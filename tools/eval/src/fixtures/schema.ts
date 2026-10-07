/**
 * Schema for one eval fixture: `tools/eval/fixtures/<id>/brief.json` + `edits.json`.
 * See tools/eval/fixtures/README.md for how the fields are meant to be used.
 */
import { z } from "zod";
import { BusinessType, Colors, Day } from "@sb/spec";

/** Section types an edit check may name. Mirrors the component catalogue in @sb/spec (a test cross-checks). */
export const SECTION_TYPES = [
  "hero-split",
  "hero-image",
  "hero-type",
  "page-header",
  "text",
  "image-text",
  "highlights",
  "steps",
  "cta",
  "booking",
  "about",
  "announcement",
  "services-list",
  "services-cards",
  "price-list",
  "menu",
  "opening-hours",
  "contact",
  "faq",
  "team",
  "gallery",
  "products",
  "rooms",
  "service-area",
  "contact-strip",
] as const;
export const FixtureSectionType = z.enum(SECTION_TYPES);

/** Facts that can be deliberately absent from a brief. */
export const MissingFact = z.enum(["prices", "hours", "photos", "phone", "email", "address", "legal", "people"]);
export type MissingFact = z.infer<typeof MissingFact>;

const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const E164 = z.string().regex(/^\+386\d{7,8}$/, "E.164 Slovene number, e.g. +38641555012");
const JsonPointer = z.string().regex(/^(\/[^/]+)+$/, "JSON Pointer, e.g. /business/phone");
const ColorPath = z.templateLiteral(["/design/colors/", Colors.keyof()]);

export const FixtureHours = z
  .strictObject({
    from: Day,
    to: Day,
    open: Time.optional(),
    close: Time.optional(),
    closed: z.boolean().optional(),
  })
  .refine((h) => (h.closed ? !h.open && !h.close : Boolean(h.open && h.close)), {
    message: "an hours entry is either closed or has both open and close",
  });

export const FixtureFacts = z.strictObject({
  name: z.string().min(1),
  phone: E164.optional(),
  email: z.email().optional(),
  address: z
    .strictObject({
      street: z.string().min(1),
      postalCode: z.string().regex(/^\d{4}$/),
      city: z.string().min(1),
    })
    .optional(),
  hours: z.array(FixtureHours).min(1).max(7).optional(),
  bookingUrl: z.url().optional(),
  prices: z
    .array(
      z.strictObject({
        item: z.string().min(1).describe("Wording as in the description"),
        amount: z.number().nonnegative(),
        from: z.boolean().optional().describe('true for "od 45 €"'),
      }),
    )
    .min(1)
    .optional(),
  people: z.array(z.strictObject({ name: z.string().min(1), role: z.string().optional() })).min(1).optional(),
  legal: z
    .strictObject({
      legalName: z.string().min(1).optional(),
      registrationNumber: z.string().regex(/^\d{7}(\d{3})?$/).optional(),
      taxNumber: z.string().regex(/^(SI)?\d{8}$/).optional(),
    })
    .refine((l) => Object.keys(l).length > 0, { message: "legal must hold at least one value; omit it otherwise" })
    .optional(),
  /** Other literal statements from the description the site may repeat (features, service area, years). */
  other: z.array(z.string().min(1)).optional(),
});
export type FixtureFacts = z.infer<typeof FixtureFacts>;

function wordCount(s: string): number {
  return s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

export const FixtureBrief = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  businessType: BusinessType,
  /** The trade within the business type when it isn't the type's usual one (Slovene: "elektro", "mizar", "gume"); for the motif-fit metric. */
  trade: z.string().min(2).max(30).optional(),
  /** Twins (tools/eval/twins): the base fixture of the same trade this one is measured against. */
  twinOf: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).optional(),
  description: z
    .string()
    .refine((d) => wordCount(d) >= 90 && wordCount(d) <= 260, { message: "description must be 90–260 words" }),
  logo: z.string().regex(/^[a-z0-9-]+\.svg$/).nullable(),
  photos: z
    .array(
      z.strictObject({
        file: z.string().regex(/^photos\/\d{2}\.jpg$/),
        /** Twins reuse a base fixture's committed photo instead of a copy: that fixture's id. */
        from: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).optional(),
        subject: z.string().min(8).max(120).describe("Slovene: what the stand-in photo depicts"),
      }),
    )
    .max(8),
  facts: FixtureFacts,
  missing: z.array(MissingFact),
});
export type FixtureBrief = z.infer<typeof FixtureBrief>;

export const EditCheck = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("equals"), path: JsonPointer, value: z.json() }),
  z.strictObject({ kind: z.literal("hasSectionType"), type: FixtureSectionType, page: z.enum(["home", "any"]) }),
  z.strictObject({ kind: z.literal("noSectionType"), type: FixtureSectionType }),
  z.strictObject({ kind: z.literal("colorDarker"), path: ColorPath }),
  z.strictObject({ kind: z.literal("colorWarmer"), path: ColorPath }),
  // The colour ends up in a named hue range (degrees, `from` may be > `to` to wrap past 0), e.g. terracotta.
  z.strictObject({ kind: z.literal("colorHueIn"), path: ColorPath, name: z.string(), from: z.number().min(0).max(360), to: z.number().min(0).max(360), minSaturation: z.number().min(0).max(1) }),
  z.strictObject({ kind: z.literal("textContains"), text: z.string().min(2) }),
  z.strictObject({ kind: z.literal("textAbsent"), text: z.string().min(2) }),
  // Prices the fact check can't accept (sb-english-prices = strict: written in English for Slovene offerings)
  // stay price placeholders: none of these amounts on the site, at least one price placeholder.
  z.strictObject({ kind: z.literal("pricePlaceholders"), amounts: z.array(z.number().positive()).min(1) }),
  z.strictObject({
    kind: z.literal("sectionCountDelta"),
    type: FixtureSectionType,
    delta: z.union([z.literal(-1), z.literal(1)]),
  }),
  z.strictObject({ kind: z.literal("manual") }),
]);
export type EditCheck = z.infer<typeof EditCheck>;

export const FixtureEdit = z.strictObject({
  message: z.string().min(3).max(300),
  lang: z.enum(["sl", "en"]),
  intent: z.string().min(5).max(200),
  check: EditCheck,
});
export type FixtureEdit = z.infer<typeof FixtureEdit>;

export const FixtureEdits = z
  .array(FixtureEdit)
  .length(5)
  .refine((edits) => edits.filter((e) => e.check.kind === "manual").length <= 1, {
    message: "at most one manual check per fixture",
  });

/** A loaded fixture with absolute paths. */
export interface Fixture {
  id: string;
  dir: string;
  brief: FixtureBrief;
  edits: FixtureEdit[];
  /** Absolute path of the logo SVG, or null. */
  logoPath: string | null;
  /** Photos with absolute paths. The JPEGs exist only after `pnpm fixtures:photos`. */
  photos: { file: string; subject: string; path: string; from?: string }[];
}
