/**
 * Where a run writes its report and contact sheet, relative to eval/. Only a run over every fixture
 * replaces a committed baseline, and each mode/scope has its own (live and record share one); a run
 * with --only, --photos, --replay or --record-missing goes to eval/runs/ (not committed), so iterating on one
 * fixture never overwrites the measured baseline (a --record-missing run's times mix replayed and live calls).
 */
export function reportPaths(o: { mode: "live" | "record" | "record-missing" | "replay" | "offline"; scope: "full" | "home"; only?: string[]; photos?: number }): { report: string; contactSheet: string } {
  const home = o.scope === "home";
  if (o.mode === "replay" || o.mode === "record-missing" || o.only || o.photos !== undefined) {
    const tag = [o.mode, o.scope, ...(o.only ?? []), ...(o.photos !== undefined ? [`${o.photos}photos`] : [])].join("-");
    return { report: `runs/report-${tag}.md`, contactSheet: `runs/contact-sheet-${tag}.png` };
  }
  if (o.mode === "offline") return { report: `offline-report${home ? "-home" : ""}.md`, contactSheet: `offline-contact-sheet${home ? "-home" : ""}.png` };
  return { report: `report${home ? "-home" : ""}.md`, contactSheet: `contact-sheet${home ? "-home" : ""}.png` };
}
