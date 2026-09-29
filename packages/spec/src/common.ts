import { z } from "zod";

/** Locales the spec can carry. `sl` is the default; others are overlays (see SiteSpec.translations). */
export const Locale = z.enum(["sl", "en", "de", "hr", "it"]);
export type Locale = z.infer<typeof Locale>;

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

/** A price in euros. `from: true` renders "od 25,00 €". */
export const Price = orPlaceholder(
  z.strictObject({
    amount: z.number().nonnegative().max(1_000_000),
    from: z.boolean().optional(),
    unit: z.string().max(20).optional().describe('Optional unit, e.g. "na osebo", "/ uro"'),
  }),
);
export type Price = z.infer<typeof Price>;

export const Tone = z.enum(["default", "alt", "inverse"]);
export type Tone = z.infer<typeof Tone>;

export const HexColor = z.string().regex(/^#[0-9a-f]{6}$/);
