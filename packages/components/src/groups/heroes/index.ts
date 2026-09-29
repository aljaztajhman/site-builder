import type { SectionType } from "@sb/spec";
import type { LcpResolvers } from "../../types.ts";
import { HERO_SPLIT_SIZES, HeroSplit } from "./HeroSplit.tsx";
import { HERO_IMAGE_SIZES, HeroImage } from "./HeroImage.tsx";
import { HeroType } from "./HeroType.tsx";
import { PAGE_HEADER_SIZES, PageHeader, pageHeaderImage } from "./PageHeader.tsx";

export const heroRenderers = {
  "hero-split": HeroSplit,
  "hero-image": HeroImage,
  "hero-type": HeroType,
  "page-header": PageHeader,
};

/** Which image is the LCP candidate when the section is first on the page (preloaded by the page shell). */
export const heroLcp: LcpResolvers = {
  "hero-split": (s) => ({ image: s.props.image, sizes: HERO_SPLIT_SIZES }),
  "hero-image": (s) => ({ image: s.props.image, sizes: HERO_IMAGE_SIZES }),
  "page-header": (s) => {
    const image = pageHeaderImage(s);
    return image ? { image, sizes: PAGE_HEADER_SIZES } : null;
  },
};

/** No hero needs client-side JS. */
export const heroIslands: Partial<Record<SectionType, string[]>> = {};
