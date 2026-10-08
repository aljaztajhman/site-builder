/**
 * Where a run writes its report, contact sheet and variety numbers, relative to eval/. Only a run over every fixture
 * replaces a committed baseline, and each mode/scope has its own (live and record share one); a run with --only,
 * --photos, --twins, --no-edits, --replay or --record-missing writes its report to eval/runs/ (not committed), so
 * iterating on one fixture never overwrites the measured baseline (a --record-missing run's times mix replayed and
 * live calls). The variety numbers don't depend on timing or edits: every run over every fixture keeps its own
 * committed file (eval/variety-<mode>-<scope>[-twins].md); partial runs put theirs in eval/runs/.
 */
export function reportPaths(o: {
  mode: "live" | "record" | "record-missing" | "replay" | "offline";
  scope: "full" | "home";
  only?: string[];
  photos?: number;
  twins?: boolean;
  edits?: boolean;
  /** --label: a named run (e.g. the variety switches off and on) always reports to eval/runs/, under its name. */
  label?: string;
}): { report: string; contactSheet: string; variety: string } {
  const home = o.scope === "home";
  const partial = !!o.only || o.photos !== undefined || !!o.label;
  // A label stands for the fixture list (a long --only list would make file names too long for Windows).
  const tag = [
    o.mode,
    o.scope,
    ...(o.label ? [o.label] : (o.only ?? [])),
    ...(o.photos !== undefined ? [`${o.photos}photos`] : []),
    ...(o.twins ? ["twins"] : []),
    ...(o.edits === false ? ["noedits"] : []),
  ].join("-");
  const variety = partial ? `runs/variety-${tag}.md` : `variety-${o.mode === "record" ? "live" : o.mode}-${o.scope}${o.twins ? "-twins" : ""}.md`;
  if (o.mode === "replay" || o.mode === "record-missing" || partial || o.twins || o.edits === false) {
    return { report: `runs/report-${tag}.md`, contactSheet: `runs/contact-sheet-${tag}.png`, variety };
  }
  if (o.mode === "offline") return { report: `offline-report${home ? "-home" : ""}.md`, contactSheet: `offline-contact-sheet${home ? "-home" : ""}.png`, variety };
  return { report: `report${home ? "-home" : ""}.md`, contactSheet: `contact-sheet${home ? "-home" : ""}.png`, variety };
}
