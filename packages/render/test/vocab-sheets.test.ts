import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ComposedProps, type Section } from "@sb/spec";
import {
  COMPOSED_SHEETS,
  FAMILY_LISTS,
  STARTER_NAMES,
  VOCAB_FAMILIES,
  composedSheets,
  sharedBundle,
  vocabCoverage,
  vocabFamilySheets,
  vocabSheet,
  type VocabFamily,
  type VocabSheet,
} from "../src/index.ts";

/** Vocab family sheets (docs/plans/studio-phase1-design.md §3.4.7-3.4.8): linking, content addressing, bundle placement, coverage. */
const desk = (col: number, span: number, row: number) => ({ col, span, row });
const text = { id: "e_t", kind: "text", paragraphs: ["Besedilo."], desk: desk(1, 6, 1), phone: { order: 0, span: "full" } };
const image = (more: object) => ({ id: "e_i", kind: "image", image: "img_x", ratio: "4:5", desk: desk(8, 5, 1), phone: { order: 1, span: "full" }, ...more });
const sectionOf = (p: object): Section => ({ id: "s_a", type: "composed", variant: "free", props: ComposedProps.parse({ intent: "story", width: "contained", rows: 1, elements: [text], ...p }) }) as Section;

const tmp = mkdtempSync(path.join(tmpdir(), "vocab-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
function partials(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmp, "p-"));
  for (const [f, css] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    writeFileSync(path.join(dir, f), css);
  }
  return dir;
}
/** Family sheets built from fake partials (a name the spec lists do not have yet is how a new name is tested). */
function withFamilies(files: Record<string, string>): Record<VocabFamily, VocabSheet> {
  const dir = partials(files);
  return Object.fromEntries(VOCAB_FAMILIES.map((f) => [f, vocabSheet(f, dir)])) as Record<VocabFamily, VocabSheet>;
}

describe("vocab family sheets: linking", () => {
  const fam = withFamilies({
    "masks/wave.css": ".cx-mask-wave { clip-path: var(--shape-wave); }\n.cx-mask-wave { --shape-wave: ellipse(50% 40%); }",
    "motion/slide.css": "@keyframes cx-mo-slide { from { opacity: 0 } to { opacity: 1 } }",
  });

  it("a page using a new mask name links the masks family, after the core sheet and the regions", () => {
    const s = sectionOf({ top: { edge: "cut" }, elements: [text, image({ mask: "wave" })] });
    expect(composedSheets([s], fam)).toEqual(["core", "section", "extensions", "vocab-masks"]);
  });

  it("each family only for its own names", () => {
    expect(composedSheets([sectionOf({ motion: "slide" })], fam)).toEqual(["core", "section", "vocab-motion"]);
    expect(composedSheets([sectionOf({ elements: [text, image({ mask: "wave" })], motion: "slide" })], fam)).toEqual(["core", "section", "extensions", "vocab-masks", "vocab-motion"]);
  });

  it("a starter (v19) name, or no name, links nothing extra, whatever the families hold", () => {
    expect(composedSheets([sectionOf({ elements: [text, image({ mask: "arch", treatment: "duotone" })], surface: { texture: "grain" } })], fam)).toEqual(["core"]);
    expect(composedSheets([sectionOf({})], fam)).toEqual(["core"]);
    expect(composedSheets([sectionOf({ motion: "reveal" })], fam)).toEqual(["core", "section"]);
  });

  it("a family without partials has no file and is never linked, even when a page uses a name it would hold", () => {
    const none = withFamilies({});
    for (const f of VOCAB_FAMILIES) expect(none[f].css).toBe("");
    expect(composedSheets([sectionOf({ elements: [text, image({ mask: "wave" })] })], none)).toEqual(["core", "extensions"]);
  });

  it("the names are read from every place a page puts them", () => {
    const f = withFamilies({
      "textures/paper.css": ".cx-tx-paper{opacity:.5}",
      "edges/wavy.css": ".cx-edge-wavy{clip-path:var(--shape-wavy)}",
      "treatments/sepia.css": ".cx-tr-sepia{filter:sepia(1)}",
      "fact-objects/badge.css": ".cx-fact--badge{border-radius:50%}",
      "type-treatments/outline.css": ".cx-h--outline{-webkit-text-stroke:1px}",
    });
    const used = (p: object) => composedSheets([sectionOf(p)], f).filter((k) => k.startsWith("vocab-"));
    const fact = { id: "e_f", kind: "fact", treatment: "badge", size: 3, value: "1998", label: "Od leta", desk: desk(1, 3, 2), phone: { order: 1, span: "full" } };
    const heading = { id: "e_h", kind: "heading", treatment: "outline", text: "Naslov", level: 1, size: 5, desk: desk(1, 6, 2), phone: { order: 1, span: "full" } };
    expect(used({ surface: { texture: "paper" } })).toEqual(["vocab-textures"]);
    expect(used({ top: { edge: "wavy" } })).toEqual(["vocab-edges"]);
    expect(used({ background: [{ kind: "photo", image: "img_x", treatment: "sepia", scrim: { role: "inverse", strength: 3 } }] })).toEqual(["vocab-treatments"]);
    expect(used({ elements: [text, image({ treatment: "sepia" })] })).toEqual(["vocab-treatments"]);
    expect(used({ elements: [text, fact] })).toEqual(["vocab-fact-objects"]);
    expect(used({ elements: [text, heading] })).toEqual(["vocab-type-treatments"]);
  });
});

