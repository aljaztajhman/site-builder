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
 * potrebujemo" by itself; the owner types the facts and taps Objavi. The budgets only go down. SB_TAPS_OUT=<file> writes the numbers as JSON;
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
/** Taps from opening the editor to a published site, per fixture; measured 2026-10-04 (docs/plans/zero-to-live.md). */
const BUDGET: Record<string, Record<Width, number>> = {
  "avtoservis-mrak": { 375: 5, 1280: 5 },
  "frizerstvo-lana": { 375: 6, 1280: 6 },
  "racunovodstvo-seliskar": { 375: 9, 1280: 9 },
};
const ALL = process.env.SB_Z2L_ALL === "1";

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-zero-to-live-"));
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
  taxNumber: "SI12345678",
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
 * Selects (days of the week) keep what they show. Returns the taps.
 */
async function fillAsk(page: Page): Promise<number> {
  let taps = 0;
  const inputs = page.locator("#facts-ask [data-ask] input:not([type=checkbox]):not([type=hidden]):not([type=color])");
  const n = await inputs.count();
  for (let i = 0; i < n; i++) {
    const input = inputs.nth(i);
    const leaf = await input.evaluate((el) => el.closest<HTMLElement>("[data-path]")?.dataset.path ?? "");
    const key = leaf.split("/").filter((x) => !/^\d+$/.test(x)).pop() ?? "";
    const text = TYPED[key];
    if (text === undefined) throw new Error(`no test value for ${leaf}`);
    if (!(await input.evaluate((el) => el === document.activeElement))) {
      taps++;
      await input.click();
    }
    await input.fill(text);
  }
  return taps;
}

const fixtures = ALL ? ["avtoservis-mrak", "fizioterapija-pregib", "frizerstvo-lana", "gostilna-zlata-zlica", "instalacije-rebernik", "kmetija-grabnar", "pekarna-kvas", "racunovodstvo-seliskar", "trgovina-oljka-in-sol", "zobozdravstvo-lebar"] : Object.keys(BUDGET);
const results: Record<string, Record<string, { taps: number; asked: number; left: number }>> = {};

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
          if (asked.length) {
            // Opens by itself after a generation, with the first missing fact focused.
            await page.locator("#facts-ask").waitFor();
            expect(await page.locator("#facts-ask [data-ask]").count()).toBe(asked.length);
            if (process.env.SB_Z2L_SHOTS) await page.screenshot({ path: path.join(process.env.SB_Z2L_SHOTS, `${id}-${width}.png`), fullPage: true });
            taps += await fillAsk(page);
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
          (results[id] ??= {})[width] = { taps, asked: asked.length, left: before.length - asked.length };
          if (BUDGET[id]) expect(taps).toBeLessThanOrEqual(BUDGET[id][width]);
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

  it("writes the numbers", async () => {
    const out = process.env.SB_TAPS_OUT;
    if (!out) return;
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, `${JSON.stringify(results, null, 2)}\n`);
  });
});
