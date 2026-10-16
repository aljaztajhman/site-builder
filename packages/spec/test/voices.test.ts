import { describe, expect, it } from "vitest";
import { Design, FONT_PAIRS, typeSystem, uppercaseAllowed, TYPE_VOICES, VOICE_PAIRS, applyVoice, findFontPair, fontPair, typeVoice, voiceOf } from "../src/index.ts";
import { golden } from "./helpers/composed.ts";

describe("type voices (M1 type and details, docs/plans/m1-type-details.md)", () => {
  it("has at least 6 voices whose headings are of different classes and different families", () => {
    expect(TYPE_VOICES.length).toBeGreaterThanOrEqual(6);
    expect(new Set(TYPE_VOICES.map((v) => v.id)).size).toBe(TYPE_VOICES.length);
    expect(new Set(TYPE_VOICES.map((v) => v.class)).size).toBeGreaterThanOrEqual(6);
    expect(new Set(TYPE_VOICES.map((v) => fontPair(v.pair).heading.family)).size).toBe(TYPE_VOICES.length);
  });

  it("resolves every voice's pair; the new pairs stay out of FONT_PAIRS (editor menu, generation and stored sites unchanged)", () => {
    expect(FONT_PAIRS).toHaveLength(20);
    for (const v of TYPE_VOICES) expect(findFontPair(v.pair)?.id).toBe(v.pair);
    for (const p of VOICE_PAIRS) expect(FONT_PAIRS.some((f) => f.id === p.id)).toBe(false);
    expect(findFontPair("no-such-pair")).toBeUndefined();
    expect(() => fontPair("no-such-pair")).toThrow();
  });

  it("sets a real size scale: body 17–18 px, ratio at least 1.25, a heading weight the face has", () => {
    for (const v of TYPE_VOICES) {
      expect([17, 18]).toContain(v.baseFontSize);
      expect(v.scale).toBeGreaterThanOrEqual(1.25);
      const [lo, hi] = fontPair(v.pair).heading.weights;
      expect(v.headingWeight).toBeGreaterThanOrEqual(lo);
      expect(v.headingWeight).toBeLessThanOrEqual(hi);
    }
  });

  it("applyVoice changes only the six type fields and the result validates", () => {
    const design = golden().design;
    for (const v of TYPE_VOICES) {
      const out = applyVoice(design, v);
      expect(Design.safeParse(out).success).toBe(true);
      expect(out).toEqual({
        ...design,
        fontPair: v.pair,
        headingWeight: v.headingWeight,
        headingTracking: v.headingTracking,
        headingCase: v.headingCase,
        baseFontSize: v.baseFontSize,
        scale: v.scale,
      });
      expect(voiceOf(out)).toBe(v.id);
    }
  });

  it("gives each voice pair a type system of its own setting, so a voiced design passes the genome's type rules", () => {
    for (const v of TYPE_VOICES) {
      const ts = typeSystem(v.pair)!;
      expect(ts, v.id).toBeDefined();
      expect(v.headingWeight).toBeGreaterThanOrEqual(ts.weight[0]);
      expect(v.headingWeight).toBeLessThanOrEqual(ts.weight[1]);
      expect(v.headingTracking).toBeGreaterThanOrEqual(ts.tracking[0]);
      expect(v.headingTracking).toBeLessThanOrEqual(ts.tracking[1]);
      expect(ts.cases).toContain(v.headingCase);
      if (v.headingCase === "uppercase") expect(uppercaseAllowed(v.pair, v.headingWeight), v.id).toBe(true);
    }
  });

  it("typeVoice throws on an unknown id", () => {
    expect(typeVoice(TYPE_VOICES[0]!.id).id).toBe(TYPE_VOICES[0]!.id);
    expect(() => typeVoice("nope" as never)).toThrow();
  });
});