describe("vocab family sheets: files", () => {
  it("are minified from the partials in file-name order and content-addressed (composed-v2-vocab-<family>-<sha10>.css)", () => {
    const a = vocabSheet("masks", partials({ "masks/b.css": ".b { top: 0.5rem }", "masks/a.css": "/* a */\n.a { top: 1px }" }));
    expect(a.css).toBe(".a{top:1px}.b{top:.5rem}");
    expect(a.names).toEqual(["a", "b"]);
    expect(a.name).toMatch(/^composed-v2-vocab-masks-[0-9a-f]{10}\.css$/);
    const same = vocabSheet("masks", partials({ "masks/a.css": ".a{top:1px}", "masks/b.css": ".b{top:.5rem}" }));
    expect(same.name).toBe(a.name);
    expect(vocabSheet("masks", partials({ "masks/a.css": ".a{top:2px}" })).name).not.toBe(a.name);
  });

  it("the real sheets are in the bundle after the hash, only when non-empty", () => {
    const bundle = sharedBundle();
    for (const f of VOCAB_FAMILIES) {
      const sheet = vocabFamilySheets()[f];
      expect(COMPOSED_SHEETS[`vocab-${f}`]().name).toBe(sheet.name);
      if (sheet.css === "") expect(bundle.files.has(sheet.name), f).toBe(false);
      else expect(new TextDecoder().decode(bundle.files.get(sheet.name)), f).toBe(sheet.css);
    }
    // The bundle hash itself (composed-v2.test.ts: baseline.sharedHash) is computed before any of them is added.
    for (const file of bundle.files.keys()) if (/^site(-.*)?\.css$/.test(file)) expect(file).not.toContain("vocab");
  });
});

describe("the real family sheets obey the bans", () => {
  it.each(VOCAB_FAMILIES)("%s: no gradient, blur, glass, shadow, italic, monospace, pill or endless animation; clip-path only through a --shape- token", (f) => {
    const css = vocabFamilySheets()[f].css;
    expect(css).not.toMatch(/gradient\(|backdrop-filter|blur\(|box-shadow|drop-shadow|monospace|font-style:italic|border-radius:999|infinite/);
    for (const m of css.matchAll(/clip-path:([^;}]+)/g)) expect(m[1]).toMatch(/^var\(--shape-[a-z]+\)$/);
  });

  it.each(["masks", "treatments"] as const)("%s: colours only from the palette's roles, no pictures", (f) => {
    const css = vocabFamilySheets()[f].css;
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|url\(/i);
  });
});

describe("vocab names and their partials (the registration check)", () => {
  it("every vocab name beyond the starter set has a partial in its family, and every partial has such a name", () => {
    for (const f of VOCAB_FAMILIES) expect(vocabCoverage(f), f).toEqual({ missing: [], orphans: [] });
  });

  it("the starter names stay in their lists", () => {
    for (const f of VOCAB_FAMILIES) for (const n of STARTER_NAMES[f]) expect(FAMILY_LISTS[f], `${f}/${n}`).toContain(n);
  });

  it("fails on a new name without a partial and on a partial without a name", () => {
    const dir = partials({ "masks/wave.css": ".a{top:0}", "masks/ghost.css": ".b{top:0}" });
    // The list is the starters plus the test's own names (the real list grows with every batch).
    expect(vocabCoverage("masks", dir, [...STARTER_NAMES.masks, "wave", "blob"])).toEqual({ missing: ["blob"], orphans: ["ghost"] });
    // A partial named after a starter name is also an orphan: those names' rules stay where they are.
    expect(vocabCoverage("masks", partials({ "masks/arch.css": ".a{top:0}" }), STARTER_NAMES.masks)).toEqual({ missing: [], orphans: ["arch"] });
  });
});
