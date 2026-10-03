/**
 * The small-business websites study: runs the public website checker (`checkUrl`, no model calls) over a
 * list of public sites, one at a time with a pause between them, and writes
 *   eval/runs/study/<date>/results.jsonl  per-site rows (names the sites; stays local, gitignored)
 *   eval/runs/study/<date>/summary.md     aggregates only, for the owner to read before publishing anything
 * Re-running with the same date resumes: sites already in results.jsonl are skipped.
 *
 *   pnpm study <list.csv> [--date 2026-10-03] [--pause 3000] [--no-lighthouse] [--limit 20]
 *
 * The list is "url" or "url,trade" per line. Who is on it is the owner's choice (GO-TO-MARKET.md: ~300
 * public small-business sites across trades). Each site gets one phone visit plus one Lighthouse run.
 */
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@sb/config";
import { CHECKER_BROWSER_ARGS, UrlRefusedError, checkUrl, launchCheckBrowser } from "@sb/engine";
import { aggregateStudy, parseStudyList, studyMarkdown, type StudyRow } from "./study-aggregate.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const listPath = process.argv[2];
  if (!listPath || listPath.startsWith("--")) {
    console.error("usage: pnpm study <list.csv> [--date YYYY-MM-DD] [--pause ms] [--no-lighthouse] [--limit n]");
    process.exit(2);
  }
  const date = arg("date") ?? new Date().toISOString().slice(0, 10);
  const pause = Number(arg("pause") ?? 3000);
  const limit = Number(arg("limit") ?? Infinity);
  const base = loadConfig();
  const config = { ...base, checker: { ...base.checker, lighthouse: !process.argv.includes("--no-lighthouse") } };
  const outDir = path.join(repoRoot, "eval/runs/study", date);
  await mkdir(outDir, { recursive: true });
  const resultsPath = path.join(outDir, "results.jsonl");
  const done: StudyRow[] = (await readFile(resultsPath, "utf8").catch(() => ""))
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as StudyRow);
  const seen = new Set(done.map((r) => r.url));
  const todo = parseStudyList(await readFile(listPath, "utf8")).filter((s) => !seen.has(s.url)).slice(0, limit);
  console.log(`[study] ${done.length} already checked, ${todo.length} to go → ${path.relative(repoRoot, outDir)}`);

  const browser = await launchCheckBrowser(CHECKER_BROWSER_ARGS);
  try {
    for (const [i, s] of todo.entries()) {
      const started = Date.now();
      let row: StudyRow;
      try {
        row = { ...s, result: await checkUrl(s.url, { browser, config }) };
      } catch (e) {
        row = { ...s, error: e instanceof UrlRefusedError ? e.reason : `error: ${(e as Error).message.slice(0, 120)}` };
      }
      done.push(row);
      await appendFile(resultsPath, `${JSON.stringify(row)}\n`);
      console.log(`[study] ${i + 1}/${todo.length} ${s.url} ${row.result ? "ok" : row.error} (${((Date.now() - started) / 1000).toFixed(0)} s)`);
      if (i < todo.length - 1) await new Promise((r) => setTimeout(r, pause));
    }
  } finally {
    await browser.close();
  }
  const summary = studyMarkdown(aggregateStudy(done), date);
  await writeFile(path.join(outDir, "summary.md"), summary);
  console.log(summary);
}

await main();
