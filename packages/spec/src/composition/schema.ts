/**
 * The composition language (spec v19, docs/plans/ai-designer-spec.md §2, docs/plans/design-studio.md §7): a section the
 * designer composes from elements placed on a grid, instead of picking one of the fixed section variants.
 *
 * Desktop (from 64 rem): a 12-column grid with `rows` rows; every element has a desktop place (column, span, row, row
 * span, layer, alignment, a small shift for controlled overlap). Phones: elements stack by `phone.order` on a 4-column
 * grid; `half` elements pair up two to a row. A phone place is required for every element, never inferred.
 *
 * Only shapes live here. The rules a schema can't say (text never overlaps text, contrast over photos, one primary action
 * per screen, the banned list where it is structural, facts only from the client …) are `validateComposition` and
 * `repairComposition` in ./guards.ts, run by validateSite.
 *
 * Every discriminator is a one-value z.enum, not z.literal: the compact catalogue's notation knows `enum`, not `const`.
 */
import { z } from "zod";
import { ImageRef, Link, Price, text } from "../common.ts";
import { MOTIFS } from "../design.ts";
import { INTENTS } from "../intents-list.ts";

/** A colour role from design.colors. Elements never carry a hex value. */
export const ColorRole = z.enum(["background", "surface", "text", "muted", "primary", "onPrimary", "accent", "border", "inverse", "onInverse", "band", "onBand"]);
export type ColorRole = z.infer<typeof ColorRole>;

export const GRID_COLUMNS = 12;
export const MAX_ROWS = 8;
export const MAX_ELEMENTS = 12;

const AlignX = z.enum(["start", "center", "end", "stretch"]);
const AlignY = z.enum(["start", "center", "end", "stretch"]);

/** Where an element sits on the desktop grid. Shifts are steps of the spacing scale, for controlled overlap. */
export const Place = z.strictObject({
  col: z.number().int().min(1).max(GRID_COLUMNS).describe("First column, 1–12"),
  span: z.number().int().min(1).max(GRID_COLUMNS).describe("Columns spanned; col + span − 1 ≤ 12"),
  row: z.number().int().min(1).max(MAX_ROWS),
  rowSpan: z.number().int().min(1).max(MAX_ROWS).optional().describe("Default 1; row + rowSpan − 1 ≤ the section's rows"),
  layer: z.number().int().min(0).max(3).optional().describe("Stacking order where elements overlap; default 0"),
  alignX: AlignX.optional(),
  alignY: AlignY.optional(),
  shiftX: z.number().int().min(-2).max(2).optional().describe("Nudge in spacing steps, for a deliberate overlap; text never overlaps text"),
  shiftY: z.number().int().min(-3).max(3).optional(),
});
export type Place = z.infer<typeof Place>;

/** Where an element sits on phones: stacked in `order`; `half` elements pair up two to a row. */
export const PhonePlace = z.strictObject({
  order: z.number().int().min(0).max(20),
  span: z.enum(["full", "inset", "half"]),
  alignX: z.enum(["start", "center", "end"]).optional(),
  hidden: z.boolean().optional().describe("Only decor and a second image may be hidden on phones"),
});
export type PhonePlace = z.infer<typeof PhonePlace>;

export const ElementId = z.string().regex(/^e_[a-z0-9_-]+$/);

const base = { id: ElementId, desk: Place, phone: PhonePlace };

/** Type-scale steps: −1 small … 5 the largest heading size; 6–8 display sizes (clamped to ≤ 12vw desktop, ≤ 15vw phone). */
const SizeStep = z.number().int().min(-1).max(8);

export const HeadingElement = z.strictObject({
  ...base,
  kind: z.enum(["heading"]),
  text: text(90),
  level: z.number().int().min(1).max(3).describe("1 only for the page's main heading; one h1 per page"),
  size: SizeStep,
  weight: z.number().int().min(400).max(900).optional(),
  case: z.enum(["normal", "uppercase"]).optional().describe("Uppercase only at weight ≥ 700 and never as a small tracked eyebrow"),
  rotate: z.enum(["0", "90", "-90"]).optional().describe("Desktop only; phones never rotate"),
  measure: z.enum(["s", "m", "l"]).optional().describe("Line length: s ≈ 12, m ≈ 20, l ≈ 30 characters per line at display sizes"),
});

export const TextElement = z.strictObject({
  ...base,
  kind: z.enum(["text"]),
  paragraphs: z.array(text(600).describe("Plain text from the client's input; no invented facts")).min(1).max(4),
  size: z.number().int().min(0).max(1).optional().describe("0 body, 1 lead"),
});

