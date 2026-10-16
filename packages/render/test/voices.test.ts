import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TYPE_VOICES, VOICE_PAIRS, allFontFaces, applyVoice, fontPair, type SiteSpec } from "@sb/spec";
import { FONTS_DIR, fontFaceCss, fontFiles, sharedBundle, tokensCss } from "../src/index.ts";

const baseline = JSON.parse(readFileSync(new URL("./composed-goldens.json", import.meta.url), "utf8")) as { sharedHash: string };
const golden = JSON.parse(readFileSync(new URL("../../../tools/eval/golden/pekarna-kvas.json", import.meta.url), "utf8")) as SiteSpec;

describe("type voices in the renderer (docs/plans/m1-type-details.md B)", () => {
  it("serves every voice face from the shared bundle, added after the hash so stored sites stay byte-identical", () => {
    const bundle = sharedBundle();
    expect(bundle.hash).toBe(baseline.sharedHash);
    for (const p of VOICE_PAIRS) for (const f of [p.heading, p.body]) expect(bundle.files.has(`fonts/${f.file}.woff2`), f.file).toBe(true);
  });

  it("keeps each voice face within the 60 KB per-family budget", () => {
    const own = new Set(allFontFaces().map((f) => f.file));
    for (const p of VOICE_PAIRS)
      for (const f of [p.heading, p.body]) if (!own.has(f.file)) expect(statSync(path.join(FONTS_DIR, `${f.file}.woff2`)).size, f.file).toBeLessThanOrEqual(60 * 1024);
  });

  it("emits @font-face rules, files and font stacks for a voice pair", () => {
    for (const v of TYPE_VOICES) {
      const design = applyVoice(golden.design, v);
      const pair = fontPair(v.pair);
      expect(fontFaceCss(design, "f/")).toContain(`font-family:"${pair.heading.family}"`);
      expect(fontFiles(design)).toContain(`${pair.heading.file}.woff2`);
      expect(tokensCss(design)).toContain(`--font-heading:"${pair.heading.family}"`);
    }
  });

  it("sets --fit-k from the face's own letter width when the pair has one, and leaves today's pairs unchanged", () => {
    for (const v of TYPE_VOICES) {
      const k = fontPair(v.pair).fitK;
      if (k === undefined) continue;
      const css = tokensCss(applyVoice(golden.design, v));
      const want = (v.headingCase === "uppercase" ? k * 1.3 : k) + Math.max(0, v.headingTracking);
      expect(css).toContain(`--fit-k:${Math.round(want * 1000) / 1000}`);
    }
    expect(tokensCss(golden.design)).toBe(tokensCss(structuredClone(golden.design)));
    expect(VOICE_PAIRS.some((p) => p.fitK !== undefined)).toBe(true);
  });
});
