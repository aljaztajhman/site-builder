/**
 * Section intents (docs/plans/variety-engine.md, Step 5): what a section is for (the services, the prices, the story, the
 * hours, the way to get in touch …), apart from how it is laid out. A section's content is written for its intent; its
 * layout is one of the intent's type:variant pairs that takes the same props. A new look can then move a section to
 * another layout of its intent without a content call (`asLayout`), wherever the other layout's (strict) schema takes
 * the props exactly as they are.
 *
 * What still needs content (a model call) to change layout:
 * - a trade template's signature hero (hero-signature): each variant reads its props differently (the plate, the
 *   receipt, the label …), and its motif belongs to its template;
 * - a type-only hero to a photo hero (it has no picture) and back where the target needs facts or texts the section lacks;
 * - layouts whose props differ: services-list ↔ services-cards, about ↔ image-text, contact ↔ contact-strip and the like
 *   share an intent but not a schema, so they are listed as one intent for the content step and are not swapped in code.
 */
import { sectionDef, type Section } from "./sections/index.ts";

export { INTENTS, type Intent } from "./intents-list.ts";
import type { Intent } from "./intents-list.ts";

/** Every section type's intent. A test checks that every section type has one. */
export const SECTION_INTENT: Record<string, Intent> = {
  "hero-split": "hero",
  "hero-image": "hero",
  "hero-type": "hero",
  "hero-signature": "hero",
  "page-header": "page-head",
  text: "story",
  about: "story",
  "image-text": "story",
  highlights: "highlights",
  steps: "steps",
  cta: "call",
  booking: "booking",
  "services-list": "services",
  "services-cards": "services",
  "price-list": "prices",
  menu: "menu",
  "opening-hours": "hours",
  contact: "contact",
  "contact-strip": "contact",
  "contact-form": "form",
  faq: "faq",
  team: "team",
  gallery: "gallery",
  products: "products",
  rooms: "rooms",
  "service-area": "area",
  announcement: "notice",
  collection: "collection",
  // Spec v19: a composed section carries its own intent (props.intent); intentOfSection reads it. "story" is only the
  // type-level default for code that has a type and no section.
  composed: "story",
  legal: "system",
  "not-found": "system",
};

export function intentOf(type: string): Intent | undefined {
  return SECTION_INTENT[type];
}

/** A section's intent: a composed section's own, otherwise its type's. */
export function intentOfSection(section: Section): Intent | undefined {
  if (section.type === "composed") return section.props.intent;
  return SECTION_INTENT[section.type];
}

/** Layouts that read their props by variant (validate.ts): never swapped in code. */
const OWN_READING: readonly string[] = ["hero-signature"];

/** Rules validate.ts holds per variant that the schema doesn't: a swap must keep them. */
function variantFits(s: Section): boolean {
  if (s.type === "services-list") {
    const props = s.props as { note?: unknown; items: { description?: unknown }[] };
    if (s.variant !== "aside") return props.note === undefined && props.items.every((i) => i.description !== undefined);
  }
  return true;
}

/**
 * The section in another layout of its intent ("type:variant") with exactly the same id, tone and props, or null when
 * that would lose or need anything: the target's strict schema must take the props as they are, and per-variant rules
 * must still hold. The section itself when it already has that layout.
 */
export function asLayout(section: Section, target: string): Section | null {
  if (`${section.type}:${section.variant}` === target) return section;
  const [type, variant] = target.split(":");
  if (!type || !variant) return null;
  if (OWN_READING.includes(type) || OWN_READING.includes(section.type)) return null;
  const intent = intentOf(section.type);
  if (!intent || intent === "system" || intentOf(type) !== intent) return null;
  let def;
  try {
    def = sectionDef(type);
  } catch {
    return null;
  }
  if (!def.variants.includes(variant)) return null;
  const next = { ...section, type, variant } as unknown as Section;
  const parsed = def.schema.safeParse(next);
  return parsed.success && variantFits(next) ? next : null;
}

/** Every layout ("type:variant") of the section's intent it can take without new content, its own first. */
export function layoutsFor(section: Section): string[] {
  const own = `${section.type}:${section.variant}`;
  const intent = intentOf(section.type);
  if (!intent) return [own];
  const types = Object.entries(SECTION_INTENT)
    .filter(([, i]) => i === intent)
    .map(([t]) => t);
  const out = [own];
  for (const t of types) {
    let def;
    try {
      def = sectionDef(t);
    } catch {
      continue;
    }
    for (const v of def.variants) {
      const key = `${t}:${v}`;
      if (key !== own && asLayout(section, key)) out.push(key);
    }
  }
  return out;
}
