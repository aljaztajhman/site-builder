/**
 * pnpm eval [--only <id>[,<id>]] [--record | --record-missing | --replay | --offline] [--scope full|home] [--photos <n>] [--no-lighthouse] [--max-eur 25] [--judge | --no-judge]
 *
 * live (default):   real model calls, the only place outside the app that spends money.
 * --record:         live, and writes every model exchange to tools/eval/recordings/<id>/ for unit tests.
 * --record-missing: replays the calls whose request is unchanged since the recording and pays only for the rest,
 *                   rewriting the fixture's recordings in place (a changed stage and the ones after it re-record).
 * --replay:         replays those recordings (no network, no cost).
 * --offline:        no model at all: checks hand-authored golden specs from tools/eval/golden/.
 * --judge:          score each generated homepage with the vision judge (default for live, --record and
 *                   --record-missing; opt-in for --offline and --replay, since it is a real model call). All of a
 *                   run's judge calls go out as one Message Batch (50 % off) after the last fixture; the run waits.
 * --judge-slovene:  also list each generated site's grammar, register and English-word errors with the Slovene judge
 *                   (slovene-judge.ts; a real model call per site on the judge's model, in the same batch). Never on by
 *                   default, in any mode. The free Slovene copy lint (slovene-lint.ts) runs in every mode, report only.
 * --photos <n>:     give each fixture only its first n photos (0: a site without photos, which gets generated pictures).
 * --no-edits:       generate and check only; no scripted chat edits (about 40 % of a homepage run's cost). Not with
 *                   --record (it would drop the edit recordings the tests replay).
 * --shard <k>/<n>:  run only every n-th fixture starting at the k-th (1-based), e.g. CI's two offline runners;
 *                   the report goes beside the others in eval/runs/, as for --only.
 * --strict:         exit 1 when a fixture errored, stopped early or has a checkpoint with a failure (CI runs
 *                   `pnpm eval --offline --strict`). Without it the run reports and exits 0.
 * --twins:          also run the twins (tools/eval/twins: more businesses of the same trades, no scripted edits), for
 *                   the same-trade look distance. They have no recordings or goldens: live, --record or --record-missing.
 * --prompt-fixes all|<name>[,<name>]: turns those config promptFixes switches on for this run (docs/dev/prompt-fixes.md),
 *                   e.g. --record-missing --only avtoservis-mrak --prompt-fixes catalogue. --replay says per fixture how
 *                   many requests changed since the recording (a changed prompt still replays the recorded answer).
 * --compact-catalogue: turns config prompts.compactCatalogue on for this run (the section catalogue and business schema in the
 *                   compact notation; HQ it-compact-catalogue). --replay counts the changed requests as with --prompt-fixes.
 * --homepage-first: turns config pipeline.homepageFirst on for this run (full scope: the homepage, then the other pages side
 *                   by side; HQ it-homepage-first). The recordings hold one content answer per site, so --replay runs out of
 *                   content recordings for the page calls until they are recorded with it on.
 * --cost-cuts all|<name>[,<name>]: turns those config costCuts switches on for this run (secondCritiqueOnlyOnFailures,
 *                   contentRetryAsPatch; docs/plans/cost-cuts.md).
 * --variety all|<name>[,<name>]: turns those config variety switches on for this run (families, skeleton, concept;
 *                   docs/plans/variety-engine.md). With families on, every generated site also gets its "Druga podoba"
 *                   (no model call) rendered, checked and measured against the generated look. The sites made earlier
 *                   in a run are always the later fixtures' neighbours (same trade, same town first), as on the platform.
 * --regenerate [twins]: after the checks, "Ustvari znova" once per fixture (a real generation, paid) and the look
 *                   distance from the first generation (variety Step 2: a regeneration explores); "twins": twins only.
 * --recordings <dir>: where --record-missing and --replay keep the recordings (default tools/eval/recordings, the
 *                   full-scope ones the tests replay; a homepage-scope or switched run should keep its own).
 * --reuse-pictures: a picture request the cache doesn't know takes the picture the fixture got earlier at the same
 *                   position (eval-transports.ts), so a run that changes the brief or design keeps its pictures fixed.
 * --label <name>:   names the run in its report files (eval/runs/variety-…-<name>.md/.json), e.g. off and on.
 * fal pictures (FAL_KEY) are cached by request in tools/eval/image-cache/ in every mode that makes them.
 * Writes eval/report.md, eval/contact-sheet.png, the review sheets in eval/look/ (look.ts) and the variety numbers
 * (variety-report.ts): eval/variety-<mode>-<scope>.md for a run over every fixture, else beside the report in eval/runs/.
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { loadConfig } from "@sb/config";
import { BatchTransport, NO_PROMPT_FIXES, launchCheckBrowser } from "@sb/engine";
import { loadFixtures, loadTwins } from "./fixtures/load.ts";
import { VARIETY_SWITCHES, renderVariety, varietyData } from "./variety-report.ts";
import { runFixture, type FixtureResult, type Mode } from "./runner.ts";
import { contactSheet, renderReport } from "./report.ts";
import { desktopContactSheet, reviewSheet } from "./look.ts";
import { reportPaths } from "./report-paths.ts";
import { sloveneJudgeRequested } from "./slovene-judge.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

/** The scripted edits: how many were applied without validation issues, and how their checks went (manual: judged by eye). */
const editLine = (r: FixtureResult): string => {
  const edits = r.checkpoints.flatMap((c) => (c.edit ? [c.edit] : []));
  const manual = edits.filter((e) => e.check.pass === null).length;
  return edits.length
    ? `edits applied ${edits.filter((e) => e.issues.length === 0).length}/${edits.length}, checks passed ${edits.filter((e) => e.check.pass === true).length}/${edits.length - manual}${manual ? ` (${manual} manual)` : ""}`
    : "";
};

