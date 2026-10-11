import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STYLE_FILES } from "@sb/components";
import { EDGES, FACT_OBJECTS, IMAGE_TREATMENTS, MASKS, MOTIONS, MOTION_META, SUBMOTIF_BASE, TEXTURES, TYPE_TREATMENTS, WORDMARK_STYLES, allFontFaces, type Section } from "@sb/spec";

const here = path.dirname(fileURLToPath(import.meta.url));
const componentsDir = path.resolve(here, "../../components");
export const FONTS_DIR = path.resolve(here, "../assets/fonts");

export interface SharedBundle {
  /** Content hash; the bundle is served under `_shared/{hash}/`. */
  hash: string;
  /** Relative path inside the bundle -> file content. */
  files: Map<string, Uint8Array>;
}

/** Strips comments and collapses whitespace. Enough for a hand-written stylesheet. */
export function minifyCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    // Never remove the space before ":": ".tone-inverse :focus-visible" is a descendant selector.
    .replace(/\s*([{};,>])\s*/g, "$1")
    .replace(/:\s+/g, ":")
    // Inside declaration blocks (innermost braces) the space before ":" can go too.
    .replace(/\{([^{}]*)\}/g, (_, body: string) => `{${body.replace(/\s+:/g, ":")}}`)
    .replace(/;}/g, "}")
    .trim();
}

/** Top-level blocks of minified CSS: `prelude{body}`, braces and quotes respected. */
function blocks(css: string): { prelude: string; body: string }[] {
  const out: { prelude: string; body: string }[] = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open < 0) break;
    let depth = 0;
    let quote: string | null = null;
    let j = open;
    for (; j < css.length; j++) {
      const ch = css[j]!;
      if (quote) {
        if (ch === "\\") j++;
        else if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) break;
    }
    out.push({ prelude: css.slice(i, open).trim(), body: css.slice(open + 1, j) });
    i = j + 1;
  }
  return out;
}

/** Selectors of a selector list, split on commas outside parentheses, brackets and quotes. */
function selectors(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    const ch = list[i]!;
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (ch === "," && depth === 0) {
      out.push(list.slice(start, i));
      start = i + 1;
    }
  }
  out.push(list.slice(start));
  return out;
}

const MOTIF = /\[data-motif="([a-z-]+)"\]/g;
/** The motifs a selector names (empty: it applies whatever the motif). */
const motifsOf = (sel: string): Set<string> => new Set([...sel.matchAll(MOTIF)].map((m) => m[1]!));

/** The trade motifs a stylesheet has rules for. */
export function motifsIn(css: string): string[] {
  return [...new Set([...css.matchAll(MOTIF)].map((m) => m[1]!))].sort();
}

const SUBMOTIF = /\[data-submotif="([a-z-]+)"\]/g;
const subMotifsOf = (sel: string): Set<string> => new Set([...sel.matchAll(SUBMOTIF)].map((m) => m[1]!));

/**
 * The sub-trade motifs a stylesheet has rules for, each with its base motif (spec SUBMOTIF_BASE): a rule naming
 * `[data-submotif="x"]` applies only on a site drawing x.
 */
export function subMotifsIn(css: string): { motif: string; sub: string }[] {
  const subs = [...new Set([...css.matchAll(SUBMOTIF)].map((m) => m[1]!))].sort();
  return subs.map((sub) => {
    const motif = (SUBMOTIF_BASE as Record<string, string>)[sub];
    if (!motif) throw new Error(`[data-submotif="${sub}"] is not a sub-trade motif (spec SUBMOTIFS)`);
    return { motif, sub };
  });
}

/**
 * The stylesheet for a site with trade motif `motif` (null: none) and sub-trade motif `sub`: every rule, in the
 * original order, except selectors that only apply under other motifs' `[data-motif="x"]` or other sub-trades'
 * `[data-submotif="y"]`. The cascade is exactly the full sheet's for that site, without the other trades' rules; a
 * site without a sub-trade motif gets exactly the sheet it got before sub-trade motifs existed.
 */
