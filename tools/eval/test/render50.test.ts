import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadRunDirItems } from "../src/outside-review.ts";
import { DEFAULT_SPECS_DIR, logoMime, pageIds, plannedSpecs, rebuildMedia, shotFileNames, sheetRows, writeSheet } from "../src/review50-render.ts";
import { loadConfig } from "@sb/config";
import { createFsStorage } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "render50-"));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("review50 render: paths and names", () => {
  it("names the four shots the way outside-review reads a run directory", async () => {
    const out = path.join(dir, "run");
    mkdirSync(path.join(out, "salon-x"), { recursive: true });
    const shot = await sharp({ create: { width: 8, height: 40, channels: 3, background: "#336699" } }).png().toBuffer();
    for (const prefix of ["home", "regenerated"]) for (const f of Object.values(shotFileNames(prefix))) writeFileSync(path.join(out, "salon-x", f), shot);
    expect(loadRunDirItems(out, { evalDir: dir }).map((i) => i.id)).toEqual(["salon-x", "salon-x-regenerated"]);
  });

  it("lists the pages that have a generated spec, and the specs each one renders", () => {
    const specs = path.join(dir, "specs");
    for (const id of ["b-page", "a-page"]) mkdirSync(path.join(specs, id), { recursive: true });
    mkdirSync(path.join(specs, "no-spec"), { recursive: true });
    writeFileSync(path.join(specs, "a-page", "spec-generated.json"), "{}");
    writeFileSync(path.join(specs, "b-page", "spec-generated.json"), "{}");
    writeFileSync(path.join(specs, "b-page", "spec-regenerated.json"), "{}");
    expect(pageIds(specs)).toEqual(["a-page", "b-page"]);
    expect(pageIds(specs, ["b-page"])).toEqual(["b-page"]);
    expect(() => pageIds(specs, ["zzz"])).toThrow(/zzz/);
    expect(plannedSpecs(specs, "a-page").map((p) => p.prefix)).toEqual(["home"]);
    expect(plannedSpecs(specs, "b-page").map((p) => p.prefix)).toEqual(["home", "regenerated"]);
  });

  it("takes the logo's type from its upload name", () => {
    expect(logoMime("sites/s/uploads/logo.svg")).toBe("image/svg+xml");
    expect(logoMime("sites/s/uploads/logo.PNG")).toBe("image/png");
    expect(logoMime("sites/s/uploads/logo.jpg")).toBe("image/jpeg");
  });

  it("rebuilds the variants of every picture and the logo from the saved originals, and names a missing original", async () => {
    const root = path.join(dir, "storage");
    mkdirSync(path.join(root, "sites/s/uploads"), { recursive: true });
    const jpg = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#996633" } }).jpeg().toBuffer();
    writeFileSync(path.join(root, "sites/s/uploads/p.jpg"), jpg);
    const spec = { assets: { logo: undefined, images: [{ id: "img_01", src: "sites/s/uploads/p.jpg", width: 1200, height: 800, alt: "x" }] } } as unknown as SiteSpec;
    const media = await rebuildMedia(spec, createFsStorage(root), loadConfig());
    expect([...media.keys()].some((k) => /^img_01-\d+\.avif$/.test(k))).toBe(true);
    expect([...media.keys()].some((k) => /^img_01-\d+\.webp$/.test(k))).toBe(true);
    const gone = { assets: { images: [{ id: "img_02", src: "sites/s/uploads/none.jpg", width: 1, height: 1, alt: "x" }] } } as unknown as SiteSpec;
    await expect(rebuildMedia(gone, createFsStorage(root), loadConfig())).rejects.toThrow(/none\.jpg/);
  });

  it("pairs before and after shots for the sheet and writes it", async () => {
    const before = path.join(dir, "before");
    const after = path.join(dir, "after");
    const wide = await sharp({ create: { width: 1280, height: 800, channels: 3, background: "#aa5533" } }).png().toBuffer();
    const phone = await sharp({ create: { width: 360, height: 800, channels: 3, background: "#33aa55" } }).png().toBuffer();
    for (const d of [before, after]) {
      mkdirSync(path.join(d, "p"), { recursive: true });
      writeFileSync(path.join(d, "p", "home-1280-first.png"), wide);
      writeFileSync(path.join(d, "p", "home-360-first.png"), phone);
    }
    mkdirSync(path.join(after, "only-after"), { recursive: true });
    const rows = sheetRows(before, after);
    expect(rows.map((r) => r.label)).toEqual(["p"]);
    await writeSheet(rows, path.join(after, "before-after.jpg"));
    expect((await sharp(path.join(after, "before-after.jpg")).metadata()).format).toBe("jpeg");
  });

  it("the saved specs directory exists in the repo", () => {
    expect(pageIds(DEFAULT_SPECS_DIR, ["avto-kovac"])).toEqual(["avto-kovac"]);
  });
});