const mode: Mode = flag("offline") ? "offline" : flag("replay") ? "replay" : flag("record-missing") ? "record-missing" : flag("record") ? "record" : "live";
const paid = mode === "live" || mode === "record" || mode === "record-missing";
const scope = value("scope") === "home" ? "home" : "full";
const maxEur = Number(value("max-eur") ?? 25);
const shardArg = value("shard");
const shard = shardArg ? /^(\d+)\/(\d+)$/.exec(shardArg) : null;
if (shardArg && (!shard || Number(shard[1]) < 1 || Number(shard[1]) > Number(shard[2]))) {
  console.error(`--shard takes <k>/<n> with 1 <= k <= n, not ${shardArg}`);
  process.exit(2);
}
const onlyArg = value("only")?.split(",").map((s) => s.trim());
const judge = flag("judge") || (paid && !flag("no-judge"));
const judgeSlovene = sloveneJudgeRequested(args);
const outDir = path.join(repoRoot, "eval");

if ((paid || judge || judgeSlovene) && !process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set. Use --offline (golden specs) or --replay (recordings) to run without the API.");
  process.exit(2);
}

const edits = !flag("no-edits");
if (!edits && mode === "record") {
  console.error("--no-edits with --record would drop the fixtures' edit recordings; use --record-missing (it keeps them) or record with edits.");
  process.exit(2);
}
const twins = flag("twins");
if (twins && !paid) {
  console.error("--twins needs real generations (live, --record or --record-missing): the twins have no recordings or golden specs.");
  process.exit(2);
}
const photoLimit = value("photos") === undefined ? undefined : Number(value("photos"));
const fixtures = [...loadFixtures(), ...(twins ? loadTwins() : [])]
  .filter((f) => !onlyArg || onlyArg.includes(f.id))
  .filter((_, i) => !shard || i % Number(shard[2]) === Number(shard[1]) - 1)
  .map((f) => (photoLimit === undefined ? f : { ...f, photos: f.photos.slice(0, photoLimit) }));
if (fixtures.length === 0) {
  console.error(`No fixtures match ${onlyArg?.join(",") ?? ""}${shardArg ? ` (shard ${shardArg})` : ""}`);
  process.exit(2);
}
const missingPhotos = fixtures.some((f) => f.photos.some((p) => !existsSync(p.path)));
if (missingPhotos) {
  console.log("Generating stand-in photos …");
  execFileSync(process.execPath, [path.join(repoRoot, "node_modules/tsx/dist/cli.mjs"), path.join(here, "fixtures/generate-photos.ts")], { stdio: "inherit" });
}

