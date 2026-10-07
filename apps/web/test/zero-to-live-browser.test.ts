import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { serve, type ServerType } from "@hono/node-server";
import { loadConfig } from "@sb/config";
import { launchCheckBrowser, mediaKey, processPhoto, siteChecklist, type CheckBrowser } from "@sb/engine";
import { Repo, createDb, createFsStorage, migrate, type Platform, type Queue } from "@sb/platform";
import { missingFacts, type SiteSpec } from "@sb/spec";
import { createApp } from "../src/app.ts";
import { adminCookie } from "./session-helpers.ts";

/**
 * From a generated site to a published one (it-zero-to-live), in Chromium at phone and desktop width, counting
 * taps (typing is not counted; moving to another field is one tap, the first field is focused). The sites are the
 * fixtures' replayed generations (`pnpm zero-to-live` writes them to tools/eval/zero-to-live/specs/), with every
 * fact the client didn't give still a placeholder. The owner watches the generation finish, the editor opens "Še to
 * potrebujemo" by itself; the owner types the facts and taps Objavi. A typed tax number fills the legal name from EU VIES
 * (a fake here, answering as the real service does): that field isn't typed. The budgets (taps and facts typed) only go
 * down. SB_TAPS_OUT=<file> writes the numbers as JSON;
 * SB_Z2L_ALL=1 runs all ten fixtures (the report in docs/plans/zero-to-live.md), CI runs three; SB_Z2L_SHOTS=<dir>
 * saves the screen as it opened.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, "../../..");
const PASSWORD = "test-password-1234";
let platform: Platform;
let dir: string;
let server: ServerType;
let base: string;
let cb: CheckBrowser;
let cookie: string;

type Width = 375 | 1280;
/**
 * Taps from opening the editor to a published site, and facts the owner types, per fixture (same at both widths).
 * 2026-10-04: taps 5, 6, 9 (docs/plans/zero-to-live.md). 2026-10-07 (it-zept-lookup: the legal name from the tax
 * number; unnamed team members left out at generation): taps 4, 5, 6; facts typed 5 -> 4, 6 -> 5, 9 -> 6.
 */
const BUDGET: Record<string, { taps: number; typed: number }> = {
  "avtoservis-mrak": { taps: 4, typed: 4 },
  "frizerstvo-lana": { taps: 5, typed: 5 },
  "racunovodstvo-seliskar": { taps: 6, typed: 6 },
};
/** What the fake VIES says about any number (fictional; the real answer's shape, 2026-10-07). */
const VIES_NAME = "TESTNO PODJETJE, D.O.O.";
const VIES_FOUND = () =>
  new Response(JSON.stringify({ countryCode: "SI", vatNumber: "10000003", requestDate: "2026-10-07T12:00:00.000Z", valid: true, requestIdentifier: "", name: VIES_NAME, address: "TESTNA ULICA 1, 1000 LJUBLJANA", traderName: "---" }), { status: 200, headers: { "content-type": "application/json" } });
