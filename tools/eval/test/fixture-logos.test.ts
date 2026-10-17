import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fitSvgViewBox } from "@sb/engine";
import { repoRoot } from "../src/compose-sheet.ts";

/**
 * Every SVG logo the eval's businesses bring draws inside its own viewBox (judge 2026-10-01: pekarna-kvas's logo read
 * "KAMNI", the tagline "PEKARNA · KAMNIK" ran past its 280-unit box). The pipeline grows the box of an upload that
 * doesn't (processLogo → fitSvgViewBox); the fixtures themselves fit too, so a tool that rasterises the file directly
 * (the mockup scripts) shows the whole logo. fitSvgViewBox returns a file that fits unchanged.
 */
const DIRS = ["fixtures", "fixtures-edge", "fresh", "hard", "twins"].map((d) => path.join(repoRoot, "tools/eval", d));

async function logos(): Promise<string[]> {
  const out: string[] = [];
  for (const dir of DIRS.filter((d) => existsSync(d))) {
    for (const id of await readdir(dir)) {
      const file = path.join(dir, id, "logo.svg");
      if (existsSync(file)) out.push(file);
    }
  }
  return out.sort();
}

describe("fixture logos", () => {
  it("each draws inside its own viewBox", async () => {
    const files = await logos();
    expect(files.map((f) => path.relative(repoRoot, f).replaceAll("\\", "/"))).toContain("tools/eval/fixtures/pekarna-kvas/logo.svg");
    const overflowing: string[] = [];
    for (const file of files) {
      const data = new Uint8Array(await readFile(file));
      const fitted = await fitSvgViewBox(data);
      if (fitted !== data) overflowing.push(`${path.relative(repoRoot, file)}: ${/<svg\b[^>]*>/i.exec(new TextDecoder().decode(fitted))?.[0]}`);
    }
    expect(overflowing).toEqual([]);
  }, 60_000);
});
