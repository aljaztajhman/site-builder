/**
 * The homepage a full-site generation has written before its other pages (config pipeline.homepageFirst, engine
 * HOMEPAGE_READY): the event carries it, the editor shows it read-only until the merged first version is saved. It is
 * never a version and never published; the preview renders it with the same renderer as every other page.
 */
import { HOMEPAGE_READY } from "@sb/engine";
import type { EventRow } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** The events as the editor gets them: the homepage in the "Homepage ready" event becomes `true` (it is served by the preview). */
export function withoutHomepageDrafts(events: EventRow[]): EventRow[] {
  return events.map((e) => (e.message === HOMEPAGE_READY && isObject(e.data) && isObject(e.data.homepage) ? { ...e, data: { ...e.data, homepage: true } } : e));
}

/**
 * The latest run's homepage draft (events in order), while it is still the newest thing to show: none once that run has
 * saved its first version (a "preview" event after it) or a new run has started.
 */
export function homepageDraft(events: EventRow[]): { eventId: string; spec: SiteSpec } | null {
  const start = events.findLastIndex((e) => e.stage === "classify" && e.message === "start");
  const run = events.slice(Math.max(0, start));
  const at = run.findLastIndex((e) => e.message === HOMEPAGE_READY);
  const ready = run[at];
  if (!ready || !isObject(ready.data) || !isObject(ready.data.homepage)) return null;
  if (run.slice(at + 1).some((e) => e.stage === "preview")) return null;
  const spec = ready.data.homepage as unknown as SiteSpec;
  return Array.isArray(spec.pages) && spec.pages.some((p) => p.kind === "home") ? { eventId: ready.id, spec } : null;
}
