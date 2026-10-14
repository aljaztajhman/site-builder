/**
 * pnpm outside-review (--okus-round <n> | --run-dir <dir>) [--items <n>] [--only <id>,...] [--reviewers gemini,gpt]
 *                     --max-eur <eur> | --dry-run   [--out <dir>] [--record <dir> | --replay <dir>]
 *
 * Scores pages (four screenshots each) with each outside reviewer (config `outsideReview`, OpenRouter) and writes, in
 * <out> (default eval/runs/outside-review-<time>): scores-<reviewer>.json (what `pnpm okus:calibrate --judge` reads),
 * reviews.json (every answer), cost-log.jsonl, report.md and summary.json. --dry-run builds every request and prints the
 * estimate without a network call or a key. A live run needs OPENROUTER_API_KEY and --max-eur (it stops before a call
 * that would go over). --replay answers from recordings (€ 0, no key); --record saves the live answers.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { loadConfig, repoRoot } from "@sb/config";
import { latestRatings, parseOwnerExport } from "./okus-calibrate.ts";
import { roundDir } from "./okus-round.ts";
import { buildSummary, formatReport, loadOkusItems, loadRunDirItems, planReview, runReview, scoresFor, selectItems } from "./outside-review.ts";
import { makeTransport } from "./outside-transport.ts";

const USAGE =
  "Usage: pnpm outside-review (--okus-round <n> | --run-dir <dir>) [--items <n>] [--only <id>,...] [--reviewers gemini,gpt] (--max-eur <eur> | --dry-run) [--out <dir>] [--record <dir> | --replay <dir>]";

const eur = (x: number) => `€${x.toFixed(4)}`;

/** Returns the exit code; `print` receives every line (never a secret). */
export async function main(argv: string[], env: Record<string, string | undefined>, print: (line: string) => void = console.log): Promise<number> {
  let v;
  try {
    v = parseArgs({
      args: argv,
      options: {
        "okus-round": { type: "string" },
        "run-dir": { type: "string" },
        items: { type: "string" },
        only: { type: "string" },
        reviewers: { type: "string" },
        "max-eur": { type: "string" },
        "dry-run": { type: "boolean" },
        out: { type: "string" },
        record: { type: "string" },
        replay: { type: "string" },
      },
    }).values;
  } catch (e) {
    print(`${e instanceof Error ? e.message : String(e)}\n${USAGE}`);
    return 2;
  }
  const config = loadConfig();
  const oc = config.outsideReview;
  const live = !v["dry-run"] && !v.replay;
  if (!v["okus-round"] === !v["run-dir"]) {
    print(`Give exactly one of --okus-round and --run-dir.\n${USAGE}`);
    return 2;
  }
  let maxEur = Number.POSITIVE_INFINITY;
  if (live) {
    maxEur = Number(v["max-eur"]);
    if (v["max-eur"] === undefined || !Number.isFinite(maxEur) || maxEur < 0) {
      print(`A live run needs --max-eur <euros> (it stops before a call that would go over). Use --dry-run to price it first.\n${USAGE}`);
      return 2;
    }
  }
  let reviewers = oc.reviewers;
  if (v.reviewers) {
    const want = v.reviewers.split(",").map((s) => s.trim());
    const unknown = want.filter((id) => !oc.reviewers.some((r) => r.id === id));
    if (unknown.length) {
      print(`Unknown reviewer: ${unknown.join(", ")} (configured: ${oc.reviewers.map((r) => r.id).join(", ")})`);
      return 2;
    }
    reviewers = oc.reviewers.filter((r) => want.includes(r.id));
  }

  let transport;
  if (!v["dry-run"]) {
    try {
      transport = makeTransport({ baseUrl: oc.baseUrl, env, ...(v.replay ? { replay: path.resolve(v.replay) } : {}), ...(v.record ? { record: path.resolve(v.record) } : {}) });
    } catch (e) {
      print(e instanceof Error ? e.message : String(e));
      return 2;
    }
  }

  let items;
  let owner: Map<string, number> | undefined;
  try {
    const round = v["okus-round"] ? Number(v["okus-round"]) : undefined;
    const all = round !== undefined ? loadOkusItems(roundDir(round)) : loadRunDirItems(path.resolve(v["run-dir"]!));
    items = selectItems(all, { ...(v.only ? { only: v.only.split(",").map((s) => s.trim()) } : {}), ...(v.items ? { count: Number(v.items) } : {}) });
    const ownerFile = round !== undefined ? path.join(roundDir(round), "owner.json") : undefined;
    if (round !== undefined && ownerFile && existsSync(ownerFile)) {
      owner = new Map([...latestRatings(parseOwnerExport(JSON.parse(readFileSync(ownerFile, "utf8"))).ratings, round)].map(([id, r]) => [id, r.score]));
    }
  } catch (e) {
    print(e instanceof Error ? e.message : String(e));
    return 1;
  }

  const plan = await planReview({ config, reviewers, items });
  const e = oc.estimate;
  print(
    `${v["dry-run"] ? "Dry run: " : ""}${plan.items} pages × ${reviewers.length} reviewers = ${plan.calls} calls, ${plan.images} pictures; estimate ${eur(plan.eur)} (${Object.entries(plan.byReviewer)
      .map(([id, b]) => `${id} ${eur(b.eur)}`)
      .join(", ")}) at ${e.tokensPerImage} tokens per picture and ${e.outputTokens} answer tokens. No call is made${v["dry-run"] ? "" : " yet"}.`,
  );
  if (v["dry-run"]) return 0;
  if (live && plan.eur > maxEur) print(`Note: the estimate is over --max-eur ${eur(maxEur)}; the run will stop when the budget is reached.`);

  const out = path.resolve(v.out ?? path.join(repoRoot, "eval/runs", `outside-review-${new Date().toISOString().replace(/[:.]/g, "-")}`));
  mkdirSync(out, { recursive: true });
  const costLog = path.join(out, "cost-log.jsonl");
  const run = await runReview({
    config,
    reviewers,
    items,
    transport: transport!,
    maxEur,
    onCost: (line) => appendFileSync(costLog, `${JSON.stringify(line)}\n`),
    onProgress: print,
  });
  for (const r of reviewers) writeFileSync(path.join(out, `scores-${r.id}.json`), `${JSON.stringify(scoresFor(run, r.id), null, 2)}\n`);
  const summary = buildSummary({ config, reviewers, run, owner, items });
  writeFileSync(path.join(out, "reviews.json"), `${JSON.stringify(run.results, null, 2)}\n`);
  writeFileSync(path.join(out, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(path.join(out, "report.md"), formatReport(summary));
  print(`${run.calls} calls, ${eur(run.spentEur)} spent${run.stoppedByBudget ? " (stopped at --max-eur)" : ""}. Written to ${out}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2), process.env);
}
