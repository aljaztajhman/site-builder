import type { SectionType } from "@sb/spec";
import type { LcpResolvers } from "../../types.ts";
import { HERO_SPLIT_SIZES, HeroSplit } from "./HeroSplit.tsx";
import { HERO_IMAGE_SIZES, HeroImage } from "./HeroImage.tsx";
import { HeroType } from "./HeroType.tsx";
import { PAGE_HEADER_SIZES, PageHeader, pageHeaderImage } from "./PageHeader.tsx";
import { HERO_SIGNATURE_SIZES, HeroSignature, signaturePhoto } from "./HeroSignature.tsx";

export const heroRenderers = {
  "hero-split": HeroSplit,
  "hero-image": HeroImage,
  "hero-type": HeroType,
  "page-header": PageHeader,
  "hero-signature": HeroSignature,
};

/** Which image is the LCP candidate when the section is first on the page (preloaded by the page shell). */
export const heroLcp: LcpResolvers = {
  "hero-split": (s) => ({ image: s.props.image, sizes: HERO_SPLIT_SIZES }),
  "hero-image": (s) => ({ image: s.props.image, sizes: HERO_IMAGE_SIZES }),
  "page-header": (s) => {
    const image = pageHeaderImage(s);
    return image ? { image, sizes: PAGE_HEADER_SIZES } : null;
  },
  "hero-signature": (s) => {
    const sizes = HERO_SIGNATURE_SIZES[s.variant];
    const image = signaturePhoto(s);
    return sizes && image ? { image, sizes } : null;
  },
};

/** No hero needs client-side JS. */
export const heroIslands: Partial<Record<SectionType, string[]>> = {};
