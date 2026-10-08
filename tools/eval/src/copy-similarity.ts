/**
 * How alike the generated homepages read (audit 2026-10-01, "same-looking homepages come from the catalogue text"):
 * the word overlap of their headlines, eyebrows and section titles, across fixtures and within a trade (twins). Free
 * and offline, from the spec alone. The business's own name and town are left out, so two sites score high only when
 * they share the template's phrasing ("Kje nas najdete", "Pokličite nas"), not their facts.
 */
import type { SiteSpec } from "@sb/spec";

/** A homepage's headings, as written. */
export interface HomepageCopy {
  id: string;
  trade: string;
  /** Hero headline and eyebrow, section titles and eyebrows, top to bottom. */
  headings: string[];
  /** Word stems of the headings, the business's name and town left out. */
  stems: string[];
}

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
/** Slovene inflects word ends: the first five letters stand for the word ("najdete", "najdemo" → "najde"). */
const stem = (w: string) => w.slice(0, 5);
const words = (s: string) => fold(s).split(/[^\p{L}]+/u).filter((w) => w.length >= 3);

export function homepageCopy(id: string, trade: string, spec: SiteSpec): HomepageCopy {
  const home = spec.pages.find((p) => p.kind === "home") ?? spec.pages[0]!;
  const headings: string[] = [];
  for (const s of home.sections) {
    const p = s.props as Record<string, unknown>;
    for (const k of ["eyebrow", "headline", "title"]) if (typeof p[k] === "string" && p[k]) headings.push(p[k] as string);
  }
  const address = spec.business.address as { city?: unknown } | undefined;
  const own = new Set([...words(typeof spec.business.name === "string" ? spec.business.name : ""), ...words(typeof address?.city === "string" ? address.city : "")].map(stem));
  const stems = [...new Set(headings.flatMap(words).map(stem))].filter((w) => !own.has(w));
  return { id, trade, headings, stems };
}

/** Jaccard overlap of two homepages' heading stems: 0 = no word in common, 1 = the same words. */
export function copyOverlap(a: HomepageCopy, b: HomepageCopy): number {
  const sa = new Set(a.stems);
  const sb = new Set(b.stems);
  const shared = [...sa].filter((w) => sb.has(w)).length;
  const union = new Set([...sa, ...sb]).size;
  return union ? shared / union : 0;
}

export interface CopySummary {
  pairs: { a: string; b: string; sameTrade: boolean; overlap: number }[];
  /** Mean overlap of pairs of different trades, and of pairs within one trade (null: none). */
  acrossTrades: number | null;
  withinTrade: number | null;
  /** Headings (folded) that two or more homepages use word for word, most used first. */
  repeated: { heading: string; sites: number }[];
}

export function copySummary(sites: HomepageCopy[]): CopySummary {
  const pairs: CopySummary["pairs"] = [];
  for (let i = 0; i < sites.length; i++)
    for (let j = i + 1; j < sites.length; j++) pairs.push({ a: sites[i]!.id, b: sites[j]!.id, sameTrade: sites[i]!.trade === sites[j]!.trade, overlap: copyOverlap(sites[i]!, sites[j]!) });
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  const uses = new Map<string, Set<string>>();
  for (const s of sites) for (const h of s.headings) {
    const k = fold(h).replace(/[^\p{L}\p{N} ]+/gu, "").replace(/\s+/g, " ").trim();
    if (k) uses.set(k, (uses.get(k) ?? new Set()).add(s.id));
  }
  return {
    pairs,
    acrossTrades: mean(pairs.filter((p) => !p.sameTrade).map((p) => p.overlap)),
    withinTrade: mean(pairs.filter((p) => p.sameTrade).map((p) => p.overlap)),
    repeated: [...uses].filter(([, ids]) => ids.size > 1).map(([heading, ids]) => ({ heading, sites: ids.size })).sort((a, b) => b.sites - a.sites || a.heading.localeCompare(b.heading)),
  };
}
