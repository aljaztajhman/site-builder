import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { migrateSpec, type SiteSpec } from "@sb/spec";
import { renderSite, sharedBundle } from "../src/index.ts";

/**
 * Sites without composed sections are untouched by the composed renderer (spec v19): every page of every golden renders
 * byte-identical HTML, and every stylesheet the shared bundle ships for them is byte-identical, to what the placeholder
 * renderer produced (origin/claude/studio-f1 before the composed renderer). Recorded as SHA-256 in composed-goldens.json.
 *
 * Deliberate changes to the shared stylesheets or the page shell change these hashes on purpose: refresh the file with
 * `UPDATE_COMPOSED_BASELINE=1 pnpm exec vitest run packages/render/test/composed-goldens.test.ts` and say why in the PR.
 */
const goldenDir = new URL("../../../tools/eval/golden/", import.meta.url);
const baselineFile = new URL("./composed-goldens.json", import.meta.url);
const sha = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");

const goldens = readdirSync(goldenDir)
  .filter((f) => f.endsWith(".json"))
  .sort();

interface Snapshot {
  sharedHash: string;
  css: Record<string, string>;
  pages: Record<string, string>;
}

/** Hash of every page's HTML (default shared hash, so the stylesheet link and its hash count too) and of every non-composed stylesheet. */
function snapshot(): Snapshot {
  const bundle = sharedBundle();
  const css: Record<string, string> = {};
  for (const [file, data] of [...bundle.files].sort(([a], [b]) => a.localeCompare(b))) if (file.endsWith(".css") && !file.startsWith("composed")) css[file] = sha(data);
  const pages: Record<string, string> = {};
  for (const f of goldens) {
    const spec = migrateSpec(JSON.parse(readFileSync(new URL(f, goldenDir), "utf8"))) as SiteSpec;
    for (const [path, html] of renderSite(spec).pages) pages[`${f.replace(/\.json$/, "")}/${path}`] = sha(html);
  }
  return { sharedHash: bundle.hash, css, pages };
}

describe("sites without composed sections", () => {
  it("render byte-identical HTML and stylesheets (goldens vs the recorded baseline)", () => {
    const now = snapshot();
    if (process.env.UPDATE_COMPOSED_BASELINE) {
      writeFileSync(baselineFile, `${JSON.stringify(now, null, 1)}\n`);
      return;
    }
    const before = JSON.parse(readFileSync(baselineFile, "utf8")) as Snapshot;
    expect(Object.keys(now.pages).length).toBeGreaterThan(20);
    expect(now.css).toEqual(before.css);
    expect(now.pages).toEqual(before.pages);
    expect(now.sharedHash).toBe(before.sharedHash);
  });

  it("link no composed stylesheet", () => {
    for (const f of goldens) {
      const spec = migrateSpec(JSON.parse(readFileSync(new URL(f, goldenDir), "utf8"))) as SiteSpec;
      for (const [path, html] of renderSite(spec).pages) expect(html, `${f} ${path}`).not.toContain("composed");
    }
  });
});
