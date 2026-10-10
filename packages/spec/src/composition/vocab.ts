/**
 * The composition language's vocabularies (spec v20, docs/plans/studio-phase1-design.md §1.1). Fields that name an
 * inventory asset (a mask, a treatment, a texture, an edge, a fact object, a type treatment, a motion, a wordmark style,
 * a drawing) are strings in the schema, checked by a guard against these lists. The inventory batches append names here
 * without touching the schema, so a new name is not a spec version bump.
 *
 * Every list is APPEND-ONLY: stored sites name these values, so a removal or a rename would make them invalid. A snapshot
 * test (test/vocab.test.ts) fails on either. A name's asset id is `<prefix>/<name>` (assets.ts), except drawings, whose
 * fields hold the full id.
 */
import { z } from "zod";
import type { ElementKind } from "./schema.ts";

/** Image masks (`image.mask`, `photos.mask`). I4 fills it to 30. */
export const MASKS = ["none", "arch", "circle", "cut", "stamp", "ticket"] as const;
/** Image treatments (`image.treatment`, `photos.treatment`, the photo layer). I4 fills it to 16. */
export const IMAGE_TREATMENTS = ["none", "duotone", "tint", "grain"] as const;
/** Section textures (`surface.texture`). I4 adds 12. */
export const TEXTURES = ["none", "grain", "lines"] as const;
/** A section's top edge (`top.edge`); "drawing" takes `top.drawing`. I5 fills it to 20. */
export const EDGES = ["straight", "rule", "cut", "torn", "drawing"] as const;
/** Fact objects (`fact.treatment`). I6 fills it to 20. */
export const FACT_OBJECTS = ["numeral", "plate", "stamp", "ticket", "seal", "tag"] as const;
/** Heading type treatments (`heading.treatment`). I6 fills it to 15. */
export const TYPE_TREATMENTS = ["none", "stacked", "knockout"] as const;
/** Section motion presets (`motion`), described in MOTION_META. I7 fills it to 20. */
export const MOTIONS = ["reveal", "unmask"] as const;
/** Typographic wordmark styles (`design.wordmark.style`). I9 adds the rest. */
export const WORDMARK_STYLES = ["plain"] as const;
/**
 * Drawings (`decor.drawing`, the drawing layer, the list marker, the ribbon separator, the edge drawing): full asset ids
 * (DrawingId), `motif/<trade>/<subject>-<style>` or `ornament/<name>-<style>`. I5 draws them; these two are the samples
 * the Drawing format starts with.
 */
export const DRAWINGS = ["motif/bakery/wheat-ear-line", "ornament/rope-line"] as const;
/** Drawings that tile along x into a strip (`decor.repeat: "x"`, G19). Each one is in DRAWINGS. */
export const REPEATABLE = ["ornament/rope-line"] as const;
/**
 * Practical facts (`iconFacts`, `business.amenities`): a fixed list of 40; code picks the icon (`icon/<style>/<fact>`).
 * Unlike the others it is closed, not grown by batches.
 */
export const PRACTICAL_FACTS = [
  "parking",
  "free-parking",
  "bike-parking",
  "ev-charging",
  "public-transport",
  "wheelchair",
  "step-free",
  "accessible-toilet",
  "lift",
  "card",
  "contactless",
  "cash-only",
  "invoice",
  "gift-voucher",
  "wifi",
  "toilets",
  "baby-change",
  "kids-welcome",
  "play-corner",
  "pets-welcome",
  "no-pets",
  "terrace",
  "garden",
  "air-con",
  "takeaway",
  "delivery",
  "home-visits",
  "pickup-service",
  "emergency",
  "appointment-only",
  "walk-ins",
  "online-booking",
  "phone-booking",
  "vegetarian",
  "vegan",
  "gluten-free",
  "local-produce",
  "english",
  "german",
  "italian",
] as const;

/** Every vocabulary by its key (the `x-vocab` value in the JSON Schema). */
export const VOCABS = {
  MASKS,
  IMAGE_TREATMENTS,
  TEXTURES,
  EDGES,
  FACT_OBJECTS,
  TYPE_TREATMENTS,
  MOTIONS,
  WORDMARK_STYLES,
  DRAWINGS,
  REPEATABLE,
  PRACTICAL_FACTS,
} as const satisfies Record<string, readonly string[]>;
export type VocabKey = keyof typeof VOCABS;

/** The JSON Schema key naming a field's vocabulary. Phase 2 swaps it for the approved shortlist as an enum. */
export const VOCAB_KEY = "x-vocab";

/** The site's motion level (`design.motion`; absent counts as calm). */
export const MotionLevel = z.enum(["still", "calm", "lively"]);
export type MotionLevel = z.infer<typeof MotionLevel>;

export interface MotionMeta {
  /** entrance: once, as the section enters the viewport; scroll: tied to scroll position (lively only). */
  kind: "entrance" | "scroll";
  /** The element kinds the preset animates. */
  targets: readonly ElementKind[];
  /** Allowed on a page's first section (it doesn't hide or delay the LCP element). */
  safeAtLoad: boolean;
  /** Needs the motion island (JS); otherwise CSS only. */
  js: boolean;
  /** The lowest site motion level it may run at. */
  minLevel: "calm" | "lively";
}

export const MOTION_META: Readonly<Record<(typeof MOTIONS)[number], MotionMeta>> = {
  reveal: { kind: "entrance", targets: ["heading", "text", "list", "fact", "prices", "quote"], safeAtLoad: false, js: false, minLevel: "calm" },
  unmask: { kind: "entrance", targets: ["image", "photos"], safeAtLoad: false, js: false, minLevel: "calm" },
};

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * A field naming an entry of a vocabulary: a lowercase kebab-case string; membership is the guard's (G8), so stored
 * sites stay valid as lists grow. The schema carries its list as `options` (as a z.enum does), for code that lists the
 * values a field takes (inventory sources, the studio deck).
 */
export function Vocab<K extends VocabKey>(list: K) {
  return Object.assign(z.string().regex(NAME).max(40).meta({ [VOCAB_KEY]: list }), { options: VOCABS[list] as (typeof VOCABS)[K] });
}

/** A drawing's full asset id: `motif/<trade>/<subject>` or `ornament/<name>`. Membership is the guard's (DRAWINGS). */
export const DrawingId = z
  .string()
  .regex(/^(motif|ornament)\/[a-z0-9-]+(\/[a-z0-9-]+)?$/)
  .meta({ [VOCAB_KEY]: "DRAWINGS" });

/** Whether `name` is in the vocabulary `list`. */
export function inVocab(list: VocabKey, name: string): boolean {
  return (VOCABS[list] as readonly string[]).includes(name);
}

/** Version of the composition language: 2 from spec v20. The studio deals `needs: "f1b"` cards when it is ≥ 2. */
export const LANGUAGE_VERSION = 2 as const;
