/**
 * Type voices (M1 type and details, docs/plans/m1-type-details.md; direction §6 "type voice"). Wave P's reviewers named
 * "the same two font voices" (a heavy grotesk and one heavy serif) and "no real size scale" first on every set. A voice is
 * a font pair plus how it is set: heading weight, tracking and case, the body size (17–18 px) and the scale ratio, so two
 * voices differ in more than the family. Plain data over existing Design fields: no spec change, and no live path picks a
 * voice yet (the proof harness assigns them; a chooser comes when the owner turns this on). A wide voice (Krona One) was
 * tried and dropped: its phone numbers and e-mail overflow a 360 px phone outside the fitted headline.
 */
import type { Design } from "./design.ts";
import { fontPair } from "./fonts.ts";

export const VOICE_IDS = ["grotesk", "editorial", "oldstyle", "signage", "didone", "slab", "geometric"] as const;
export type VoiceId = (typeof VOICE_IDS)[number];

export interface TypeVoice {
  id: VoiceId;
  label: string;
  /** The heading face's class; no two voices share one. */
  class: "grotesque" | "transitional" | "old-style" | "condensed" | "didone" | "slab" | "geometric";
  /** A FONT_PAIRS or VOICE_PAIRS id. */
  pair: string;
  headingWeight: number;
  headingTracking: number;
  headingCase: Design["headingCase"];
  baseFontSize: 17 | 18;
  scale: number;
  /** Voice words (as the type inventory's: warm, exact, loud, quiet, old, new), for a chooser. */
  tone: readonly ("warm" | "exact" | "loud" | "quiet" | "old" | "new")[];
}

export const TYPE_VOICES: readonly TypeVoice[] = [
  { id: "grotesk", label: "Tight grotesk", class: "grotesque", pair: "inter-tight-inter", headingWeight: 750, headingTracking: -0.015, headingCase: "normal", baseFontSize: 17, scale: 1.333, tone: ["exact", "new"] },
  { id: "editorial", label: "Light editorial serif", class: "transitional", pair: "newsreader-libre-franklin", headingWeight: 400, headingTracking: -0.02, headingCase: "normal", baseFontSize: 18, scale: 1.414, tone: ["quiet", "old"] },
  { id: "oldstyle", label: "Warm old-style", class: "old-style", pair: "young-serif-alegreya", headingWeight: 400, headingTracking: -0.01, headingCase: "normal", baseFontSize: 18, scale: 1.333, tone: ["warm", "old"] },
  { id: "signage", label: "Condensed signage capitals", class: "condensed", pair: "oswald-source-sans", headingWeight: 600, headingTracking: 0.01, headingCase: "uppercase", baseFontSize: 17, scale: 1.414, tone: ["loud", "exact"] },
  { id: "didone", label: "High-contrast didone", class: "didone", pair: "bodoni-albert-sans", headingWeight: 500, headingTracking: -0.02, headingCase: "normal", baseFontSize: 17, scale: 1.414, tone: ["quiet", "new"] },
  { id: "slab", label: "Clarendon slab", class: "slab", pair: "besley-work-sans", headingWeight: 700, headingTracking: -0.01, headingCase: "normal", baseFontSize: 17, scale: 1.333, tone: ["warm", "loud", "old"] },
  { id: "geometric", label: "Tracked geometric capitals", class: "geometric", pair: "jost-literata", headingWeight: 600, headingTracking: 0.06, headingCase: "uppercase", baseFontSize: 18, scale: 1.333, tone: ["exact", "quiet", "new"] },
];

export function typeVoice(id: VoiceId): TypeVoice {
  const v = TYPE_VOICES.find((x) => x.id === id);
  if (!v) throw new Error(`Unknown type voice: ${id}`);
  return v;
}

/** The design with the voice's six type fields set; nothing else changes. */
export function applyVoice(design: Design, v: TypeVoice): Design {
  fontPair(v.pair);
  return {
    ...design,
    fontPair: v.pair,
    headingWeight: v.headingWeight,
    headingTracking: v.headingTracking,
    headingCase: v.headingCase,
    baseFontSize: v.baseFontSize,
    scale: v.scale,
  };
}

/** The voice a design is set in, by its font pair; undefined for a pair no voice uses. */
export function voiceOf(design: Pick<Design, "fontPair">): VoiceId | undefined {
  return TYPE_VOICES.find((v) => v.pair === design.fontPair)?.id;
}