let viesAnswer: () => Response = VIES_FOUND;
const ALL = process.env.SB_Z2L_ALL === "1";

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-zero-to-live-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = { send: async () => "job", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  const app = createApp({ platform, config: loadConfig(), viesFetch: (async () => viesAnswer()) as typeof fetch, auth: { password: PASSWORD, secret: "s".repeat(32), secureCookies: false } });
  server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
  await new Promise<void>((r) => server.once("listening", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  cookie = await adminCookie((p, init) => fetch(`${base}${p}`, init), PASSWORD);
  cb = await launchCheckBrowser();
}, 120_000);

afterAll(async () => {
  await cb?.close();
  server?.close();
  await platform?.close();
  await rm(dir, { recursive: true, force: true });
});

let seq = 0;
/** The fixture's replayed generation as a fresh site, with the fixture's description (the fact check reads it) and pictures in storage. */
async function seed(id: string): Promise<string> {
  const fixture = path.join(repoRoot, "tools/eval/fixtures", id);
  const brief = JSON.parse(await readFile(path.join(fixture, "brief.json"), "utf8")) as { description: string; photos: { file: string }[] };
  const spec = JSON.parse(await readFile(path.join(repoRoot, "tools/eval/zero-to-live/specs", `${id}.json`), "utf8")) as SiteSpec;
  spec.slug = `${id}-${++seq}`;
  const site = await platform.repo.createSite({ name: spec.slug, slug: spec.slug, intake: { description: brief.description, photoAssetIds: [], scope: "full" } });
  // Generated pictures and fixtures without photos get a fixture photo as their stand-in; one small width is enough.
  const photos = brief.photos.length ? brief.photos.map((p) => path.join(fixture, ...p.file.split("/"))) : [path.join(repoRoot, "tools/eval/fixtures/pekarna-kvas/photos/01.jpg")];
  for (const [i, im] of spec.assets.images.entries()) {
    const processed = await processPhoto(im.id, new Uint8Array(await readFile(photos[i % photos.length]!)), [360], { avif: 40, webp: 60 });
    for (const v of processed.variants) await platform.storage.put(mediaKey(site.id, v.file), v.data, v.file.endsWith(".webp") ? "image/webp" : "image/avif");
  }
  // The owner watches it generate: the editor is opened while the job runs, the version lands afterwards.
  await platform.repo.setStatus(site.id, "generating");
  generated.set(site.id, async () => {
    await platform.repo.saveSpec(site.id, spec, "generate");
    await platform.repo.setStatus(site.id, "ready");
  });
  return site.id;
}
/** Per site: saves its generated version and marks it ready, as the worker does at the end of a generation. */
const generated = new Map<string, () => Promise<void>>();

type Page = Awaited<ReturnType<CheckBrowser["browser"]["newPage"]>>;

/** What a test owner types, by the field's own name (fictional values; the fact check accepts owner-typed facts). */
const TYPED: Record<string, string> = {
  phone: "+38641555000",
  email: "info@primer.si",
  street: "Testna ulica 1",
  postalCode: "1000",
  city: "Ljubljana",
  price: "25",
  open: "08:00",
  close: "16:00",
  name: "Ana Testna",
  legalName: "Testno podjetje d.o.o.",
  registrationNumber: "1234567000",
  // A valid check digit (a number that can't be one isn't looked up).
  taxNumber: "SI10000003",
  serviceArea: "Celje",
};

/** Opens the editor; with `watch`, while the site generates, and the generation then finishes. */
async function open(siteId: string, width: Width, watch = true) {
  const context = await cb.browser.newContext({ viewport: { width, height: width === 375 ? 812 : 900 }, reducedMotion: "reduce", hasTouch: width === 375 });
  const [name, value] = cookie.split("=") as [string, string];
  await context.addCookies([{ name, value, url: base }]);
  const page = await context.newPage();
  if (!watch) await generated.get(siteId)!();
  await page.goto(`${base}/sites/${siteId}`);
  if (watch) {
    await page.locator(".ed.generating").waitFor();
    await generated.get(siteId)!();
  }
  await page.frameLocator("iframe[title='Predogled strani']").locator("main").waitFor({ timeout: 20_000 });
  return { page, context };
}

/**
 * Types every missing fact on the open "Še to potrebujemo" screen: a tap for each field that isn't focused yet.
 * A field the tax number's lookup filled is left as it is. Selects (days of the week) keep what they show.
 * Returns the taps and the facts typed.
 */
async function fillAsk(page: Page): Promise<{ taps: number; typed: number }> {
  let taps = 0;
  const typed = new Set<string>();
  const inputs = page.locator("#facts-ask [data-ask] input:not([type=checkbox]):not([type=hidden]):not([type=color])");
  const n = await inputs.count();
  for (let i = 0; i < n; i++) {
    const input = inputs.nth(i);
    const leaf = await input.evaluate((el) => el.closest<HTMLElement>("[data-path]")?.dataset.path ?? "");
    const key = leaf.split("/").filter((x) => !/^\d+$/.test(x)).pop() ?? "";
    const text = TYPED[key];
    if (text === undefined) throw new Error(`no test value for ${leaf}`);
    if (await input.inputValue()) continue;
    if (!(await input.evaluate((el) => el === document.activeElement))) {
      taps++;
      await input.click();
    }
    await input.fill(text);
    typed.add(await input.evaluate((el) => el.closest<HTMLElement>("[data-ask]")?.dataset.ask ?? ""));
    // The owner sees the name fill in before moving on.
    if (key === "taxNumber") await page.locator(`#facts-ask [data-lookup="found"], #facts-ask [data-lookup="none"]`).waitFor();
  }
  return { taps, typed: typed.size };
}

const fixtures = ALL ? ["avtoservis-mrak", "fizioterapija-pregib", "frizerstvo-lana", "gostilna-zlata-zlica", "instalacije-rebernik", "kmetija-grabnar", "pekarna-kvas", "racunovodstvo-seliskar", "trgovina-oljka-in-sol", "zobozdravstvo-lebar"] : Object.keys(BUDGET);
const results: Record<string, Record<string, { taps: number; asked: number; typed: number; left: number }>> = {};

describe("from a generated site to a published one", () => {
  for (const id of fixtures) {
    for (const width of [375, 1280] as const) {
      it(`${id} at ${width} px`, async () => {
        const siteId = await seed(id);
        const { page, context } = await open(siteId, width);
        const before = await siteChecklist(platform.repo, siteId, (await platform.repo.getSpec(siteId))!.spec);
        const asked = missingFacts(before);
        try {
          let taps = 0;
          let typed = 0;
          if (asked.length) {
            // Opens by itself after a generation, with the first missing fact focused.
            await page.locator("#facts-ask").waitFor();
            expect(await page.locator("#facts-ask [data-ask]").count()).toBe(asked.length);
            if (process.env.SB_Z2L_SHOTS) await page.screenshot({ path: path.join(process.env.SB_Z2L_SHOTS, `${id}-${width}.png`), fullPage: true });
            const filled = await fillAsk(page);
            taps += filled.taps;
            typed = filled.typed;
            taps++;
            await page.locator("#ask-publish").click();
          } else {
            expect(await page.locator("#facts-ask").count()).toBe(0);
            taps++;
            await page.getByRole("button", { name: "Objavi", exact: true }).click();
          }
          await expect.poll(async () => (await platform.repo.getSite(siteId))?.published_version ?? null, { timeout: 30_000 }).not.toBeNull();
          // Nothing the client didn't give was filled in by anyone but the owner: the typed values are on the site.
          const spec = (await platform.repo.getSpec(siteId))!.spec;
          expect(missingFacts(await siteChecklist(platform.repo, siteId, spec))).toEqual([]);
          // A legal name that was missing came from the register, not from typing.
          if (asked.some((f) => f.kind === "legalName")) expect(spec.business.provider.legalName).toBe(VIES_NAME);
          (results[id] ??= {})[width] = { taps, asked: asked.length, typed, left: before.length - asked.length };
          if (BUDGET[id]) {
            expect(taps).toBeLessThanOrEqual(BUDGET[id].taps);
            expect(typed).toBeLessThanOrEqual(BUDGET[id].typed);
          }
        } finally {
          await context.close();
        }
      }, 90_000);
    }
  }

  it("asks nothing by itself on a later visit, and Objavi opens the screen while facts are missing", async () => {
    const siteId = await seed("avtoservis-mrak");
    const { page, context } = await open(siteId, 1280, false);
    try {
      expect(await page.locator("#facts-ask").count()).toBe(0);
      await page.getByRole("button", { name: "Objavi", exact: true }).click();
      await page.locator("#facts-ask").waitFor();
      // Objavi under an empty form says what is missing instead of publishing.
      await page.locator("#ask-publish").click();
      await expect.poll(() => page.locator(".toast-text").textContent()).toContain("Še niso vpisani vsi podatki");
      expect((await platform.repo.getSite(siteId))?.published_version).toBeNull();
      // "Kasneje" closes it; the chip opens it again.
      await page.getByRole("button", { name: "Kasneje" }).click();
      expect(await page.locator("#facts-ask").count()).toBe(0);
      await page.locator("#checklist-summary").click();
      await page.locator("#facts-ask").waitFor();
    } finally {
      await context.close();
    }
  }, 90_000);

  it("Podatki: the tax number fills the legal name the owner can still change; VIES down leaves the fields to type", async () => {
    const siteId = await seed("avtoservis-mrak");
    const { page, context } = await open(siteId, 1280, false);
    const spec = async () => (await platform.repo.getSpec(siteId))!.spec;
    const address = (await spec()).business.address;
    try {
      await page.locator(".shortcut", { hasText: "Podatki" }).click();
      const tax = page.locator(`[data-path="/business/provider/taxNumber"] input`);
      const name = page.locator(`[data-path="/business/provider/legalName"] input`);
      // Down first: a short note, nothing filled, the fields stay open to type.
      viesAnswer = () => new Response(JSON.stringify({ actionSucceed: false, errorWrappers: [{ error: "MS_UNAVAILABLE" }] }), { status: 503 });
      await tax.fill("SI 1000 0003");
      await page.locator(`[data-lookup="none"]`).waitFor();
      expect(await page.locator(".company-note").textContent()).toContain("Registra zavezancev za DDV trenutno ni mogoče doseči");
      expect(await name.inputValue()).toBe("");
      // An invalid number says so without asking.
      viesAnswer = VIES_FOUND;
      await tax.fill("SI12345678");
      await expect.poll(() => page.locator(".company-note").textContent()).toContain("Davčna številka ni veljavna");
      expect(await name.inputValue()).toBe("");
      // Up again: the name fills and is saved; the address the site has stays.
      await tax.fill("SI10000003");
      await page.locator(`[data-lookup="found"]`).waitFor();
      await expect.poll(async () => (await spec()).business.provider.legalName).toBe(VIES_NAME);
      expect(await name.inputValue()).toBe(VIES_NAME);
      expect((await spec()).business.provider.taxNumber).toBe("SI10000003");
      expect((await spec()).business.address).toEqual(address);
      // The owner's own words win.
      await name.fill("Avtoservis Mrak d.o.o.");
      await expect.poll(async () => (await spec()).business.provider.legalName, { timeout: 10_000 }).toBe("Avtoservis Mrak d.o.o.");
    } finally {
      viesAnswer = VIES_FOUND;
      await context.close();
    }
  }, 90_000);

  it("a missing address fills from the register too, on the screen, still editable", async () => {
    const siteId = await seed("avtoservis-mrak");
    const finish = generated.get(siteId)!;
    generated.set(siteId, async () => {
      await finish();
      const spec = (await platform.repo.getSpec(siteId))!.spec;
      spec.business.address = { $placeholder: "address" };
      await platform.repo.saveSpec(siteId, spec, "manual");
    });
    const { page, context } = await open(siteId, 1280, false);
    try {
      await page.getByRole("button", { name: "Objavi", exact: true }).click();
      await page.locator("#facts-ask").waitFor();
      // The tax number comes before the name and address it can fill.
      const order = await page.locator("#facts-ask [data-ask]").evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.ask));
      expect(order.indexOf("/business/provider/taxNumber")).toBeLessThan(order.indexOf("/business/address"));
      expect(order.indexOf("/business/provider/taxNumber")).toBeLessThan(order.indexOf("/business/provider/legalName"));
      await page.locator(`#facts-ask [data-ask="/business/provider/taxNumber"] input`).fill("10000003");
      await page.locator(`#facts-ask [data-lookup="found"]`).waitFor();
      expect(await page.locator(`#facts-ask [data-ask="/business/provider/legalName"] input`).inputValue()).toBe(VIES_NAME);
      const street = page.locator(`#facts-ask [data-ask="/business/address"] [data-path$="/street"] input`);
      expect(await street.inputValue()).toBe("TESTNA ULICA 1");
      await street.fill("Testna ulica 1");
      await expect.poll(async () => (await platform.repo.getSpec(siteId))!.spec.business.address, { timeout: 10_000 }).toEqual({ street: "Testna ulica 1", postalCode: "1000", city: "LJUBLJANA" });
      expect((await platform.repo.getSpec(siteId))!.spec.business.provider.legalName).toBe(VIES_NAME);
    } finally {
      await context.close();
    }
  }, 90_000);

  it("the team keeps only the people the client named, and \"Dodaj člana\" adds one", async () => {
    const siteId = await seed("racunovodstvo-seliskar");
    const { page, context } = await open(siteId, 1280, false);
    const members = async () => {
      const s = (await platform.repo.getSpec(siteId))!.spec;
      return s.pages.flatMap((p) => p.sections).flatMap((x) => (x.type === "team" ? x.props.members : []));
    };
    try {
      expect((await members()).map((m) => m.name)).toEqual(["Branka Seliškar"]);
      const s = (await platform.repo.getSpec(siteId))!.spec;
      const at = s.pages.findIndex((p) => p.sections.some((x) => x.type === "team"));
      if (at > 0) await page.getByLabel("Stran", { exact: true }).selectOption(String(at));
      await page.locator(".outline li", { hasText: "Ekipa" }).first().click();
      await page.getByRole("button", { name: "+ Dodaj člana" }).click();
      await expect.poll(async () => (await members()).length).toBe(2);
      // The new person's name is the owner's to type: missing until then, never made up.
      expect((await members())[1]!.name).toEqual({ $placeholder: "name" });
    } finally {
      await context.close();
    }
  }, 90_000);

  it("writes the numbers", async () => {
    const out = process.env.SB_TAPS_OUT;
    if (!out) return;
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, `${JSON.stringify(results, null, 2)}\n`);
  });
});
