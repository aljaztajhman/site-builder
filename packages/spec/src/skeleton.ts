/**
 * The site's skeleton (docs/plans/variety-engine.md, Step 4): the frame every page shares, chosen per site instead of
 * the same on every site. Spec v15, optional on the design: a site without one renders exactly as before (header and
 * footer from `chrome`, the phone bar, one container width, one card and button style). Set only by the generator
 * when config `variety.skeleton` is on.
 *
 * - header: today's three variants (bar, split-cta, stacked: `chrome.header.variant` maps one to one) and five
 *   families that also differ on phones: a centred wordmark; the logo with the phone number and no menu box; transparent
 *   over the hero photo; the menu as a word without a box; compact and sticky.
 * - actions: where the call lives on phones: today's bar (call and directions), one floating call button (with a small
 *   directions button), or the call in the header (it stays on screen). Whatever the choice, a screen shows one call
 *   button: every other call action renders as a text link (chrome.css).
 * - footer: today's columns and compact, a big closing wordmark, or the address with directions beside the hours; its
 *   tone comes from the design, not forced dark under a trade motif.
 * - section level: container width, card style, button style (all within the banned list: no pills, no shadows),
 *   dividers between sections and the ratio of content photos.
 * - alignment per section: every section starts at the left edge, except at most one per page that is centred
 *   (`centred`, section ids): a short stack (a call to action band, a short narrow text, a short story without a photo)
 *   centred whole, or a symmetric grid (cards, products, horizontal steps, a gallery, a team grid) under a centred head. Long running text is never centred (canCentre); the renderer keeps the first one per page that may be.
 */
import { z } from "zod";
import { SectionId } from "./sections/define.ts";

export const HEADER_FAMILIES = ["bar", "split-cta", "stacked", "centred", "phone", "overlay", "word", "compact"] as const;
export type HeaderFamily = (typeof HEADER_FAMILIES)[number];
/** The five header families Step 4 adds (the first three are today's `chrome.header.variant`s). */
export const NEW_HEADER_FAMILIES: readonly HeaderFamily[] = ["centred", "phone", "overlay", "word", "compact"];

export const PHONE_ACTIONS = ["bar", "float", "header"] as const;
export type PhoneActions = (typeof PHONE_ACTIONS)[number];

export const FOOTER_FAMILIES = ["columns", "compact", "wordmark", "visit"] as const;
export type FooterFamily = (typeof FOOTER_FAMILIES)[number];

export const SECTION_WIDTHS = ["contained", "wide", "full"] as const;
export const CARD_STYLES = ["bordered", "filled", "none"] as const;
export const BUTTON_STYLES = ["square", "soft", "underline"] as const;
export const DIVIDERS = ["motif", "rule", "none"] as const;
export const PHOTO_RATIOS = ["standard", "landscape", "square", "portrait"] as const;
/** CSS aspect ratio per photo ratio (content photos: image-text, the split hero on desktop). */
export const PHOTO_RATIO_CSS: Record<(typeof PHOTO_RATIOS)[number], string> = { standard: "4 / 3", landscape: "3 / 2", square: "1 / 1", portrait: "4 / 5" };

export const Skeleton = z.strictObject({
  header: z.enum(HEADER_FAMILIES),
  actions: z.enum(PHONE_ACTIONS),
  footer: z.enum(FOOTER_FAMILIES),
  footerTone: z.enum(["default", "alt", "inverse", "band"]),
  width: z.enum(SECTION_WIDTHS),
  cards: z.enum(CARD_STYLES),
  buttons: z.enum(BUTTON_STYLES),
  dividers: z.enum(DIVIDERS),
  photoRatio: z.enum(PHOTO_RATIOS),
  /** The sections centred on their axis, at most one per page (see the module comment); absent: none. */
  centred: z.array(SectionId).max(16).optional(),
});
export type Skeleton = z.infer<typeof Skeleton>;