export const ListElement = z.strictObject({
  ...base,
  kind: z.enum(["list"]),
  items: z.array(text(120)).min(1).max(8),
  marker: z.enum(["none", "rule", "dot"]).optional(),
});

export const FactElement = z.strictObject({
  ...base,
  kind: z.enum(["fact"]),
  value: text(24).describe("A fact from the client's input (a year, a number, a phone, a time); never invented"),
  label: text(60),
  treatment: z.enum(["numeral", "plate", "stamp", "ticket", "seal", "tag"]),
  size: z.number().int().min(2).max(8),
});

export const ImageElement = z.strictObject({
  ...base,
  kind: z.enum(["image"]),
  image: ImageRef,
  ratio: z.enum(["1:1", "4:5", "3:4", "4:3", "3:2", "16:9", "21:9", "fill"]),
  mask: z.enum(["none", "arch", "circle", "cut", "stamp", "ticket"]).optional(),
  treatment: z.enum(["none", "duotone", "tint", "grain"]).optional(),
});

export const ActionElement = z.strictObject({
  ...base,
  kind: z.enum(["action"]),
  action: z.enum(["call", "book", "directions", "link"]),
  label: text(32),
  link: Link.optional().describe("Only for action \"link\""),
  style: z.enum(["primary", "secondary", "text"]),
});

export const HoursElement = z.strictObject({
  ...base,
  kind: z.enum(["hours"]),
  style: z.enum(["table", "compact", "week"]),
});

export const ContactElement = z.strictObject({
  ...base,
  kind: z.enum(["contact"]),
  show: z.array(z.enum(["phone", "email", "address", "map"])).min(1).max(4),
});

export const PricesElement = z.strictObject({
  ...base,
  kind: z.enum(["prices"]),
  items: z
    .array(
      z.strictObject({
        name: text(80),
        note: text(120).optional(),
        price: Price,
        unavailable: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(12),
  style: z.enum(["rows", "plates", "tags"]),
});

/** A small drawing: one path of a sanitised SVG, colours as roles only. */
export const DecorPath = z.strictObject({
  d: z.string().regex(/^[MmLlHhVvCcSsQqTtAaZz0-9 ,.-]{1,2000}$/),
  fill: z.union([ColorRole, z.enum(["none"])]),
  stroke: z.union([ColorRole, z.enum(["none"])]).optional(),
  width: z.number().min(0).max(8).optional(),
});

export const DecorElement = z.strictObject({
  ...base,
  kind: z.enum(["decor"]),
  motif: z.enum(MOTIFS).optional().describe("A motif from the library; or a drawing in svg; exactly one of the two"),
  svg: z
    .strictObject({
      width: z.number().int().min(8).max(400),
      height: z.number().int().min(8).max(400),
      paths: z.array(DecorPath).min(1).max(24),
    })
    .optional(),
});

export const Element = z.discriminatedUnion("kind", [
  HeadingElement,
  TextElement,
  ListElement,
  FactElement,
  ImageElement,
  ActionElement,
  HoursElement,
  ContactElement,
  PricesElement,
  DecorElement,
]);
export type Element = z.infer<typeof Element>;
export type ElementKind = Element["kind"];
export const ELEMENT_KINDS = ["heading", "text", "list", "fact", "image", "action", "hours", "contact", "prices", "decor"] as const satisfies readonly ElementKind[];

/** Intents a composed section may serve: every intent except "system". */
export const ComposedIntent = z.enum(INTENTS.filter((i) => i !== "system") as [Exclude<(typeof INTENTS)[number], "system">, ...Exclude<(typeof INTENTS)[number], "system">[]]);

export const ComposedProps = z.strictObject({
  intent: ComposedIntent.describe("What the section is for; a preset layout of the same intent replaces it if it fails the checks"),
  width: z.enum(["contained", "wide", "full"]),
  minHeight: z.enum(["none", "s", "m", "l", "screen"]).optional().describe("screen = the viewport minus the header, desktop only; phones cap at l"),
  rows: z.number().int().min(1).max(MAX_ROWS),
  gap: z.number().int().min(0).max(6).optional().describe("Steps of the spacing scale; default 3"),
  surface: z
    .strictObject({
      texture: z.enum(["none", "grain", "lines"]).optional(),
      divider: z.enum(["none", "rule", "motif"]).optional(),
    })
    .optional(),
  elements: z.array(Element).min(1).max(MAX_ELEMENTS),
});
export type ComposedProps = z.infer<typeof ComposedProps>;
