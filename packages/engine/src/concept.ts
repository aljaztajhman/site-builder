/**
 * The concept (docs/plans/variety-engine.md, Step 3), behind config `variety.concept`: what makes this business itself.
 * The brief call adds the business's subtype, its main goal, its angle, the one fact worth turning into the page's
 * signature object, the materials it names and its local anchor. Code then:
 * - drops what the client's text doesn't support (verifyConcept: materials and the anchor must be in the text, the
 *   signature fact must be a fact the client gave, the subtype a kind of the business type);
 * - picks a homepage blueprint by the goal (call-first, book-first, browse-first, visit-first, story-first), which
 *   replaces the template's one fixed outline;
 * - picks a signature device by the signature fact and the materials, not by the trade;
 * - lets the subtype pick the drawn motif (spec siteMotif) and tells the design step.
 * With the switch off none of this runs and every request is today's.
 */
import { z } from "zod";
import {
  BusinessSubtype,
  SECTION_DEFS,
  SUBTYPE_MOTIF,
  outlineSlots,
  subtypeFits,
  subtypesOf,
  type BusinessType,
  type Direction,
  type OutlineSlot,
} from "@sb/spec";
import { fold } from "./fact-pairing.ts";
import type { Brief, Dropped } from "./brief.ts";

export const GOALS = ["call", "book", "visit", "browse", "order", "enquire"] as const;
export type Goal = (typeof GOALS)[number];
export const ANGLES = ["family-history", "speciality", "speed", "place", "craft", "value", "person"] as const;
export const SIGNATURE_FACTS = ["phone", "hours", "founding-year", "price", "distance", "rooms", "place", "none"] as const;
export type SignatureFact = (typeof SIGNATURE_FACTS)[number];

/** The brief's concept (only in a brief made with the switch on). */
export const Concept = z.strictObject({
  subtype: BusinessSubtype.nullable().describe("The trade within the business type: one of the subtypes the message lists for this type, only when the client's text clearly says it; else null"),
  goal: z.enum(GOALS).describe("The one thing most visitors should do"),
  angle: z.enum(ANGLES).describe("What the client's own text leans on most"),
  signatureFact: z.enum(SIGNATURE_FACTS).describe("The one fact the client gave that is worth turning into the page's signature object; none when the client gave none of these"),
  materials: z.array(z.string().max(40)).max(5).describe("3 to 5 nouns the client's text names: materials, tools, ingredients or products, in Slovene as written there"),
  localAnchor: z.string().max(60).nullable().describe("The town, valley or landmark the client names, as written; else null"),
});
export type Concept = z.infer<typeof Concept>;

/** The brief system's concept rules (a second system block, only with the switch on). */
export const BRIEF_CONCEPT_SYSTEM = `Concept rules (the concept decides the homepage's structure and its one signature object; it never adds facts):
- subtype: the trade within the business type, only one of the subtypes the message lists, and only when the client's text clearly says it (an electrician, a roofer, a florist). Otherwise null.
- goal: the one thing most visitors should do. call: they phone (a tradesperson, a repair shop). book: an appointment or a table. visit: they come to the shop, farm or restaurant. browse: they look through the range, menu or rooms first. order: they order products ahead. enquire: they ask for an offer or a quote.
- angle: what the client's own text leans on most. family-history, speciality, speed (quick, available, the same day), place (the town, the valley, the view), craft (how it is made, the material), value (the price), person (the owner themself).
- signatureFact: the one fact the client gave that is worth turning into an object on the page: phone, hours, founding-year (only a year the client wrote), price (only a price the client gave), distance (only a distance or travel time the client wrote), rooms (rooms or beds the client lists), place (a town, valley or landmark the client names). none when the client gave none of these.
- materials: 3 to 5 nouns for the materials, tools, ingredients or products the client's text names, in Slovene as written there. Fewer when the text names fewer; never add one.
- localAnchor: the town, valley or landmark the client names, as written there; else null.`;

