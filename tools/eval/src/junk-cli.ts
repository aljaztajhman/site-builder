/**
 * pnpm eval:junk [--record | --replay] [--max-eur 0.10]
 *
 * Classifies tools/eval/junk/cases.json with the configured classifier (config models.classify) and reports, per
 * case, the business type and confidence, the confidence that separates junk from real businesses, and what today's
 * tiers.junk.minClassifierConfidence gets wrong (it-junk-threshold). Live and --record make real calls (about
 * €0.01 for the set); --record also writes them to tools/eval/recordings/junk/ for --replay and the tests. Every
 * call's cost is logged and the run stops at --max-eur. Report: eval/runs/junk-<mode>.md.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { rmSync } from "node:fs";
import path from "node:path";
import { loadConfig, repoRoot } from "@sb/config";
import { AnthropicTransport, ModelClient, RecordingTransport, ReplayTransport, type ModelTransport } from "@sb/engine";
import { classifyCases, junkReport, loadCases, separate } from "./junk/calibrate.ts";

const args = process.argv.slice(2);
const mode = args.includes("--replay") ? "replay" : args.includes("--record") ? "record" : "live";
const maxEur = args.includes("--max-eur") ? Number(args[args.indexOf("--max-eur") + 1]) : 0.1;
const config = loadConfig();
const dir = path.join(repoRoot, "tools/eval/recordings/junk");

if (mode !== "replay" && !process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set. Use --replay to run on the recorded answers.");
  process.exit(2);
}
let transport: ModelTransport;
if (mode === "replay") transport = new ReplayTransport(dir, true);
else if (mode === "record") {
  rmSync(dir, { recursive: true, force: true });
  transport = new RecordingTransport(new AnthropicTransport(), dir);
} else transport = new AnthropicTransport();

let eur = 0;
const client = new ModelClient({
  config,
  transport,
  spentToday: async () => (eur >= maxEur ? Number.POSITIVE_INFINITY : 0),
  onCall: async (r) => {
    eur += r.costEur;
    console.log(`[cost] ${r.stage} ${r.model} in ${r.usage.input_tokens} out ${r.usage.output_tokens} €${r.costEur.toFixed(5)}`);
  },
});

const results = await classifyCases(client, loadCases(), config.tiers.junk.minDescriptionChars);
// Replayed answers cost nothing now; the recorded cost is what the run cost when recorded.
const report = junkReport(results, { threshold: config.tiers.junk.minClassifierConfidence, minChars: config.tiers.junk.minDescriptionChars, model: config.models.classify.model, eur, mode });
await mkdir(path.join(repoRoot, "eval/runs"), { recursive: true });
const out = path.join(repoRoot, `eval/runs/junk-${mode}.md`);
await writeFile(out, report);
console.log(report);
const s = separate(results);
console.log(`Wrote ${path.relative(repoRoot, out)}. ${s.separable ? `Suggested threshold ${s.suggested!.toFixed(2)}.` : "Not separable by confidence alone."} Model spend €${eur.toFixed(4)}${mode === "replay" ? " (as recorded)" : ""}.`);
