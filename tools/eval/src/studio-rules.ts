/**
 * pnpm exec tsx tools/eval/src/studio-rules.ts [--mode mockup|direct|picker] [--dir <folder>] [--repair] [--verbose]
 *
 * Counts what the studio's homepages still break of the Review 50 rules (engine studio/page-rules.ts studioPageIssues:
 * spec-level, no browser, free): (a) a sentence shown twice, (b) a way to reach the business twice in one section,
 * (c) an empty section, (e) an image twice. Reads every `<id>.spec.json` (not `.today.spec.json`) in
 * eval/runs/studio-poc-<mode>/ (written by `pnpm studio:poc --fresh --mode <mode> --replay`), or in --dir.
 * --repair runs the studio's repairs (repairStudioPage) on each spec first, in memory (specs written before the repairs
 * existed); --verbose prints each line.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { repoRoot } from "@sb/config";
import { repairStudioPage, studioPageIssues, type PageRule } from "@sb/engine";
import { migrateSpec } from "@sb/spec";

const args = process.argv.slice(2);
const val = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const dir = val("--dir") ?? path.join(repoRoot, "eval/runs", `studio-poc-${val("--mode") ?? "mockup"}`);
const verbose = args.includes("--verbose");
const repair = args.includes("--repair");

const RULES: [PageRule, string][] = [
  ["sentence", "(a) sentence twice"],
  ["contact", "(b) contact twice in a section"],
  ["empty", "(c) empty section"],
  ["image", "(e) image twice"],
  ["visit", "address or hours in full in two sections"],
];
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".spec.json") && !f.endsWith(".today.spec.json"))
  .sort();
const total = new Map<PageRule, number>(RULES.map(([r]) => [r, 0]));
console.log(`${path.relative(repoRoot, dir) || dir}: ${files.length} studio homepages`);
console.log(["fixture".padEnd(28), ...RULES.map(([r]) => r.padStart(9))].join(""));
for (const f of files) {
  const spec = migrateSpec(JSON.parse(readFileSync(path.join(dir, f), "utf8")));
  const repairs = repair ? repairStudioPage(spec).filter((l) => !l.startsWith("still")) : [];
  const issues = studioPageIssues(spec);
  const n = (r: PageRule) => issues.filter((i) => i.rule === r).length;
  for (const [r] of RULES) total.set(r, total.get(r)! + n(r));
  console.log([f.replace(/\.spec\.json$/, "").padEnd(28), ...RULES.map(([r]) => String(n(r)).padStart(9))].join(""));
  if (verbose) for (const l of repairs) console.log(`    repaired: ${l}`);
  if (verbose) for (const i of issues) console.log(`    ${i.rule}: ${i.line}`);
}
console.log(["total".padEnd(28), ...RULES.map(([r]) => String(total.get(r)).padStart(9))].join(""));
console.log(RULES.map(([r, label]) => `${label}: ${total.get(r)}`).join("; "));
