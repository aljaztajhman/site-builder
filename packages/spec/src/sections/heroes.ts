import { z } from "zod";
import { ImageRef, Link, text } from "../common.ts";
import { defineSection } from "./define.ts";

const HEADLINE_RULE = 'Concrete and specific to this business. Never "Dobrodošli" or "Welcome to".';
const EYEBROW_RULE = "Short plain label above the headline, e.g. the town or trade. Not numbered.";

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
    eyebrow: text(40).optional().describe(EYEBROW_RULE),
    headline: text(70).describe(HEADLINE_RULE),
    intro: text(220),
    primary: Link.optional(),
    secondary: Link.optional(),
    image: ImageRef,
  }),
);

export const heroImage = defineSection(
  {
    type: "hero-image",
    group: "heroes",
    variants: ["overlay-bottom", "overlay-left"],
    description:
      "Homepage hero led by one wide, atmospheric photo (interior, landscape, dish, workshop). The headline sits on a solid panel that overlaps the photo's bottom edge (overlay-bottom) or its left side (overlay-left) on desktop. Use when the client has a strong landscape photo.",
    images: "required",
    mobile: "Photo first at 4:3, the solid text panel directly below it. Actions are full-width buttons, at least 48 px tall.",
    a11y: "Headline is the page h1. Text sits on a solid inverse panel, never on the photo, so contrast holds for any photo. The photo is the LCP image and is preloaded.",
  },
  z.strictObject({
    eyebrow: text(40).optional().describe(EYEBROW_RULE),
    headline: text(70).describe(HEADLINE_RULE),
    intro: text(200),
    primary: Link.optional(),
    secondary: Link.optional(),
    image: ImageRef.describe("A landscape photo; the edges are cropped on narrow screens, so keep the subject near the focal point."),
  }),
);

export const heroType = defineSection(
  {
    type: "hero-type",
    group: "heroes",
    variants: ["large", "with-facts"],
    description:
      "Typography-led homepage hero with no photo: a large headline, intro and actions. with-facts adds a column with phone, address (with a directions link) and opening hours from the business facts. Use when the client has no photos or only weak ones, or when calling/visiting is the main goal.",
    images: "none",
    mobile: "Single column, left-aligned. with-facts shows the facts below the actions; phone and directions links are at least 44 px tall.",
    a11y: "Headline is the page h1. Facts are a description list; the phone is a tel: link.",
  },
  z.strictObject({
    eyebrow: text(40).optional().describe(EYEBROW_RULE),
    headline: text(90).describe(HEADLINE_RULE),
    intro: text(260),
    primary: Link.optional(),
    secondary: Link.optional(),
  }),
);

export const pageHeader = defineSection(
  {
    type: "page-header",
    group: "heroes",
    variants: ["plain", "with-image"],
    description:
      "Opening section of an inner page (services, about, contact): the page title as h1, an optional short intro and, for with-image, one wide photo below the title. Use as the first section of every page except the homepage.",
    images: "optional",
    mobile: "Title and intro, then the photo at 3:2 (with-image). Long titles wrap; nothing overflows at 360 px.",
    a11y: "Title is the page h1. with-image without an image renders like plain. The photo is the LCP image and is preloaded.",
  },
  z.strictObject({
    eyebrow: text(40).optional().describe(EYEBROW_RULE),
    title: text(70).describe("The page title, e.g. \"Storitve in cene\". Not a greeting."),
    intro: text(240).optional(),
    image: ImageRef.optional().describe("Only used by the with-image variant."),
  }),
);

/** Add new hero section definitions here and to the tuple below. */
export const heroSchemas = [heroSplit.schema, heroImage.schema, heroType.schema, pageHeader.schema] as const;
export const heroDefs = [heroSplit, heroImage, heroType, pageHeader];
