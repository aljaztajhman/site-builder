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
 * --photos <n>:     give each fixture only its first n photos (0: a site without photos, which gets generated pictures).
 * --no-edits:       generate and check only; no scripted chat edits (about 40 % of a homepage run's cost). Not with
 *                   --record (it would drop the edit recordings the tests replay).
 * --twins:          also run the twins (tools/eval/twins: more businesses of the same trades, no scripted edits), for
 *                   the same-trade look distance. They have no recordings or goldens: live, --record or --record-missing.
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
import { BatchTransport, launchCheckBrowser } from "@sb/engine";
import { loadFixtures, loadTwins } from "./fixtures/load.ts";
import { renderVariety } from "./variety-report.ts";
import { runFixture, type FixtureResult, type Mode } from "./runner.ts";
import { contactSheet, renderReport } from "./report.ts";
import { desktopContactSheet, reviewSheet } from "./look.ts";
import { reportPaths } from "./report-paths.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const mode: Mode = flag("offline") ? "offline" : flag("replay") ? "replay" : flag("record-missing") ? "record-missing" : flag("record") ? "record" : "live";
const paid = mode === "live" || mode === "record" || mode === "record-missing";
const scope = value("scope") === "home" ? "home" : "full";
const maxEur = Number(value("max-eur") ?? 25);
const only = value("only")?.split(",").map((s) => s.trim());
const judge = flag("judge") || (paid && !flag("no-judge"));
const outDir = path.join(repoRoot, "eval");

if ((paid || judge) && !process.env.ANTHROPIC_API_KEY) {
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
  .filter((f) => !only || only.includes(f.id))
  .map((f) => (photoLimit === undefined ? f : { ...f, photos: f.photos.slice(0, photoLimit) }));
if (fixtures.length === 0) {
  console.error(`No fixtures match ${only?.join(",")}`);
  process.exit(2);
}
const missingPhotos = fixtures.some((f) => f.photos.some((p) => !existsSync(p.path)));
if (missingPhotos) {
  console.log("Generating stand-in photos …");
  execFileSync(process.execPath, [path.join(repoRoot, "node_modules/tsx/dist/cli.mjs"), path.join(here, "fixtures/generate-photos.ts")], { stdio: "inherit" });
}

const config = loadConfig();
await mkdir(outDir, { recursive: true });
const browser = await launchCheckBrowser();
const results: FixtureResult[] = [];
const startedAt = new Date();
const t0 = Date.now();
let spent = 0;
const judgeBatch = judge ? { transport: new BatchTransport(), judging: [] as Promise<void>[] } : undefined;
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
      recordingsDir: path.join(repoRoot, "tools/eval/recordings"),
      goldenDir: path.join(repoRoot, "tools/eval/golden"),
      scope,
      lighthouse: !flag("no-lighthouse"),
      maxEur,
      spentSoFar: () => spent,
      judge,
      edits,
      ...(judgeBatch ? { judgeBatch } : {}),
    });
    // What was really paid: replayed answers and cached pictures are free (the report still prices them).
    spent += r.paidEur;
    results.push(r);
    const failing = r.checkpoints.filter((c) => c.failures.length).length;
    const reuse = [r.calls ? `${r.calls.replayed} calls replayed, ${r.calls.recorded} recorded` : "", r.pictures ? `${r.pictures.cached} pictures cached, ${r.pictures.made} made` : ""].filter(Boolean).join(", ");
    console.log(r.error ? `  error: ${r.error.split("\n")[0]}` : `  ${r.checkpoints.length} checkpoints, ${failing} with failures, paid €${r.paidEur.toFixed(3)}${reuse ? ` (${reuse})` : ""}, run total €${spent.toFixed(2)}`);
    for (const c of r.checkpoints) for (const fail of c.failures) console.log(`    ${c.label}: ${fail}`);
  }
  if (judgeBatch?.judging.length) {
    console.log(`\nJudging ${judgeBatch.judging.length} homepage(s) in one Message Batch (50 % off); waiting for it to end …`);
    await judgeBatch.transport.drain(judgeBatch.judging);
    const judgeEur = results.reduce((a, r) => a + r.judgeEur, 0);
    spent += judgeEur;
    console.log(`  batch ${judgeBatch.transport.batches.join(", ")}: judge €${judgeEur.toFixed(3)} (run total €${spent.toFixed(2)})`);
  }
} finally {
  await browser.close();
}

const report = renderReport(results, config, { mode, scope, startedAt, totalEur: spent, wallMs: Date.now() - t0 });
const out = reportPaths({ mode, scope, ...(only ? { only } : {}), ...(photoLimit !== undefined ? { photos: photoLimit } : {}), twins, edits });
await mkdir(path.dirname(path.join(outDir, out.report)), { recursive: true });
await writeFile(path.join(outDir, out.report), report);
await writeFile(path.join(outDir, out.variety), renderVariety(results, { mode, scope, startedAt }));
await writeFile(path.join(outDir, out.contactSheet), await contactSheet(results));
for (const r of results) await reviewSheet(r.id);
await desktopContactSheet(results.map((r) => r.id));
console.log(`\nWrote ${path.join(outDir, out.report)} and ${out.contactSheet}. Model spend €${spent.toFixed(2)}.`);
