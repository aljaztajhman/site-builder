import { z } from "zod";
import { text } from "../common.ts";
import { defineSection } from "./define.ts";

export const legal = defineSection(
  {
    type: "legal",
    group: "structure",
    variants: ["default"],
    description:
      "Privacy policy or accessibility statement, generated in code from the business facts. Added by the system on legal pages only.",
    images: "none",
    mobile: "Single readable column; headings wrap; the review notice sits at the top.",
    a11y: "Page h1 is the document title; sub-sections are h2/h3. A visible notice marks the text as a template for review.",
    systemOnly: true,
  },
  z.strictObject({
    kind: z.enum(["privacy", "accessibility"]),
    /** accessibility: the day the statement was prepared, set when the site is made (YYYY-MM-DD). */
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
);

export const notFound = defineSection(
  {
    type: "not-found",
    group: "structure",
    variants: ["default"],
    description: "Body of the 404 page: short title, one sentence and a button back to the homepage. Added by the system.",
    images: "none",
    mobile: "Single column; the homepage button is full width and 48 px tall.",
    a11y: "Title is the page h1. The homepage link is a real link.",
    systemOnly: true,
  },
  z.strictObject({
    title: text(60),
    body: text(200),
  }),
);

export const contactStrip = defineSection(
  {
    type: "contact-strip",
    group: "structure",
    variants: ["bar", "cards"],
    description:
      "Compact row of quick facts near the top of the homepage: phone (click to call), address with a directions link, weekly opening hours. Facts come from the business data; use it right after the hero on local-business homepages.",
    images: "none",
    mobile: "Facts stack in one column; phone and directions links are at least 44 px tall.",
    a11y: "Section is named by its h2 (visually hidden when no title is given). Each fact has an h3 label.",
  },
  z.strictObject({
    title: text(60).optional().describe('Optional visible heading, e.g. "Obiščite nas". Leave out for a compact strip.'),
  }),
);

export const structureSchemas = [legal.schema, notFound.schema, contactStrip.schema] as const;
export const structureDefs = [legal, notFound, contactStrip];
