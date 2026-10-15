import type { Business, Page, Section } from "@sb/spec";

/** Which of the visit facts (the full address, the opening hours) a page's sections already show. */
export interface PageFacts {
  address: boolean;
  hours: boolean;
}

/**
 * What one section renders of the address and the hours, by its type and variant (the components that render them:
 * Info.tsx Contact and OpeningHours, ContactStrip, HeroType with-facts, HeroSignature photo's strip, Booking
 * with-hours, and composed hours, contact-with-address and map elements). Keep this in step with those components:
 * the footer reads it to say each thing once (the 50-page review found address and hours printed two or three times).
 */
export function sectionFacts(section: Section, business: Business): PageFacts {
  const hasHours = business.hours !== undefined;
  switch (section.type) {
    case "contact":
      return { address: true, hours: hasHours };
    case "contact-strip":
      return { address: true, hours: hasHours };
    case "opening-hours":
      return { address: false, hours: true };
    case "hero-type":
      return section.variant === "with-facts" ? { address: true, hours: hasHours } : { address: false, hours: false };
    case "hero-signature":
      return section.variant === "photo" ? { address: true, hours: hasHours } : { address: false, hours: false };
    case "booking":
      return { address: false, hours: section.variant === "with-hours" && hasHours };
    case "composed": {
      const els = section.props.elements;
      return {
        address: els.some((el) => el.kind === "map" || (el.kind === "contact" && el.show.includes("address"))),
        hours: els.some((el) => el.kind === "hours"),
      };
    }
    default:
      return { address: false, hours: false };
  }
}

/** The visit facts the sections above this one show (a later contact block leaves those out: say each thing once). */
export function factsAbove(page: Page, sectionId: string, business: Business): PageFacts {
  const out: PageFacts = { address: false, hours: false };
  for (const s of page.sections) {
    if (s.id === sectionId) break;
    const f = sectionFacts(s, business);
    out.address ||= f.address;
    out.hours ||= f.hours;
  }
  return out;
}

/**
 * What a contact block (contact, contact-strip) leaves out to say each thing once: what a section above it showed,
 * and the hours when the page has its own opening-hours section (that section is where the hours live).
 */
export function shownElsewhere(page: Page, sectionId: string, business: Business): PageFacts {
  const above = factsAbove(page, sectionId, business);
  return { address: above.address, hours: above.hours || page.sections.some((s) => s.type === "opening-hours" && s.id !== sectionId) };
}

/** The visit facts any section of the page shows. */
export function pageFacts(page: Page, business: Business): PageFacts {
  const out: PageFacts = { address: false, hours: false };
  for (const s of page.sections) {
    const f = sectionFacts(s, business);
    out.address ||= f.address;
    out.hours ||= f.hours;
  }
  return out;
}