/** Short stacks centred whole (heading, text and buttons). */
export const CENTRED_STACKS: readonly string[] = ["cta:band", "text:narrow", "about:text-only"];
/** Symmetric grids whose head (eyebrow, title, intro) is centred over them. */
export const CENTRED_HEADS: readonly string[] = [
  "services-cards:grid",
  "services-cards:compact",
  "products:grid",
  "steps:horizontal",
  "gallery:grid",
  "gallery:mosaic",
  "team:grid",
];
/** Trade motifs that set the narrow text as their own two-part block (motifs.css): it is not centred there. */
export const OWN_NARROW_TEXT: readonly string[] = ["label", "bend"];
/** A centred stack holds at most this many paragraphs, each at most this long (characters): centred text stays short. */
export const CENTRED_TEXT = { paragraphs: 2, chars: 280 } as const;

/**
 * Whether a section may be centred: a short stack or a symmetric grid (never long running text, never a narrow text a
 * trade motif lays out itself). `motif`: the site's trade template motif, if any.
 */
export function canCentre(section: { type: string; variant: string; props: unknown }, motif?: string): boolean {
  const key = `${section.type}:${section.variant}`;
  if (CENTRED_HEADS.includes(key)) return true;
  if (!CENTRED_STACKS.includes(key)) return false;
  if (key === "text:narrow" && motif !== undefined && OWN_NARROW_TEXT.includes(motif)) return false;
  const paragraphs = (section.props as { paragraphs?: unknown }).paragraphs;
  if (paragraphs === undefined) return true;
  return Array.isArray(paragraphs) && paragraphs.length <= CENTRED_TEXT.paragraphs && paragraphs.every((p) => typeof p === "string" && p.length <= CENTRED_TEXT.chars);
}

/** The ids of a page's sections that render centred: the first one on the page that is listed and may be centred, or none. */
export function centredOn(
  skeleton: Skeleton | undefined,
  sections: readonly { id: string; type: string; variant: string; props: unknown }[],
  motif?: string,
): ReadonlySet<string> {
  const ids = skeleton?.centred;
  if (!ids?.length) return new Set();
  const first = sections.find((s) => ids.includes(s.id) && canCentre(s, motif));
  return new Set(first ? [first.id] : []);
}

/**
 * The skeleton that renders a site the way it rendered before v15, from its chrome (header and footer variant map one
 * to one). Rendering it equals rendering no skeleton apart from the one-call-button rule and the address eyebrow, so the
 * migration leaves skeletons out instead of writing this (a migrated spec renders byte-identical HTML).
 */
export function skeletonOfChrome(chrome: { header: { variant: "bar" | "split-cta" | "stacked" }; footer: { variant: "columns" | "compact" } }): Skeleton {
  return { header: chrome.header.variant, actions: "bar", footer: chrome.footer.variant, footerTone: "alt", width: "contained", cards: "filled", buttons: "soft", dividers: "motif", photoRatio: "standard" };
}

/** Header families that sit over the hero photo: only on a page that opens on a full-bleed photo hero, else `word`. */
export const OVERLAY_HEROES: readonly string[] = ["hero-signature:photo", "hero-signature:view"];

/**
 * The header family a page renders: overlay only over a full-bleed photo hero with its photo, and without a logo (a logo
 * is drawn for a light ground); elsewhere (inner pages, other heroes) the menu as a word, its closest relative.
 */
export function headerFamilyFor(skeleton: Skeleton, first: { type: string; variant: string; props: unknown } | undefined, hasLogo: boolean): HeaderFamily {
  if (skeleton.header !== "overlay") return skeleton.header;
  // A header that carries the call stays on screen (sticky); one over the photo can't, so it is the word family then.
  return skeleton.actions !== "header" && canOverlay(first, hasLogo) ? "overlay" : "word";
}

export function canOverlay(first: { type: string; variant: string; props: unknown } | undefined, hasLogo: boolean): boolean {
  const image = (first?.props as { image?: unknown } | undefined)?.image;
  return !hasLogo && first !== undefined && OVERLAY_HEROES.includes(`${first.type}:${first.variant}`) && image !== undefined;
}
