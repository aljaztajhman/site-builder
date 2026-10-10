import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { serveStatic, type StaticServer } from "@sb/engine";
import { ComposedProps, type Section } from "@sb/spec";
import { COMPOSED, WIDTHS, loadComposed, openPage, writeComposedSite } from "../src/compose-sheet.ts";

/**
 * The composed type scale is monotonic whatever the template's tokens: a heading at size step n is never smaller than one
 * at step n − 1, at 1280 and 360 px, in the tablica, cevi and skorja directions (Tablica sets --fs-h2 above --fs-h1).
 * Also: a seal's short Slovene label never breaks inside a word. No model call.
 */
let browser: Browser;
let dir: string;
let server: StaticServer;
beforeAll(async () => {
  browser = await chromium.launch();
  dir = await mkdtemp(path.join(tmpdir(), "sb-composed-scale-"));
  server = await serveStatic(dir);
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
  await rm(dir, { recursive: true, force: true });
});

const STEPS = [2, 3, 4, 5, 6, 7, 8] as const;
const SEALS = ["Odprto ob", "pon–sob odprto od"];

/** One heading per size step, stacked; and a seal with a two-word label. */
function scaleSection(): Section {
  return {
    id: "s_scale",
    type: "composed",
    variant: "free",
    props: ComposedProps.parse({
      intent: "hero",
      width: "wide",
      rows: STEPS.length + 1,
      elements: [
        ...STEPS.map((n, i) => ({ id: `e_h${n}`, kind: "heading", text: `Korak ${n}`, level: i === 0 ? 1 : 2, size: n, desk: { col: 1, span: 12, row: i + 1 }, phone: { order: i, span: "full" } })),
        // The brief's label, and Skorja's opener seal (two columns wide on desktop, half a row on phones).
        { id: "e_seal", kind: "fact", value: "6.30", label: SEALS[0], treatment: "seal", size: 4, desk: { col: 1, span: 3, row: STEPS.length + 1 }, phone: { order: STEPS.length, span: "half" } },
        { id: "e_seal2", kind: "fact", value: "6.30", label: SEALS[1], treatment: "seal", size: 5, desk: { col: 7, span: 2, row: STEPS.length + 1 }, phone: { order: STEPS.length + 1, span: "half" } },
      ],
    }),
  } as Section;
}

describe("composed type scale and seal labels", () => {
  for (const t of COMPOSED) {
    it(`${t.id} ${t.name} (${t.fixture}): steps 2–8 never shrink; the seal label keeps whole words`, async () => {
      const spec = await loadComposed(t);
      spec.pages.find((p) => p.kind === "home")!.sections = [scaleSection()];
      const file = await writeComposedSite(t, spec, dir);
      const problems: string[] = [];
      for (const w of WIDTHS) {
        const { page, ctx } = await openPage(browser, w, `${server.url}/${file}`);
        try {
          const sizes = await page.evaluate((steps) => steps.map((n) => parseFloat(getComputedStyle(document.querySelector(`.cx-h[data-sz="${n}"]`)!).fontSize)), [...STEPS]);
          for (let i = 1; i < sizes.length; i++) {
            if (sizes[i]! < sizes[i - 1]! - 0.01) problems.push(`${w.width} px: step ${STEPS[i]} ${sizes[i]} px < step ${STEPS[i - 1]} ${sizes[i - 1]} px`);
          }
          // Each word of a seal's label sits on one line: a word's range has one line box (no hyphen, no break inside it).
          const seals = await page.evaluate((labels) => {
            return labels.map((want) => {
              const label = [...document.querySelectorAll("#s_scale .cx-fact--seal .cx-fact__label")].find((el) => el.textContent?.trim() === want);
              if (!label) return { want, found: false, hyphens: "", split: [] as string[] };
              const node = [...label.childNodes].find((n) => n.nodeType === Node.TEXT_NODE)!;
              const split: string[] = [];
              for (const m of (node.textContent ?? "").matchAll(/\S+/g)) {
                const r = document.createRange();
                r.setStart(node, m.index);
                r.setEnd(node, m.index + m[0].length);
                if (new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size > 1) split.push(m[0]);
              }
              return { want, found: true, hyphens: getComputedStyle(label).hyphens, split };
            });
          }, SEALS);
          for (const seal of seals) {
            if (!seal.found) problems.push(`${w.width} px: no seal labelled "${seal.want}"`);
            if (seal.hyphens === "auto") problems.push(`${w.width} px: seal label "${seal.want}" has hyphens: auto`);
            for (const word of seal.split) problems.push(`${w.width} px: seal label "${seal.want}" breaks inside "${word}"`);
          }
        } finally {
          await ctx.close();
        }
      }
      expect(problems).toEqual([]);
    }, 120_000);
  }
});
