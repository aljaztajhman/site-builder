/**
 * pnpm rerender-runs --out <dir> --briefs <dir> <id>[,<id>] [--runs eval/runs]
 *
 * Renders the saved spec of earlier eval runs (eval/runs/<id>/spec-generated.json, with the run's own stored media)
 * with today's renderer and checks, and writes the page shots in the layout `pnpm outside-review --run-dir` reads:
 * <out>/<id>/home-360-first.png, home-360.png, home-1280-first.png, home-1280.png. No model call: for scoring renderer
 * fixes on pages already generated (the M1 final check) without paying for a new generation.
 */
import { existsSync, readdirSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "@sb/config";
import { checkSite, launchCheckBrowser, loadMedia } from "@sb/engine";
import { createFsStorage } from "@sb/platform";
import { siteFiles } from "@sb/render";
import type { SiteSpec } from "@sb/spec";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const out = opt("out");
const runs = opt("runs") ?? "eval/runs";
const briefs = opt("briefs");
const ids = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--")).flatMap((a) => a.split(","));
if (!out || !briefs || !ids.length) {
  console.error("usage: pnpm rerender-runs --out <dir> --briefs <dir> <id>[,<id>] [--runs eval/runs]");
  process.exit(2);
}

const config = loadConfig();
const browser = await launchCheckBrowser();
try {
  for (const id of ids) {
    const dir = path.join(runs, id);
    const spec = JSON.parse(await readFile(path.join(dir, "spec-generated.json"), "utf8")) as SiteSpec;
    const sites = path.join(dir, "storage", "sites");
    const siteId = existsSync(sites) ? readdirSync(sites)[0] : undefined;
    if (!siteId) throw new Error(`${id}: no stored site under ${sites}`);
    const storage = createFsStorage(path.join(dir, "storage"));
    const media = await loadMedia(storage, siteId, spec, config.images.widths);
    const files = siteFiles(spec, media, { imageWidths: config.images.widths });
    // The client's own text, so the fact check reads facts against it as in generation.
    const corpus = (JSON.parse(await readFile(path.join(briefs, id, "brief.json"), "utf8")) as { description: string }).description;
    const report = await checkSite(spec, files, { config, corpus, lighthouse: false, browser });
    const target = path.join(out, id);
    await mkdir(target, { recursive: true });
    await writeFile(path.join(target, "home-360.png"), report.screenshots.mobileFull);
    await writeFile(path.join(target, "home-1280.png"), report.screenshots.desktop);
    await writeFile(path.join(target, "home-360-first.png"), report.screenshots.mobile);
    await writeFile(path.join(target, "home-1280-first.png"), report.screenshots.desktopFirst);
    await writeFile(path.join(target, "spec.json"), JSON.stringify(spec, null, 1));
    console.log(`${id}: ${report.failures.length ? `failures: ${report.failures.join("; ")}` : "no check failures"}`);
  }
} finally {
  await browser.close();
}
