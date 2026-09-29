import type { SectionType } from "@sb/spec";
import { heroLcp, heroRenderers } from "./groups/heroes/index.ts";
import { contentRenderers } from "./groups/content/index.ts";
import { businessRenderers } from "./groups/business/index.ts";
import { structureRenderers } from "./groups/structure/index.ts";
import type { LcpImage, LcpResolvers, SectionComponent, SectionRenderers } from "./types.ts";
import type { Section } from "@sb/spec";

/** Every section type in @sb/spec must have exactly one renderer (enforced by `satisfies`). */
export const renderers = {
  ...heroRenderers,
  ...contentRenderers,
  ...businessRenderers,
  ...structureRenderers,
} satisfies SectionRenderers;

export function rendererFor(type: SectionType): SectionComponent<SectionType> {
  return renderers[type] as SectionComponent<SectionType>;
}

/**
 * Client-side islands a section needs (files in packages/components/islands, served from _shared/js/).
 * nav.js is always loaded by the page shell.
 */
export const SECTION_ISLANDS: Partial<Record<SectionType, string[]>> = {};

/** LCP resolvers for sections that can open a page with a photo. Heroes and page headers. */
export const SECTION_LCP: LcpResolvers = { ...heroLcp };

export function lcpImageFor(section: Section): LcpImage | null {
  const fn = SECTION_LCP[section.type] as ((s: Section) => LcpImage | null) | undefined;
  return fn ? fn(section) : null;
}
