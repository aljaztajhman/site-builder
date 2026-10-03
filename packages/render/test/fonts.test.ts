import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { allFontFaces } from "@sb/spec";
import { fileURLToPath } from "node:url";

interface FkFont {
  variationAxes: Record<string, { min: number; max: number; default: number }>;
  hasGlyphForCodePoint(cp: number): boolean;
  glyphForCodePoint(cp: number): { id: number; path: { commands: unknown[] } };
}
const require = createRequire(import.meta.url);
/** Same directory packages/render/src/shared.ts reads (not imported, to keep this test independent of the stylesheet bundle). */
const FONTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../assets/fonts");
const fontkit = require("fontkit") as { create(buf: Buffer): FkFont };

const SLOVENE_AND_PUNCTUATION = "č š ž ć đ Č Š Ž Ć Đ € „ “ – …".replace(/ /g, "");
const ASCII_LETTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

describe("self-hosted fonts (pnpm fonts)", () => {
  for (const face of allFontFaces()) {
    describe(face.family, () => {
      const file = path.join(FONTS_DIR, `${face.file}.woff2`);

      it("exists with its licence", () => {
        expect(existsSync(file)).toBe(true);
        expect(existsSync(path.join(FONTS_DIR, "LICENSES", `${face.file}.txt`))).toBe(true);
      });

      it("stays within the 60 KB per-family budget", () => {
        expect(statSync(file).size).toBeLessThanOrEqual(60 * 1024);
      });

      it("parses, keeps the wght axis and covers Slovene text", () => {
        const font = fontkit.create(readFileSync(file));
        const wght = font.variationAxes.wght;
        expect(wght, "wght axis").toBeDefined();
        // The file holds exactly the weights the @font-face rule declares (a narrower file would fake the rest).
        expect([wght!.min, wght!.max]).toEqual(face.weights);
        const missing = [...SLOVENE_AND_PUNCTUATION, ...ASCII_LETTERS].filter((ch) => {
          const cp = ch.codePointAt(0)!;
          if (!font.hasGlyphForCodePoint(cp)) return true;
          const g = font.glyphForCodePoint(cp);
          return g.id === 0 || g.path.commands.length === 0;
        });
        expect(missing.join("")).toBe("");
      });
    });
  }
});
