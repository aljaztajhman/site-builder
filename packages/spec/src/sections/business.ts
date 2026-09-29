import { z } from "zod";
import { ImageRef, Link, Price, orPlaceholder, text } from "../common.ts";
import { defineSection } from "./define.ts";

const EYEBROW_RULE = "Optional short plain label above the heading. Not numbered.";

/** Heading block shared by every business section. */
const head = {
  eyebrow: text(40).optional().describe(EYEBROW_RULE),
  title: text(80).describe("Section heading (h2). Concrete, never a generic greeting."),
  intro: text(240).optional(),
};

const PRICE_RULE = "Only prices given in the client's input. Otherwise a price placeholder; never estimate.";

export const servicesList = defineSection(
  {
    type: "services-list",
    group: "business",
    variants: ["rows", "two-column"],
    description:
      "Two to twelve services as a typographic list: name, one or two sentences, optional price and link. rows: one service per row with the price aligned right. two-column: services in two columns on desktop. Use when services matter more than photos.",
    images: "none",
    mobile: "One column; name and price on one line when they fit, otherwise the price wraps under the name. Rows separated by rules.",
    a11y: "Heading is an h2; each service is an h3 inside a list. Prices use tabular numbers.",
  },
  z.strictObject({
    ...head,
    items: z
      .array(
        z.strictObject({
          name: text(60),
          description: text(240),
          price: Price.optional().describe(PRICE_RULE),
          link: Link.optional(),
        }),
      )
      .min(2)
      .max(12),
  }),
);

export const servicesCards = defineSection(
  {
    type: "services-cards",
    group: "business",
    variants: ["grid", "compact"],
    description:
      "Two to nine services as cards, each with an optional photo, a title, a short text and an optional link. No icons. grid: photo on top. compact: small photo beside the text. Use when the client has a photo per service; otherwise prefer services-list.",
    images: "optional",
    mobile: "One card per row at 360 px, two on tablet, three on desktop only with four or more cards. Three cards never form a plain row of three.",
    a11y: "Heading is an h2; each card title is an h3 inside a list. Card photos use the asset alt text.",
  },
  z.strictObject({
    ...head,
    items: z
      .array(
        z.strictObject({
          image: ImageRef.optional(),
          title: text(60),
          text: text(200),
          link: Link.optional(),
        }),
      )
      .min(2)
      .max(9),
  }),
);

export const priceList = defineSection(
  {
    type: "price-list",
    group: "business",
    variants: ["table", "grouped"],
    description:
      "Cenik: up to eight groups of items with prices. table: one real table per group. grouped: groups as definition lists, two columns on desktop. Every price comes from the client's input; missing prices are placeholders.",
    images: "none",
    mobile: "Two columns (item, price) that fit 360 px without a scroll container; long item names wrap, prices stay on one line, aligned right.",
    a11y: "table: <table> with the group name as caption (h3) and row headers. grouped: h3 per group and a <dl>. Prices use tabular numbers.",
  },
  z.strictObject({
    ...head,
    groups: z
      .array(
        z.strictObject({
          name: text(60).optional().describe("Group name, e.g. \"Striženje\". Leave out when there is only one group."),
          items: z
            .array(
              z.strictObject({
                name: text(80),
                note: text(120).optional().describe("Short detail, e.g. duration or what is included"),
                price: Price.describe(PRICE_RULE),
              }),
            )
            .min(1)
            .max(20),
        }),
      )
      .min(1)
      .max(8),
    footnote: text(200).optional().describe('e.g. "Cene vključujejo DDV." Only if the client said so.'),
  }),
);

export const MenuTag = z.enum(["vegetarian", "vegan", "gluten-free", "lactose-free", "spicy", "local"]);
export type MenuTag = z.infer<typeof MenuTag>;

export const menuSection = defineSection(
  {
    type: "menu",
    group: "business",
    variants: ["classic", "two-column"],
    description:
      "Restaurant or gostilna menu: up to ten categories of dishes with optional description, price and dietary tags. classic: one column. two-column: categories side by side on desktop. Only dishes and prices from the client's input.",
    images: "none",
    mobile: "One column; dish name and price on one line, description below. Tags are small text labels.",
    a11y: "Heading is an h2; each category an h3 with a list of dishes. Tags are text, never emoji.",
  },
  z.strictObject({
    ...head,
    categories: z
      .array(
        z.strictObject({
          name: text(60),
          dishes: z
            .array(
              z.strictObject({
                name: text(80),
                description: text(160).optional(),
                price: Price.describe(PRICE_RULE),
                tags: z.array(MenuTag).max(4).optional().describe("Only tags the client's input supports"),
              }),
            )
            .min(1)
            .max(20),
        }),
      )
      .min(1)
      .max(10),
    footnote: text(200).optional().describe("e.g. allergen note, only from the client's input"),
  }),
);

export const openingHoursSection = defineSection(
  {
    type: "opening-hours",
    group: "business",
    variants: ["table", "compact"],
    description:
      "Opening hours from the business facts (never written in props), with a heading and an optional note. table: full day names in a table. compact: short day names in a narrow list. Use on the homepage or contact page.",
    images: "none",
    mobile: "Day left, hours right, one row per day range, fits 360 px.",
    a11y: "Heading is an h2. table: <table> with row headers for the days.",
  },
  z.strictObject({
    eyebrow: head.eyebrow,
    title: head.title,
    note: text(200).optional().describe("e.g. how to book outside opening hours; not the hours themselves"),
  }),
);

