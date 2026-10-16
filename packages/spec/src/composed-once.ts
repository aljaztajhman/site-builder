import type { SiteSpec } from "./site.ts";
import type { Business } from "./business.ts";
import type { Element } from "./composition/schema.ts";
import { isPlaceholder } from "./common.ts";
import { sentenceKey, sentences } from "./text-once.ts";
import { issueKeys, noNewIssues } from "./repair-util.ts";

/**
 * The Review 50 rules on composed sections (the studio's homepages, 2026-10-15: the shoot-out's composed pages drew
 * 57–65 reviewer blockers against today's 9, the same defects Review 50 removed from preset sections). Like
 * images-once.ts and text-once.ts this is not part of validateSite: an owner keeps what they placed. The studio repairs
 * its freshly built homepage in code (engine studio/page-rules.ts) and reports what is left.
 *
 * - The hours note at most once: a composed hours element prints business.hours.note, so a text element of the same
 *   section loses the note's sentences (any length, as OpeningHours reads it).
 * - Each way to reach the business at most once per section: a map element prints the address and its directions
 *   link, so a contact element beside it leaves out its address and map; a fact element that shows the phone, so a
 *   contact element beside it leaves out the phone.
 * - No empty section: a heading with nothing under it, or a content section (prices, products, services…) that is a
 *   heading and a short line, goes.
 */

type Section = SiteSpec["pages"][number]["sections"][number];
type Composed = Extract<Section, { type: "composed" }>;

const isComposed = (s: Section): s is Composed => s.type === "composed";

const digits = (s: string) => s.replace(/\D/g, "");

/**
 * Whether a composed fact element shows the business phone: a number of six digits or more that is linked to a call,
 * or whose last eight digits are the phone's (the client writes "070 555 418" for +38670555418).
 */
export function factShowsPhone(el: Element, business: Pick<Business, "phone">): boolean {
  if (el.kind !== "fact") return false;
  const d = digits(el.value);
  if (d.length < 6) return false;
  if (el.link && "action" in el.link && el.link.action === "call") return true;
  const phone = business.phone;
  return !!phone && !isPlaceholder(phone) && digits(phone).slice(-8) === d.slice(-8);
}

/** Tries `edit` on the section; keeps it when the spec is as valid as before, else puts the section back. */
function tryEdit(spec: SiteSpec, section: Composed, edit: (props: Composed["props"]) => void): boolean {
  const before = issueKeys(spec);
  const snapshot = structuredClone(section.props);
  edit(section.props);
  if (noNewIssues(before, issueKeys(spec))) return true;
  section.props = snapshot;
  return false;
}

/**
 * Text elements of a composed section with an hours element lose the hours note's sentences (the hours print it); a
 * paragraph left empty goes, and an element left without one goes. Returns what was repaired.
 */
export function repairComposedHoursNotes(spec: SiteSpec): string[] {
  const log: string[] = [];
  const hours = spec.business.hours;
  if (!hours || isPlaceholder(hours) || !hours.note) return log;
  const said = new Set(sentences(hours.note).map(sentenceKey));
  spec.pages.forEach((p, pi) =>
    p.sections.forEach((s, si) => {
      if (!isComposed(s) || !s.props.elements.some((e) => e.kind === "hours")) return;
      for (const el of [...s.props.elements]) {
        if (el.kind !== "text") continue;
        const kept = el.paragraphs.map((t) => sentences(t).filter((x) => !said.has(sentenceKey(x))).join(" ")).filter(Boolean);
        if (kept.length === el.paragraphs.length && kept.every((t, i) => t === el.paragraphs[i])) continue;
        const ok = tryEdit(spec, s, (props) => {
          const at = props.elements.findIndex((e) => e.id === el.id);
          if (kept.length) (props.elements[at] as typeof el).paragraphs = kept;
          else props.elements.splice(at, 1);
        });
        log.push(`/pages/${pi}/sections/${si} ${el.id}: the hours print their note; ${ok ? (kept.length ? "left out its sentences" : "dropped the text") : "left it (the section needs it)"}`);
      }
    }),
  );
  return log;
}

/** What a contact element repeats of its section: the address and map beside a map element, the phone beside a phone fact. */
function contactRepeats(els: readonly Element[], business: Pick<Business, "phone">): Set<string> {
  const out = new Set<string>();
  if (els.some((e) => e.kind === "map")) {
    out.add("address");
    out.add("map");
  }
  if (els.some((e) => factShowsPhone(e, business))) out.add("phone");
  return out;
}

/** The contact elements' entries their section already shows elsewhere, one line each (the check without the repair). */
export function repeatedContactLines(spec: SiteSpec, pi: number): string[] {
  const out: string[] = [];
  spec.pages[pi]?.sections.forEach((s, si) => {
    if (!isComposed(s)) return;
    const dup = contactRepeats(s.props.elements, spec.business);
    for (const el of s.props.elements) if (el.kind === "contact") for (const w of el.show.filter((x) => dup.has(x))) out.push(`/pages/${pi}/sections/${si} ${el.id}: ${w} is shown twice in the section`);
  });
  return out;
}

