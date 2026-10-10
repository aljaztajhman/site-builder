import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STYLE_FILES } from "@sb/components";
import { MOTION_META, SUBMOTIF_BASE, allFontFaces, type Section } from "@sb/spec";

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
 * The spec v20 composed stylesheet (packages/components/styles/composed-v2.css, docs/plans/studio-phase1-design.md §3.4):
 * every v20 addition, linked after the core sheet only by pages that use one (composedSheets). Named and kept out of the
 * bundle hash like the core sheet, so pages without a v20 feature keep their bytes.
 */
const COMPOSED_V2_CSS = "composed-v2.css";
let composedV2: { name: string; css: string } | undefined;
export function composedV2Stylesheet(): { name: string; css: string } {
  if (!composedV2) composedV2 = contentAddressed(COMPOSED_V2_CSS, "composed-v2");
  return composedV2;
}

function contentAddressed(file: string, stem: string): { name: string; css: string } {
  const css = minifyCss(readFileSync(path.join(componentsDir, "styles", file), "utf8"));
  return { name: `${stem}-${createHash("sha256").update(css).digest("hex").slice(0, 10)}.css`, css };
}

/** The composed stylesheets by their key in composedSheets, in link order. */
export const COMPOSED_SHEETS = { core: composedStylesheet, v2: composedV2Stylesheet } as const;
export type ComposedSheet = keyof typeof COMPOSED_SHEETS;

type ComposedSection = Extract<Section, { type: "composed" }>;
const isComposed = (s: Section): s is ComposedSection => s.type === "composed";

/** Whether a composed section uses a spec v20 section-level feature (§1.3). R2 adds the new kinds, R3 the extensions. */
function usesV2(s: ComposedSection): boolean {
  const p = s.props;
  return p.background !== undefined || p.top !== undefined || p.motion !== undefined || p.pin !== undefined || p.headerOver === true;
}

/**
 * The composed stylesheets a page links, in link order: none without a composed section; the core sheet with one; the
 * core and the v2 sheet when one of them uses a v20 feature. One place decides both links (extensible: design.wordmark).
 */
export function composedSheets(sections: readonly Section[]): ComposedSheet[] {
  const own = sections.filter(isComposed);
  if (own.length === 0) return [];
  return own.some(usesV2) ? ["core", "v2"] : ["core"];
}

/**
 * Composed islands (packages/components/islands/composed/*.js): the JS a motion preset with `js: true` needs, in the
 * bundle after the hash like the composed sheets, so adding one changes no other site's bytes. Served from
 * _shared/<hash>/js/composed/. Today's presets (reveal, unmask) are pure CSS, so there are none yet.
 */
const COMPOSED_ISLANDS_DIR = path.join(componentsDir, "islands", "composed");
export function composedIslandFiles(): string[] {
  return existsSync(COMPOSED_ISLANDS_DIR) ? readdirSync(COMPOSED_ISLANDS_DIR).filter((n) => n.endsWith(".js")).sort() : [];
}

/** The one island of every motion preset that needs JS (MOTION_META js; §3.2: ≤ 3 KiB gzip), as a path under js/. */
export const COMPOSED_MOTION_ISLAND = "composed/motion.js";

/** The composed islands a page's sections load, as paths under js/ (the page shell's island list). */
export function composedIslands(sections: readonly Section[]): string[] {
  const js = sections.filter(isComposed).some((s) => s.props.motion !== undefined && MOTION_META[s.props.motion as keyof typeof MOTION_META]?.js === true);
  return js ? [COMPOSED_MOTION_ISLAND] : [];
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
  for (const sheet of Object.values(COMPOSED_SHEETS).map((get) => get())) files.set(sheet.name, Buffer.from(sheet.css, "utf8"));
  for (const f of composedIslandFiles()) files.set(`js/composed/${f}`, readFileSync(path.join(COMPOSED_ISLANDS_DIR, f)));
  cached = { hash, files };
  return cached;
}

/** For tests and dev servers that edit styles live. */
export function resetSharedBundleCache(): void {
  cached = undefined;
  composed = undefined;
  composedV2 = undefined;
}
