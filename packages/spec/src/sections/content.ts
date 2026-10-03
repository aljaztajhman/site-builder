import { z } from "zod";
import { ImageRef, Link, orPlaceholder, text } from "../common.ts";
import { CollectionKind } from "../collections.ts";
import { defineSection } from "./define.ts";

const EYEBROW_RULE = "Optional short plain label above the heading. Not numbered.";
const PARAGRAPH = text(600).describe("One paragraph of plain text, from the client's input. No invented facts or figures.");

export const textSection = defineSection(
  {
    type: "text",
    group: "content",
    variants: ["narrow", "two-column"],
    description:
      "Heading and one to six paragraphs of running text. narrow: one readable column. two-column: heading on the left, text on the right on desktop. Use for explanations that need more than a list, e.g. how a service works or what is included.",
    images: "none",
    mobile: "One column at a readable measure; the heading wraps, nothing overflows at 360 px.",
    a11y: "Heading is an h2. Paragraphs are real <p> elements; line length stays between 45 and 75 characters.",
  },
  z.strictObject({
    eyebrow: text(40).optional().describe(EYEBROW_RULE),
    heading: text(80),
    paragraphs: z.array(PARAGRAPH).min(1).max(6),
  }),
);

export const imageText = defineSection(
  {
    type: "image-text",
    group: "content",
    variants: ["image-left", "image-right", "round", "pair"],
    description:
      "One photo beside a heading, up to three paragraphs and an optional link. Use to present one service, room, product or place with its own photo. Alternate image-left and image-right when used more than once on a page. round: the photo in a disc with a ring, the link as the section's one button; for an offer on a coloured band (gift boxes, a seasonal special). pair: a tall photo with a second photo (inset) overlapping its corner, an optional number the client gave set wall-sized above the heading (figure: \"40\" with the heading \"sedežev na terasi\"), the link as the section's one button.",
    images: "required",
    mobile: "Photo first at 4:3 (round: a disc at 70 % of the width), then heading and text. The link is at least 44 px tall.",
    a11y: "Heading is an h2. Photo alt text comes from the asset.",
  },
  z.strictObject({
    eyebrow: text(40).optional().describe(EYEBROW_RULE),
    heading: text(80),
    paragraphs: z.array(text(500)).min(1).max(3),
    link: Link.optional(),
    image: ImageRef,
    inset: ImageRef.optional().describe("pair only: a second photo overlapping the first one's corner."),
    figure: text(8).optional().describe("pair only: one number from the client's input, set wall-sized above the heading, which reads on from it."),
  }),
);

export const highlightsSection = defineSection(
  {
    type: "highlights",
    group: "content",
    variants: ["list", "columns", "figures"],
    description:
      "Two to six short points, each a bold title and one or two sentences, set typographically with rules (no icons). list: one point per row. columns: two columns on desktop. figures: each title is one short word, abbreviation or number from the client's input (\"s.p.\", \"12 let\") set at poster size, its text a short label under it on a rule; the heading is a small label. Use for concrete reasons to choose the business or what a visit includes; each point must come from the client's input.",
    images: "none",
    mobile: "One column; each point is separated by a rule. figures: the titles wrap to the screen width, side by side when they fit.",
    a11y: "Heading is an h2, each point an h3 inside a list.",
  },
  z.strictObject({
    eyebrow: text(40).optional().describe(EYEBROW_RULE),
    heading: text(80),
    intro: text(240).optional(),
    items: z
      .array(
        z.strictObject({
          title: text(60),
          text: text(200),
        }),
      )
      .min(2)
      .max(6),
  }),
);

export const stepsSection = defineSection(
  {
    type: "steps",
    group: "content",
    variants: ["vertical", "horizontal"],
    description:
      "How it works: two to five steps in order, each a short title and text, with an optional action after the last step. vertical: a timeline down the page. horizontal: steps side by side on desktop. Use for booking, ordering or a first visit.",
    images: "none",
    mobile: "Both variants stack as a vertical timeline. No numbered labels; the order is carried by an ordered list.",
    a11y: "Heading is an h2; steps are an ordered list, each step title an h3.",
  },
  z.strictObject({
    eyebrow: text(40).optional().describe(EYEBROW_RULE),
    heading: text(80),
    intro: text(240).optional(),
    steps: z
      .array(
        z.strictObject({
          title: text(60),
          text: text(240),
        }),
      )
      .min(2)
      .max(5),
    action: Link.optional(),
  }),
);

