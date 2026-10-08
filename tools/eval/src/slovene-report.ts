/**
 * The eval report's Slovene section: the deterministic copy lint (slovene-lint.ts, every mode, report only) and the
 * opt-in Slovene judge (slovene-judge.ts, --judge-slovene). Neither changes a fixture's pass or fail.
 */
import type { FixtureResult } from "./runner.ts";
import { RULES, type RuleId, type SloveneLint } from "./slovene-lint.ts";
import { SLOVENE_ERROR_KINDS } from "./slovene-judge.ts";

const esc = (t: string) => t.replace(/\|/g, "/").replace(/\s+/g, " ");
const countOnly = new Set(RULES.filter((r) => r.countOnly).map((r) => r.id));
const byRule = (counts: Partial<Record<RuleId, number>>) =>
  RULES.filter((r) => counts[r.id])
    .map((r) => `${r.id} ${counts[r.id]}`)
    .join(", ");

/** Lines for the report's Summary list: the lint's totals, and the Slovene judge's when it ran. */
export function sloveneSummary(results: FixtureResult[]): string[] {
  const out: string[] = [];
  const linted = results.filter((r) => r.slovene);
  if (linted.length) {
    const lints = linted.map((r) => r.slovene!.generated);
    const totals = sumCounts(lints.map((l) => l.counts));
    const echoed = lints.reduce((a, l) => a + Object.values(l.echoed).reduce((x, n) => x + (n ?? 0), 0), 0);
    const total = lints.reduce((a, l) => a + l.total, 0);
    const errors = Object.fromEntries(Object.entries(totals).filter(([k]) => !countOnly.has(k as RuleId))) as Partial<Record<RuleId, number>>;
    const mixed = lints.filter((l) => l.address.ti > 0 && l.address.vi > 0).length;
    out.push(
      `- Slovene copy lint (report only, no model; table below): **${total}** findings on ${lints.filter((l) => l.total > 0).length} of ${lints.length} sites${total ? ` (${byRule(errors)})` : ""}; ${mixed} site${mixed === 1 ? "" : "s"} mix vi and ti; ${echoed} more echo the client's own text; em dashes ${totals["em-dash"] ?? 0} (count only)`,
    );
  }
  const judged = results.filter((r) => r.sloveneJudge);
  if (judged.length) {
    const sum = (k: (typeof SLOVENE_ERROR_KINDS)[number]) => judged.reduce((a, r) => a + r.sloveneJudge!.counts[k], 0);
    out.push(
      `- Slovene judge (--judge-slovene): grammar ${sum("grammar")}, register ${sum("register")}, English ${sum("english")} errors on ${judged.length} sites (${judged.reduce((a, r) => a + r.sloveneJudge!.unquoted, 0)} quotes not found on the site; €${judged.reduce((a, r) => a + (r.sloveneJudgeEur ?? 0), 0).toFixed(3)})`,
    );
  }
  return out;
}

function sumCounts(all: Partial<Record<RuleId, number>>[]): Partial<Record<RuleId, number>> {
  const out: Partial<Record<RuleId, number>> = {};
  for (const c of all) for (const [k, n] of Object.entries(c) as [RuleId, number][]) out[k] = (out[k] ?? 0) + n;
  return out;
}

const echoedTotal = (l: SloveneLint) => Object.values(l.echoed).reduce((a, n) => a + (n ?? 0), 0);

/** The report's "Slovene copy" section. */
export function sloveneLines(results: FixtureResult[]): string[] {
  const linted = results.filter((r) => r.slovene);
  const judged = results.filter((r) => r.sloveneJudge || r.sloveneJudgeError);
  if (!linted.length && !judged.length) return [];
  const lines = ["## Slovene copy", ""];
  if (linted.length) {
    lines.push(
      "Deterministic lint (`tools/eval/src/slovene-lint.ts`) over every visible string of the generated site: pages, collections and alt texts; the business's own names, links and brands left out. Report only: no fixture passes or fails on it. A finding whose text is also in the client's own description is *echoed*: listed, not counted. Address counts vi and ti forms over the whole site.",
      "",
      "| Site | Strings | Findings | By rule | Address | Echoed | After edits |",
      "|---|---|---|---|---|---|---|",
    );
    for (const r of linted) {
      const g = r.slovene!.generated;
      const f = r.slovene!.final;
      const mixed = g.address.ti > 0 && g.address.vi > 0;
      lines.push(
        `| ${r.id} | ${g.strings} | ${g.total} | ${byRule(g.counts) || "—"} | vi ${g.address.vi} / ti ${g.address.ti}${mixed ? " (mixed)" : ""} | ${echoedTotal(g) ? `${echoedTotal(g)} (${byRule(g.echoed)})` : "—"} | ${f ? f.total : "—"} |`,
      );
    }
    lines.push("", "| Rule | Findings | Sites | Echoed |", "|---|---|---|---|");
    for (const rule of RULES) {
      const n = linted.reduce((a, r) => a + (r.slovene!.generated.counts[rule.id] ?? 0), 0);
      const sites = linted.filter((r) => r.slovene!.generated.counts[rule.id]).length;
      const e = linted.reduce((a, r) => a + (r.slovene!.generated.echoed[rule.id] ?? 0), 0);
      lines.push(`| ${rule.id}: ${rule.label} | ${n} | ${sites} | ${e} |`);
    }
    lines.push("");
    const examples = linted.filter((r) => r.slovene!.generated.findings.length);
    if (examples.length) {
      lines.push("Findings (up to eight per site; every finding is in `eval/runs/<site>/slovene-lint.json`):", "");
      for (const r of examples) {
        const fs = [...r.slovene!.generated.findings].sort((a, b) => Number(a.echoed) - Number(b.echoed)).slice(0, 8);
        lines.push(`- **${r.id}**: ${fs.map((f) => `${f.rule} „${esc(f.quote)}“ in „${esc(f.text.slice(0, 60))}${f.text.length > 60 ? "…" : ""}“ (\`${f.path}\`)${f.echoed ? " *echoed*" : ""}`).join("; ")}`);
      }
      lines.push("");
    }
  }
  if (judged.length) {
    lines.push(
      "### Slovene judge",
      "",
      "Errors the model listed with quotes (`tools/eval/src/slovene-judge.ts`, opt-in with `--judge-slovene`). Unquoted: quotes not found word for word on the site.",
      "",
      "| Site | Grammar | Register | English | Unquoted | Note | First errors |",
      "|---|---|---|---|---|---|---|",
    );
    for (const r of judged) {
      if (!r.sloveneJudge) {
        lines.push(`| ${r.id} | — | — | — | — | judge failed: ${esc(r.sloveneJudgeError ?? "")} | — |`);
        continue;
      }
      const j = r.sloveneJudge;
      const first = SLOVENE_ERROR_KINDS.flatMap((k) => j.output[k].slice(0, 2).map((e) => `${k}: „${esc(e.quote)}“ → „${esc(e.fix)}“`)).join("; ");
      lines.push(`| ${r.id} | ${j.counts.grammar} | ${j.counts.register} | ${j.counts.english} | ${j.unquoted} | ${esc(j.output.note)} | ${first || "—"} |`);
    }
    lines.push("");
  }
  return lines;
}
