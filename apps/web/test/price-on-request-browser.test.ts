import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { serve, type ServerType } from "@hono/node-server";
import { loadConfig } from "@sb/config";
import { launchCheckBrowser, runAxe, switchDirection, type AxeViolation, type CheckBrowser } from "@sb/engine";
import { Repo, createDb, createFsStorage, migrate, type Platform, type Queue } from "@sb/platform";
import { DIRECTIONS, missingFacts, publishChecklist, readList, type ListAt, type SiteSpec } from "@sb/spec";
import { createApp } from "../src/app.ts";
import { adminCookie } from "./session-helpers.ts";

/**
 * "Cena po dogovoru" (it-price-on-request, config `editor.priceOnRequest` switched on here) in Chromium at 360 and
 * 1280 px against the real app: one tap per item and one for the whole list, in the price editor and on "Še to
 * potrebujemo"; the choice is the owner's fact, so the price no longer holds up publishing and the site publishes.
 * Every new control is at least 44 px tall, nothing scrolls sideways, axe finds nothing. The site shows "po dogovoru"
 * in every price-list variant, the menu and services in every direction without overflowing at either width.
 * No model calls. PRICE_ON_REQUEST_SHOTS=<dir> keeps a screenshot of that page per direction and width.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const PASSWORD = "test-password-1234";
const ON = { onRequest: true };
const SHOTS = process.env.PRICE_ON_REQUEST_SHOTS;
let platform: Platform;
let dir: string;
let server: ServerType;
let base: string;
let cb: CheckBrowser;
let cookie: string;
type Page = Awaited<ReturnType<CheckBrowser["browser"]["newPage"]>>;
type Width = 360 | 1280;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-price-onreq-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = { send: async () => "job", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  const config = loadConfig();
  // The switch is off in config/app.config.json; this app has it on.
  const app = createApp({ platform, config: { ...config, editor: { ...config.editor, priceOnRequest: true } }, auth: { password: PASSWORD, secret: "s".repeat(32), secureCookies: false } });
  server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
  await new Promise<void>((r) => server.once("listening", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  cookie = await adminCookie((p, init) => fetch(`${base}${p}`, init), PASSWORD);
  cb = await launchCheckBrowser();
  if (SHOTS) await mkdir(SHOTS, { recursive: true });
}, 120_000);

afterAll(async () => {
  await cb?.close();
  server?.close();
  await platform?.close();
  await rm(dir, { recursive: true, force: true });
});

let seq = 0;
async function seed(fixture: string, change?: (s: SiteSpec) => void): Promise<string> {
  const spec = JSON.parse(await readFile(path.join(here, `../../../tools/eval/golden/${fixture}.json`), "utf8")) as SiteSpec;
  spec.slug = `${fixture}-onreq-${++seq}`;
  change?.(spec);
  const brief = JSON.parse(await readFile(path.join(here, `../../../tools/eval/fixtures/${fixture}/brief.json`), "utf8")) as { description: string };
  const site = await platform.repo.createSite({ name: spec.slug, slug: spec.slug, intake: { description: brief.description, photoAssetIds: [], scope: "full" } });
  await platform.repo.saveSpec(site.id, spec, "generate");
  await platform.repo.setStatus(site.id, "ready");
  return site.id;
}

async function open(siteId: string, width: Width) {
  const context = await cb.browser.newContext({ viewport: { width, height: width === 360 ? 780 : 900 }, reducedMotion: "reduce", hasTouch: width === 360, isMobile: width === 360 });
  const [name, value] = cookie.split("=") as [string, string];
  await context.addCookies([{ name, value, url: base }]);
  const page = await context.newPage();
  // "Vse cene po dogovoru" over typed amounts asks first: the owner says yes.
  page.on("dialog", (d) => void d.accept());
  await page.goto(`${base}/sites/${siteId}`);
  await page.frameLocator("iframe[title='Predogled strani']").locator("main").waitFor();
  await page.locator(".outline li").first().waitFor({ state: "attached" });
  return { page, close: () => context.close() };
}

const spec = async (id: string) => (await platform.repo.getSpec(id))!.spec;
const preview = (page: Page) => page.frameLocator('iframe[title="Predogled strani"]');
const valueAt = (s: unknown, ptr: string) => ptr.split("/").slice(1).reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], s);
async function checklist(siteId: string): Promise<{ path: string; kind: string; detail: string }[]> {
  const r = await fetch(`${base}/api/sites/${siteId}`, { headers: { cookie } });
  return ((await r.json()) as { checklist: { path: string; kind: string; detail: string }[] }).checklist;
}
const describeAxe = (v: AxeViolation[]) => v.map((x) => `${x.id} (${x.impact}, ${x.nodes}): ${x.targets.join(" | ")}`);
const noSideways = async (page: Page, width: Width) => expect(await page.evaluate(() => document.documentElement.scrollWidth), "no sideways scroll").toBeLessThanOrEqual(width);
/** Height and width of what a thumb taps: a button, or a checkbox's whole label. */
const tapSize = (page: Page, selector: string) =>
  page.locator(selector).evaluateAll((els) => els.map((e) => (e.closest("label") ?? e).getBoundingClientRect()).map((r) => [Math.round(r.width), Math.round(r.height)]));

