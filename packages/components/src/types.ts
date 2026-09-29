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
  /** Path to a shared asset (stylesheet, fonts, islands), relative to the current page. */
  shared: (file: string) => string;
  /** Path to a site media file, relative to the current page. */
  media: (file: string) => string;
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