/** The brief message's concept line: the subtypes the business type has (only with the switch on). */
export function conceptLine(businessType: BusinessType): string {
  const subs = subtypesOf(businessType);
  return `Subtypes for ${businessType}: ${subs.length ? subs.join(", ") : "none (subtype null)"}.`;
}

/** Words in folded text, for matching a client's noun in its Slovene forms ("hrastov les" ~ "hrastovega lesa"). */
const words = (s: string): string[] => fold(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** The stem a noun is matched by: the word without its last letters (Slovene case endings), at least 3 letters. */
function stem(word: string): string {
  return word.length <= 4 ? word : word.slice(0, Math.max(3, word.length - 2));
}

/** Whether every word of `phrase` (3 letters or more) appears in the text in some form. */
export function inClientText(phrase: string, text: string): boolean {
  const have = words(text);
  const need = words(phrase).filter((w) => w.length >= 3);
  return need.length > 0 && need.every((w) => have.some((h) => h.startsWith(stem(w))));
}

const YEAR = /(?<!\d)(1[89]\d{2}|20[0-2]\d)(?!\d)/;
const DISTANCE = /\d+(?:[.,]\d+)?\s*(?:km|kilometr\w*|m\b|metr\w*|min\b|minut\w*)/;
const ROOMS = /(?<!\p{L})(?:sob[aeoi]?|sobami|apartma\w*|lezisc\w*)(?!\p{L})/u;

/** Whether the client gave the signature fact (in the verified brief or in their own text). */
function supported(fact: SignatureFact, brief: Brief, text: string, anchor: string | null): boolean {
  const t = fold(text);
  switch (fact) {
    case "phone":
      return brief.facts.phone !== null;
    case "hours":
      return brief.facts.hours !== null;
    case "price":
      return brief.offerings.some((o) => o.price !== null);
    case "founding-year":
      return YEAR.test(t);
    case "distance":
      return DISTANCE.test(t);
    case "rooms":
      return ROOMS.test(t);
    case "place":
      return anchor !== null || brief.facts.address !== null;
    case "none":
      return true;
  }
}

/**
 * Drops what the client's text doesn't support: a subtype of another type, materials and an anchor not in the text, a
 * signature fact the client didn't give (it becomes "none"). Returns the cleaned concept and what was dropped.
 */
export function verifyConcept(concept: Concept, brief: Brief, sourceText: string): { concept: Concept; dropped: Dropped[] } {
  const dropped: Dropped[] = [];
  const c: Concept = structuredClone(concept);
  if (c.subtype !== null && !subtypeFits(brief.businessType, c.subtype)) {
    dropped.push({ field: "concept.subtype", value: c.subtype });
    c.subtype = null;
  }
  const seen = new Set<string>();
  c.materials = c.materials.filter((m) => {
    const key = words(m).join(" ");
    const keep = inClientText(m, sourceText) && !seen.has(key);
    seen.add(key);
    if (!keep) dropped.push({ field: "concept.materials", value: m });
    return keep;
  });
  if (c.localAnchor !== null && !inClientText(c.localAnchor, sourceText)) {
    dropped.push({ field: "concept.localAnchor", value: c.localAnchor });
    c.localAnchor = null;
  }
  if (!supported(c.signatureFact, brief, sourceText, c.localAnchor)) {
    dropped.push({ field: "concept.signatureFact", value: c.signatureFact });
    c.signatureFact = "none";
  }
  return { concept: c, dropped };
}

// ---------- Homepage blueprints by goal ----------

export const BLUEPRINTS = ["call-first", "book-first", "browse-first", "visit-first", "story-first"] as const;
export type Blueprint = (typeof BLUEPRINTS)[number];

/** The blueprint for a concept: the goal decides; a story told by the family or the owner leads when nobody needs to call or book first. */
export function blueprintFor(c: Pick<Concept, "goal" | "angle">): Blueprint {
  if (c.goal === "call") return "call-first";
  if (c.goal === "book") return "book-first";
  if (c.goal === "enquire" || c.angle === "family-history" || c.angle === "person") return "story-first";
  if (c.goal === "visit") return "visit-first";
  return "browse-first";
}

interface BlueprintPlace {
  /** Section types that can fill this place, the first the blueprint's own. */
  types: string[];
  note: string;
}

/** What comes between the hero and the closing call, top to bottom; every place is optional (it needs facts). */
const BLUEPRINT_PLACES: Record<Blueprint, BlueprintPlace[]> = {
  "call-first": [
    { types: ["services-list", "services-cards"], note: "every service the client lists, a short name and one plain line each" },
    { types: ["service-area"], note: "where the client works (the places come from the business facts)" },
    { types: ["steps"], note: "how a job goes, from the client's own words (call, visit, offer)" },
    { types: ["price-list"], note: "only the prices the client gave" },
  ],
  "book-first": [
    { types: ["opening-hours", "booking"], note: "when visitors can come and how they book, from the client's words" },
    { types: ["services-list", "price-list"], note: "what can be booked, prices only as the client gave them" },
    { types: ["team"], note: "the people the client named, with their roles" },
    { types: ["cta"], note: "the client's own sentence about booking, with one booking action" },
  ],
  "browse-first": [
    { types: ["products", "price-list", "menu", "rooms"], note: "what the client sells or offers, as listed, prices only as given" },
    { types: ["gallery", "image-text"], note: "the client's photos of the range or the place" },
    { types: ["text"], note: "the rest of the range in one sentence, in the client's words" },
    { types: ["opening-hours"], note: "when they are open" },
  ],
  "visit-first": [
    { types: ["opening-hours"], note: "when they are open; the note what the client said about visiting" },
    { types: ["image-text"], note: "the place itself with its photo, in the client's words" },
    { types: ["price-list", "menu", "products", "rooms"], note: "what a visit offers, prices only as the client gave them" },
    { types: ["gallery"], note: "more photos of the place" },
  ],
  "story-first": [
    { types: ["about"], note: "the client's own story: who works there and how; a year only if the client gave one" },
    { types: ["image-text"], note: "how the client works, with a photo" },
    { types: ["services-list", "products"], note: "what the client does or makes, as listed" },
    { types: ["highlights"], note: "two to four points or figures the client gave" },
  ],
};

const head = (line: string) => line.split(":").slice(0, 2).join(":").split(/\s/)[0]!;

/** The section "type:variant" a direction uses for a type: the template outline's, its preferred variant, or the type's first. */
function variantFor(dir: Direction, type: string): { option: string; line?: string } {
  const line = dir.template?.homepage.slice(1, -1).find((l) => head(l).startsWith(`${type}:`));
  if (line) return { option: head(line), line };
  const prefer = dir.layout.prefer.find((p) => p.startsWith(`${type}:`));
  const def = SECTION_DEFS.find((d) => d.type === type);
  return { option: prefer ?? `${type}:${def!.variants[0]}` };
}

/**
 * A blueprint's outline slots for a template direction (families.ts OutlineSlot, checked by validateOutline): the
 * template's hero (or the family's pick), the blueprint's places in its order, each in the template's own variant and
 * tone where the template has the type, and the template's closing call. Where the signature device needs a section,
 * it is placed right after the hero. Empty outside a template.
 */
export function blueprintSlots(dir: Direction, blueprint: Blueprint, o: { hero?: string; device?: SignatureDevice } = {}): OutlineSlot[] {
  const own = outlineSlots(dir, o.hero);
  if (!own.length) return [];
  const used = new Set<string>();
  const middle: OutlineSlot[] = [];
  const deviceSection = o.device?.section;
  if (deviceSection) {
    const type = deviceSection.split(":")[0]!;
    const fromTemplate = variantFor(dir, type);
    const option = fromTemplate.line && head(fromTemplate.line) === deviceSection ? fromTemplate : { option: deviceSection };
    middle.push({ kind: "optional", options: [option.option], note: option.line ?? `${deviceSection}: ${o.device!.note}` });
    used.add(type);
  }
  for (const place of BLUEPRINT_PLACES[blueprint]) {
    const type = place.types.find((t) => !used.has(t) && dir.template!.homepage.some((l) => head(l).startsWith(`${t}:`))) ?? place.types.find((t) => !used.has(t));
    if (!type) continue;
    used.add(type);
    const v = variantFor(dir, type);
    middle.push({ kind: "optional", options: [v.option], note: v.line ?? `${v.option}: ${place.note}` });
  }
  return [own[0]!, ...middle, own.at(-1)!];
}

// ---------- Signature device by fact ----------

/** Material families, from the client's own nouns (folded stems). */
const MATERIALS: Record<string, string[]> = {
  food: ["kruh", "pecivo", "pecen", "testo", "mok", "kvas", "sir", "mes", "salam", "potic", "tort", "slasc", "kav", "zelenjav", "sadj", "jed", "kosil", "malic"],
  bottle: ["steklenic", "kozar", "vin", "olj", "med", "marmelad", "sok", "zganj", "liker"],
  paper: ["papir", "racun", "dokument", "obrazc", "knjig", "porocil"],
  textile: ["blag", "voln", "bombaz", "svil", "lan", "oblacil", "oblek", "srajc", "hlac", "torb"],
  plant: ["cvet", "roz", "sopek", "tulipan", "rastlin", "lonc", "venc", "zelenj"],
};

/** The material families the concept's materials belong to. */
export function materialFamilies(materials: string[]): Set<string> {
  const out = new Set<string>();
  for (const m of materials) for (const w of words(m)) for (const [family, stems] of Object.entries(MATERIALS)) if (stems.some((s) => w.startsWith(s))) out.add(family);
  return out;
}

export interface SignatureDevice {
  id: "call-object" | "seal" | "week-chart" | "poster" | "label" | "offers" | "tags" | "figure" | "route-line" | "rates" | "address-card";
  /** The hero fact that carries it (hero-signature fact), when the device is the hero's object. */
  heroFact?: "phone" | "opening" | "address";
  /** The section "type:variant" that draws it, when it is a section of its own. */
  section?: string;
  /** For the content step: what the device shows. */
  note: string;
}

/**
 * The page's one signature object, chosen in code from the signature fact and the materials, not the trade: the phone
 * as the motif's call object, the hours on a seal (food), a poster (paper) or a week chart, a price on labels (bottles,
 * textiles, flowers), as offers at headline size (food) or as tags, the founding year as a wall-sized figure, a
 * distance as a route line, rooms as rates, a place on the hero's address card. Undefined for "none".
 */
export function signatureDevice(c: Pick<Concept, "signatureFact" | "materials">): SignatureDevice | undefined {
  const m = materialFamilies(c.materials);
  switch (c.signatureFact) {
    case "phone":
      return { id: "call-object", heroFact: "phone", note: "the phone number as the hero's object (the direction draws it as its call object)" };
    case "hours":
      if (m.has("food")) return { id: "seal", heroFact: "opening", note: "the earliest opening time on the hero's round seal" };
      if (m.has("paper")) return { id: "poster", section: "opening-hours:poster", note: "the hours set as a poster: what is open and when, from the client's words" };
      return { id: "week-chart", section: "opening-hours:week", note: "the opening hours as a week chart; the note how to come or book, from the client's words" };
    case "price":
      if (m.has("bottle") || m.has("textile") || m.has("plant")) return { id: "label", section: "price-list:tags", note: "two to four products the client priced, each on its own label: name, the quantity as the note, the price" };
      if (m.has("food")) return { id: "offers", section: "price-list:offers", note: "the standing offers the client priced, the price at headline size" };
      return { id: "tags", section: "price-list:tags", note: "only the prices the client gave, each as a large price object" };
    case "founding-year":
      return { id: "figure", section: "about:figure", note: "the year the business started as the wall-sized figure (only the year the client wrote), the heading what it stands for" };
    case "distance":
      return { id: "route-line", section: "service-area:list", note: "the places the client serves as stops on one line, the distance the client gave in the intro" };
    case "rooms":
      return { id: "rates", section: "price-list:rates", note: "the rooms or beds the client lists with the prices the client gave and their units" };
    case "place":
      return { id: "address-card", heroFact: "address", note: "the street and town on the hero's card (label, card and bend heroes; elsewhere the address in the hero's facts)" };
    case "none":
      return undefined;
  }
}

// ---------- What the steps are told ----------

/** The design step's line about the subtype (only with the switch on and a subtype). */
export function subtypeDesignLine(c: Concept | undefined): string {
  if (!c?.subtype) return "";
  const motif = SUBTYPE_MOTIF[c.subtype];
  return `Subtype: ${c.subtype}.${motif ? ` On its trade's template the drawn motif is this subtype's own (${motif}), in the site's colours.` : ""} Goal: ${c.goal}; angle: ${c.angle}.`;
}

export interface ConceptPlan {
  blueprint: Blueprint;
  device?: SignatureDevice;
}

/** The concept's plan for the content step. */
export function conceptPlan(c: Concept): ConceptPlan {
  const device = signatureDevice(c);
  return { blueprint: blueprintFor(c), ...(device ? { device } : {}) };
}

/**
 * The content step's outline with the switch on: on a template, the blueprint's outline instead of the template's fixed
 * one; anywhere, the signature device. `hero`: the variety engine's family hero, as in templateOutline.
 */
export function conceptOutline(dir: Direction, plan: ConceptPlan, hero?: string): string {
  const parts: string[] = [];
  const slots = blueprintSlots(dir, plan.blueprint, { ...(hero ? { hero } : {}), ...(plan.device ? { device: plan.device } : {}) });
  if (slots.length) {
    const lines = slots.map((s, i) => {
      if (i === 0 && hero && !s.note.startsWith(`${hero} `) && !s.note.startsWith(`${hero}:`)) {
        return `${hero}: this site's hero (instead of the template's signature hero): the headline and intro the signature hero would carry, the best photo where the variant shows one, the call as the primary action`;
      }
      return s.note;
    });
    parts.push(
      `Homepage blueprint ${plan.blueprint} on the ${dir.name} template (chosen from this business's goal), top to bottom. Follow it: these sections in this order, with these variants and tones, and no others on the homepage; leave a section out only when the facts it needs are missing. A closing contact section is allowed although the top already shows contact facts.\n${lines.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
    );
  }
  const d = plan.device;
  if (d) parts.push(`Signature object (chosen in code from the client's own fact): ${d.note}.${deviceHow(d, hero ?? (dir.template ? head(dir.template.homepage[0]!) : dir.layout.heroes[0]))}`);
  return parts.join("\n\n");
}

/** How the content step places the device: the hero's fact where the hero can show it, else its section. */
function deviceHow(d: SignatureDevice, hero: string | undefined): string {
  const [type, variant] = (hero ?? "").split(":");
  if (d.heroFact && type === "hero-signature") {
    if (d.heroFact !== "address" || ["label", "card", "bend"].includes(variant ?? "")) return ` Set the hero's fact to "${d.heroFact}".`;
    return " This hero can't show the address: name the place the client gave in the headline or intro instead.";
  }
  if (d.heroFact) return d.heroFact === "phone" ? " Put the phone where the hero shows its facts." : " Put it in the hero's facts.";
  return d.section ? ` Use ${d.section} for it, right after the hero.` : "";
}
