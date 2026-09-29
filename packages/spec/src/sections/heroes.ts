import { z } from "zod";
import { ImageRef, Link, text } from "../common.ts";
import { defineSection } from "./define.ts";

export const heroSplit = defineSection(
  {
    type: "hero-split",
    group: "heroes",
    variants: ["image-right", "image-left"],
    description:
      "Homepage hero with headline, short intro and up to two actions beside one strong photo. Use when the client has at least one good photo.",
    images: "required",
    mobile: "Stacks: text first, then the photo at 4:3. Actions are full-width buttons, at least 48 px tall.",
    a11y: "Headline is the page h1. Photo alt text comes from the asset. The photo is the LCP image and is preloaded.",
  },
  z.strictObject({
    eyebrow: text(40).optional().describe("Short plain label above the headline, e.g. the town or trade. Not numbered."),
    headline: text(70).describe('Concrete and specific to this business. Never "Dobrodošli" or "Welcome to".'),
    intro: text(220),
    primary: Link.optional(),
    secondary: Link.optional(),
    image: ImageRef,
  }),
);

/** Add new hero section definitions here and to the tuple below. */
export const heroSchemas = [heroSplit.schema] as const;
export const heroDefs = [heroSplit];
