/**
 * pnpm outside-review (--okus-round <n> | --run-dir <dir> [--since <ISO time>]) [--items <n>] [--only <id>,...] [--reviewers gemini,gpt]
 *                     --max-eur <eur> | --dry-run   [--out <dir>] [--record <dir> | --record-missing <dir> | --replay <dir>]
 *
 * Scores pages (four screenshots each) with each outside reviewer (config `outsideReview`, OpenRouter) and writes, in
 * <out> (default eval/runs/outside-review-<time>): scores-<reviewer>.json (what `pnpm okus:calibrate --judge` reads),
 * reviews.json (every answer), cost-log.jsonl, report.md and summary.json. --dry-run builds every request and prints the
 * estimate without a network call or a key. A live run needs OPENROUTER_API_KEY and --max-eur (it stops before a call
 * that would go over). --replay answers from recordings (€ 0, no key); --record saves the live answers;
 * --record-missing reuses the answers already recorded there (€ 0) and asks and records only the rest. An Anthropic
 * reviewer (config provider "anthropic") needs ANTHROPIC_API_KEY; with `batch` its pages go as Message Batches.
 *
 * pnpm outside-review --set <name>=<source> [--set ...] (--max-eur <eur> | --dry-run) [--out <dir>] [--record... | --replay <dir>]
 *
 * The whole-set round (set-review.ts): each reviewer sees every page of a set at once as two contact sheets (desktop 1280 px
 * first screens, phone 360 px first screens) and judges the set (overall, variety, sameness, recurring issues, best and
 * weakest pages, one change). A source is a directory (<id>-1280-first.png + <id>-360-first.png, <id>-desk.png +
 * <id>-phone.png, or <id>/home-1280-first.png + home-360-first.png), a manifest JSON ([{id, desk, phone}]), or a
 * comma-separated list of those (`today:<dir>` reads a studio-poc directory's `<id>-today-*` pages, today's site, instead
 * of the studio's). One call per reviewer per set; same transports, recordings, pricing and --max-eur stop.
 * Writes <out>/sets/<set>/{desk-N.jpg,phone-N.jpg,<reviewer>.json}, sets.md and cost-log.jsonl.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { loadConfig, repoRoot } from "@sb/config";
import { latestRatings, parseOwnerExport } from "./okus-calibrate.ts";
import { roundDir } from "./okus-round.ts";
import { buildSummary, formatReport, loadOkusItems, loadRunDirItems, planReview, runReview, scoresFor, selectItems } from "./outside-review.ts";
import { makeTransport, type OutsideTransport } from "./outside-transport.ts";
import { buildSet, loadSetPages, parseSetArg, planSets, runSets, writeSetOutputs, type BuiltSet } from "./set-review.ts";

const USAGE =
  "Usage: pnpm outside-review (--okus-round <n> | --run-dir <dir> [--since <ISO time>] | --set <name>=<dir|manifest.json|a,b>... ) [--items <n>] [--only <id>,...] [--reviewers gemini,gpt] (--max-eur <eur> | --dry-run) [--out <dir>] [--record <dir> | --record-missing <dir> | --replay <dir>]";

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
        since: { type: "string" },
        items: { type: "string" },
        only: { type: "string" },
        reviewers: { type: "string" },
        "max-eur": { type: "string" },
        "dry-run": { type: "boolean" },
        out: { type: "string" },
        record: { type: "string" },
        "record-missing": { type: "string" },
        replay: { type: "string" },
        set: { type: "string", multiple: true },
      },
    }).values;
  } catch (e) {
    print(`${e instanceof Error ? e.message : String(e)}\n${USAGE}`);
    return 2;
  }
  const config = loadConfig();
  const oc = config.outsideReview;
  const live = !v["dry-run"] && !v.replay;
  const setMode = (v.set?.length ?? 0) > 0;
  if (setMode && (v["okus-round"] || v["run-dir"] || v.items || v.only || v.since)) {
    print(`--set (the whole-set round) is a round of its own: leave out --okus-round, --run-dir, --items, --only and --since.\n${USAGE}`);
    return 2;
  }
  if (!setMode && !v["okus-round"] === !v["run-dir"]) {
    print(`Give exactly one of --okus-round and --run-dir (or --set <name>=<source> for the whole-set round).\n${USAGE}`);
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
  if (v.items !== undefined && !(Number.isInteger(Number(v.items)) && Number(v.items) > 0)) {
    print(`--items needs a whole number above 0, got "${v.items}".\n${USAGE}`);
    return 2;
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

  if ([v.replay, v.record, v["record-missing"]].filter(Boolean).length > 1) {
    print(`Give at most one of --replay, --record and --record-missing.\n${USAGE}`);
    return 2;
  }
  const transports = new Map<string, OutsideTransport>();
  if (!v["dry-run"]) {
    try {
      for (const r of reviewers) {
        transports.set(
          r.id,
          makeTransport({
            baseUrl: oc.baseUrl,
            env,
            reviewer: r,
            ...(v.replay ? { replay: path.resolve(v.replay) } : {}),
            ...(v.record ? { record: path.resolve(v.record) } : {}),
            ...(v["record-missing"] ? { recordMissing: path.resolve(v["record-missing"]) } : {}),
          }),
        );
      }
    } catch (e) {
      print(e instanceof Error ? e.message : String(e));
      return 2;
    }
  }

  if (setMode) {
    let built: BuiltSet[];
    try {
      const names = new Set<string>();
      built = [];
      for (const arg of v.set!) {
        const { name, source } = parseSetArg(arg);
        if (names.has(name)) throw new Error(`--set ${name} given twice`);
        names.add(name);
        built.push(await buildSet(name, loadSetPages(source)));
      }
    } catch (e) {
      print(e instanceof Error ? e.message : String(e));
      return 1;
    }
    const plan = planSets({ config, reviewers, sets: built });
    const e = oc.estimate;
    print(
      `${v["dry-run"] ? "Dry run: " : ""}${plan.sets} sets (${Object.entries(plan.bySet)
        .map(([n, s]) => `${n}: ${s.pages} pages, ${s.images} sheets, ${eur(s.eur)}`)
        .join("; ")}) × ${reviewers.length} reviewers = ${plan.calls} calls, ${plan.images} pictures; estimate ${eur(plan.eur)} (${Object.entries(plan.byReviewer)
        .map(([id, b]) => `${id} ${eur(b.eur)}`)
        .join(", ")}) at ${e.tokensPerImage} tokens per picture and ${e.outputTokens} answer tokens. No call is made${v["dry-run"] ? "" : " yet"}.`,
    );
    if (v["dry-run"]) return 0;
    if (live && plan.eur > maxEur) print(`Note: the estimate is over --max-eur ${eur(maxEur)}; the run will stop when the budget is reached.`);
    const out = path.resolve(v.out ?? path.join(repoRoot, "eval/runs", `outside-review-sets-${new Date().toISOString().replace(/[:.]/g, "-")}`));
    mkdirSync(out, { recursive: true });
    const costLog = path.join(out, "cost-log.jsonl");
    const run = await runSets({ config, reviewers, sets: built, transport: (r) => transports.get(r.id)!, maxEur, onCost: (line) => appendFileSync(costLog, `${JSON.stringify(line)}\n`), onProgress: print });
    writeSetOutputs({ out, reviewers, sets: built, run });
    print(`${run.calls} calls, ${eur(run.spentEur)} spent${run.stoppedByBudget ? " (stopped at --max-eur)" : ""}. Written to ${out} (sets.md, sets/<set>/<reviewer>.json and the sheets)`);
    return 0;
  }

  let items;
  let owner: Map<string, number> | undefined;
  try {
    const round = v["okus-round"] ? Number(v["okus-round"]) : undefined;
    const since = v.since ? new Date(v.since) : undefined;
    if (since && Number.isNaN(since.getTime())) throw new Error(`--since takes an ISO time, not ${v.since}`);
    const all = round !== undefined ? loadOkusItems(roundDir(round)) : loadRunDirItems(path.resolve(v["run-dir"]!), since ? { since } : {});
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
    transport: (r) => transports.get(r.id)!,
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