export function stylesheetFor(css: string, motif: string | null, sub: string | null = null): string {
  const filter = (css: string): string => {
    let out = "";
    for (const b of blocks(css)) {
      if (/^@(media|supports|container|layer)\b/.test(b.prelude)) {
        const inner = filter(b.body);
        if (inner) out += `${b.prelude}{${inner}}`;
      } else if (b.prelude.startsWith("@")) out += `${b.prelude}{${b.body}}`;
      else {
        // A selector naming motifs can only match under one of them (:is([data-motif="a"],[data-motif="b"]) …).
        const kept = selectors(b.prelude).filter((sel) => {
          const named = motifsOf(sel);
          const subs = subMotifsOf(sel);
          return (named.size === 0 || (motif !== null && named.has(motif))) && (subs.size === 0 || (sub !== null && subs.has(sub)));
        });
        if (kept.length) out += `${kept.join(",")}{${b.body}}`;
      }
    }
    return out;
  };
  return filter(css);
}

/**
 * The stylesheet of composed sections (spec v19, packages/components/styles/composed.css). It is not part of the shared
 * sheet: a page links it only when it has a composed section, so every site without one keeps the HTML and the stylesheet
 * it had. It is named by its own content hash (composed-<hash>.css), and stays out of the bundle hash for the same
 * reason (the hash is in every page's stylesheet link): a changed composed.css changes its own file name, nothing else.
 */
const COMPOSED_CSS = "composed.css";
let composed: { name: string; css: string } | undefined;
export function composedStylesheet(): { name: string; css: string } {
  if (!composed) composed = contentAddressed(COMPOSED_CSS, "composed");
  return composed;
}

/**
 * The spec v20 composed stylesheets (packages/components/styles/composed-v2.css, docs/plans/studio-phase1-design.md
 * §3.4.7). The one source file has four regions (marker comments `region: <name>`, one owner each); each region is its
 * own sheet, minified and content-addressed (composed-v2-<region>-<sha10>.css), in the bundle after the hash like the
 * core sheet, and linked after it only by pages that use that region (composedSheets). Pages without a v20 feature keep
 * their bytes; a page with one downloads only the regions it uses. An empty region (vocab, until the batches add rules)
 * has no file and is never linked.
 */
const COMPOSED_V2_CSS = "composed-v2.css";
export const COMPOSED_V2_REGIONS = ["section", "kinds", "extensions", "vocab"] as const;
export type ComposedRegion = (typeof COMPOSED_V2_REGIONS)[number];

/** The source of each region of composed-v2.css, split at its markers (the comment before the first marker is dropped). */
export function composedV2Regions(source: string = readFileSync(path.join(componentsDir, "styles", COMPOSED_V2_CSS), "utf8")): Record<ComposedRegion, string> {
  const at = COMPOSED_V2_REGIONS.map((r) => {
    const marker = `/* region: ${r} */`;
    const i = source.indexOf(marker);
    if (i < 0 || source.indexOf(marker, i + 1) >= 0) throw new Error(`${COMPOSED_V2_CSS}: region marker "${marker}" must appear exactly once`);
    return { r, start: i, from: i + marker.length };
  });
  if (at.some((x, n) => n > 0 && x.start < at[n - 1]!.start)) throw new Error(`${COMPOSED_V2_CSS}: region markers out of order (${COMPOSED_V2_REGIONS.join(", ")})`);
  return Object.fromEntries(at.map((x, n) => [x.r, source.slice(x.from, at[n + 1]?.start ?? source.length)])) as Record<ComposedRegion, string>;
}

/**
 * A second pass for the v2 sheets, inside declaration blocks only (outside strings and url()): no spaces around `*` and
 * `/` (calc, aspect-ratio, grid lines, the font shorthand) and no leading zero (0.75rem → .75rem). All three are optional
 * in CSS values; in selectors `*` and spaces mean something, so selectors are never touched. minifyCss itself stays as it
 * is: it makes the shared sheets, whose bytes are recorded (composed-goldens).
 */