/**
 * Contact elements leave out what their section already shows (a map element: the address and the directions link; a
 * phone fact: the phone); one left with nothing to show goes. Returns what was repaired (and what was left).
 */
export function repairComposedContact(spec: SiteSpec): string[] {
  const log: string[] = [];
  spec.pages.forEach((p, pi) =>
    p.sections.forEach((s, si) => {
      if (!isComposed(s)) return;
      const dup = contactRepeats(s.props.elements, spec.business);
      for (const el of [...s.props.elements]) {
        if (el.kind !== "contact" || !el.show.some((w) => dup.has(w))) continue;
        const show = el.show.filter((w) => !dup.has(w));
        const what = el.show.filter((w) => dup.has(w)).join(", ");
        const ok = tryEdit(spec, s, (props) => {
          const at = props.elements.findIndex((e) => e.id === el.id);
          if (show.length) (props.elements[at] as typeof el).show = show;
          else props.elements.splice(at, 1);
        });
        log.push(`/pages/${pi}/sections/${si} ${el.id}: ${what} shown in the section already; ${ok ? (show.length ? "dropped it here" : "dropped the contact element") : "left it (the section needs it)"}`);
      }
    }),
  );
  return log;
}

/** Visit facts (the address, the opening hours in full) a section shows. */
interface Visit {
  address: boolean;
  hours: boolean;
}

/** Whether a composed text or heading element spells out the address in full (the street, the postcode and town: as the browser check, engine repeatedContact, reads it). */
function saysAddress(el: Element, business: Business): boolean {
  const a = business.address;
  if (!a || isPlaceholder(a) || (el.kind !== "text" && el.kind !== "heading")) return false;
  const norm = (s: string) => s.replace(/[\s,]+/g, " ").trim().toLowerCase();
  const text = norm(el.kind === "text" ? el.paragraphs.join(" ") : el.text);
  return text.includes(norm(a.street)) && text.includes(norm(`${a.postalCode} ${a.city}`));
}

/** The composed elements that show a visit fact in full: hours elements; map, contact-with-address and address text. */
function visitElements(els: readonly Element[], business: Business): { el: Element; fact: keyof Visit }[] {
  const out: { el: Element; fact: keyof Visit }[] = [];
  for (const el of els) {
    if (el.kind === "hours") out.push({ el, fact: "hours" });
    else if (el.kind === "map" || (el.kind === "contact" && el.show.includes("address")) || saysAddress(el, business)) out.push({ el, fact: "address" });
  }
  return out;
}

/**
 * What a preset section shows of the visit facts after it (a contact block leaves out what a section above showed, so
 * after it both are on the page); kept in step with @sb/components page-facts.ts sectionFacts.
 */
function presetVisit(s: Section, business: Business): Visit {
  const hasHours = business.hours !== undefined;
  switch (s.type) {
    case "contact":
    case "contact-strip":
      return { address: true, hours: hasHours };
    case "opening-hours":
      return { address: false, hours: true };
    case "hero-type":
      return s.variant === "with-facts" ? { address: true, hours: hasHours } : { address: false, hours: false };
    case "hero-signature":
      return s.variant === "photo" ? { address: true, hours: hasHours } : { address: false, hours: false };
    case "booking":
      return { address: false, hours: s.variant === "with-hours" && hasHours };
    default:
      return { address: false, hours: false };
  }
}

/** Each composed element of page `pi` that shows the address or the hours in full again, below a section that showed it. */
function visitRepeats(spec: SiteSpec, pi: number): { si: number; el: Element; fact: keyof Visit }[] {
  const shown: Visit = { address: false, hours: false };
  const out: { si: number; el: Element; fact: keyof Visit }[] = [];
  spec.pages[pi]?.sections.forEach((s, si) => {
    if (!isComposed(s)) {
      const v = presetVisit(s, spec.business);
      shown.address ||= v.address;
      shown.hours ||= v.hours;
      return;
    }
    const here: Visit = { address: false, hours: false };
    for (const v of visitElements(s.props.elements, spec.business)) {
      if (shown[v.fact]) out.push({ si, ...v });
      here[v.fact] = true;
    }
    shown.address ||= here.address;
    shown.hours ||= here.hours;
  });
  return out;
}

/** The address or hours a page shows in full in more than one section, one line per later copy (the check). */
export function repeatedVisitLines(spec: SiteSpec, pi: number): string[] {
  return visitRepeats(spec, pi).map((r) => `/pages/${pi}/sections/${r.si} ${r.el.id}: the ${r.fact === "hours" ? "opening hours" : "address"} shown in full higher on the page`);
}