export const contactSection = defineSection(
  {
    type: "contact",
    group: "business",
    variants: ["split-map", "stacked"],
    description:
      "Contact details from the business facts: click-to-call phone, email, address with a directions link, opening hours, and a map that loads only after the visitor clicks. split-map: details beside the map on desktop. stacked: details in columns, map below. No form.",
    images: "none",
    mobile: "Details first, each link at least 44 px tall; call and directions buttons full width; the map placeholder follows.",
    a11y: "Heading is an h2. Details are a <dl>. The map is a button-activated embed (no third-party request before the click) with a plain link to Google Maps.",
  },
  z.strictObject({
    ...head,
  }),
);

export const faqSection = defineSection(
  {
    type: "faq",
    group: "business",
    variants: ["accordion", "list"],
    description:
      "Two to twelve questions and answers from the client's input. accordion: native disclosure widgets, answers hidden until opened. list: every answer visible, question beside answer on desktop.",
    images: "none",
    mobile: "One column; each question is a tap target at least 44 px tall with a visible open/closed marker.",
    a11y: "Heading is an h2; each question an h3. accordion uses <details>/<summary> (keyboard and screen reader support without JS).",
  },
  z.strictObject({
    ...head,
    items: z
      .array(z.strictObject({ question: text(140), answer: text(600) }))
      .min(2)
      .max(12),
  }),
);

export const teamSection = defineSection(
  {
    type: "team",
    group: "business",
    variants: ["grid", "list"],
    description:
      "People who work there: name, role, optional short bio and portrait. grid: portraits in a grid. list: one person per row with a small portrait. Names only from the client's input, otherwise a name placeholder.",
    images: "optional",
    mobile: "grid: two portraits per row. list: small portrait beside name and role.",
    a11y: "Heading is an h2; each person's name an h3. Portrait alt text comes from the asset.",
  },
  z.strictObject({
    ...head,
    members: z
      .array(
        z.strictObject({
          name: orPlaceholder(text(60)).describe("Never invent a name; use a name placeholder when the brief has none"),
          role: text(60),
          bio: text(240).optional(),
          image: ImageRef.optional(),
        }),
      )
      .min(1)
      .max(12),
  }),
);

export const gallerySection = defineSection(
  {
    type: "gallery",
    group: "business",
    variants: ["grid", "mosaic"],
    description:
      "Two to sixteen photos with optional captions; tapping a photo opens a larger view. grid: even tiles. mosaic: photos at their natural proportions in columns. Use for interiors, dishes, finished work or the farm.",
    images: "required",
    mobile: "Two columns at 360 px; mosaic keeps each photo's proportions so nothing is cropped awkwardly.",
    a11y: "Heading is an h2. Each photo is a link to the large image (works without JS); with JS it opens a modal <dialog> with labelled previous, next and close buttons; Escape closes and focus returns.",
  },
  z.strictObject({
    ...head,
    images: z
      .array(z.strictObject({ image: ImageRef, caption: text(120).optional() }))
      .min(2)
      .max(16),
  }),
);

export const productsSection = defineSection(
  {
    type: "products",
    group: "business",
    variants: ["grid", "list"],
    description:
      "Shop or bakery products: name, optional description, price, quantity and photo. grid: product cards with photos. list: compact rows with a small photo. Only products and prices from the client's input.",
    images: "optional",
    mobile: "grid: two products per row. list: one per row, price aligned right.",
    a11y: "Heading is an h2; each product name an h3 inside a list. Prices use tabular numbers.",
  },
  z.strictObject({
    ...head,
    items: z
      .array(
        z.strictObject({
          name: text(60),
          description: text(160).optional(),
          price: Price.optional().describe(PRICE_RULE),
          unit: text(30).optional().describe('Package size or quantity, e.g. "500 g", "kos"'),
          image: ImageRef.optional(),
        }),
      )
      .min(1)
      .max(24),
  }),
);

export const roomsSection = defineSection(
  {
    type: "rooms",
    group: "business",
    variants: ["cards", "rows"],
    description:
      "Rooms, apartments or offers of a tourist farm: name, description, capacity, features, price and an optional booking link. cards: two per row on desktop. rows: photo beside text, one per row.",
    images: "optional",
    mobile: "One per row: photo first, then name, capacity, features and price.",
    a11y: "Heading is an h2; each room name an h3. Features are a list.",
  },
  z.strictObject({
    ...head,
    items: z
      .array(
        z.strictObject({
          name: text(60),
          description: text(300),
          capacity: z.number().int().min(1).max(20).optional().describe("Number of guests, only if given"),
          features: z.array(text(40)).max(8).optional(),
          price: Price.optional().describe(`${PRICE_RULE} Use unit, e.g. "na noč".`),
          image: ImageRef.optional(),
          link: Link.optional(),
        }),
      )
      .min(1)
      .max(8),
  }),
);

export const serviceAreaSection = defineSection(
  {
    type: "service-area",
    group: "business",
    variants: ["list", "inline"],
    description:
      "Where a builder or installer works. The places come from the business facts (serviceArea), never from props. list: places in columns. inline: one line of places. Optional action, e.g. a call link.",
    images: "none",
    mobile: "list: two columns of places; inline: wraps naturally.",
    a11y: "Heading is an h2; places are a list.",
  },
  z.strictObject({
    ...head,
    action: Link.optional(),
  }),
);

export const businessSchemas = [
  servicesList.schema,
  servicesCards.schema,
  priceList.schema,
  menuSection.schema,
  openingHoursSection.schema,
  contactSection.schema,
  faqSection.schema,
  teamSection.schema,
  gallerySection.schema,
  productsSection.schema,
  roomsSection.schema,
  serviceAreaSection.schema,
] as const;

export const businessDefs = [
  servicesList,
  servicesCards,
  priceList,
  menuSection,
  openingHoursSection,
  contactSection,
  faqSection,
  teamSection,
  gallerySection,
  productsSection,
  roomsSection,
  serviceAreaSection,
];