export function compactValues(css: string): string {
  return css.replace(/\{([^{}]*)\}/g, (_, body: string) => {
    const parts = body.split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|url\([^)]*\))/);
    const out = parts.map((p, i) => (i % 2 === 1 ? p : p.replace(/ ([*/]) /g, "$1").replace(/(?<![\w.])(-?)0\.(\d)/g, "$1.$2")));
    return `{${out.join("")}}`;
  });
}

type Sheet = { name: string; css: string };
let composedV2: Record<ComposedRegion, Sheet> | undefined;
/** Every region's sheet (an empty region has css "" and is not in the bundle). */
export function composedV2Sheets(): Record<ComposedRegion, Sheet> {
  if (!composedV2) {
    const regions = composedV2Regions();
    composedV2 = Object.fromEntries(COMPOSED_V2_REGIONS.map((r) => [r, named(compactValues(minifyCss(regions[r])), `composed-v2-${r}`)])) as Record<ComposedRegion, Sheet>;
  }
  return composedV2;
}

function contentAddressed(file: string, stem: string): Sheet {
  return named(minifyCss(readFileSync(path.join(componentsDir, "styles", file), "utf8")), stem);
}
const named = (css: string, stem: string): Sheet => ({ name: `${stem}-${createHash("sha256").update(css).digest("hex").slice(0, 10)}.css`, css });

/**
 * Vocab family sheets (docs/plans/studio-phase1-design.md §3.4.7-3.4.8): the CSS of the names the inventory batches add
 * to the spec vocabularies, one sheet per asset family, linked only by a page that uses one of that family's names.
 *
 * Source: one small partial per name, `packages/components/styles/vocab/<family>/<name>.css` (the file name is the vocab
 * name). An asset maker adds a name by adding one file, with no shared file to conflict on. A family's sheet is its
 * partials in file-name order, minified, content-addressed (composed-v2-vocab-<family>-<sha10>.css), and in the bundle
 * after the hash. A partial's rules are scoped to its own name (a class or attribute naming it), so the order between
 * partials never matters. A family with no partial has no sheet and is never linked.
 *
 * The names in the spec lists when the sheets were introduced (STARTER_NAMES) are drawn by the core sheet and the v2
 * region sheets and stay there (their shared mechanics are grouped with other names' rules); partials are for new names.
 */
export const VOCAB_FAMILIES = ["masks", "treatments", "textures", "edges", "fact-objects", "type-treatments", "motion", "wordmarks"] as const;
export type VocabFamily = (typeof VOCAB_FAMILIES)[number];

/** The spec list each family's names come from. */
export const FAMILY_LISTS: Record<VocabFamily, readonly string[]> = {
  masks: MASKS,
  treatments: IMAGE_TREATMENTS,
  textures: TEXTURES,
  edges: EDGES,
  "fact-objects": FACT_OBJECTS,
  "type-treatments": TYPE_TREATMENTS,
  motion: MOTIONS,
  wordmarks: WORDMARK_STYLES,
};

/** The names each list had when the family sheets were introduced: their CSS is in composed.css / composed-v2.css. */
export const STARTER_NAMES: Record<VocabFamily, readonly string[]> = {
  masks: ["none", "arch", "circle", "cut", "stamp", "ticket"],
  treatments: ["none", "duotone", "tint", "grain"],
  textures: ["none", "grain", "lines"],
  edges: ["straight", "rule", "cut", "torn", "drawing"],
  "fact-objects": ["numeral", "plate", "stamp", "ticket", "seal", "tag"],
  "type-treatments": ["none", "stacked", "knockout"],
  motion: ["reveal", "unmask"],
  wordmarks: ["plain"],
};

export const VOCAB_DIR = path.join(componentsDir, "styles", "vocab");

/** The names that have a partial in `<dir>/<family>/` (sorted). */
export function vocabPartials(family: VocabFamily, dir: string = VOCAB_DIR): string[] {
  const d = path.join(dir, family);
  return existsSync(d) ? readdirSync(d).filter((n) => n.endsWith(".css")).map((n) => n.slice(0, -4)).sort() : [];
}

