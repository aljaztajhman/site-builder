import { validateSite, type SiteSpec } from "@sb/spec";
import type { SiteCheckReport } from "./index.ts";

/**
 * A page that scrolls sideways at 360 px must not ship silently (the outside review: "ELEKTROINŠTALACIJE" at the
 * hero's size made the phone page 435 px wide). When every element that runs past the edge is a heading's text, the
 * type scale (design.scale, which sets every heading size) comes down within the range the design allows, and the
 * site is checked again: first halfway to the lowest allowed scale, then the lowest (at most `maxTries` re-checks).
 * The first scale that clears the scroll is kept. If none does, or something else overflows (an image, a table), the
 * spec stays as it was and the check's failure stands: the pipeline reports it.
 */

export interface OverflowRepair {
  spec: SiteSpec;
  report: SiteCheckReport;
  /** Whether the spec changed (a lower type scale). */
  changed: boolean;
  /** What was tried and how it ended; empty when the phone pages didn't scroll. */
  log: string[];
}

const SCALE_STEP = 0.005;

/** Pages that scroll sideways at the phone width. */
const scrolling = (r: SiteCheckReport) => r.pages.filter((p) => p.mobile.horizontalScroll);

/** The lowest type scale the spec allows (the validation it passes now stays as it is), below the current one. */
export function lowestAllowedScale(spec: SiteSpec): number {
  const issues = (s: SiteSpec) => {
    const v = validateSite(s);
    return new Set(v.ok ? [] : v.issues.map((i) => `${i.path} ${i.message}`));
  };
  const before = issues(spec);
  let lowest = spec.design.scale;
  for (let s = Math.round((spec.design.scale - SCALE_STEP) * 1000) / 1000; s >= 1.1; s = Math.round((s - SCALE_STEP) * 1000) / 1000) {
    const after = issues({ ...spec, design: { ...spec.design, scale: s } });
    if (![...after].every((k) => before.has(k))) break;
    lowest = s;
  }
  return lowest;
}

export async function repairPhoneOverflow(spec: SiteSpec, report: SiteCheckReport, recheck: (spec: SiteSpec) => Promise<SiteCheckReport>, opts: { maxTries?: number } = {}): Promise<OverflowRepair> {
  const pages = scrolling(report);
  if (!pages.length) return { spec, report, changed: false, log: [] };
  const what = pages.flatMap((p) => (p.mobile.overflowing ?? []).map((o) => ({ ...o, file: p.file })));
  const named = what.map((o) => `${o.file} ${o.what} +${o.by}px`).join("; ") || "nothing named";
  if (!what.length || what.some((o) => !o.heading)) {
    return { spec, report, changed: false, log: [`horizontal scroll at 360 px not repaired: not only heading text overflows (${named})`] };
  }
  const from = spec.design.scale;
  const lowest = lowestAllowedScale(spec);
  if (lowest >= from) return { spec, report, changed: false, log: [`horizontal scroll at 360 px not repaired: the type scale ${from} is already the lowest the design allows (${named})`] };
  const maxTries = opts.maxTries ?? 2;
  const tries = [...new Set([Math.round(((from + lowest) / 2) * 1000) / 1000, lowest])].filter((s) => s < from).slice(-maxTries);
  const log: string[] = [];
  for (const scale of tries) {
    const next: SiteSpec = { ...spec, design: { ...spec.design, scale } };
    const r = await recheck(next);
    if (!scrolling(r).length) {
      log.push(`horizontal scroll at 360 px repaired: type scale ${from} → ${scale} (${named})`);
      return { spec: next, report: r, changed: true, log };
    }
    log.push(`type scale ${scale}: still scrolls at 360 px (${scrolling(r).map((p) => `${p.file} ${p.mobile.scrollWidth}`).join(", ")})`);
  }
  log.push(`horizontal scroll at 360 px not repaired: the lowest type scale the design allows (${lowest}) still overflows (${named})`);
  return { spec, report, changed: false, log };
}
