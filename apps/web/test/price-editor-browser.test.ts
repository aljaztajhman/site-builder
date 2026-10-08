import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { serve, type ServerType } from "@hono/node-server";
import { loadConfig } from "@sb/config";
import { launchCheckBrowser, type CheckBrowser } from "@sb/engine";
import { Repo, createDb, createFsStorage, migrate, type Platform, type Queue } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { createApp } from "../src/app.ts";
import { adminCookie } from "./session-helpers.ts";

/**
 * The price-list and menu editor in Chromium against the real app: the owner edits groups and items on a
 * phone and a desktop, every change lands in the spec, the preview swaps in the re-rendered section
 * without reloading, and the prices the owner typed pass the fact check (nothing on the checklist).
 * Set PRICE_EDITOR_SHOTS=<dir> to keep screenshots of the editor and the rendered page at 1280 and 360 px.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const PASSWORD = "test-password-1234";
const SHOTS = process.env.PRICE_EDITOR_SHOTS;
let platform: Platform;
let dir: string;
let server: ServerType;
let base: string;
let cb: CheckBrowser;
let cookie: string;
type Page = Awaited<ReturnType<CheckBrowser["browser"]["newPage"]>>;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-price-e2e-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = { send: async () => "job", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  const app = createApp({ platform, config: loadConfig(), auth: { password: PASSWORD, secret: "s".repeat(32), secureCookies: false } });
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

/** A fresh copy of an eval fixture's golden site, with the fixture's own text as the intake (the fact-check corpus). */
async function seed(fixture: string, slug: string): Promise<string> {
  const spec = JSON.parse(await readFile(path.join(here, `../../../tools/eval/golden/${fixture}.json`), "utf8")) as SiteSpec;
  spec.slug = slug;
  const brief = JSON.parse(await readFile(path.join(here, `../../../tools/eval/fixtures/${fixture}/brief.json`), "utf8")) as { description: string };
  const site = await platform.repo.createSite({ name: slug, slug, intake: { description: brief.description, photoAssetIds: [], scope: "full" } });
  await platform.repo.saveSpec(site.id, spec, "generate");
  return site.id;
}

async function open(siteId: string, width: number) {
  const context = await cb.browser.newContext({ viewport: { width, height: width < 768 ? 780 : 900 }, reducedMotion: "reduce", hasTouch: width < 768 });
  const [name, value] = cookie.split("=") as [string, string];
  await context.addCookies([{ name, value, url: base }]);
  const page = await context.newPage();
  page.on("dialog", (d) => void d.accept());
  await page.goto(`${base}/sites/${siteId}`);
  await page.locator(".outline li").first().waitFor({ state: "attached" });
  return { page, close: () => context.close() };
}

/** Opens the page holding the list (second page of both fixtures) and selects the list in the panel. */
async function selectList(page: Page, outline: string) {
  if (await page.locator(".sheet-handle").isVisible()) await page.locator(".sheet-handle").click();
  await page.getByLabel("Stran", { exact: true }).selectOption({ index: 1 });
  await page.locator(`.outline li:has(strong:text-is("${outline}"))`).click();
  await page.locator(".pl-item").first().waitFor();
}

const spec = async (siteId: string) => ((await platform.repo.getSpec(siteId))!).spec;
type Item = { name: string; price: { amount?: number; from?: boolean; unit?: string; $placeholder?: string }; unavailable?: boolean; note?: string };
const salonGroups = async (siteId: string) => (spec(siteId).then((s) => (s.pages[1]!.sections[1]!.props as { groups: { name?: string; items: Item[] }[] }).groups));
const preview = (page: Page) => page.frameLocator('iframe[title="Predogled strani"]');

async function checklist(siteId: string): Promise<{ path: string; kind: string }[]> {
  const r = await fetch(`${base}/api/sites/${siteId}`, { headers: { cookie } });
  return ((await r.json()) as { checklist: { path: string; kind: string }[] }).checklist;
}

