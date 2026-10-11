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

/**
 * The fixture's spec as stored, without its photos processed. For checks of the spec itself (validation, facts, element
 * coverage): processing the photos encodes 23 AVIF/WebP variants, ≈ 3 s locally and ≈ 17 s on one libvips thread, which
 * pushed the spec-only test past its 30 s timeout on a busy CI runner. Processing changes only `assets` (image and logo
 * dimensions, the logo's file name), which neither validation nor the fact check reads differently.
 */
export async function kitchenSinkSpecOnly(): Promise<SiteSpec> {
  return migrateSpec(JSON.parse(await readFile(KITCHEN_SINK_FILE, "utf8"))) as SiteSpec;
}

/** The fixture's spec with its photos processed (assets updated to the processed sizes) and the media files to publish. */
export async function kitchenSinkSpec(): Promise<{ spec: SiteSpec; media: Map<string, Uint8Array> }> {
  const spec = await kitchenSinkSpecOnly();
  const media = await fixtureMedia(KITCHEN_SINK_FIXTURE, spec);
  return { spec, media };
}

/** Writes the published files of a site into `dir` (as the preview-free static export). */
export async function writeSiteFiles(spec: SiteSpec, media: Map<string, Uint8Array>, dir: string, widths?: readonly number[]): Promise<void> {
  for (const [rel, data] of siteFiles(spec, media, { imageWidths: [...(widths ?? loadConfig().images.widths)] })) {
    await mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await writeFile(path.join(dir, rel), data);
  }
}
