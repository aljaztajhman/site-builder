import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { migrateSpec, type SiteSpec } from "@sb/spec";
import { exportFiles, exportZip, siteFiles } from "../src/index.ts";

const golden = (id: string) => migrateSpec(JSON.parse(readFileSync(new URL(`../../../tools/eval/golden/${id}.json`, import.meta.url), "utf8"))) as SiteSpec;

describe("offline export", () => {
  const spec = golden("pekarna-kvas");
  const media = new Map([["img_01-360.webp", new Uint8Array([1, 2, 3])]]);

  it("holds the published site's files plus a root index.html that opens the site", () => {
    const files = exportFiles(spec, media);
    const site = siteFiles(spec, media);
    expect([...files.keys()].sort()).toEqual([...site.keys(), "index.html"].sort());
    const root = strFromU8(files.get("index.html")!);
    expect(root).toContain(`<meta http-equiv="refresh" content="0; url=${spec.slug}/index.html">`);
    expect(root).toContain(`<a href="${spec.slug}/index.html">Pekarna Kvas</a>`);
  });

  it("zips exactly those files (what `pnpm check:firefox` opens is what an owner downloads)", () => {
    const unzipped = unzipSync(exportZip(spec, media));
    const files = exportFiles(spec, media);
    expect(Object.keys(unzipped).sort()).toEqual([...files.keys()].sort());
    for (const [p, data] of files) expect(Buffer.from(unzipped[p]!).equals(Buffer.from(data)), p).toBe(true);
  });
});