// A shard reports like an --only run over its fixtures.
const only = shard ? fixtures.map((f) => f.id) : onlyArg;
const config = loadConfig();
// --prompt-fixes all | name,name: turns those config promptFixes switches on for this run (the runner shares the config).
const fixesArg = value("prompt-fixes");
if (fixesArg) {
  const names = fixesArg === "all" ? Object.keys(NO_PROMPT_FIXES) : fixesArg.split(",").map((s) => s.trim());
  const unknown = names.filter((n) => !(n in NO_PROMPT_FIXES));
  if (unknown.length) {
    console.error(`Unknown prompt fix(es): ${unknown.join(", ")}. Known: ${Object.keys(NO_PROMPT_FIXES).join(", ")}.`);
    process.exit(2);
  }
  for (const n of names) (config.promptFixes as Record<string, unknown>)[n] = true;
  console.log(`Prompt fixes on: ${names.join(", ")}`);
}
if (flag("compact-catalogue")) {
  config.prompts.compactCatalogue = true;
  console.log("Compact catalogue on (prompts.compactCatalogue)");
}
if (flag("homepage-first")) {
  config.pipeline.homepageFirst = true;
  console.log("Homepage first on (pipeline.homepageFirst)");
}
// --cost-cuts all | secondCritiqueOnlyOnFailures,contentRetryAsPatch: turns those config costCuts switches on for this run.
const cutsArg = value("cost-cuts");
if (cutsArg) {
  const known = Object.keys(config.costCuts);
  const names = cutsArg === "all" ? known : cutsArg.split(",").map((s) => s.trim());
  const unknown = names.filter((n) => !known.includes(n));
  if (unknown.length) {
    console.error(`Unknown cost cut(s): ${unknown.join(", ")}. Known: ${known.join(", ")}.`);
    process.exit(2);
  }
  for (const n of names) (config.costCuts as Record<string, boolean>)[n] = true;
  console.log(`Cost cuts on: ${names.join(", ")}`);
}
// --variety all | families,skeleton,concept: turns those config variety switches on for this run.
const varietyArg = value("variety");
if (varietyArg) {
  const names = varietyArg === "all" ? [...VARIETY_SWITCHES] : varietyArg.split(",").map((s) => s.trim());
  const unknown = names.filter((n) => !(VARIETY_SWITCHES as readonly string[]).includes(n));
  if (unknown.length) {
    console.error(`Unknown variety switch(es): ${unknown.join(", ")}. Known: ${VARIETY_SWITCHES.join(", ")}.`);
    process.exit(2);
  }
  for (const n of names) config.variety[n as (typeof VARIETY_SWITCHES)[number]] = true;
  console.log(`Variety switches on: ${names.join(", ")}`);
}
const regenerate = flag("regenerate");
const twinIds = new Set(value("regenerate") === "twins" ? loadTwins().map((t) => t.id) : []);
if (regenerate && !paid) {
  console.error("--regenerate needs real generations (live or --record-missing).");
  process.exit(2);
}
// --recordings <dir>: where --record-missing/--replay keep the fixtures' recordings (default tools/eval/recordings, the
// full-scope ones the unit tests replay). A homepage-scope or switched run should keep its own, so it never rewrites those.
const recordingsDir = path.resolve(repoRoot, value("recordings") ?? "tools/eval/recordings");
if (mode === "record" && value("recordings") === undefined && scope === "home") {
  console.error("--record --scope home would replace the full-scope recordings the tests replay; pass --recordings <dir>.");
  process.exit(2);
}
const label = value("label");
await mkdir(outDir, { recursive: true });
const browser = await launchCheckBrowser();
const results: FixtureResult[] = [];
const startedAt = new Date();
const t0 = Date.now();
let spent = 0;
const judgeBatch = judge || judgeSlovene ? { transport: new BatchTransport(), judging: [] as Promise<void>[] } : undefined;
try {
  for (const f of fixtures) {
    if (spent >= maxEur) {
      console.error(`Stopping: model spend €${spent.toFixed(2)} reached the run budget €${maxEur}.`);
      break;
    }
    console.log(`\n▶ ${f.id} (${f.brief.businessType}, ${mode})`);
    const r = await runFixture(f, {
      mode,
      outDir,
      browser,
      recordingsDir,
      goldenDir: path.join(repoRoot, "tools/eval/golden"),
      scope,
      lighthouse: !flag("no-lighthouse"),
      maxEur,
      spentSoFar: () => spent,
      judge,
      judgeSlovene,
      edits,
      // The sites made so far in this run are the platform's other sites (the variety engine's neighbours).
      neighbours: results.flatMap((x) => (x.made ? [x.made] : [])),
      regenerate: regenerate && (twinIds.size === 0 || twinIds.has(f.id)),
      reusePictures: flag("reuse-pictures"),
      ...(judgeBatch ? { judgeBatch } : {}),
    });
    // What was really paid: replayed answers and cached pictures are free (the report still prices them).
    spent += r.paidEur;
    results.push(r);
    const failing = r.checkpoints.filter((c) => c.failures.length).length;
    const reuse = [
      r.calls ? `${r.calls.replayed} calls replayed, ${r.calls.recorded} recorded` : "",
      r.pictures ? `${r.pictures.cached} pictures cached, ${r.pictures.made} made${r.pictures.reused ? `, ${r.pictures.reused} reused` : ""}` : "",
      r.anotherLook ? (r.anotherLook.ok ? `Druga podoba ${r.anotherLook.distance.toFixed(2)} away` : `no Druga podoba (${r.anotherLook.reason})`) : "",
      r.regenerated ? (r.regenerated.error === undefined ? `regenerated ${r.regenerated.distance.toFixed(2)} away (€${r.regenerated.eur.toFixed(3)})` : `regeneration failed: ${r.regenerated.error}`) : "",
      r.replayChanged !== undefined ? `${r.replayChanged} request(s) changed since recording` : "",
      r.critique ? `critique patches applied in ${r.critique.applied}/${r.critique.withPatches} rounds${r.critique.rejected ? ` (${r.critique.rejected} rejected)` : ""}` : "",
      editLine(r),
      r.slovene ? `Slovene lint ${r.slovene.generated.total}` : "",
    ]
      .filter(Boolean)
      .join(", ");
    console.log(r.error ? `  error: ${r.error.split("\n")[0]}` : `  ${r.checkpoints.length} checkpoints, ${failing} with failures, paid €${r.paidEur.toFixed(3)}${reuse ? ` (${reuse})` : ""}, run total €${spent.toFixed(2)}`);
    for (const c of r.checkpoints) for (const fail of c.failures) console.log(`    ${c.label}: ${fail}`);
  }
  if (judgeBatch?.judging.length) {
    console.log(`\nJudging: ${judgeBatch.judging.length} request(s)${judge && judgeSlovene ? " (vision and Slovene judge)" : judgeSlovene ? " (Slovene judge)" : ""} in one Message Batch (50 % off); waiting for it to end …`);
    await judgeBatch.transport.drain(judgeBatch.judging);
    const judgeEur = results.reduce((a, r) => a + r.judgeEur, 0);
    const sloveneEur = results.reduce((a, r) => a + (r.sloveneJudgeEur ?? 0), 0);
    spent += judgeEur + sloveneEur;
    console.log(`  batch ${judgeBatch.transport.batches.join(", ")}: judge €${judgeEur.toFixed(3)}${judgeSlovene ? `, Slovene judge €${sloveneEur.toFixed(3)}` : ""} (run total €${spent.toFixed(2)})`);
  }
} finally {
  await browser.close();
}