/**
 * What a family's partials must be: one for every name of the family's spec list beyond the starter names, and no other.
 * `missing`: such names without a partial; `orphans`: partials whose name is not one of them.
 */
export function vocabCoverage(family: VocabFamily, dir: string = VOCAB_DIR, list: readonly string[] = FAMILY_LISTS[family]): { missing: string[]; orphans: string[] } {
  const partials = vocabPartials(family, dir);
  const starters = new Set(STARTER_NAMES[family]);
  const wanted = list.filter((n) => !starters.has(n));
  return { missing: wanted.filter((n) => !partials.includes(n)), orphans: partials.filter((n) => !wanted.includes(n)) };
}

export interface VocabSheet extends Sheet {
  family: VocabFamily;
  /** The names whose partials the sheet holds: a page using one of them links it. */
  names: string[];
}
/** The sheet of a family (css "" when it has no partials), from the partials in `dir`. */
export function vocabSheet(family: VocabFamily, dir: string = VOCAB_DIR): VocabSheet {
  const names = vocabPartials(family, dir);
  const source = names.map((n) => readFileSync(path.join(dir, family, `${n}.css`), "utf8")).join("\n");
  return { family, names, ...named(compactValues(minifyCss(source)), `composed-v2-vocab-${family}`) };
}
let vocabSheets: Record<VocabFamily, VocabSheet> | undefined;
export function vocabFamilySheets(): Record<VocabFamily, VocabSheet> {
  vocabSheets ??= Object.fromEntries(VOCAB_FAMILIES.map((f) => [f, vocabSheet(f)])) as Record<VocabFamily, VocabSheet>;
  return vocabSheets;
}

/** The composed stylesheets by their key in composedSheets, in link order. */
export const COMPOSED_SHEETS = {
  core: composedStylesheet,
  section: () => composedV2Sheets().section,
  kinds: () => composedV2Sheets().kinds,
  extensions: () => composedV2Sheets().extensions,
  vocab: () => composedV2Sheets().vocab,
  "vocab-masks": () => vocabFamilySheets().masks,
  "vocab-treatments": () => vocabFamilySheets().treatments,
  "vocab-textures": () => vocabFamilySheets().textures,
  "vocab-edges": () => vocabFamilySheets().edges,
  "vocab-fact-objects": () => vocabFamilySheets()["fact-objects"],
  "vocab-type-treatments": () => vocabFamilySheets()["type-treatments"],
  "vocab-motion": () => vocabFamilySheets().motion,
  "vocab-wordmarks": () => vocabFamilySheets().wordmarks,
} as const satisfies Record<"core" | ComposedRegion | `vocab-${VocabFamily}`, () => Sheet>;
export type ComposedSheet = keyof typeof COMPOSED_SHEETS;

type ComposedSection = Extract<Section, { type: "composed" }>;

/** The vocab names a section uses, by family. */
export function vocabNamesOf(s: ComposedSection): Record<VocabFamily, Set<string>> {
  const p = s.props;
  const out: Record<VocabFamily, Set<string>> = { masks: new Set(), treatments: new Set(), textures: new Set(), edges: new Set(), "fact-objects": new Set(), "type-treatments": new Set(), motion: new Set(), wordmarks: new Set() };
  const add = (f: VocabFamily, n: string | undefined) => {
    if (n !== undefined) out[f].add(n);
  };
  add("textures", p.surface?.texture);
  add("edges", p.top?.edge);
  add("motion", p.motion);
  for (const b of p.background ?? []) if (b.kind === "photo") add("treatments", b.treatment);
  for (const el of p.elements) {
    if (el.kind === "image" || el.kind === "photos") {
      add("masks", el.mask);
      add("treatments", el.treatment);
    } else if (el.kind === "fact") add("fact-objects", el.treatment);
    else if (el.kind === "heading") add("type-treatments", el.treatment);
  }
  return out;
}
const isComposed = (s: Section): s is ComposedSection => s.type === "composed";

