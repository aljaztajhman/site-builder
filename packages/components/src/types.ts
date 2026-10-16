import type { ReactElement } from "react";
import type { ImageAsset, ImageRef, LinkTarget, Locale, Page, SectionOf, SectionType, SiteSpec } from "@sb/spec";
import type { UiKey } from "./i18n.ts";

export interface ImageSource {
  type: "image/avif" | "image/webp";
  srcSet: string;
}

export interface ResolvedImage {
  asset: ImageAsset;
  sources: ImageSource[];
  /** Fallback src (webp, mid width). */
  src: string;
  width: number;
  height: number;
  alt: string;
}

/**
 * Render-time details (docs/plans/m1-type-details.md, piece A): each switch is off when absent, and a page rendered with
 * none of them on is byte-identical to one rendered without the option. They change markup only where noted and are
 * otherwise CSS (styles/details.css, scoped to the matching class on <html>, primitives detailsClass).
 */
export interface RenderDetails {
  /** Hero and header calls as a real primary button (phone icon, heavy, body size, 48 px). */
  cta?: boolean;
  /** Fuller header: section anchors instead of a lone home entry, a taller header, the stacked family as a masthead. */
  header?: boolean;
  /** No chip on each generated picture: one caption under the first one on the page. */
  aiCaption?: boolean;
  /** Composed display headlines fit their own column, short words never break, the first screen holds them. */
  fit?: boolean;
  /** Small things small, big things big: body-size nav and hero facts, 40 px section headings, one eyebrow a page. */
  scale?: boolean;
}

/**
 * Everything a component needs to render. Built by @sb/render; identical for preview and publish,
 * so preview output equals published output.
 */
export interface RenderCtx {
  /** Spec with the current locale's translations already applied. */
  site: SiteSpec;
  page: Page;
  locale: Locale;
  t: (key: UiKey) => string;
  image: (id: ImageRef) => ResolvedImage;
  /** Resolved href, or null when the target depends on a missing fact (placeholder). */
  href: (target: LinkTarget) => string | null;
  pageHref: (pageId: string) => string;
  /** On a collection entry's page, `page` is the collection's list page: the menu marks it as the current section, not the current page. */
  entry?: boolean;
  /** Path of a collection entry's page ("novice/odprtje.html", collections.ts) relative to the current page. */
  entryHref: (path: string) => string;
  /** Path to a shared asset (stylesheet, fonts, islands), relative to the current page. */
  shared: (file: string) => string;
  /** Path to a site media file, relative to the current page. */
  media: (file: string) => string;
  /** The day of rendering (@sb/render RenderOptions.now): only for a date the spec doesn't carry (a site from before spec v11). */
  today: Date;
  /** Render-time details (RenderDetails); absent: all off. */
  details?: RenderDetails;
}

export interface SectionProps<T extends SectionType> {
  section: SectionOf<T>;
  ctx: RenderCtx;
  /** Position on the page; index 0 renders its image eagerly with high fetch priority (LCP). */
  index: number;
}

export type SectionComponent<T extends SectionType> = (props: SectionProps<T>) => ReactElement | null;

export type SectionRenderers = { [T in SectionType]: SectionComponent<T> };

export interface LcpImage {
  image: ImageRef;
  /** Must equal the `sizes` the component renders, or the preload is wasted. */
  sizes: string;
}

export type LcpResolvers = Partial<{ [T in SectionType]: (section: SectionOf<T>) => LcpImage | null }>;
