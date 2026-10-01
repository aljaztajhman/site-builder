/**
 * Mechanical fixes to the parsed content answer before validation. Each fix is one the model's retry
 * would make anyway (each such mistake cost a paid full-site retry in the 2026-10-01 recording), and none
 * can change meaning or add anything: whitespace around object keys, `null` properties (no field of the
 * content schema is nullable, so null can only mean "absent"), and SEO texts over their length limit cut
 * back at a word boundary. Everything else is left for validation and the retry to report.
 */

import { SEO_LIMITS } from "./assemble.ts";

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Clause boundaries a shortened text may end on: " | ", " - ", " – ", " — ", ", ", "; ", ": ", and sentence ends. */
const CLAUSE = /(?:\s[|\-–—]\s|[,;:]\s|[.!?]\s)/g;
/** Separators that can't end a text; sentence punctuation (.!?) is kept. */
const TRAILING = /[\s|\-–—,;:]+$/;

/**
 * Shortens `s` to at most `max` characters without cutting a word. When the kept part has a clause
 * boundary in its second half, it ends there, so it doesn't end on a dangling word of a cut-off list
 * ("…, ogrevanje, toplotne"). Returns null when no word boundary fits (a single word longer than max).
 */
export function shortenAtWordBoundary(s: string, max: number): string | null {
  const text = s.trim();
  if (text.length <= max) return text;
  // The last whitespace at or before `max`: the word before it is whole.
  const cut = text.slice(0, max + 1).search(/\s\S*$/);
  if (cut <= 0) return null;
  let kept = text.slice(0, cut);
  let clauseEnd = -1;
  for (const m of kept.matchAll(CLAUSE)) {
    // Keep sentence punctuation, drop other separators.
    const end = /^[.!?]/.test(m[0]) ? m.index + 1 : m.index;
    if (end >= max / 2) clauseEnd = end;
  }
  if (clauseEnd > 0) kept = kept.slice(0, clauseEnd);
  kept = kept.replace(TRAILING, "");
  return kept.length > 0 ? kept : null;
}

/**
 * In place: trims whitespace around object keys, unless the trimmed key already exists in that object,
 * and drops properties whose value is null. Array items are never removed.
 */
function tidyKeys(value: unknown, path: string, repairs: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => tidyKeys(v, `${path}/${i}`, repairs));
    return;
  }
  if (!isObject(value)) return;
  const entries = Object.entries(value);
  if (entries.some(([k]) => k !== k.trim() && k.trim() !== "" && !Object.hasOwn(value, k.trim()))) {
    // Rebuild to keep the key order.
    const taken = new Set(entries.map(([k]) => k));
    for (const k of Object.keys(value)) delete value[k];
    for (const [k, v] of entries) {
      const t = k.trim();
      if (t !== k && t !== "" && !taken.has(t)) {
        value[t] = v;
        taken.add(t);
        repairs.push(`${path}: trimmed key ${JSON.stringify(k)}`);
      } else value[k] = v;
    }
  }
  for (const [k, v] of Object.entries(value)) {
    if (v === null) {
      delete value[k];
      repairs.push(`${path}/${k}: dropped null`);
    } else tidyKeys(v, `${path}/${k}`, repairs);
  }
}

/**
 * Repairs the parsed content answer in place and returns what it changed, one line per fix with its
 * JSON path (as validation issues are written). Anything it can't fix mechanically stays as it was.
 */
export function repairContentOutput(data: unknown): string[] {
  const repairs: string[] = [];
  tidyKeys(data, "", repairs);
  if (!isObject(data) || !Array.isArray(data.pages)) return repairs;
  data.pages.forEach((page, i) => {
    if (!isObject(page) || !isObject(page.seo)) return;
    const seo = page.seo;
    for (const field of ["title", "description"] as const) {
      const v = seo[field];
      const max = SEO_LIMITS[field];
      if (typeof v !== "string" || v.trim().length <= max) continue;
      const short = shortenAtWordBoundary(v, max);
      if (short === null) continue;
      seo[field] = short;
      repairs.push(`/pages/${i}/seo/${field}: shortened from ${v.trim().length} to ${short.length} characters`);
    }
  });
  return repairs;
}