/** The element kinds spec v20 adds (§1.5): their rules are in composed-v2.css region kinds. */
const V2_KINDS: ReadonlySet<string> = new Set(["photos", "wordmark", "ribbon", "sticker", "map", "iconFacts", "quote"]);

/** The mask, image treatment and fact object names the core sheet (spec v19) draws. */
const V19_MASKS: ReadonlySet<string> = new Set(["none", "arch", "circle", "cut", "stamp", "ticket"]);
const V19_IMAGE_TREATMENTS: ReadonlySet<string> = new Set(["none", "duotone", "tint", "grain"]);
const V19_FACT_OBJECTS: ReadonlySet<string> = new Set(["numeral", "plate", "stamp", "ticket", "seal", "tag"]);

type ComposedElement = ComposedSection["props"]["elements"][number];

/**
 * Whether an element uses a spec v20 extension of an existing kind (F1b-R3; region extensions): a tilt, a bleed, a
 * colour role (`color`, `fill`), an image scrim or a mask or treatment name beyond v19's, a heading treatment, a drop cap,
 * a list lead, marker, weight or size, a fact link, label order, plate code, count or an object beyond v19's, a price
 * style beyond rows, plates and tags (or its columns, size, plate code), and a decor drawing, colour, fixed size or repeat.
 * The generic ones (tilt, bleed, colour roles) count for the new kinds too.
 */
function elementUsesExtension(el: ComposedElement): boolean {
  const d = el.desk;
  if ((d.tilt !== undefined && d.tilt !== 0) || d.bleedX !== undefined || d.bleedY !== undefined || el.phone.span === "bleed") return true;
  if (("color" in el && el.color !== undefined) || ("fill" in el && el.fill !== undefined)) return true;
  switch (el.kind) {
    case "heading":
      return (el.treatment !== undefined && el.treatment !== "none") || el.fillImage !== undefined;
    case "text":
      return el.dropCap === true;
    case "list":
      return el.items.some((i) => typeof i !== "string") || (el.marker !== undefined && !["none", "rule", "dot"].includes(el.marker)) || el.drawing !== undefined || (el.weight !== undefined && el.weight !== "regular") || (el.size !== undefined && el.size > 0);
    case "fact":
      return el.link !== undefined || el.labelAt === "before" || el.plateCode === true || el.count === true || !V19_FACT_OBJECTS.has(el.treatment);
    case "image":
      return el.scrim !== undefined || (el.mask !== undefined && !V19_MASKS.has(el.mask)) || (el.treatment !== undefined && !V19_IMAGE_TREATMENTS.has(el.treatment));
    case "prices":
      return !["rows", "plates", "tags"].includes(el.style) || el.phoneColumns !== undefined || (el.size !== undefined && el.size > 0) || el.plateCode === true;
    case "decor":
      return el.drawing !== undefined || el.fit !== undefined || el.size !== undefined || el.repeat !== undefined;
    default:
      return false;
  }
}

/** The v2 regions a section's rules come from. */
function regionsOf(s: ComposedSection): Set<ComposedRegion> {
  const p = s.props;
  const out = new Set<ComposedRegion>();
  if (p.background !== undefined || p.top !== undefined || p.motion !== undefined || p.pin !== undefined || p.headerOver === true) out.add("section");
  for (const el of p.elements) {
    if (V2_KINDS.has(el.kind)) out.add("kinds");
    if (elementUsesExtension(el)) out.add("extensions");
    // An image's scrim is the photo layer's (.cx-scrim-<n>, .cx-ro-<role>: region section) over one picture.
    if (el.kind === "image" && el.scrim !== undefined) out.add("section");
  }
  return out;
}

/**
 * The composed stylesheets a page links, in link order: none without a composed section; the core sheet with one; after
 * it, each v20 region sheet one of them uses (section-level fields: section; the new kinds: kinds; the extensions of the
 * existing kinds: extensions); then each vocab family sheet (VOCAB_FAMILIES) holding a name the page uses. One place decides every link.
 *
 * `wordmark` is the site's design.wordmark style, with whether the header or footer shows it (a site without a logo): the
 * kinds region (the base `.cx-wm` rules) and the wordmarks family sheet are linked when a page's wordmark block or its
 * chrome uses a style that has a partial, also on a page with no composed section (then without the core sheet, which
 * the wordmark does not need). Absent: nothing changes (every site before I9a).
 */
