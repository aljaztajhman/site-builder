import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Browser } from "playwright";
import { FONT_PAIRS, INVENTORY_FONT_PAIRS } from "@sb/spec";
import { repoRoot } from "../compose-sheet.ts";

/** Every face that sets headings today: the shipped pairs' and the inventory pairs' (file stem, family, weight range). */
export function headingFaces(): { file: string; family: string; weights: [number, number] }[] {
  const all = [...FONT_PAIRS, ...INVENTORY_FONT_PAIRS].map((p) => p.heading);
  return [...new Map(all.map((f) => [f.file, { file: f.file, family: f.family, weights: f.weights }])).values()];
}

export interface MarkInk {
  /** Ink top of the tallest capital with a mark above it (À–ſ), in em above the baseline. */
  mark: number;
  /** Ink bottom of the deepest lower-case descender (g j p q y , ; ą ę ç ş), in em below the baseline. */
  desc: number;
  /** The same for text set in capitals (Q J , ; Ą Ę Ç Ş). */
  capsDesc: number;
}

/**
 * The ink of a face in Chromium (canvas ink metrics of the shipped woff2), at the lightest heading weight we set (400,
 * or the face's own) and its heaviest: the larger of each. What a display line with a marked capital needs between its
 * baselines: mark + desc (+ air).
 */
export async function measureMarkInk(browser: Browser): Promise<Record<string, MarkInk>> {
  const faces = headingFaces();
  const data = await Promise.all(faces.map(async (f) => (await readFile(path.join(repoRoot, "packages/render/assets/fonts", `${f.file}.woff2`))).toString("base64")));
  const ctx = await browser.newContext();
  try {
    const page = await ctx.newPage();
    // tsx (esbuild keepNames) wraps the named functions below in __name(): give the page one.
    await page.setContent("<!doctype html><html><body></body></html>");
    await page.evaluate("window.__name = (f) => f");
    const out = await page.evaluate(
      async ({ faces, data }) => {
        const marked: string[] = [];
        for (let c = 0xc0; c <= 0x17f; c++) {
          const ch = String.fromCodePoint(c);
          const parts = ch.normalize("NFD");
          if (parts.length > 1 && /\p{Lu}/u.test(parts[0]!) && /[̀-̽̕̚-̈́͆͊-͌]/u.test(parts.slice(1))) marked.push(ch);
        }
        const res: Record<string, { mark: number; desc: number; capsDesc: number }> = {};
        const canvas = document.createElement("canvas").getContext("2d")!;
        for (let i = 0; i < faces.length; i++) {
          const f = faces[i]!;
          const bytes = Uint8Array.from(atob(data[i]!), (c) => c.charCodeAt(0));
          const fam = `m-${f.file}`;
          const face = new FontFace(fam, bytes.buffer, { weight: `${f.weights[0]} ${f.weights[1]}` });
          await face.load();
          document.fonts.add(face);
          const r = { mark: 0, desc: 0, capsDesc: 0 };
          for (const w of [Math.max(400, f.weights[0]), f.weights[1]]) {
            canvas.font = `${w} 1000px "${fam}"`;
            const up = (s: string) => Math.max(...[...s].map((ch) => canvas.measureText(ch).actualBoundingBoxAscent)) / 1000;
            const down = (s: string) => Math.max(...[...s].map((ch) => canvas.measureText(ch).actualBoundingBoxDescent)) / 1000;
            r.mark = Math.max(r.mark, up(marked.join("")));
            r.desc = Math.max(r.desc, down("gjpqy,;ąęçş"));
            r.capsDesc = Math.max(r.capsDesc, down("QJ,;ĄĘÇŞ"));
          }
          res[f.file] = r;
        }
        return res;
      },
      { faces, data },
    );
    return out;
  } finally {
    await ctx.close();
  }
}
