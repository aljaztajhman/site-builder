import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { serveStatic, type StaticServer } from "@sb/engine";
import { stageOkus } from "../src/okus-page.ts";
import { imagePaths, itemsJson, pairsJson, type OkusItem, type OkusPair } from "../src/okus-round.ts";

/**
 * The Okus rating page (tools/okus/index.html) in Chromium on a tiny made-up round (3 items, 1 pair, plain-colour
 * pictures): the storage adapter writes and reads ratings through localStorage when there is no `db` capability and
 * through a stubbed `claude.use("db")` when there is; the flow works by keyboard; nothing scrolls sideways at 360 and
 * 1280 px. No model call, no network (Google Fonts are blocked).
 */
const ITEMS: OkusItem[] = ["aa", "bb", "cc"].map((id, i) => ({
  id: `t-${id}`,
  kind: i === 0 ? "reference" : "golden",
  label: `Test ${id}`,
  trade: "bakery",
  fixture: null,
  source: "none",
  images: imagePaths(`t-${id}`),
}));
const PAIRS: OkusPair[] = [{ id: "p01", kind: "reference-golden", a: "t-bb", b: "t-aa" }];

let browser: Browser;
let server: StaticServer;
let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-okus-page-"));
  await stageOkus(dir, { copyRounds: false });
  const round = path.join(dir, "rounds/1");
  await mkdir(path.join(round, "img"), { recursive: true });
  await writeFile(path.join(dir, "rounds/index.json"), JSON.stringify({ rounds: [1] }));
  await writeFile(path.join(round, "items.json"), itemsJson(1, ITEMS));
  await writeFile(path.join(round, "pairs.json"), pairsJson(1, PAIRS));
  const jpg = (w: number, h: number, c: string) => sharp({ create: { width: w, height: h, channels: 3, background: c } }).jpeg().toBuffer();
  for (const [i, it] of ITEMS.entries()) {
    const c = ["#c0392b", "#2c7a4b", "#2b44c9"][i]!;
    await writeFile(path.join(round, it.images.desk), await jpg(1280, 800, c));
    await writeFile(path.join(round, it.images.deskFull), await jpg(1280, 3000, c));
    await writeFile(path.join(round, it.images.phone), await jpg(720, 1600, c));
    await writeFile(path.join(round, it.images.phoneFull), await jpg(720, 6000, c));
  }
  server = await serveStatic(dir);
  browser = await chromium.launch();
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
  if (dir) await rm(dir, { recursive: true, force: true });
});

async function open(width: number, init?: () => void): Promise<{ page: Page; ctx: BrowserContext }> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  await page.goto(`${server.url}/index.html`);
  await page.getByText(/Stran \d od 3/).waitFor();
  return { page, ctx };
}

const stored = (page: Page, col: string) => page.evaluate((c) => JSON.parse(localStorage.getItem(`okus:${c}`) ?? "{}") as Record<string, Record<string, unknown>>, col);
const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

describe("Okus page without the db capability (localStorage)", () => {
  it("stores ratings by keyboard and click, resumes after a reload, then asks the pair", async () => {
    const { page, ctx } = await open(1280);
    try {
      expect(await page.evaluate(async () => (await (window as unknown as { OkusStore: { open: () => Promise<{ kind: string }> } }).OkusStore.open()).kind)).toBe("local");
      await expect.poll(() => page.getByText("samo v tem brskalniku").count()).toBeGreaterThan(0);
      // Item 1: keys 4 and D, a note, the button.
      await page.keyboard.press("4");
      await page.keyboard.press("d");
      await page.locator("#note").fill("Lep naslov.");
      await page.locator("#next").click();
      await page.getByText("Stran 2 od 3").waitFor();
      // Item 2: keys only (2, N, Enter).
      await page.locator("body").click({ position: { x: 5, y: 300 } });
      await page.keyboard.press("2");
      await page.keyboard.press("n");
      await page.keyboard.press("Enter");
      await page.getByText("Stran 3 od 3").waitFor();

      const ratings = await stored(page, "ratings");
      expect(Object.keys(ratings).sort()).toEqual(["r1-t-aa", "r1-t-bb"]);
      expect(ratings["r1-t-aa"]).toMatchObject({ itemId: "t-aa", round: 1, score: 4, showCustomer: true, note: "Lep naslov." });
      expect(ratings["r1-t-bb"]).toMatchObject({ itemId: "t-bb", round: 1, score: 2, showCustomer: false, note: "" });
      expect(typeof ratings["r1-t-aa"]!.at).toBe("string");

      await page.reload();
      await page.getByText("Stran 3 od 3").waitFor();
      expect(await page.locator("#tab-items-n").textContent()).toBe("2/3");

      // Saving needs both answers.
      await page.keyboard.press("5");
      expect(await page.locator("#next").isDisabled()).toBe(true);
      await page.keyboard.press("d");
      await page.locator("#next").click();
      await page.getByText("Katera je boljša?").waitFor();
      await page.keyboard.press("a");
      await page.getByText("Hvala, runda je končana").waitFor();
      expect((await stored(page, "pairs"))["r1-p01"]).toMatchObject({ pairId: "p01", round: 1, winner: "t-bb" });
    } finally {
      await ctx.close();
    }
  }, 60_000);

  it("adapter: set, get and list round-trip through localStorage", async () => {
    const { page, ctx } = await open(1280);
    try {
      const r = await page.evaluate(async () => {
        const s = (window as unknown as { OkusStore: { local: { set: (c: string, id: string, d: object) => Promise<void>; get: (c: string, id: string) => Promise<unknown>; list: (c: string) => Promise<unknown[]> } } }).OkusStore.local;
        await s.set("ratings", "r1-x", { itemId: "x", score: 3 });
        return { one: await s.get("ratings", "r1-x"), all: await s.list("ratings"), raw: localStorage.getItem("okus:ratings") };
      });
      expect(r.one).toEqual({ itemId: "x", score: 3 });
      expect(r.all).toContainEqual({ id: "r1-x", itemId: "x", score: 3 });
      expect(JSON.parse(r.raw!)).toHaveProperty("r1-x");
    } finally {
      await ctx.close();
    }
  });
});

