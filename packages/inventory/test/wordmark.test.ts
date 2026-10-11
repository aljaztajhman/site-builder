import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { FONT_PAIRS, WORDMARK_STYLES, generateWordmark, wordmarkLayout, type FontFace } from "@sb/spec";
import { SLOVENE_GLYPHS, fontFile, inventory, wordmarkAssets } from "../src/index.ts";
import { WORDMARK_NAMES } from "../scripts/pages-v2.ts";

/**
 * Wordmarks (I9a): every style draws every letter of every name, in capitals where the style sets capitals, in each face a
 * site's pairing can give it (the display face, or the text face with role "text"), including č š ž ć đ. Same check as the
 * per-font test in assets.test.ts, on the text a style actually sets.
 */
interface FkFont {
  hasGlyphForCodePoint(cp: number): boolean;
  glyphForCodePoint(cp: number): { id: number; path: { commands: unknown[] } };
}
const fontkit = createRequire(import.meta.url)("fontkit") as { create(buf: Buffer): FkFont };

const faces = new Map<string, FontFace>();
for (const p of FONT_PAIRS) for (const f of [p.heading, p.body]) faces.set(f.file, f);
const fonts = new Map([...faces.keys()].map((file) => [file, fontkit.create(readFileSync(fontFile(file)))] as const));
const draws = (font: FkFont, ch: string): boolean => {
  const cp = ch.codePointAt(0)!;
  if (!font.hasGlyphForCodePoint(cp)) return false;
  const g = font.glyphForCodePoint(cp);
  return g.id !== 0 && (/\s/u.test(ch) || g.path.commands.length > 0);
};

/** The text a style sets for a name: the name in the style's case, and the initials. */
function setText(name: string, style: (typeof WORDMARK_STYLES)[number]): string {
  const { options } = wordmarkLayout(name, style);
  return (options.case === "upper" ? options.lines.join(" ").toLocaleUpperCase("sl") : options.lines.join(" ")) + options.monogram;
}

describe("every wordmark style draws the Slovene letters", () => {
  const names = [...WORDMARK_NAMES, `Čšž ćđ ČŠŽ ĆĐ`];
  for (const style of WORDMARK_STYLES)
    it(`${style}: every letter of the 20 names and of ${SLOVENE_GLYPHS}, in the capitals it sets, in all ${fonts.size} faces`, () => {
      const missing = new Set<string>();
      for (const name of names) {
        const text = setText(name, style) + SLOVENE_GLYPHS;
        for (const [file, font] of fonts) for (const ch of text) if (!draws(font, ch)) missing.add(`${file}:${ch}`);
      }
      expect([...missing]).toEqual([]);
    });

  it("what the generator picks is drawn in the font of the role it asks for", () => {
    for (const p of FONT_PAIRS)
      for (const name of WORDMARK_NAMES) {
        const g = generateWordmark(name, "abcdef12", { fontPair: p.id, headingWeight: 700, headingCase: "normal" });
        const face = g.role === "text" ? p.body : p.heading;
        const font = fonts.get(face.file)!;
        const { options } = wordmarkLayout(name, g.style);
        const text = options.case === "upper" ? name.toLocaleUpperCase("sl") : name;
        expect([...text].filter((ch) => !draws(font, ch))).toEqual([]);
      }
  });
});

describe("the wordmark assets", () => {
  it("every style is a registered draft asset (wordmark/<style>) within its byte budget; the sheet takes them from there", () => {
    const reg = inventory();
    expect(wordmarkAssets().map((a) => a.id)).toEqual(WORDMARK_STYLES.map((s) => `wordmark/${s}`));
    for (const s of WORDMARK_STYLES) expect(reg.byId(`wordmark/${s}`)?.kind, s).toBe("wordmark");
  });
});