/** frizerstvo-lana's Cenik (page 2): Striženje (3), Barvanje in pričeske (4; Pramene and Fen frizura without a price). */
const SALON: ListAt = { page: 1, section: 1, id: "s_prices" };

describe("\"Cena po dogovoru\" with the switch on", () => {
  for (const width of [360, 1280] as const) {
    it(`price editor at ${width} px: one tap per item, one for the whole list, and back`, async () => {
      const id = await seed("frizerstvo-lana");
      const { page, close } = await open(id, width);
      try {
        if (await page.locator(".sheet-handle").isVisible()) await page.locator(".sheet-handle").click();
        await page.getByLabel("Stran", { exact: true }).selectOption({ index: 1 });
        await page.locator('.outline li:has(strong:text-is("Cenik"))').click();
        await page.locator(".pl-item").first().waitFor();

        // One item: open it, one tap.
        await page.locator(".pl-sum", { hasText: "Pramene" }).click();
        const item = page.locator(".pl-item.is-open");
        const tick = item.getByLabel("Cena po dogovoru (namesto zneska)");
        await tick.check();
        await expect.poll(async () => readList(await spec(id), SALON)!.groups[1]!.items[1], { timeout: 10_000 }).toEqual({ name: "Pramene", price: ON });
        expect(await item.locator('[data-field="price"]').isDisabled()).toBe(true);
        expect(await item.locator(".pl-shown").textContent()).toBe("Na strani: po dogovoru");
        expect(await item.locator(".pl-price").textContent()).toBe("po dogovoru");
        await expect.poll(() => preview(page).locator("#s_prices .prices__row", { hasText: "Pramene" }).textContent(), { timeout: 10_000 }).toContain("po dogovoru");
        // The owner's answer: off the checklist; the other missing price stays.
        await expect
          .poll(async () => (await checklist(id)).filter((b) => b.path.startsWith("/pages/1/sections/1/")).map((b) => b.path), { timeout: 10_000 })
          .toEqual(["/pages/1/sections/1/props/groups/1/items/2/price"]);
        if (width === 360) {
          for (const [w, h] of await tapSize(page, '.pl-item.is-open [data-field="on-request"]')) expect(Math.min(w!, h!), "the tick's label").toBeGreaterThanOrEqual(44);
          await noSideways(page, width);
        }

        // Back again: missing again (its amount field was empty).
        await tick.uncheck();
        await expect.poll(async () => readList(await spec(id), SALON)!.groups[1]!.items[1]!.price, { timeout: 10_000 }).toEqual({ $placeholder: "price" });
        expect(await item.locator('[data-field="price"]').isDisabled()).toBe(false);
        await expect.poll(() => item.locator(".pl-shown").textContent()).toBe("Brez cene. Dokler je ne vpišete, strani ni mogoče objaviti.");

        // The whole list: one tap (the owner confirms over the amounts already typed).
        const all = page.getByRole("button", { name: "Vse cene po dogovoru" });
        if (width === 360) {
          const [w, h] = (await tapSize(page, `#pl-onreq-s_prices`))[0]!;
          expect(Math.min(w!, h!)).toBeGreaterThanOrEqual(44);
        }
        await all.click();
        await expect.poll(async () => readList(await spec(id), SALON)!.groups.flatMap((g) => g.items.map((i) => i.price)), { timeout: 10_000 }).toEqual(Array(7).fill(ON));
        await expect.poll(() => page.locator(".pl-price").allTextContents(), { timeout: 10_000 }).toEqual(Array(7).fill("po dogovoru"));
        await page.locator(".pl-all-onreq").waitFor();
        await expect.poll(() => preview(page).locator("#s_prices .price--on-request").count(), { timeout: 10_000 }).toBe(7);
        expect(await checklist(id).then((c) => c.filter((b) => b.path.startsWith("/pages/1/sections/1/")))).toEqual([]);
        // Names, notes and the homepage's own list are as they were.
        const after = await spec(id);
        expect(readList(after, SALON)!.groups[1]!.items.map((i) => [i.name, i.note ?? null])).toEqual([
          ["Barvanje", "barve brez amoniaka"],
          ["Pramene", null],
          ["Fen frizura", null],
          ["Svečana pričeska", "za poroke in maturantske plese"],
        ]);

        await noSideways(page, width);
        await page.waitForTimeout(300);
        expect(describeAxe(await runAxe(page))).toEqual([]);
      } finally {
        await close();
      }
    }, 120_000);

    it(`"Še to potrebujemo" at ${width} px: one tap per price, one for every missing price, then Objavi publishes`, async () => {
      // The inn's only missing facts are four prices: two products on the homepage, two dishes on the menu.
      const id = await seed("gostilna-zlata-zlica");
      const { page, close } = await open(id, width);
      try {
        const asked = missingFacts(publishChecklist(await spec(id)));
        expect(asked.map((f) => f.kind)).toEqual(["price", "price", "price", "price"]);
        await page.getByRole("button", { name: "Objavi", exact: true }).click();
        await page.locator("#facts-ask").waitFor();
        expect(await page.locator("#facts-ask [data-ask]").count()).toBe(4);
        await noSideways(page, width);
        await page.waitForTimeout(300);
        expect(describeAxe(await runAxe(page))).toEqual([]);
        for (const [w, h] of await tapSize(page, '#facts-ask [data-field="on-request"], #facts-ask .ask-onreq-all')) expect(Math.min(w!, h!)).toBeGreaterThanOrEqual(44);

        // One tap on the first price: saved as the owner's answer, the field greyed out, the box stays until the screen redraws.
        const first = page.locator("#facts-ask [data-ask]").first();
        const firstPath = (await first.getAttribute("data-ask"))!;
        await first.getByLabel("Cena po dogovoru").check();
        await expect.poll(async () => valueAt(await spec(id), firstPath), { timeout: 10_000 }).toEqual(ON);
        expect(await first.locator('input[inputmode="decimal"]').isDisabled()).toBe(true);

        // One tap for the rest: every price still missing.
        await page.getByRole("button", { name: "Vse manjkajoče cene po dogovoru" }).click();
        await expect.poll(async () => Promise.all(asked.map(async (f) => valueAt(await spec(id), f.path))), { timeout: 10_000 }).toEqual(Array(4).fill(ON));
        await expect.poll(() => page.locator("#facts-ask .help").first().textContent(), { timeout: 10_000 }).toBe("Vsi podatki so vpisani.");
        expect(await checklist(id)).toEqual([]);

        // Nothing holds it up: Objavi on the screen publishes.
        await page.locator("#ask-publish").click();
        await expect.poll(async () => (await platform.repo.getSite(id))?.published_version ?? null, { timeout: 30_000 }).not.toBeNull();
        const slug = (await platform.repo.getSite(id))!.slug;
        for (const file of ["", "jedilnik.html"]) {
          const p = await page.context().newPage();
          await p.setViewportSize({ width, height: 900 });
          await p.goto(`${base}/s/${slug}/${file}`);
          expect(await p.locator(".price--on-request").count(), file || "index").toBeGreaterThanOrEqual(2);
          expect(await p.locator(".ph").count(), file || "index").toBe(0);
          expect(await p.evaluate(() => document.documentElement.scrollWidth), file || "index").toBeLessThanOrEqual(width);
          // No price for these in the structured data.
          expect(await p.locator('script[type="application/ld+json"]').allTextContents().then((t) => t.join(""))).not.toContain("onRequest");
          await p.close();
        }
      } finally {
        await close();
      }
    }, 120_000);
  }

  it("the site: \"po dogovoru\" fits every price-list variant, the menu and services in every direction at 360 and 1280 px", async () => {
    // One page of every place a price shows, every price on request.
    const id = await seed("frizerstvo-lana", (s) => {
      const img = s.assets.images[0]!.id;
      const items = [{ name: "Žensko striženje s fenom", note: "Posvet, pranje in oblikovanje", price: ON }, { name: "Svečana pričeska za poroko", price: ON }, { name: "Barvanje", price: ON }, { name: "Pramene", price: ON }];
      const list = (id: string, variant: string, extra: object = {}) => ({ id, type: "price-list", variant, props: { title: "Cenik", groups: [{ name: "Striženje", items }], ...extra } });
      s.pages[1]!.sections = [
        list("s_t", "table"),
        list("s_g", "grouped"),
        list("s_tags", "tags"),
        { id: "s_o", type: "price-list", variant: "offers", props: { title: "Ponudba", groups: [{ name: "Vsak dan", items: items.slice(0, 1) }, { name: "Ob sobotah", items: items.slice(1, 2) }] } },
        list("s_r", "rates", { image: img, groups: [{ items: items.slice(0, 3) }] }),
        { id: "s_m", type: "menu", variant: "two-column", props: { title: "Jedilni list", categories: [{ name: "Glavne jedi", dishes: [{ name: "Domača pečenka s pražen krompirjem", price: ON }, { name: "Ričet", price: ON }] }] } },
        { id: "s_sv", type: "services-list", variant: "rows", props: { title: "Storitve", items: [{ name: "Posvet", description: "Pogovor o željah.", price: ON }, { name: "Nega", description: "Maske in obloge.", price: ON }] } },
      ] as SiteSpec["pages"][number]["sections"];
    });
    const s0 = await spec(id);
    const problems: string[] = [];
    const ctx = await cb.browser.newContext({ reducedMotion: "reduce" });
    const [name, value] = cookie.split("=") as [string, string];
    await ctx.addCookies([{ name, value, url: base }]);
    try {
      for (const d of DIRECTIONS) {
        await platform.repo.saveSpec(id, { ...s0, design: switchDirection(s0, d.id) }, "manual");
        for (const width of [360, 1280] as const) {
          const p = await ctx.newPage();
          await p.setViewportSize({ width, height: 900 });
          await p.goto(`${base}/preview/${id}/cenik.html`);
          const found = await p.evaluate(() => {
            const out: string[] = [];
            const words = [...document.querySelectorAll<HTMLElement>(".price--on-request, .rates__amount--on-request")];
            for (const el of words) {
              const r = el.getBoundingClientRect();
              const box = el.closest("td, dd, li, p, .offers__body, .price-tags__item")!.getBoundingClientRect();
              const where = el.closest("section")?.id ?? "?";
              if (el.textContent !== "po dogovoru") out.push(`${where}: "${el.textContent}"`);
              if (r.left < -0.5 || r.right > window.innerWidth + 0.5) out.push(`${where}: off screen (${Math.round(r.left)}–${Math.round(r.right)})`);
              if (r.right > box.right + 1 || r.left < box.left - 1) out.push(`${where}: outside its box (${Math.round(r.right)} > ${Math.round(box.right)})`);
              if (parseFloat(getComputedStyle(el).fontSize) < 16) out.push(`${where}: ${getComputedStyle(el).fontSize}`);
            }
            if (document.documentElement.scrollWidth > window.innerWidth) out.push(`page scrolls sideways (${document.documentElement.scrollWidth})`);
            out.push(`count ${words.length}`);
            return out;
          });
          if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `site-${d.id}-${width}.png`), fullPage: true });
          const count = found.pop();
          // 4 + 4 + 4 + 2 + 3 + 2 + 2.
          if (count !== "count 21") problems.push(`${d.id} ${width}: ${count}`);
          problems.push(...found.map((f) => `${d.id} ${width}: ${f}`));
          await p.close();
        }
      }
    } finally {
      await ctx.close();
    }
    expect(problems).toEqual([]);
  }, 180_000);
});
