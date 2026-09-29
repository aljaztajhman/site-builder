import type { LcpResolvers } from "../../types.ts";
import { HERO_SPLIT_SIZES, HeroSplit } from "./HeroSplit.tsx";

export const heroRenderers = {
  "hero-split": HeroSplit,
};

/** Which image is the LCP candidate when the section is first on the page (preloaded by the page shell). */
export const heroLcp: LcpResolvers = {
  "hero-split": (s) => ({ image: s.props.image, sizes: HERO_SPLIT_SIZES }),
};
