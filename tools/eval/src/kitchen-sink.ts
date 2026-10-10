/**
 * The kitchen-sink fixture of composition language v2 (spec v20, docs/plans/studio-phase1-design.md §3.3, §3.5):
 * tools/eval/composed/kitchen-sink.json is the pekarna-kvas golden with three pages of composed sections that use every
 * feature that exists today: every element kind and arrangement, the section background (field, photo with a scrim,
 * drawing), top edges with a rise, texture, motion, pin, header over, the marquee, the counter, fact links and plate
 * codes, Paint, tilt, bleed, masks and treatments, list markers, price styles, fixed and repeating drawings. Facts and
 * photos come from the fixture's brief; `business.amenities` (practical facts for iconFacts) is the one added field.
 * The page checks of the browser test (test/kitchen-sink-browser.test.ts), the preview = published test (apps/web) and
 * the per-page CSS weights use it.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@sb/config";
import { siteFiles } from "@sb/render";
import { migrateSpec, type SiteSpec } from "@sb/spec";
import { fixtureMedia } from "./families-sheet.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
export const KITCHEN_SINK_FILE = path.resolve(here, "../composed/kitchen-sink.json");
/** The golden the fixture's photos come from (tools/eval/fixtures/<id>/photos). */
export const KITCHEN_SINK_FIXTURE = "pekarna-kvas";

export async function kitchenSinkSpec(): Promise<{ spec: SiteSpec; media: Map<string, Uint8Array> }> {
  const spec = migrateSpec(JSON.parse(await readFile(KITCHEN_SINK_FILE, "utf8"))) as SiteSpec;
  const media = await fixtureMedia(KITCHEN_SINK_FIXTURE, spec);
  return { spec, media };
}

/** Writes the published files of a site into `dir` (as the preview-free static export). */
export async function writeSiteFiles(spec: SiteSpec, media: Map<string, Uint8Array>, dir: string): Promise<void> {
  for (const [rel, data] of siteFiles(spec, media, { imageWidths: loadConfig().images.widths })) {
    await mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await writeFile(path.join(dir, rel), data);
  }
}
