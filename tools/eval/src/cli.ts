/**
 * pnpm eval [--only <id>[,<id>]] [--record | --replay | --offline] [--scope full|home] [--photos <n>] [--no-lighthouse] [--max-eur 25] [--judge | --no-judge]
 *
 * live (default): real model calls, the only place outside the app that spends money.
 * --record:       live, and writes every model exchange to tools/eval/recordings/<id>/ for unit tests.
 * --replay:       replays those recordings (no network, no cost).
 * --offline:      no model at all: checks hand-authored golden specs from tools/eval/golden/.
 * --judge:        score each generated homepage with the vision judge (default for live and --record;
 *                 opt-in for --offline and --replay, since it is a real model call).
 * --photos <n>:   give each fixture only its first n photos (0: a site without photos, which gets generated pictures).
 * Writes eval/report.md, eval/contact-sheet.png and the review sheets in eval/look/ (look.ts).
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { loadConfig } from "@sb/config";
import { launchCheckBrowser } from "@sb/engine";
import { loadFixtures } from "./fixtures/load.ts";
import { runFixture, type FixtureResult, type Mode } from "./runner.ts";
import { contactSheet, renderReport } from "./report.ts";
import { desktopContactSheet, reviewSheet } from "./look.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const mode: Mode = flag("offline") ? "offline" : flag("replay") ? "replay" : flag("record") ? "record" : "live";
const scope = value("scope") === "home" ? "home" : "full";
const maxEur = Number(value("max-eur") ?? 25);
const only = value("only")?.split(",").map((s) => s.trim());
const judge = flag("judge") || ((mode === "live" || mode === "record") && !flag("no-judge"));
const outDir = path.join(repoRoot, "eval");

if ((mode === "live" || mode === "record" || judge) && !process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set. Use --offline (golden specs) or --replay (recordings) to run without the API.");
  process.exit(2);
}

const photoLimit = value("photos") === undefined ? undefined : Number(value("photos"));
const fixtures = loadFixtures()
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
    });
    const cost = r.costByStage.reduce((a, c) => a + c.eur, 0) + r.judgeEur;
    spent += cost;
    results.push(r);
    const failing = r.checkpoints.filter((c) => c.failures.length).length;
    console.log(r.error ? `  error: ${r.error.split("\n")[0]}` : `  ${r.checkpoints.length} checkpoints, ${failing} with failures, €${cost.toFixed(3)} (run total €${spent.toFixed(2)})`);
    for (const c of r.checkpoints) for (const fail of c.failures) console.log(`    ${c.label}: ${fail}`);
  }
} finally {
  await browser.close();
}

const report = renderReport(results, config, { mode, scope, startedAt, totalEur: spent, wallMs: Date.now() - t0 });
await writeFile(path.join(outDir, "report.md"), report);
await writeFile(path.join(outDir, "contact-sheet.png"), await contactSheet(results));
for (const r of results) await reviewSheet(r.id);
await desktopContactSheet(results.map((r) => r.id));
console.log(`\nWrote ${path.join(outDir, "report.md")} and contact-sheet.png. Model spend €${spent.toFixed(2)}.`);
