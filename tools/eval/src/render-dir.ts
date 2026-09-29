/**
 * Dev helper: render a spec JSON file to a folder (with generated stand-in image variants) and
 * optionally screenshot a page at 360 and 1280 px.
 *
 *   pnpm tsx tools/eval/src/render-dir.ts <spec.json> <outDir> [--shot <page.html>]
 *
 * Screenshots land in <outDir>/shots/. Media are flat coloured stand-ins unless a real
 * variant already exists in <outDir>/<slug>/media/.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { validateSite, type SiteSpec } from "@sb/spec";
import { renderToDir, screenshot } from "./lib/render-dir.ts";

const [specFile, outDir, flag, page] = process.argv.slice(2);
if (!specFile || !outDir) {
  console.error("usage: render-dir.ts <spec.json> <outDir> [--shot <page.html>]");
  process.exit(2);
}
const raw = JSON.parse(readFileSync(specFile, "utf8")) as unknown;
const v = validateSite(raw);
if (!v.ok) {
  console.error("Spec is not valid:");
  for (const i of v.issues) console.error(`  ${i.path}: ${i.message}`);
  if (!v.spec) process.exit(1);
}
const spec = (v.spec ?? raw) as SiteSpec;
const dir = await renderToDir(spec, outDir);
console.log(`rendered ${dir}`);
if (flag === "--shot") await screenshot(outDir, spec.slug, page ?? "index.html", path.join(outDir, "shots"));