export function composedSheets(sections: readonly Section[], families: Record<VocabFamily, VocabSheet> = vocabFamilySheets(), wordmark?: { style: string; chrome: boolean }): ComposedSheet[] {
  const own = sections.filter(isComposed);
  const wmIn = wordmark !== undefined && (wordmark.chrome || own.some((s) => s.props.elements.some((e) => e.kind === "wordmark")));
  if (own.length === 0 && !wmIn) return [];
  const used = new Set<ComposedRegion>();
  const names = VOCAB_FAMILIES.map((): Set<string> => new Set());
  for (const s of own) {
    for (const r of regionsOf(s)) used.add(r);
    const byFamily = vocabNamesOf(s);
    VOCAB_FAMILIES.forEach((f, i) => byFamily[f].forEach((n) => names[i]!.add(n)));
  }
  if (wmIn) {
    used.add("kinds");
    names[VOCAB_FAMILIES.indexOf("wordmarks")]!.add(wordmark!.style);
  }
  // A family sheet follows the region sheets, when the page uses one of the names it holds (starter names: none).
  const familySheets = VOCAB_FAMILIES.filter((f, i) => families[f].css !== "" && families[f].names.some((n) => names[i]!.has(n))).map((f) => `vocab-${f}` as const);
  return [...(own.length > 0 ? (["core"] as const) : []), ...COMPOSED_V2_REGIONS.filter((r) => used.has(r) && composedV2Sheets()[r].css !== ""), ...familySheets];
}

/**
 * Composed islands (packages/components/islands/composed/*.js): the JS a composed feature needs (the marquee's pause, the
 * count-up; a motion preset with `js: true`), in the bundle after the hash like the composed sheets, so adding or changing
 * one changes no other site's bytes. Each is served content-addressed, _shared/<hash>/js/composed/<name>-<sha10>.js:
 * _shared/<hash>/ is cached immutable and written once per release, so a changed island must get a new URL.
 */
const COMPOSED_ISLANDS_DIR = path.join(componentsDir, "islands", "composed");
/** The source files (count.js, ribbon.js …), sorted. */
export function composedIslandFiles(): string[] {
  return existsSync(COMPOSED_ISLANDS_DIR) ? readdirSync(COMPOSED_ISLANDS_DIR).filter((n) => n.endsWith(".js")).sort() : [];
}

/** The served path under js/ of an island with these bytes: composed/<stem>-<sha10>.js. */
export const islandPathFor = (file: string, bytes: Uint8Array | string): string =>
  `composed/${file.replace(/\.js$/, "")}-${createHash("sha256").update(bytes).digest("hex").slice(0, 10)}.js`;

let islandPaths: Map<string, string> | undefined;
/** A composed island's served path under js/ (islandPathFor its source file's bytes; read once). */
export function composedIslandPath(file: string): string {
  islandPaths ??= new Map();
  let p = islandPaths.get(file);
  if (!p) {
    p = islandPathFor(file, readFileSync(path.join(COMPOSED_ISLANDS_DIR, file)));
    islandPaths.set(file, p);
  }
  return p;
}

/** The one island of every motion preset that needs JS (MOTION_META js; §3.2: ≤ 3 KiB gzip), its source file. */
export const COMPOSED_MOTION_ISLAND = "motion.js";

/** The marquee's pause button (ribbon move "loop", owner decision D2), its source file. */
export const COMPOSED_RIBBON_ISLAND = "ribbon.js";

/** The island of a fact with `count` (D2: counts up to the client's number once, on first view), its source file. */
export const COMPOSED_COUNT_ISLAND = "count.js";

/**
 * reveal.js with composed facts that call among its call objects (the bar steps aside for a later plate), its source
 * file. A page with such a fact loads it in place of reveal.js (site.tsx), so the shared reveal.js keeps its bytes.
 */
