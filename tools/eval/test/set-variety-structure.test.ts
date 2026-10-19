// The structure share and the chrome tuples `pnpm variety` reports (docs/plans/wave-p-harness.md).
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LOOK_WEIGHTS } from "../src/look-print.ts";
import type { SiteSpec } from "@sb/spec";
import { chromeTupleOf, loadPrint, loadVarietyEntries, markdownLine, varietyOf } from "../src/set-variety.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN = ["pekarna-kvas", "avtoservis-mrak", "instalacije-rebernik"] as const;
const weights = LOOK_WEIGHTS;

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "set-variety-structure-"));
  for (const id of GOLDEN) copyFileSync(path.join(here, "../golden", `${id}.json`), path.join(dir, `${id}.spec.json`));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** The golden specs with a chosen skeleton header and phone action, written beside the others as `<id>-x.spec.json`. */
function withChrome(id: string, header: string, actions: string, tone?: string): string {
  const spec = JSON.parse(readFileSync(path.join(dir, `${id}.spec.json`), "utf8")) as SiteSpec;
  const design = spec.design as unknown as { skeleton?: Record<string, unknown> };
  design.skeleton = { ...(design.skeleton ?? { footer: "compact", footerTone: "alt", width: "contained", cards: "filled", buttons: "soft", dividers: "motif", photoRatio: "standard" }), header, actions };
  if (tone) spec.chrome.header.tone = tone as never;
  const file = path.join(dir, `${id}-x.spec.json`);
  writeFileSync(file, JSON.stringify(spec));
  return file;
}

describe("structure share and chrome tuples", () => {
  it("reports the largest structure's share and the distinct chrome tuples of a manifest", async () => {
    const files = [
      withChrome("pekarna-kvas", "stacked", "float", "band"),
      withChrome("avtoservis-mrak", "stacked", "float", "band"),
      withChrome("instalacije-rebernik", "word", "bar", "alt"),
    ];
    const manifest = path.join(dir, "manifest.json");
    writeFileSync(manifest, JSON.stringify(files.map((f, i) => ({ id: `p${i}`, spec: path.basename(f), structure: ["poster", "poster", "ledger"][i] }))));
    const entries = loadVarietyEntries(manifest);
    expect(entries.map((e) => e.structure)).toEqual(["poster", "poster", "ledger"]);
    const r = varietyOf(await Promise.all(entries.map(loadPrint)), weights);
    expect(r.structures).toEqual({ pages: 3, distinct: 2, maxShare: 2 / 3, counts: { poster: 2, ledger: 1 } });
    expect(r.chromeTuples).toEqual({ distinct: 2, largestRepeat: 2, counts: { "stacked|band|float": 2, "word|alt|bar": 1 } });
    const line = markdownLine("proof", r);
    expect(line).toContain("structure share max 67 % over 2 structures (poster 2, ledger 1)");
    expect(line).toContain("chrome tuples 2 distinct, largest repeat 2");
  });

  it("leaves the structure share out when no page names one, and reads the chrome of a spec without a skeleton from its variant", async () => {
    const r = varietyOf(await Promise.all(loadVarietyEntries(path.join(dir, "pekarna-kvas.spec.json")).map(loadPrint)), weights);
    expect(r.structures).toBeUndefined();
    expect(markdownLine("one", r)).not.toContain("structure share");
    const spec = JSON.parse(readFileSync(path.join(dir, "pekarna-kvas.spec.json"), "utf8")) as SiteSpec;
    expect(chromeTupleOf({ ...spec, design: { ...spec.design, skeleton: undefined } } as SiteSpec)).toBe(`${spec.chrome.header.variant}|${spec.chrome.header.tone ?? "default"}|bar`);
  });
});
