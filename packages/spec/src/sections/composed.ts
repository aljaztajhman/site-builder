import { ComposedProps } from "../composition/schema.ts";
import { defineSection } from "./define.ts";

/** Spec v19: a section composed from placed elements (composition/schema.ts). Written by the AI designer only. */
export const composedSection = defineSection(
  {
    type: "composed",
    group: "composed",
    variants: ["free"],
    description:
      "A section composed from elements placed on a 12-column grid (headings, text, facts as objects, photos with masks, actions, hours, contact, prices, small drawings). For layouts no preset section has. Every element needs a phone place.",
    images: "optional",
    mobile: "Elements stack in phone.order on a 4-column grid; half elements pair up; no rotation, shift or overlap of text on phones.",
    a11y: "Reading order is phone.order; one h1 per page; text over a photo gets a scrim to 4.5:1 or moves off it; decor is aria-hidden.",
    designerOnly: true,
  },
  ComposedProps,
);

export const composedSchemas = [composedSection.schema] as const;
export const composedDefs = [composedSection] as const;
