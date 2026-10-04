import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classify, type ModelClient } from "@sb/engine";

/**
 * Calibrating the intake's junk check (it-junk-threshold): classify a set of descriptions with the configured
 * classifier and find the confidence that separates junk from real businesses (config
 * tiers.junk.minClassifierConfidence). Descriptions shorter than tiers.junk.minDescriptionChars never reach the
 * classifier: they are refused by length, as the intake does.
 */
export interface JunkCase {
  id: string;
  expect: "junk" | "real";
  description: string;
}

export interface JunkResult extends JunkCase {
  /** null: refused by length, no model call. */
  businessType: string | null;
  confidence: number | null;
}

export const CASES_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../junk/cases.json");

export function loadCases(file = CASES_FILE): JunkCase[] {
  return (JSON.parse(readFileSync(file, "utf8")) as { cases: JunkCase[] }).cases;
}

/** One call per case that is long enough, in file order (the recordings replay in that order). */
export async function classifyCases(client: ModelClient, cases: JunkCase[], minChars: number): Promise<JunkResult[]> {
  const out: JunkResult[] = [];
  for (const c of cases) {
    if (c.description.trim().length < minChars) {
      out.push({ ...c, businessType: null, confidence: null });
      continue;
    }
    const r = await classify(client, c.description);
    out.push({ ...c, businessType: r.businessType, confidence: r.confidence });
  }
  return out;
}

export interface Separation {
  /** Highest confidence of a junk case the classifier saw (0 when none). */
  maxJunk: number;
  /** Lowest confidence of a real case (1 when none). */
  minReal: number;
  /** A threshold strictly above every junk case and at most every real case exists. */
  separable: boolean;
  /** The midpoint of the gap, rounded to 0.05, when separable. */
  suggested: number | null;
  /** Junk cases that pass, and real cases that are refused, at `threshold`. */
  wrongAt: (threshold: number) => { passedJunk: string[]; refusedReal: string[] };
}

export function separate(results: JunkResult[]): Separation {
  const seen = results.filter((r) => r.confidence !== null);
  const junk = seen.filter((r) => r.expect === "junk").map((r) => r.confidence!);
  const real = seen.filter((r) => r.expect === "real").map((r) => r.confidence!);
  const maxJunk = junk.length ? Math.max(...junk) : 0;
  const minReal = real.length ? Math.min(...real) : 1;
  const separable = maxJunk < minReal;
  const mid = Math.round(((maxJunk + minReal) / 2) * 20) / 20;
  // The rounded midpoint must still lie in the gap; otherwise the exact one.
  const suggested = !separable ? null : mid > maxJunk && mid <= minReal ? mid : (maxJunk + minReal) / 2;
  return {
    maxJunk,
    minReal,
    separable,
    suggested,
    wrongAt: (t) => ({
      // Refused by length counts as refused, which is right for junk and wrong for a real business.
      passedJunk: results.filter((r) => r.expect === "junk" && r.confidence !== null && r.confidence >= t).map((r) => r.id),
      refusedReal: results.filter((r) => r.expect === "real" && (r.confidence === null || r.confidence < t)).map((r) => r.id),
    }),
  };
}

/** The report as Markdown: every case with its verdict, the gap, and what today's threshold gets wrong. */
export function junkReport(results: JunkResult[], o: { threshold: number; minChars: number; model: string; eur: number; mode: string }): string {
  const s = separate(results);
  const wrongNow = s.wrongAt(o.threshold);
  const lines = [
    `# Junk check calibration (${o.mode})`,
    "",
    `Model ${o.model}, ${results.filter((r) => r.confidence !== null).length} calls, €${o.eur.toFixed(4)}. Refused by length: under ${o.minChars} characters.`,
    "",
    "| Case | Expected | Type | Confidence |",
    "|---|---|---|---|",
    ...results.map((r) => `| ${r.id} | ${r.expect} | ${r.businessType ?? "—"} | ${r.confidence === null ? "refused by length" : r.confidence.toFixed(2)} |`),
    "",
    `Highest junk confidence ${s.maxJunk.toFixed(2)}, lowest real confidence ${s.minReal.toFixed(2)}: ${
      s.separable ? `separable; suggested tiers.junk.minClassifierConfidence ${s.suggested!.toFixed(2)}.` : "not separable by confidence alone."
    }`,
    `Today's threshold ${o.threshold}: junk let through ${wrongNow.passedJunk.length ? wrongNow.passedJunk.join(", ") : "none"}; real refused ${wrongNow.refusedReal.length ? wrongNow.refusedReal.join(", ") : "none"}.`,
  ];
  return `${lines.join("\n")}\n`;
}
