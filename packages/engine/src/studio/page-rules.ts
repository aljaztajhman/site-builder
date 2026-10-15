/**
 * The Review 50 rules on the studio's homepage (the outside review, 2026-10-14/15; the studio shoot-out found them
 * broken on composed pages): a sentence at most once, each way to reach the business once per section, no empty
 * section, an image at most once. The studio's composed sections never passed through the repairs today's pipeline runs
 * (stages.ts), so the mockup, direct and picker paths run them here on the page they have just built, before the
 * guards: code after the model's answer, so the recordings replay unchanged. What can't be repaired is reported.
 */
import {
  repairComposedContact,
  repairComposedHoursNotes,
  repairRepeatedImages,
  repairRepeatedSentences,
  repairRepeatedVisit,
  repairThinSections,
  repeatedContactLines,
  repeatedImageIssues,
  repeatedSentenceLines,
  repeatedVisitLines,
  thinSectionLines,
  type SiteSpec,
} from "@sb/spec";
import { renderedPageText } from "../page-text.ts";

/**
 * The rules: (a) a sentence twice, (b) contact twice in a section, (c) an empty section, (e) an image twice, and the
 * banned pattern next to (b): the address or the hours in full in two sections of the page.
 */
export type PageRule = "sentence" | "contact" | "empty" | "image" | "visit";

export interface PageRuleIssue {
  rule: PageRule;
  line: string;
}

const homeIndex = (spec: SiteSpec) => Math.max(0, spec.pages.findIndex((p) => p.kind === "home"));

/** What the homepage still breaks of the rules, one line each (the check: spec-level, no browser). */
export function studioPageIssues(spec: SiteSpec): PageRuleIssue[] {
  const pi = homeIndex(spec);
  const out: PageRuleIssue[] = [];
  let sentenceLines: string[];
  try {
    sentenceLines = repeatedSentenceLines(spec, pi, renderedPageText);
  } catch (e) {
    sentenceLines = [`/pages/${pi}: sentences not checked (the page doesn't render: ${(e as Error).message.slice(0, 80)})`];
  }
  out.push(...sentenceLines.map((line) => ({ rule: "sentence" as const, line })));
  out.push(...repeatedContactLines(spec, pi).map((line) => ({ rule: "contact" as const, line })));
  out.push(...repeatedVisitLines(spec, pi).map((line) => ({ rule: "visit" as const, line })));
  out.push(...thinSectionLines(spec, pi).map((line) => ({ rule: "empty" as const, line })));
  out.push(
    ...repeatedImageIssues(spec)
      .filter((i) => i.path.startsWith(`/pages/${pi}/`))
      .map((i) => ({ rule: "image" as const, line: `${i.path}: ${i.message}` })),
  );
  return out;
}

/**
 * The repairs, in place, on a page the studio has just built (nothing points into it yet, so a composed list entry,
 * element or section may go): empty sections, repeated images, contact repeated in a section, then on the page, the
 * hours note, repeated sentences, then empty sections again (a drop can empty one). The spec stays as valid as it was.
 * Returns what was repaired, then a "still:" line for each rule the page still breaks.
 */
export function repairStudioPage(spec: SiteSpec): string[] {
  const log = [...repairThinSections(spec)];
  log.push(...repairRepeatedImages(spec, { composedEntries: true }));
  log.push(...repairComposedContact(spec));
  log.push(...repairRepeatedVisit(spec));
  log.push(...repairComposedHoursNotes(spec));
  try {
    log.push(...repairRepeatedSentences(spec, renderedPageText, { composedEntries: true }));
  } catch {
    log.push("repeated sentences: not checked (the page doesn't render)");
  }
  log.push(...repairThinSections(spec));
  return [...log.filter((l) => !l.includes("left it")), ...studioPageIssues(spec).map((i) => `still (${i.rule}): ${i.line}`)];
}
