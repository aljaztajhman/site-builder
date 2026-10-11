import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { serveStatic, type StaticServer } from "@sb/engine";
import { artifactDocument } from "../src/okus-page.ts";

/**
 * The approval rating page (tools/approval/index.html) in Chromium on a tiny made-up round (3 pages, plain-colour
 * pictures): taps and "done" are stored through localStorage without the `db` capability and through a stubbed
 * `claude.use("db")` with it; nothing scrolls sideways at 360 and 1280 px. No model call, no network.
 */
const PAGE_HTML = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../approval/index.html");
const PAGES = ["p01", "p02", "p03"].map((id, i) => ({
  id,
  title: `Test page ${i + 1} with a rather long title to check that it wraps on a narrow phone screen`,
  fixtureId: "pekarna-kvas",
  stance: "oversized-type",
  seed: i + 1,
  kind: "named",
  desktop: `img/${id}-desk.jpg`,
  phone: `img/${id}-phone.jpg`,
  parts: [
    { id: "s1", label: "Section 1 — opening", assets: ["composition/hero/a"], image: `img/${id}-s1.jpg` },
    { id: "s2", label: "Section 2 — opening hours with a long label to wrap", assets: ["composition/hours/b"], image: `img/${id}-s2.jpg` },
    { id: "colours", label: "Colours", assets: ["palette/c"], image: null, swatches: ["#ffffff", "#edf2ef", "#24130a", "#8c2a2a", "#af3e31", "#ecc56a"] },
    { id: "fonts", label: "Fonts", assets: ["pairing/some-very-long-pairing-name--another-very-long-font-name"], image: null },
  ],
}));

let browser: Browser;
let server: StaticServer;
let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-approval-page-"));
  await mkdir(path.join(dir, "img"), { recursive: true });
  await writeFile(path.join(dir, "index.html"), artifactDocument(await readFile(PAGE_HTML, "utf8")));
  await writeFile(path.join(dir, "items.json"), JSON.stringify({ pages: PAGES }));
  const jpg = (w: number, h: number, c: string) => sharp({ create: { width: w, height: h, channels: 3, background: c } }).jpeg().toBuffer();
  for (const p of PAGES) {
    await writeFile(path.join(dir, p.desktop), await jpg(900, 3000, "#c0392b"));
    await writeFile(path.join(dir, p.phone), await jpg(360, 5000, "#2c7a4b"));
    for (const part of p.parts) if (part.image) await writeFile(path.join(dir, part.image), await jpg(700, 400, "#2b44c9"));
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
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  await page.goto(`${server.url}/index.html`);
  await page.getByText(/\d of 3/).first().waitFor();
  return { page, ctx };
}

const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("approval:flags") ?? "{}") as Record<string, Record<string, unknown>>);
const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

describe("approval page without the db capability (localStorage)", () => {
  it("asks the question, stores taps, notes and done, moves on, and resumes after a reload", async () => {
    const { page, ctx } = await open(1280);
    try {
      expect(await page.getByText("Would you be happy if a client's site looked like this?").count()).toBe(1);
      expect(await page.locator("#count").textContent()).toBe("1 of 3 · 0 done");
      await page.locator('.part[data-part="s2"]').click();
      expect(await page.locator('.part[data-part="s2"]').getAttribute("aria-pressed")).toBe("true");
      await page.locator('.part[data-part="colours"]').click();
      await page.locator('.part[data-part="colours"]').click(); // tapped twice: off again
      await page.locator("#note").fill("Too busy.");
      await page.locator("#done").click();
      await page.locator("#count").getByText("2 of 3 · 1 done").waitFor();
      const flags = await stored(page);
      expect(flags.p01).toMatchObject({ pageId: "p01", flagged: ["s2"], note: "Too busy.", done: true });
      expect(typeof flags.p01!.at).toBe("string");

      await page.reload();
      await page.locator("#count").getByText("2 of 3 · 1 done").waitFor();
      await page.locator("#prev").click();
      expect(await page.locator('.part[data-part="s2"]').getAttribute("aria-pressed")).toBe("true");
      expect(await page.locator("#note").inputValue()).toBe("Too busy.");
      expect(await page.locator("#done").textContent()).toMatch(/reopen/);
    } finally {
      await ctx.close();
    }
  }, 60_000);
});

describe("approval page with the db capability", () => {
  it("writes the flags documents to the shared store (and mirrors them locally)", async () => {
    const { page, ctx } = await open(1280, () => {
      const docs: Record<string, Record<string, unknown>> = {};
      (window as unknown as { __docs: typeof docs }).__docs = docs;
      const db = {
        collection: (col: string) => ({
          doc: (id: string) => ({
            id,
            get: async () => ({ id, exists: `${col}/${id}` in docs, data: () => docs[`${col}/${id}`] }),
            set: async (d: Record<string, unknown>) => {
              docs[`${col}/${id}`] = structuredClone(d);
            },
          }),
          get: async () => {
            const list = Object.keys(docs).filter((k) => k.startsWith(`${col}/`)).map((k) => ({ id: k.slice(col.length + 1), exists: true, data: () => docs[k] }));
            return { docs: list, size: list.length, empty: !list.length };
          },
        }),
      };
      (window as unknown as { claude: { use: (n: string) => Promise<unknown> } }).claude = { use: async (n: string) => (n === "db" ? db : null) };
    });
    try {
      await expect.poll(() => page.getByText("shared store").count()).toBeGreaterThan(0);
      await page.locator('.part[data-part="s1"]').click();
      await page.locator("#done").click();
      await page.locator("#count").getByText("2 of 3").waitFor();
      const docs = await page.evaluate(() => (window as unknown as { __docs: Record<string, unknown> }).__docs);
      expect(docs["flags/p01"]).toMatchObject({ pageId: "p01", flagged: ["s1"], done: true });
      expect((await stored(page)).p01).toMatchObject({ flagged: ["s1"] });
    } finally {
      await ctx.close();
    }
  }, 60_000);
});

describe("approval page layout", () => {
  for (const width of [360, 1280]) {
    it(`no sideways scroll at ${width} px`, async () => {
      const { page, ctx } = await open(width);
      try {
        expect(await noSideScroll(page)).toBe(true);
        await page.locator('.part[data-part="fonts"]').click();
        expect(await noSideScroll(page)).toBe(true);
        await page.locator("#next").click();
        expect(await noSideScroll(page)).toBe(true);
      } finally {
        await ctx.close();
      }
    }, 60_000);
  }
});
