// @module-tag slow
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { serveStatic, type StaticServer } from "@sb/engine";
import { ComposedProps, type Section } from "@sb/spec";
import { COMPOSED, WIDTHS, loadComposed, openPage, writeComposedSite, checkPage } from "../src/compose-sheet.ts";

/**
 * Four composed-renderer faults found building reference homepages (HQ it-studio-references), each held in a browser
 * at 1280 and 360 px: a lead paragraph is never hyphenated (a name split at a line end reads as a typo); a timeline's
 * lead text clears its ring at every list size; a map's address keeps the section's text colour whatever colour role
 * the map has; a prices board pairs each name with its price and fits a phone. No model call.
 */
let browser: Browser;
let dir: string;
let server: StaticServer;
beforeAll(async () => {
  browser = await chromium.launch();
  dir = await mkdtemp(path.join(tmpdir(), "sb-composed-fixes-"));
  server = await serveStatic(dir);
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
  await rm(dir, { recursive: true, force: true });
});

const T = COMPOSED[0]!;

async function open(sections: Section[], w: (typeof WIDTHS)[number]) {
  const spec = await loadComposed(T);
  spec.pages.find((p) => p.kind === "home")!.sections = sections;
  const file = await writeComposedSite(T, spec, dir);
  return openPage(browser, w, `${server.url}/${file}`);
}

const shot = async (page: Page, name: string, w: number) => {
  if (process.env.SB_SHOTS) await page.screenshot({ path: path.join(process.env.SB_SHOTS, `${name}-${w}.png`), fullPage: true });
};

function composed(id: string, rows: number, elements: unknown[], tone?: "inverse"): Section {
  return { id, type: "composed", variant: "free", ...(tone ? { tone } : {}), props: ComposedProps.parse({ intent: "story", width: "contained", rows, elements }) } as Section;
}