const report = renderReport(results, config, { mode, scope, startedAt, totalEur: spent, wallMs: Date.now() - t0 });
const out = reportPaths({ mode, scope, ...(only ? { only } : {}), ...(photoLimit !== undefined ? { photos: photoLimit } : {}), twins, edits, ...(label ? { label } : {}) });
await mkdir(path.dirname(path.join(outDir, out.report)), { recursive: true });
await writeFile(path.join(outDir, out.report), report);
const switches = Object.entries(config.variety).filter(([k, v]) => (VARIETY_SWITCHES as readonly string[]).includes(k) && v === true).map(([k]) => k);
const varietyMeta = { mode, scope, startedAt, switches, ...(label ? { label } : {}) };
await writeFile(path.join(outDir, out.variety), renderVariety(results, varietyMeta));
// The same numbers as data, for a before/after comparison of two runs (pnpm variety:compare).
await writeFile(path.join(outDir, out.variety.replace(/\.md$/, ".json")), `${JSON.stringify(varietyData(results, { ...varietyMeta, totalEur: spent }), null, 2)}\n`);
await writeFile(path.join(outDir, out.contactSheet), await contactSheet(results));
for (const r of results) await reviewSheet(r.id);
await desktopContactSheet(results.map((r) => r.id));
console.log(`\nWrote ${path.join(outDir, out.report)} and ${out.contactSheet}. Model spend €${spent.toFixed(2)}.`);

if (flag("strict")) {
  const failing = results.filter((r) => r.error || r.checkpoints.some((c) => c.failures.length > 0)).map((r) => r.id);
  const missing = fixtures.length - results.length;
  if (failing.length || missing) {
    console.error(`--strict: ${failing.length ? `failing: ${failing.join(", ")}` : ""}${failing.length && missing ? "; " : ""}${missing ? `${missing} fixture(s) not run` : ""}`);
    process.exitCode = 1;
  } else console.log(`--strict: all ${results.length} fixture(s) pass every automated check.`);
}