/**
 * The address and the opening hours in full once per page (docs/PRODUCT.md banned patterns): a composed element that
 * shows one again below a section that showed it loses it (a contact element its address and map, any other element
 * goes). Returns what was repaired (and what was left).
 */
export function repairRepeatedVisit(spec: SiteSpec): string[] {
  const log: string[] = [];
  spec.pages.forEach((p, pi) => {
    for (const r of visitRepeats(spec, pi).reverse()) {
      const s = p.sections[r.si] as Composed;
      const what = r.fact === "hours" ? "opening hours" : "address";
      const ok = tryEdit(spec, s, (props) => {
        const at = props.elements.findIndex((e) => e.id === r.el.id);
        const el = props.elements[at]!;
        const show = el.kind === "contact" ? el.show.filter((w) => w !== "address" && w !== "map") : [];
        if (el.kind === "contact" && show.length) el.show = show;
        else props.elements.splice(at, 1);
      });
      log.push(`/pages/${pi}/sections/${r.si} ${r.el.id}: the ${what} is shown in full higher on the page; ${ok ? "dropped it here" : "left it (the section needs it)"}`);
    }
  });
  return log;
}

/** Elements that only frame a section: a section of these alone says nothing. */
const FRAME: ReadonlySet<Element["kind"]> = new Set(["heading", "decor", "action", "wordmark", "sticker", "ribbon"]);

/** Intents whose section is a list of things (a price list, the services, the rooms): a heading and a short line are not one. */
const LISTING = new Set(["services", "products", "menu", "rooms", "prices", "gallery", "faq", "team", "steps", "area", "highlights"]);

/** Fewer words than this in a listing section's text, with nothing else under its heading, is a section with no content. */
export const THIN_SECTION_WORDS = 25;

/** Intents that may be short by design: the opener, the call to act, a notice, and the visit facts. */
const SHORT_OK = new Set(["hero", "call", "notice", "contact", "hours"]);

/**
 * Why a composed section has no content, or null: one heading with nothing under it, or a listing section (prices,
 * products, services…) whose only content is one heading's text of fewer than THIN_SECTION_WORDS words. A section with
 * several headings is never empty (items set as a heading and a line each, or as headings alone, are a list).
 */
export function thinSection(s: Section): string | null {
  if (!isComposed(s) || SHORT_OK.has(s.props.intent)) return null;
  const content = s.props.elements.filter((e) => !FRAME.has(e.kind));
  // Several headings are items set large (four statements as a band), not a title over nothing.
  if (s.props.elements.filter((e) => e.kind === "heading").length > 1) return null;
  if (!content.length) return "nothing under its heading";
  if (!LISTING.has(s.props.intent) || content.some((e) => e.kind !== "text")) return null;
  const words = content.flatMap((e) => (e.kind === "text" ? e.paragraphs : [])).join(" ").split(/\s+/).filter(Boolean).length;
  return words < THIN_SECTION_WORDS ? `a ${s.props.intent} section with only ${words} words of text` : null;
}

/** The empty sections of page `pi`, one line each (the check without the repair). */
export function thinSectionLines(spec: SiteSpec, pi: number): string[] {
  return (spec.pages[pi]?.sections ?? []).flatMap((s, si) => {
    const why = thinSection(s);
    return why ? [`/pages/${pi}/sections/${si} (${s.id}): ${why}`] : [];
  });
}

/**
 * Drops the empty composed sections (never a page's first) where the spec stays as valid. Its neighbours then meet: when
 * the next one's top edge can't follow the previous one's divider, the next one's edge goes too. Returns what was
 * repaired (and what was left).
 */
export function repairThinSections(spec: SiteSpec): string[] {
  const log: string[] = [];
  spec.pages.forEach((p, pi) => {
    for (let si = p.sections.length - 1; si > 0; si--) {
      const s = p.sections[si]!;
      const why = thinSection(s);
      if (!why) continue;
      const before = issueKeys(spec);
      const next = p.sections[si + 1];
      const nextProps = next && isComposed(next) ? structuredClone(next.props) : undefined;
      p.sections.splice(si, 1);
      let ok = noNewIssues(before, issueKeys(spec));
      if (!ok && next && isComposed(next) && next.props.top !== undefined) {
        delete next.props.top;
        ok = noNewIssues(before, issueKeys(spec));
      }
      if (ok) {
        log.push(`/pages/${pi}/sections/${si} (${s.id}): ${why}; dropped the section${nextProps?.top !== undefined && next && isComposed(next) && next.props.top === undefined ? ` (and ${next.id}'s top edge)` : ""}`);
        continue;
      }
      if (next && isComposed(next) && nextProps) next.props = nextProps;
      p.sections.splice(si, 0, s);
      log.push(`/pages/${pi}/sections/${si} (${s.id}): ${why}; left it (the page needs it)`);
    }
  });
  return log;
}