describe("composed renderer fixes", () => {
  it("a lead paragraph is not hyphenated", async () => {
    const s = composed("s_lead", 1, [
      { id: "e_t", kind: "text", paragraphs: ["Anže Kovačevič-Štefančič in Marjetka Potočnik-Hribernik vodita delavnico že dvajset let."], size: 1, desk: { col: 1, span: 6, row: 1 }, phone: { order: 0, span: "full" } },
    ]);
    for (const w of WIDTHS) {
      const { page, ctx } = await open([s], w);
      try {
        const h = await page.evaluate(() => getComputedStyle(document.querySelector("#s_lead .cx-t--lead p")!).hyphens);
        expect(h, `${w.width} px`).toBe("manual");
      } finally {
        await ctx.close();
      }
    }
  }, 120_000);

  it("a timeline's lead text clears its ring at both list sizes", async () => {
    const items = [
      { lead: "2004", text: "Odprtje delavnice" },
      { lead: "2012", text: "Nova stavba" },
      { lead: "2020", text: "Druga generacija" },
    ];
    const s = composed(
      "s_tl",
      2,
      [1, 2].map((size, i) => ({ id: `e_l${size}`, kind: "list", items, marker: "line", size, desk: { col: 1, span: 12, row: i + 1 }, phone: { order: i, span: "full" } })),
    );
    for (const w of WIDTHS) {
      const { page, ctx } = await open([s], w);
      try {
        await shot(page, "timeline", w.width);
        const gaps = await page.evaluate(() =>
          [...document.querySelectorAll("#s_tl .cx-l--line")].map((ul) => {
            const li = ul.querySelector("li")!;
            const cs = getComputedStyle(li);
            const ring = getComputedStyle(li, "::before");
            const ringRight = parseFloat(ring.left) + parseFloat(ring.width);
            return { size: ul.className.match(/cx-ls-\d/)?.[0], gap: parseFloat(cs.paddingLeft) - ringRight };
          }),
        );
        expect(gaps.length).toBe(2);
        for (const g of gaps) expect(g.gap, `${w.width} px ${g.size}`).toBeGreaterThanOrEqual(6);
      } finally {
        await ctx.close();
      }
    }
  }, 120_000);

  it("a map with an accent colour keeps its address in the section's text colour on a dark section", async () => {
    const s = composed("s_map", 1, [{ id: "e_m", kind: "map", style: "street", color: "accent", desk: { col: 1, span: 6, row: 1 }, phone: { order: 0, span: "full" } }], "inverse");
    for (const w of WIDTHS) {
      const { page, ctx } = await open([s], w);
      try {
        await shot(page, "map", w.width);
        const c = await page.evaluate(() => {
          const addr = document.querySelector("#s_map .cx-map__cap address")!;
          const body = document.querySelector("#s_map .cx-t, #s_map")!;
          return { addr: getComputedStyle(addr).color, section: getComputedStyle(document.querySelector("#s_map")!).color, body: getComputedStyle(body).color };
        });
        expect(c.addr, `${w.width} px`).toBe(c.section);
        const checks = await checkPage(page);
        expect(checks.axe.filter((a) => a.startsWith("color-contrast")), `${w.width} px`).toEqual([]);
      } finally {
        await ctx.close();
      }
    }
  }, 120_000);

  it("a prices board pairs name and price on one row and fits a phone", async () => {
    const items = [
      { name: "Menjava olja in filtra", note: "Vključuje material", price: { amount: 49, from: true } },
      { name: "Diagnostika motorja z računalnikom in poročilom o napakah", price: { amount: 35 } },
      { name: "Menjava zavornih ploščic", price: { onRequest: true } },
      { name: "Pnevmatike", price: { amount: 20, unit: "na kolo" } },
      { name: "Ličenje", price: { onRequest: true } },
    ];
    const s = composed("s_pb", 1, [{ id: "e_p", kind: "prices", items, style: "board", desk: { col: 1, span: 8, row: 1 }, phone: { order: 0, span: "full" } }]);
    for (const w of WIDTHS) {
      const { page, ctx } = await open([s], w);
      try {
        await shot(page, "board", w.width);
        const rows = await page.evaluate(() =>
          [...document.querySelectorAll("#s_pb .prices__row")].map((r) => {
            const dt = r.querySelector("dt")!.getBoundingClientRect();
            const dd = r.querySelector("dd")!.getBoundingClientRect();
            const board = document.querySelector("#s_pb .cx-prices--board")!.getBoundingClientRect();
            return { dtTop: dt.top, dtBottom: dt.bottom, dtLeft: dt.left, ddTop: dd.top, ddLeft: dd.left, dtRight: dt.right, ddRight: dd.right, board: board.right, ddW: dd.width };
          }),
        );
        for (const r of rows) {
          expect(r.ddRight, `${w.width} px price inside the board`).toBeLessThanOrEqual(r.board + 0.5);
          if (w.width >= 768) {
            // A menu board: the price to the right of the name's box and on its line.
            expect(r.ddLeft, `${w.width} px price right of name`).toBeGreaterThanOrEqual(r.dtRight - 0.5);
            expect(Math.abs(r.ddTop - r.dtTop), `${w.width} px same row`).toBeLessThan(40);
          } else {
            // Phones: a price that fits beside its name stays on the line; one that does not wraps under it from the same edge.
            const beside = r.ddLeft >= r.dtRight - 0.5 && Math.abs(r.ddTop - r.dtTop) < 40;
            const under = r.ddTop >= r.dtBottom - 0.5 && Math.abs(r.ddLeft - r.dtLeft) < 1;
            expect(beside || under, `${w.width} px price pairs with its name`).toBe(true);
          }
        }
        const checks = await checkPage(page);
        expect(checks.horizontalScroll, `${w.width} px scroll ${checks.scrollWidth}`).toBe(false);
        // The test page has no heading of its own: the one-h1 rule is the composed sheet's, not this fault's.
        expect(checks.axe.filter((a) => !a.startsWith("page-has-heading-one"))).toEqual([]);
      } finally {
        await ctx.close();
      }
    }
  }, 120_000);
});
