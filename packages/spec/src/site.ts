import { z } from "zod";
import { ImageRef, Locale, PageRef, Tone, text } from "./common.ts";
import { Business } from "./business.ts";
import { Design } from "./design.ts";
import { Section } from "./sections/index.ts";
import { SectionId } from "./sections/define.ts";
import { Collections } from "./collections.ts";

export const SPEC_VERSION = 15 as const;

export const PageKind = z.enum(["home", "standard", "privacy", "accessibility", "not-found"]);
export type PageKind = z.infer<typeof PageKind>;

export const Page = z.strictObject({
  id: PageRef,
  kind: PageKind,
  /** File name without extension: "" is index.html; "storitve" is storitve.html. ASCII, lower case. */
  slug: z.string().regex(/^$|^[a-z0-9]+(-[a-z0-9]+)*$/).max(40),
  nav: z.strictObject({ label: text(24), show: z.boolean() }),
  seo: z.strictObject({
    title: text(60),
    description: text(160),
  }),
  sections: z.array(Section).min(1).max(14),
});
export type Page = z.infer<typeof Page>;

export const ImageAsset = z.strictObject({
  id: ImageRef,
  /** Storage key of the original upload; render derives variant paths from id and width. */
  src: z.string().max(300),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  alt: z.string().max(180).describe("Slovene alt text; empty string only for purely decorative images"),
  /** Focal point for cropping, 0..1. */
  focal: z.strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).optional(),
  /**
   * "generated": an AI image the pipeline made because the client had too few photos. It is labelled
   * on the site and may only fill GENERATED_IMAGE_SECTIONS. Absent means the client's own photo.
   */
  origin: z.enum(["client", "generated"]).optional(),
});
export type ImageAsset = z.infer<typeof ImageAsset>;

/**
 * The only sections a generated image may appear in: atmosphere beside a headline or text. Never
 * galleries, team, services, products, rooms or about, where a picture reads as the business itself.
 */
export const GENERATED_IMAGE_SECTIONS = ["hero-split", "hero-image", "hero-signature", "image-text", "page-header"] as const;

export const LogoAsset = z.strictObject({
  src: z.string().max(300),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** File name under media/ as rendered (svg or png). */
  file: z.string().regex(/^logo\.(png|svg)$/),
});

export const Chrome = z.strictObject({
  header: z.strictObject({
    variant: z.enum(["bar", "split-cta", "stacked"]),
    cta: z.enum(["call", "booking", "directions", "none"]),
    /** Header background: page colour (default), surface (alt) or dark inverse. */
    tone: Tone.optional(),
  }),
  footer: z.strictObject({
    variant: z.enum(["columns", "compact"]),
    /** The year after "©", set when the site is made (preview, published page and export agree). */
    year: z.number().int().min(2000).max(2100).optional().describe("Set by the system; leave out."),
  }),
  /** Sticky call/directions bar on mobile for local businesses. */
  mobileActionBar: z.boolean(),
});
export type Chrome = z.infer<typeof Chrome>;

/**
 * Spec v14: a text (or price, or other plain value) the owner typed in the editor (it-keep-owner-edits): the
 * section's id and the value's pointer inside it. "Ustvari znova" keeps these in the regenerated site where the same
 * section and field exist (engine owner-text.ts); the server sets them on direct edits (owner-edits.ts).
 */
export const OwnerEdit = z.strictObject({
  section: SectionId,
  path: z.string().regex(/^\/props(\/[^/]+)+$/).max(200),
});
export type OwnerEdit = z.infer<typeof OwnerEdit>;
export const MAX_OWNER_EDITS = 500;

/** Most pages a site holds, every kind counted (see `pages` below). */
export const MAX_PAGES = 24;

export const SiteSpec = z.strictObject({
  specVersion: z.literal(SPEC_VERSION),
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).min(2).max(48),
  locales: z.strictObject({ default: Locale, enabled: z.array(Locale).min(1) }),
  business: Business,
  design: Design,
  assets: z.strictObject({
    logo: LogoAsset.optional(),
    images: z.array(ImageAsset).max(40),
  }),
  chrome: Chrome,
  /** Spec v13: up to 24 (Plus has up to 20 home and standard pages, plus privacy, accessibility and 404; it-plan-limits). */
  pages: z.array(Page).min(1).max(MAX_PAGES),
  /** Spec v12: blog, events, services and team the owner keeps in the editor (collections.ts). Never generated. */
  collections: Collections.optional(),
  /**
   * Non-default locales as overlays: JSON Pointer into this spec -> translated string.
   * Only string leaves can be translated.
   */
  translations: z.partialRecord(Locale, z.record(z.string(), z.string())).optional(),
  /** Spec v14: what the owner typed in the editor, kept by "Ustvari znova" (OwnerEdit above). */
  ownerEdits: z.array(OwnerEdit).max(MAX_OWNER_EDITS).optional().describe("Set by the editor; leave out."),
});
export type SiteSpec = z.infer<typeof SiteSpec>;