describe("price list editor in a browser", () => {
  it("desktop: fills a missing price, marks an item unavailable, adds, moves and deletes, and the preview follows without reloading", async () => {
    const id = await seed("frizerstvo-lana", "cenik-namizje");
    const { page, close } = await open(id, 1280);
    try {
      await selectList(page, "Cenik");
      await expect.poll(() => page.locator(".pl-item").count()).toBe(7);
      // Marks the preview's window: a reload would lose it.
      await preview(page).locator("#s_prices").waitFor();
      await page.frames().find((f) => f.url().includes("cenik.html"))!.evaluate(() => ((window as unknown as { __kept: number }).__kept = 1));
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "editor-1280-list.png") });

      // A tap on the "Pramene" row in the preview opens its fields.
      await preview(page).locator(".prices__row", { hasText: "Pramene" }).click();
      const pramene = page.locator(".pl-item.is-open");
      await expect.poll(() => pramene.locator(".pl-name").textContent()).toBe("Pramene");

      // Typed the English way; shown and saved the Slovene way.
      const started = Date.now();
      await pramene.locator('[data-field="price"]').fill("35.5");
      await expect.poll(() => pramene.locator(".pl-shown").textContent()).toBe("Na strani: 35,50 €");
      await expect.poll(async () => (await salonGroups(id))[1]!.items[1]!.price, { timeout: 10_000 }).toEqual({ amount: 35.5 });
      await expect.poll(() => preview(page).locator(".prices__row", { hasText: "Pramene" }).textContent(), { timeout: 10_000 }).toContain("35,50 €");
      const shownAfter = Date.now() - started;
      // The section was swapped in place: same window, no reload.
      expect(await page.frames().find((f) => f.url().includes("cenik.html"))!.evaluate(() => (window as unknown as { __kept?: number }).__kept)).toBe(1);

      // Unreadable input: said why, nothing saved.
      await pramene.locator('[data-field="price"]').fill("1,200");
      await expect.poll(() => pramene.getByText(/^Ali mislite 1\.200 € ali 1,20 €\?/).count()).toBe(1);
      expect(await pramene.locator('[data-field="price"]').getAttribute("aria-invalid")).toBe("true");
      await pramene.locator('[data-field="price"]').fill("35,50");

      await pramene.getByLabel("Trenutno ni na voljo (ostane na seznamu z opombo)").check();
      await expect.poll(async () => (await salonGroups(id))[1]!.items[1]!.unavailable, { timeout: 10_000 }).toBe(true);
      await expect.poll(() => preview(page).locator(".prices__row.is-unavailable").textContent(), { timeout: 10_000 }).toContain("Trenutno ni na voljo");
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "editor-1280-item.png") });

      // Down, by button: "Žensko striženje s fenom" goes below "Moško striženje".
      await page.getByRole("button", { name: "Premakni dol: Žensko striženje s fenom" }).click();
      await expect.poll(async () => (await salonGroups(id))[0]!.items.map((i) => i.name), { timeout: 10_000 }).toEqual(["Moško striženje", "Žensko striženje s fenom", "Otroško striženje"]);

      // A new item opens with its name selected: typing replaces the starter text.
      await page.locator(".pl-group").first().getByRole("button", { name: "+ Dodaj postavko" }).click();
      const added = page.locator(".pl-item.is-open");
      await expect.poll(() => page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.value)).toBe("Nova postavka");
      await page.keyboard.type("Striženje šiške");
      await added.locator('[data-field="price"]').fill("8");
      await expect.poll(async () => (await salonGroups(id))[0]!.items[3], { timeout: 10_000 }).toEqual({ name: "Striženje šiške", price: { amount: 8 } });
      await expect.poll(() => preview(page).locator("#s_prices").textContent(), { timeout: 10_000 }).toContain("Striženje šiške");

      // The owner's prices are the owner's facts: nothing about them on the checklist.
      await expect.poll(async () => (await checklist(id)).filter((b) => b.path.startsWith("/pages/1/sections/1/props/groups/")).map((b) => `${b.kind} ${b.path}`), { timeout: 10_000 }).toEqual([
        "placeholder /pages/1/sections/1/props/groups/1/items/2/price",
      ]);

      // The heading saves on its own path: the list edited before it stays as it is.
      await page.getByLabel("Naslov", { exact: true }).fill("Cene v salonu");
      await expect.poll(async () => ((await spec(id)).pages[1]!.sections[1]!.props as { title: string }).title, { timeout: 10_000 }).toBe("Cene v salonu");
      expect((await salonGroups(id))[1]!.items[1]).toEqual({ name: "Pramene", price: { amount: 35.5 }, unavailable: true });

      // Delete it again (confirmed), and add a group.
      await added.getByRole("button", { name: "Izbriši postavko" }).click();
      await expect.poll(async () => (await salonGroups(id))[0]!.items.length, { timeout: 10_000 }).toBe(3);
      await page.getByRole("button", { name: "+ Dodaj skupino" }).click();
      await expect.poll(async () => (await salonGroups(id)).map((g) => g.name), { timeout: 10_000 }).toEqual(["Striženje", "Barvanje in pričeske", "Nova skupina"]);
      if (SHOTS) {
        await writeFile(path.join(SHOTS, "timing.txt"), `typed price shown in the preview after ${shownAfter} ms (includes the 450 ms typing pause)\n`);
        await page.screenshot({ path: path.join(SHOTS, "editor-1280-after.png") });
        for (const width of [1280, 360]) {
          const p = await page.context().newPage();
          await p.setViewportSize({ width, height: 900 });
          await p.goto(`${base}/preview/${id}/cenik.html`);
          await p.locator("#s_prices").screenshot({ path: path.join(SHOTS, `site-${width}-cenik.png`) });
          await p.close();
        }
      }
    } finally {
      await close();
    }
  }, 90_000);

  it("phone (360 px): the list fits, every move is a 44 px button, an item is edited and saved", async () => {
    const id = await seed("frizerstvo-lana", "cenik-telefon");
    const { page, close } = await open(id, 360);
    try {
      await selectList(page, "Cenik");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
      // No drag: up/down buttons on every group and item, big enough for a thumb.
      const sizes = await page.locator(".pl-move .icon").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => [Math.round(r.width), Math.round(r.height)]));
      expect(sizes.length).toBe(2 * 2 + 7 * 2);
      for (const [w, h] of sizes) expect(Math.min(w!, h!)).toBeGreaterThanOrEqual(44);
      const rows = await page.locator(".pl-sum").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
      for (const h of rows) expect(h).toBeGreaterThanOrEqual(44);

      await page.locator(".pl-sum", { hasText: "Fen frizura" }).click();
      const item = page.locator(".pl-item.is-open");
      await item.locator('[data-field="price"]').fill("od 20 €");
      await item.getByLabel("Enota (neobvezno)").fill("/ obisk");
      await expect.poll(async () => (await salonGroups(id))[1]!.items[2]!.price, { timeout: 10_000 }).toEqual({ amount: 20, from: true, unit: "/ obisk" });
      expect(await item.getByLabel("Prikaži kot »od« (najnižja cena)").isChecked()).toBe(true);
      await page.getByRole("button", { name: "Premakni gor: Fen frizura" }).click();
      await expect.poll(async () => (await salonGroups(id))[1]!.items.map((i) => i.name), { timeout: 10_000 }).toEqual(["Barvanje", "Fen frizura", "Pramene", "Svečana pričeska"]);
      // Still open after the redraw, at its new place, and the only one open.
      await expect.poll(() => page.locator(".pl-group").nth(1).locator(".pl-name").allTextContents()).toEqual(["Barvanje", "Fen frizura", "Pramene", "Svečana pričeska"]);
      expect(await page.locator(".pl-item.is-open .pl-name").allTextContents()).toEqual(["Fen frizura"]);
      // Moving another item past it keeps it open too (Pramene goes up, Fen frizura down to 3rd).
      await page.getByRole("button", { name: "Premakni gor: Pramene" }).click();
      await expect.poll(() => page.locator(".pl-group").nth(1).locator(".pl-name").allTextContents(), { timeout: 10_000 }).toEqual(["Barvanje", "Pramene", "Fen frizura", "Svečana pričeska"]);
      expect(await page.locator(".pl-item.is-open .pl-name").allTextContents()).toEqual(["Fen frizura"]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
      if (SHOTS) {
        await page.locator(".pl-item.is-open").scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(SHOTS, "editor-360-item.png") });
        await page.locator(".pl-group").first().scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(SHOTS, "editor-360-list.png") });
      }
    } finally {
      await close();
    }
  }, 90_000);

  it("a missing price is on 'Še to potrebujemo' after Objavi, named by its item, and takes a price as owners write it", async () => {
    const id = await seed("frizerstvo-lana", "cenik-seznam");
    const { page, close } = await open(id, 1280);
    try {
      await page.getByRole("button", { name: "Objavi" }).click();
      const entry = page.locator("#facts-ask [data-ask]", { hasText: "Pramene" });
      await expect.poll(() => entry.count()).toBe(1);
      const path = (await entry.getAttribute("data-ask"))!;
      // With "Cena po dogovoru" on, the entry also has its checkbox: the price is the text field.
      await entry.locator("input[type=text]").fill("od 12,50");
      await expect
        .poll(async () => {
          let o: unknown = (await platform.repo.getSpec(id))!.spec;
          for (const seg of path.split("/").slice(1)) o = (o as Record<string, unknown>)[seg];
          return o;
        })
        .toEqual({ amount: 12.5, from: true });
    } finally {
      await close();
    }
  }, 60_000);

  it("plates (Tablica, price tags): an item marked unavailable in the editor keeps its plate, fits 360 and 1280 px", async () => {
    // avtoservis-mrak in the Tablica direction with its four prices as plates, on the services page.
    const s = JSON.parse(await readFile(path.join(here, "../../../tools/eval/golden/avtoservis-mrak.json"), "utf8")) as SiteSpec;
    const { direction } = await import("@sb/spec");
    const t = direction("tablica");
    s.design = { ...s.design, direction: t.id, fontPair: t.fontPairs[0]!, colors: { ...t.palette.fallback }, radius: 6, baseFontSize: 18, scale: 1.25, headingWeight: 900, headingCase: "uppercase", headingTracking: -0.02, density: "regular", shadow: "none", imagery: t.imagery };
    s.pages[1]!.sections.splice(2, 0, {
      id: "s_cene",
      type: "price-list",
      variant: "tags",
      tone: "inverse",
      props: { title: "Nekaj cen", groups: [{ items: [{ name: "Diagnostika", price: { amount: 30 } }, { name: "Polnjenje klime", price: { amount: 59 } }, { name: "Menjava gum", note: "za komplet", price: { amount: 20 } }, { name: "Hramba gum", note: "na sezono", price: { amount: 40 } }] }] },
    } as SiteSpec["pages"][number]["sections"][number]);
    const site = await platform.repo.createSite({ name: "tablice", slug: "tablice", intake: { description: JSON.parse(await readFile(path.join(here, "../../../tools/eval/fixtures/avtoservis-mrak/brief.json"), "utf8")).description, photoAssetIds: [], scope: "full" } });
    await platform.repo.saveSpec(site.id, s, "generate");
    const { page, close } = await open(site.id, 1280);
    try {
      await selectList(page, "Cenik");
      await page.locator(".pl-sum", { hasText: "Polnjenje klime" }).click();
      await page.locator(".pl-item.is-open").getByLabel("Trenutno ni na voljo (ostane na seznamu z opombo)").check();
      await expect.poll(() => preview(page).locator(".price-tags__item.is-unavailable").textContent(), { timeout: 10_000 }).toContain("Trenutno ni na voljo");
      expect(await preview(page).locator(".price-tag.plate").count()).toBe(4);
      expect(await checklist(site.id).then((c) => c.filter((b) => b.path.startsWith("/pages/1/sections/2/")))).toEqual([]);
      for (const width of [1280, 360]) {
        const p = await page.context().newPage();
        await p.setViewportSize({ width, height: 900 });
        await p.goto(`${base}/preview/${site.id}/storitve.html`);
        expect(await p.evaluate(() => document.documentElement.scrollWidth), `${width}`).toBeLessThanOrEqual(width);
        if (SHOTS) await p.locator("#s_cene").screenshot({ path: path.join(SHOTS, `site-${width}-tablice.png`) });
        await p.close();
      }
    } finally {
      await close();
    }
  }, 90_000);

  it("menu: a dish's tags and unavailable land in the spec and in the preview", async () => {
    const id = await seed("gostilna-zlata-zlica", "jedilnik");
    const { page, close } = await open(id, 1280);
    try {
      await selectList(page, "Jedilnik");
      await page.locator(".pl-sum", { hasText: "Ričet" }).click();
      const dish = page.locator(".pl-item.is-open");
      await dish.getByLabel("Domače, lokalno").check();
      await dish.getByLabel("Trenutno ni na voljo (ostane na seznamu z opombo)").check();
      await dish.getByLabel("Opis jedi (neobvezno)").fill("S prekajenimi rebrci");
      const menu = async () => ((await spec(id)).pages[1]!.sections[1]!.props as { categories: { dishes: Item[] }[] }).categories;
      await expect.poll(async () => (await menu())[2]!.dishes[2], { timeout: 10_000 }).toEqual({ name: "Ričet", description: "S prekajenimi rebrci", price: { $placeholder: "price", note: "Vpišite ceno ričeta" }, tags: ["local"], unavailable: true });
      await expect.poll(() => preview(page).locator(".menu__dish.is-unavailable").textContent(), { timeout: 10_000 }).toContain("lokalne sestavine");
      if (SHOTS) {
        await page.screenshot({ path: path.join(SHOTS, "editor-1280-menu.png") });
        for (const width of [1280, 360]) {
          const p = await page.context().newPage();
          await p.setViewportSize({ width, height: 900 });
          await p.goto(`${base}/preview/${id}/jedilnik.html`);
          await p.locator("#s_menu").screenshot({ path: path.join(SHOTS, `site-${width}-jedilnik.png`) });
          await p.close();
        }
      }
    } finally {
      await close();
    }
  }, 90_000);
});