export const ctaSection = defineSection(
  {
    type: "cta",
    group: "content",
    variants: ["band", "split"],
    description:
      "Call to action: a heading, one sentence and one or two buttons. band: compact strip with the buttons beside the text on desktop. split: large heading on the left, text and buttons on the right. Use near the end of a page; best on the inverse tone.",
    images: "none",
    mobile: "Text first, then full-width buttons, at least 48 px tall and 12 px apart.",
    a11y: "Heading is an h2. Buttons are links with visible labels.",
  },
  z.strictObject({
    heading: text(80),
    text: text(240).optional(),
    primary: Link,
    secondary: Link.optional(),
  }),
);

export const bookingSection = defineSection(
  {
    type: "booking",
    group: "content",
    variants: ["simple", "with-hours"],
    description:
      'Invites the visitor to book or call: heading, text and one button whose target is {"action":"booking"} (only when the business has a booking URL) or {"action":"call"}. with-hours also shows the opening hours and phone number from the business facts.',
    images: "none",
    mobile: "Text, then a full-width button; with-hours shows the hours below.",
    a11y: "Heading is an h2; the hours box has an h3. Hours are a description list.",
  },
  z.strictObject({
    heading: text(80),
    text: text(300),
    action: Link.describe('Target {"action":"booking"} or {"action":"call"}'),
    secondary: Link.optional(),
  }),
);

export const aboutSection = defineSection(
  {
    type: "about",
    group: "content",
    variants: ["image-side", "text-only", "figure"],
    description:
      "The business's own story, told only with what the client wrote: heading, up to four paragraphs, an optional photo (image-side) and optionally the owner's name and role. figure: no photo; one number the client gave (the founding year) set wall-sized beside the heading and text (props.figure). Never invent history, years or numbers.",
    images: "optional",
    mobile: "Photo first at 4:3 (image-side; 4:5 beside the text on desktop), then the text. image-side without an image renders like text-only. figure: the number first, then the text.",
    variantNeeds: { "image-side": "image", figure: "figure" },
    a11y: "Heading is an h2. Photo alt text comes from the asset.",
  },
  z.strictObject({
    eyebrow: text(40).optional().describe(EYEBROW_RULE),
    heading: text(80),
    paragraphs: z.array(PARAGRAPH).min(1).max(4),
    image: ImageRef.optional(),
    ownerName: orPlaceholder(text(60)).optional().describe("Only if the client named the owner; otherwise a name placeholder or omit."),
    ownerRole: text(60).optional().describe('e.g. "lastnica salona"'),
    figure: z
      .strictObject({
        label: text(32).describe('What the number is, e.g. "Delamo od leta"'),
        value: text(8).describe('The number exactly as the client wrote it, e.g. "2004"'),
      })
      .optional()
      .describe("figure only: one number from the client's input, never estimated or rounded."),
  }),
);

export const announcementSection = defineSection(
  {
    type: "announcement",
    group: "content",
    variants: ["bar", "card"],
    description:
      "A short notice the client provided, e.g. a holiday closure or a new service: title, one or two sentences and an optional link. bar: a slim strip. card: a boxed notice. Only for notices from the client's input.",
    images: "none",
    mobile: "Title and text wrap; the link is at least 44 px tall. Static: no marquee, no dismiss button.",
    a11y: "Title is an h2. No motion, no JavaScript.",
  },
  z.strictObject({
    title: text(60),
    text: text(200),
    link: Link.optional(),
  }),
);

/** Spec v12: a collection the owner keeps (collections.ts) shown on a page. */
export const collectionSection = defineSection(
  {
    type: "collection",
    group: "content",
    variants: ["list", "cards"],
    description:
      "Entries of one of the owner's collections (blog posts, events, services, team) from SiteSpec.collections: list: ruled rows with the date or price beside the title and summary. cards: two or three cards per row with a photo when the entry has one. limit shows only the first entries (newest posts, next events) with a link to the collection's page.",
    images: "optional",
    mobile: "One entry per row; dates and prices stay on one line; each entry's link is at least 44 px tall.",
    a11y: "Heading is an h2; each entry's title an h3 inside a list, linking to the entry's page when it has one. Dates are <time> elements.",
    ownerOnly: true,
  },
  z.strictObject({
    kind: CollectionKind,
    eyebrow: text(40).optional().describe(EYEBROW_RULE),
    title: text(80),
    intro: text(240).optional(),
    limit: z.number().int().min(1).max(12).optional().describe("Show only this many entries, with a link to the collection's page"),
  }),
);

export const contentSchemas = [
  textSection.schema,
  imageText.schema,
  highlightsSection.schema,
  stepsSection.schema,
  ctaSection.schema,
  bookingSection.schema,
  aboutSection.schema,
  announcementSection.schema,
  collectionSection.schema,
] as const;
export const contentDefs = [textSection, imageText, highlightsSection, stepsSection, ctaSection, bookingSection, aboutSection, announcementSection, collectionSection];
