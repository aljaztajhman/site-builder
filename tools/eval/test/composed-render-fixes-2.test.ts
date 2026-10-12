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
 * Three composed-renderer faults found building reference homepages (HQ it-studio-render-fixes-2), each held in a
 * browser at 1280 and 360 px: a wide section's content starts where the site header's does; side-by-side fields keep
 * the colour their text was checked against when the columns stack on a phone; a display heading never breaks inside
 * a word. No model call.
 */
let browser: Browser;
let dir: string;
let server: StaticServer;
beforeAll(async () => {
  browser = await chromium.launch();
  dir = await mkdtemp(path.join(tmpdir(), "sb-composed-fixes2-"));
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

function composed(id: string, width: "contained" | "wide" | "full", rows: number, elements: unknown[], extra: Record<string, unknown> = {}): Section {
  return { id, type: "composed", variant: "free", props: ComposedProps.parse({ intent: "story", width, rows, elements, ...extra }) } as Section;
}

describe("composed renderer fixes, round 2", () => {
  it("a wide section's content starts where the header's content starts", async () => {
    const s = composed("s_w", "wide", 1, [{ id: "e_h", kind: "heading", text: "Naša delavnica", level: 2, size: 3, desk: { col: 1, span: 6, row: 1 }, phone: { order: 0, span: "full" } }]);
    for (const w of WIDTHS) {
      const { page, ctx } = await open([s], w);
      try {
        await shot(page, "wide", w.width);
        const x = await page.evaluate(() => {
          const inner = document.querySelector(".site-header__inner")!;
          return { header: inner.getBoundingClientRect().left + parseFloat(getComputedStyle(inner).paddingLeft), section: document.querySelector("#s_w h2")!.getBoundingClientRect().left };
        });
        expect(x.section, `${w.width} px`).toBeCloseTo(x.header, 0);
      } finally {
        await ctx.close();
      }
    }
  }, 120_000);

  it("on a phone, side-by-side fields sit behind the text they were chosen for", async () => {
    const side = (id: string, col: number) => [
      { id: `e_${id}_h`, kind: "heading", text: `Naslov ${id}`, level: 2, size: 3, desk: { col, span: 6, row: 1 }, phone: { order: col > 1 ? 1 : 0, span: "full" } },
      { id: `e_${id}_t`, kind: "text", paragraphs: ["Besedilo, ki mora biti na svoji barvi tudi takrat, ko se stolpca na telefonu zložita en pod drugega."], desk: { col, span: 6, row: 2 }, phone: { order: col > 1 ? 3 : 2, span: "full" } },
    ];
    const s = composed("s_f", "contained", 2, [...side("a", 1), ...side("b", 7)], {
      background: [
        { kind: "field", role: "inverse", cols: { from: 1, to: 6 } },
        { kind: "field", role: "band", cols: { from: 7, to: 12 } },
      ],
    });
    for (const w of WIDTHS) {
      const { page, ctx } = await open([s], w);
      try {
        await shot(page, "fields", w.width);
        const bad = await page.evaluate(() => {
          const out: string[] = [];
          for (const el of document.querySelectorAll<HTMLElement>("#s_f .cx-on > *")) {
            const r = el.getBoundingClientRect();
            if (!r.height) continue;
            const on = el.closest(".cx-on")!;
            const probe = document.createElement("i");
            probe.style.background = "var(--cx-rc)";
            on.appendChild(probe);
            const want = getComputedStyle(probe).backgroundColor;
            probe.remove();
            const cy = r.top + r.height / 2;
            const cx = r.left + r.width / 2;
            const fields = [...document.querySelectorAll<HTMLElement>("#s_f .cx-field")].filter((f) => {
              const b = f.getBoundingClientRect();
              return getComputedStyle(f).display !== "none" && cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom;
            });
            const got = [...new Set(fields.map((f) => getComputedStyle(f).backgroundColor))];
            if (got.length !== 1 || got[0] !== want) out.push(`${el.className || el.tagName}: want ${want}, field(s) ${got.join("|") || "none"}`);
          }
          return out;
        });
        expect(bad, `${w.width} px`).toEqual([]);
        expect((await checkPage(page)).axe.filter((a) => a.startsWith("color-contrast")), `${w.width} px`).toEqual([]);
      } finally {
        await ctx.close();
      }
    }
  }, 120_000);

  it("an uppercase display heading never breaks inside a word", async () => {
    const s = composed("s_d", "contained", 1, [
      { id: "e_d", kind: "heading", text: "Avtomobilski servis Sever", level: 2, size: 7, weight: 800, case: "uppercase", desk: { col: 1, span: 12, row: 1 }, phone: { order: 0, span: "full" } },
    ]);
    for (const w of WIDTHS) {
      const { page, ctx } = await open([s], w);
      try {
        await shot(page, "display", w.width);
        const res = await page.evaluate(() => {
          const h = document.querySelector("#s_d h2")!;
          const split: string[] = [];
          const walker = document.createTreeWalker(h, NodeFilter.SHOW_TEXT);
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            for (const m of (n.textContent ?? "").matchAll(/\S+/g)) {
              const range = document.createRange();
              range.setStart(n, m.index!);
              range.setEnd(n, m.index! + m[0].length);
              const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
              if (lines.size > 1) split.push(m[0]);
            }
          }
          return { split, over: h.scrollWidth > Math.ceil(h.getBoundingClientRect().width) + 1 };
        });
        expect(res.split, `${w.width} px words split over lines`).toEqual([]);
        expect(res.over, `${w.width} px heading overflows its box`).toBe(false);
      } finally {
        await ctx.close();
      }
    }
  }, 120_000);
});
