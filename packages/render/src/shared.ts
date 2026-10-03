import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STYLE_FILES } from "@sb/components";
import { allFontFaces } from "@sb/spec";

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

/**
 * The stylesheet for a site with trade motif `motif` (null: none): every rule, in the original order,
 * except selectors that only apply under other motifs' `[data-motif="x"]`. The cascade is exactly the
 * full sheet's for that site, without nine other trades' rules.
 */
export function stylesheetFor(css: string, motif: string | null): string {
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
          return named.size === 0 || (motif !== null && named.has(motif));
        });
        if (kept.length) out += `${kept.join(",")}{${b.body}}`;
      }
    }
    return out;
  };
  return filter(css);
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
  cached = { hash: h.digest("hex").slice(0, 10), files };
  return cached;
}

/** For tests and dev servers that edit styles live. */
export function resetSharedBundleCache(): void {
  cached = undefined;
}
