import { z } from "zod";
import { ActionElement, ContactElement, DecorElement, FactElement, HeadingElement, HoursElement, ImageElement, ListElement, PricesElement, TextElement } from "./schema.ts";

/**
 * What the owner edits in a composed section (spec v19): each element's copy, in the field definitions of ./schema.ts
 * (same lengths), and nothing of where or how it sits. Heading text, paragraphs, list items, a fact's value and label,
 * an action's label, price items' name, note and price. Placement, sizes, masks, styles, drawings and the intent are
 * the designer's (validateComposition checks them together); the editor's form keeps whatever it doesn't show.
 * Every element kind is a member, those without copy (image, hours, contact, decor) with their kind only, so the
 * form can tell each element's fields by its kind.
 */
const PriceItem = PricesElement.shape.items.element;

export const ComposedCopy = z.strictObject({
  elements: z.array(
    z.discriminatedUnion("kind", [
      HeadingElement.pick({ kind: true, text: true }),
      TextElement.pick({ kind: true, paragraphs: true }),
      ListElement.pick({ kind: true, items: true }),
      FactElement.pick({ kind: true, value: true, label: true }),
      ImageElement.pick({ kind: true }),
      ActionElement.pick({ kind: true, label: true }),
      HoursElement.pick({ kind: true }),
      ContactElement.pick({ kind: true }),
      PricesElement.pick({ kind: true }).extend({ items: z.array(PriceItem.pick({ name: true, note: true, price: true })).min(1).max(12) }),
      DecorElement.pick({ kind: true }),
    ]),
  ),
});