describe("Okus page with the db capability", () => {
  it("writes ratings and pair answers to the shared store (and mirrors them locally)", async () => {
    const { page, ctx } = await open(1280, () => {
      // A stand-in for claude.ai's `db` namespace (collection/doc/get/set), keeping documents on window.__docs.
      const docs: Record<string, Record<string, unknown>> = {};
      (window as unknown as { __docs: typeof docs }).__docs = docs;
      const doc = (col: string, id: string) => ({
        id,
        get: async () => ({ id, exists: `${col}/${id}` in docs, data: () => docs[`${col}/${id}`] }),
        set: async (d: Record<string, unknown>) => {
          docs[`${col}/${id}`] = structuredClone(d);
        },
      });
      const db = {
        collection: (col: string) => ({
          doc: (id: string) => doc(col, id),
          get: async () => {
            const hits = Object.keys(docs).filter((k) => k.startsWith(`${col}/`));
            const list = hits.map((k) => ({ id: k.slice(col.length + 1), exists: true, data: () => docs[k] }));
            return { docs: list, size: list.length, empty: !list.length };
          },
        }),
      };
      (window as unknown as { claude: { use: (n: string) => Promise<unknown> } }).claude = { use: async (n: string) => (n === "db" ? db : null) };
    });
    try {
      await expect.poll(() => page.getByText("skupno bazo").count()).toBeGreaterThan(0);
      await page.keyboard.press("3");
      await page.keyboard.press("n");
      await page.locator("#next").click();
      await page.getByText("Stran 2 od 3").waitFor();
      const docs = await page.evaluate(() => (window as unknown as { __docs: Record<string, unknown> }).__docs);
      expect(docs["ratings/r1-t-aa"]).toMatchObject({ itemId: "t-aa", round: 1, score: 3, showCustomer: false });
      expect((await stored(page, "ratings"))["r1-t-aa"]).toMatchObject({ score: 3 });
      await page.locator("#tab-pairs").click();
      await page.keyboard.press("e");
      await expect.poll(async () => (await page.evaluate(() => (window as unknown as { __docs: Record<string, unknown> }).__docs))["pairs/r1-p01"]).toMatchObject({ pairId: "p01", winner: "tie" });
    } finally {
      await ctx.close();
    }
  }, 60_000);
});

describe("Okus page layout", () => {
  for (const width of [360, 1280]) {
    it(`no sideways scroll at ${width} px (rating, pair, review, full page)`, async () => {
      const { page, ctx } = await open(width);
      try {
        expect(await noSideScroll(page)).toBe(true);
        await page.locator("#tab-pairs").click();
        await page.getByText("Katera je boljša?").waitFor();
        expect(await noSideScroll(page)).toBe(true);
        await page.locator("#tab-review").click();
        await page.getByText("Pregled").first().waitFor();
        expect(await noSideScroll(page)).toBe(true);
        await page.locator("#tab-items").click();
        await page.locator("button[data-kind=phone]").first().click();
        expect(await page.locator("dialog#full").evaluate((d) => (d as HTMLDialogElement).open)).toBe(true);
        await page.keyboard.press("Escape");
        expect(await page.locator("dialog#full").evaluate((d) => (d as HTMLDialogElement).open)).toBe(false);
      } finally {
        await ctx.close();
      }
    }, 60_000);
  }
});
