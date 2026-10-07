import { z } from "zod";

/**
 * Locales the spec schema can carry. `sl` is the default; others are overlays (see SiteSpec.translations).
 * Sites may only use SITE_LOCALES (validateSite enforces it, withSiteLocales falls back on read); the others
 * stay in the schema so specs written before the restriction still parse without a version bump.
 */
export const Locale = z.enum(["sl", "en", "de", "hr", "it"]);
export type Locale = z.infer<typeof Locale>;

/** Locales a site may use: those with UI strings, day names and placeholder labels (components i18n). */
export const SITE_LOCALES = ["sl", "en"] as const satisfies readonly Locale[];
export type SiteLocale = (typeof SITE_LOCALES)[number];
export const isSiteLocale = (l: string): l is SiteLocale => (SITE_LOCALES as readonly string[]).includes(l);

/**
 * A marked placeholder for a fact the client has not provided.
 * Rendered visibly; a site with any placeholder left cannot be published.
 */
export const PlaceholderKind = z.enum([
  "phone",
  "email",
  "address",
  "price",
  "hours",
  "name",
  "legalName",
  "registrationNumber",
  "taxNumber",
  "text",
]);
export type PlaceholderKind = z.infer<typeof PlaceholderKind>;

export const Placeholder = z.strictObject({
  $placeholder: PlaceholderKind,
  note: z.string().max(80).optional().describe("Short hint for the client, in Slovene"),
});
export type Placeholder = z.infer<typeof Placeholder>;

export function isPlaceholder(v: unknown): v is Placeholder {
  return typeof v === "object" && v !== null && "$placeholder" in v;
}

/**
 * The only link URLs a site renders: http(s). z.url() also accepts javascript:, data: and the like, so
 * validation reports them and the renderer drops them. mailto: and tel: are built from business facts.
 */
export function isWebUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/** A value or a marked placeholder. */
export function orPlaceholder<T extends z.ZodType>(schema: T) {
  return z.union([schema, Placeholder]);
}

/** Plain single-line text with a hard length limit (the component's content limit). */
export function text(max: number) {
  return z.string().trim().min(1).max(max);
}

/** Reference to an image in SiteSpec.assets.images by id. */
export const ImageRef = z.string().regex(/^img_[a-z0-9_-]+$/);
export type ImageRef = z.infer<typeof ImageRef>;

export const PageRef = z.string().regex(/^p_[a-z0-9_-]+$/);

/**
 * Where a link goes. Facts (phone, address, booking URL) are never written into links by the model;
 * actions resolve them from SiteSpec.business at render time.
 */
export const LinkTarget = z.union([
  z.strictObject({ page: PageRef, section: z.string().max(40).optional() }),
  z.strictObject({ action: z.enum(["call", "directions", "email", "booking"]) }),
  z.strictObject({ url: z.url().max(300) }),
]);
export type LinkTarget = z.infer<typeof LinkTarget>;

export const Link = z.strictObject({
  label: text(40),
  target: LinkTarget,
});
export type Link = z.infer<typeof Link>;

/**
 * JSON Schema key of a schema only the owner may write (set with `.meta`): toModelJsonSchema leaves it out of every
 * union, so the model is never offered it, and the engine strips such values from anything the model writes.
 */
export const OWNER_ONLY = "x-owner-only";

/**
 * Spec v15: "Cena po dogovoru" (it-price-on-request, owner's decision sb-price-on-request). The owner chose to give
 * the price on request instead of an amount: rendered as "po dogovoru", never a placeholder (it doesn't block
 * publishing) and never an offer price in JSON-LD. Only the owner sets it in the editor (config
 * `editor.priceOnRequest`); the generator, the critique and chat edits can't (engine owner-only prices).
 */
export const PriceOnRequest = z.strictObject({ onRequest: z.literal(true) }).meta({ [OWNER_ONLY]: true });
export type PriceOnRequest = z.infer<typeof PriceOnRequest>;

/** A price in euros. `from: true` renders "od 25,00 €". Or a marked placeholder, or the owner's "po dogovoru" (v15). */
export const Price = z.union([
  z.strictObject({
    amount: z.number().nonnegative().max(1_000_000),
    from: z.boolean().optional(),
    unit: z.string().max(20).optional().describe('Optional unit, e.g. "na osebo", "/ uro"'),
  }),
  Placeholder,
  PriceOnRequest,
]);
export type Price = z.infer<typeof Price>;

/**
 * Section background: the page colour, the alternate surface, the dark inverse colour, or the
 * direction's saturated band colour (design.colors.band, falling back to primary when a site has none).
 */
export const Tone = z.enum(["default", "alt", "inverse", "band"]);
export type Tone = z.infer<typeof Tone>;

export const HexColor = z.string().regex(/^#[0-9a-f]{6}$/);