export const COMPOSED_BAR_ISLAND = "bar.js";

/** A composed section of the page has a fact whose whole object links to the phone. */
export const hasComposedCallFact = (sections: readonly Section[]): boolean =>
  sections.filter(isComposed).some((s) => s.props.elements.some((el) => el.kind === "fact" && el.link !== undefined && "action" in el.link && el.link.action === "call"));

/** The composed islands a page's sections load, as served paths under js/ (composedIslandPath; the page shell's island list). */
export function composedIslands(sections: readonly Section[]): string[] {
  const own = sections.filter(isComposed);
  const out: string[] = [];
  if (hasComposedCallFact(sections)) out.push(COMPOSED_BAR_ISLAND);
  if (own.some((s) => s.props.motion !== undefined && MOTION_META[s.props.motion as keyof typeof MOTION_META]?.js === true)) out.push(COMPOSED_MOTION_ISLAND);
  if (own.some((s) => s.props.elements.some((el) => el.kind === "ribbon" && el.move === "loop"))) out.push(COMPOSED_RIBBON_ISLAND);
  if (own.some((s) => s.props.elements.some((el) => el.kind === "fact" && el.count === true && /^\d{1,9}$/.test(el.value)))) out.push(COMPOSED_COUNT_ISLAND);
  return out.map(composedIslandPath);
}

export function sharedStylesheet(): string {
  return STYLE_FILES.map((f) => readFileSync(path.join(componentsDir, "styles", f), "utf8")).join("\n");
}

let cached: SharedBundle | undefined;

/**
 * The one stylesheet, fonts and islands shared by every site. Deterministic: same sources, same hash.
 */
export function sharedBundle(): SharedBundle {
  if (cached) return cached;
  const files = new Map<string, Uint8Array>();
  // One stylesheet per trade motif (site-<motif>.css) and one for sites without (site.css): each the whole
  // sheet without the other trades' rules, so a site downloads ~20 KB less and its cascade is unchanged.
  const css = minifyCss(sharedStylesheet());
  files.set("site.css", Buffer.from(stylesheetFor(css, null), "utf8"));
  for (const motif of motifsIn(css)) files.set(`site-${motif}.css`, Buffer.from(stylesheetFor(css, motif), "utf8"));
  // And one per sub-trade motif on its template's layout (site-<motif>-<sub>.css, spec v15 business.subtype).
  for (const { motif, sub } of subMotifsIn(css)) files.set(`site-${motif}-${sub}.css`, Buffer.from(stylesheetFor(css, motif, sub), "utf8"));
  const islandsDir = path.join(componentsDir, "islands");
  for (const f of readdirSync(islandsDir).filter((n) => n.endsWith(".js")).sort()) {
    files.set(`js/${f}`, readFileSync(path.join(islandsDir, f)));
  }
  for (const face of allFontFaces()) {
    const p = path.join(FONTS_DIR, `${face.file}.woff2`);
    if (existsSync(p)) files.set(`fonts/${face.file}.woff2`, readFileSync(p));
  }
  const h = createHash("sha256");
  for (const [k, v] of [...files.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    h.update(k);
    h.update(v);
  }
  const hash = h.digest("hex").slice(0, 10);
  // After the hash: the composed sheets and islands (see composedStylesheet, composedIslandFiles).
  for (const sheet of Object.values(COMPOSED_SHEETS).map((get) => get())) if (sheet.css !== "") files.set(sheet.name, Buffer.from(sheet.css, "utf8"));
  for (const f of composedIslandFiles()) files.set(`js/${composedIslandPath(f)}`, readFileSync(path.join(COMPOSED_ISLANDS_DIR, f)));
  cached = { hash, files };
  return cached;
}

/** For tests and dev servers that edit styles live. */
export function resetSharedBundleCache(): void {
  cached = undefined;
  composed = undefined;
  composedV2 = undefined;
  islandPaths = undefined;
  vocabSheets = undefined;
}
