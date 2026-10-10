/**
 * What an asset adds to a page, in bytes, measured on the real files: font files, and the CSS rules that apply only
 * when the asset is used (the minified shared stylesheet and the composed sheet, as packages/render ships them).
 */
import { statSync } from "node:fs";
import path from "node:path";
import { FONTS_DIR, composedStylesheet, minifyCss, sharedStylesheet, stylesheetFor } from "@sb/render";

export const fontFile = (file: string): string => path.join(FONTS_DIR, `${file}.woff2`);
export const fontLicenseFile = (file: string): string => path.join(FONTS_DIR, "LICENSES", `${file}.txt`);

export function fontBytes(file: string): number {
  return statSync(fontFile(file)).size;
}

let shared: string | undefined;
const sharedCss = (): string => (shared ??= minifyCss(sharedStylesheet()));
const bytes = (s: string): number => Buffer.byteLength(s, "utf8");

/** Bytes a trade motif adds to site.css (its site-<motif>.css minus site.css). */
export function motifBytes(motif: string): number {
  const css = sharedCss();
  return bytes(stylesheetFor(css, motif)) - bytes(stylesheetFor(css, null));
}

/** Bytes a sub-trade motif adds to its template's sheet (site-<motif>-<sub>.css minus site-<motif>.css). */
export function subMotifBytes(motif: string, sub: string): number {
  const css = sharedCss();
  return bytes(stylesheetFor(css, motif, sub)) - bytes(stylesheetFor(css, motif));
}

/** Top-level and nested (@media, @supports …) rules of a minified stylesheet as [prelude, body] pairs, flattened. */
export function cssRules(css: string): { prelude: string; body: string }[] {
  const out: { prelude: string; body: string }[] = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open < 0) break;
    const prelude = css.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") depth--;
      j++;
    }
    const body = css.slice(open + 1, j - 1);
    if (/^@(media|supports|container|layer)\b/.test(prelude)) out.push(...cssRules(body));
    else out.push({ prelude, body });
    i = j;
  }
  return out;
}

/** Bytes of the rules whose selector matches `needle`, as `selector{body}`. */
export function ruleBytes(css: string, needle: RegExp): number {
  return cssRules(css)
    .filter((r) => !r.prelude.startsWith("@") && needle.test(r.prelude))
    .reduce((n, r) => n + bytes(r.prelude) + bytes(r.body) + 2, 0);
}

export const sharedRuleBytes = (needle: RegExp): number => ruleBytes(sharedCss(), needle);
export const composedRuleBytes = (needle: RegExp): number => ruleBytes(composedStylesheet().css, needle);

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const word = (cls: string): RegExp => new RegExp(`${esc(cls)}(?![a-z0-9_-])`);
