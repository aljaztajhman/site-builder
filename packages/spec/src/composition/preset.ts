/**
 * Composition presets (docs/plans/studio-phase1-design.md §5, I3): a composed section's props written once, with slot
 * markers where the client's facts go (./slots.ts), registered in the inventory as `composition/<intent>/<name>`.
 * `fillPreset` turns one into ComposedProps for a site: every marker gets its value from the business, the brief or
 * the section's copy; an element whose required slots have no value is dropped and the layout closes up behind it; the
 * result is repaired and checked by the composition guards. Nothing is invented: a value is only ever copied from the
 * sources, and an offering without a price becomes the spec's marked price placeholder.
 *
 * It lives in @sb/spec, beside the schema and the guards it fills against, because both callers depend on it: the
 * inventory (contact sheets, the per-preset checks) and the engine's designer (Phase 2). Neither depends on the other.
 */
import type { z } from "zod";
import type { Business } from "../business.ts";
import { isPlaceholder, type Price, type Tone } from "../common.ts";
import type { Colors } from "../design.ts";
import { formatAddress, formatPhoneNational } from "../format.ts";
import { walkObjects, walkStrings } from "../pointer.ts";
import type { SiteSpec } from "../site.ts";
import { repairComposition, validateComposition, type CompositionBusiness, type CompositionContext, type ComposedSection } from "./guards.ts";
import { COMPOSED_LAYOUT_KEYS } from "./layout-keys.ts";
import { ComposedIntent, ComposedProps, Element, MAX_ELEMENTS, type Place } from "./schema.ts";
import { MAX_SLOT_INDEX, bracedIn, parseSlot, replaceSlots, slotProblem, slotType, slotsIn } from "./slots.ts";
import { PRACTICAL_FACTS } from "./vocab.ts";

// ---------- the format ----------

/** A value as a preset writes it: any string may hold slot markers, and an object field (a price) may be one whole marker. */
type Slotted<T> = T extends string | number | boolean | null | undefined
  ? T
  : T extends readonly (infer U)[]
    ? Slotted<U>[]
    : T extends object
      ? { [K in keyof T]: Slotted<T[K]> | (NonNullable<T[K]> extends object ? (NonNullable<T[K]> extends readonly unknown[] ? never : string) : never) }
      : T;

/** ComposedProps with slot markers. */
export type PresetProps = Slotted<z.input<typeof ComposedProps>>;

/** Where elements move when one is dropped: dropped element id → { other element id → its new desktop place (merged) }. */
export type PresetReflow = Readonly<Record<string, Readonly<Record<string, Partial<Place>>>>>;

/**
 * First-screen structures (Design 5, docs/plans/design-direction-2026-10.md §2). A hero preset names the one it builds;
 * plain data for now (Wave P), checked against the geometry once `structureOf` exists (U1).
 */
export const STRUCTURES = ["poster", "band", "magazine", "strata", "mosaic", "field", "ledger", "split"] as const;
export type Structure = (typeof STRUCTURES)[number];

export interface CompositionPreset {
  /** `composition/<intent>/<name>`; the intent is props.intent. */
  id: string;
  /** The section's tone (the ground it was designed on); absent: default. */
  tone?: Tone;
  /** Inventory tags: trades it fits (empty: any), stance ids, mood words read from the layout. */
  tags?: { trades?: readonly string[]; stances?: readonly string[]; mood?: readonly string[] };
  /** Hero presets: the first-screen structure the layout builds. */
  structure?: Structure;
  /** Slot names (without braces) that must have a value, else the preset can't be used for this business at all. */
  needs?: readonly string[];
  props: PresetProps;
  /** Explicit moves when an element is dropped; without one, the neighbours beside it widen into its columns. */
  reflow?: PresetReflow;
  /** One line for the gallery: what the layout is, where it came from. */
  note?: string;
}

/** Contextual typing for preset files (`export default definePreset({ … })`). */
export const definePreset = (p: CompositionPreset): CompositionPreset => p;

const PRESET_ID = /^composition\/([a-z]+(?:-[a-z]+)*)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;

/** The intent and name of a preset id ("composition/hero/split-photo" → hero, split-photo); null when malformed. */
export function parsePresetId(id: string): { intent: string; name: string } | null {
  const m = PRESET_ID.exec(id);
  return m ? { intent: m[1]!, name: m[2]! } : null;
}

// ---------- the sources ----------

/** The part of the engine's Brief (engine brief.ts) the slots read; the Brief itself is assignable to it. */
export interface PresetBrief {
  summary?: string | null;
  highlights?: readonly string[];
  offerings?: readonly {
    name: string;
    description?: string | null;
    group?: string | null;
    price?: { amount: number; from?: boolean | null; unit?: string | null } | null;
  }[];
  facts?: { people?: readonly { name: string; role?: string | null }[] };
  /** The business's own process steps, as the client described them (spec v21; absent when they gave none). */
  steps?: readonly { title: string; text: string }[];
  /** The questions and answers the client gave (spec v21; absent when they gave none). */
  faq?: readonly { question: string; answer: string }[];
}

/** Everything a preset is filled from. */
export interface PresetSources {
  business: Pick<Business, "name" | "phone" | "email" | "address" | "hours" | "bookingUrl" | "amenities">;
  /** spec.assets.images in order (absent origin: the client's photo). */
  images?: readonly { id: string; origin?: "client" | "generated" }[];
  brief?: PresetBrief;
  /** The copy the content stage wrote for this section. */
  copy?: { headline?: string; lead?: string };
  /** design.colors, for the contrast guards; without it they are skipped. */
  colors?: Colors;
}

/** The sources of a site: its business, images and colours, plus the brief and this section's copy when known. */
export function presetSources(spec: SiteSpec, brief?: PresetBrief, copy?: PresetSources["copy"]): PresetSources {
  return {
    business: spec.business,
    images: spec.assets.images.map((i) => ({ id: i.id, origin: i.origin ?? "client" })),
    colors: spec.design.colors,
    ...(brief ? { brief } : {}),
    ...(copy ? { copy } : {}),
  };
}

const str = (v: string | null | undefined): string | undefined => {
  const t = v?.replace(/\s+/g, " ").trim();
  return t ? t : undefined;
};

type Offering = NonNullable<PresetBrief["offerings"]>[number];

function priceOf(o: Offering): Price {
  if (!o.price) return { $placeholder: "price" };
  const unit = str(o.price.unit);
  return { amount: o.price.amount, ...(o.price.from ? { from: true } : {}), ...(unit ? { unit } : {}) };
}

function offeringField(o: Offering | undefined, field: string): string | Price | undefined {
  if (!o) return undefined;
  if (field === "price") return priceOf(o);
  if (field === "name") return str(o.name);
  if (field === "description") return str(o.description);
  if (field === "group") return str(o.group);
  return undefined;
}

/** The value of a slot (a name without braces), or undefined when the sources have none. */
export function slotValue(name: string, src: PresetSources): string | Price | undefined {
  if (slotProblem(name)) return undefined;
  const { pattern, indices } = parseSlot(name);
  const i = indices[0] ?? 0;
  const b = src.business;
  const address = b.address && !isPlaceholder(b.address) ? b.address : undefined;
  const hours = b.hours && !isPlaceholder(b.hours) ? b.hours : undefined;
  const offerings = src.brief?.offerings ?? [];
  const field = pattern.slice(pattern.lastIndexOf(".") + 1);
  switch (pattern) {
    case "business.name":
      return str(b.name);
    case "business.town":
      return str(address?.city);
    case "business.street":
      return str(address?.street);
    case "business.address":
      return address ? formatAddress(address) : undefined;
    case "business.phone":
      return typeof b.phone === "string" ? formatPhoneNational(b.phone) : undefined;
    case "business.email":
      return typeof b.email === "string" ? b.email : undefined;
    case "business.hours.note":
      return str(hours?.note);
    case "brief.summary":
      return str(src.brief?.summary);
    case "brief.highlights[]":
      return str(src.brief?.highlights?.[i]);
    case "brief.people[].name":
      return str(src.brief?.facts?.people?.[i]?.name);
    case "brief.people[].role":
      return str(src.brief?.facts?.people?.[i]?.role);
    case "brief.steps[].title":
      return str(src.brief?.steps?.[i]?.title);
    case "brief.steps[].text":
      return str(src.brief?.steps?.[i]?.text);
    case "brief.faq[].question":
      return str(src.brief?.faq?.[i]?.question);
    case "brief.faq[].answer":
      return str(src.brief?.faq?.[i]?.answer);
    case "copy.headline":
      return str(src.copy?.headline);
    case "copy.lead":
      return str(src.copy?.lead);
    case "images[]":
      return src.images?.[i]?.id;
    case "photos[]":
      return src.images?.filter((im) => (im.origin ?? "client") === "client")[i]?.id;
    case "amenities[]":
      return b.amenities?.[i];
  }
  if (pattern.startsWith("brief.offerings[]")) return offeringField(offerings[i], field);
  if (pattern.startsWith("brief.priced[]")) return offeringField(offerings.filter((o) => o.price)[i], field);
  return undefined;
}

/** The guards' context for a section filled from these sources (no page: the rules across sections are the caller's). */
export function presetContext(src: PresetSources): CompositionContext {
  const b = src.business;
  const address = b.address && !isPlaceholder(b.address) ? b.address : undefined;
  const business: CompositionBusiness = {
    ...(typeof b.phone === "string" ? { phone: b.phone } : {}),
    ...(typeof b.email === "string" ? { email: b.email } : {}),
    ...(address ? { address: formatAddress(address), town: address.city } : {}),
    ...(b.amenities ? { amenities: b.amenities } : {}),
    ...(b.bookingUrl ? { bookingUrl: b.bookingUrl } : {}),
  };
  const images = src.images ?? [];
  return {
    imageIds: new Set(images.map((i) => i.id)),
    hasBookingUrl: !!b.bookingUrl,
    business,
    images: new Map(images.map((i) => [i.id, { origin: i.origin ?? "client" }])),
    ...(src.colors ? { colors: src.colors } : {}),
  };
}

// ---------- filling ----------

const MISSING = Symbol("missing");
type Filled = unknown;

/** Fills every marker under `v`; a string whose slot has no value is MISSING, and so is dropped from its array or object. */
function fill(v: unknown, src: PresetSources, missing: Set<string>): Filled | typeof MISSING {
  if (typeof v === "string") {
    const names = slotsIn(v);
    if (names.length === 0) return v;
    if (names.length === 1 && v === `{${names[0]}}`) {
      const value = slotValue(names[0]!, src);
      if (value === undefined) {
        missing.add(names[0]!);
        return MISSING;
      }
      return value;
    }
    let gap = false;
    const out = replaceSlots(v, (name) => {
      const value = slotValue(name, src);
      if (typeof value !== "string") {
        missing.add(name);
        gap = true;
        return "";
      }
      return value;
    });
    return gap ? MISSING : out.replace(/\s+/g, " ").trim();
  }
  if (Array.isArray(v)) return v.map((x) => fill(x, src, missing)).filter((x) => x !== MISSING);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      const f = fill(x, src, missing);
      if (f !== MISSING) out[k] = f;
    }
    return out;
  }
  return v;
}

/** What an element of its kind needs from the business beyond its slots (G14 and the facts the components read). */
function kindNeeds(e: Record<string, unknown>, src: PresetSources): string | null {
  const b = src.business;
  const has = {
    phone: typeof b.phone === "string",
    email: typeof b.email === "string",
    address: !!b.address && !isPlaceholder(b.address),
    hours: !!b.hours && !isPlaceholder(b.hours),
    booking: !!b.bookingUrl,
  };
  const target: Record<string, boolean> = { call: has.phone, directions: has.address, book: has.booking, booking: has.booking, email: has.email };
  switch (e.kind) {
    case "hours":
      return has.hours ? null : "business.hours";
    case "map":
      return has.address ? null : "business.address";
    case "action": {
      const a = e.action as string;
      return a in target && !target[a] ? `business.${a === "call" ? "phone" : a === "directions" ? "address" : "bookingUrl"}` : null;
    }
    case "contact": {
      const show = (e.show as string[]).filter((s) => (s === "phone" ? has.phone : s === "email" ? has.email : has.address));
      e.show = show;
      return show.length ? null : "business.contact";
    }
    case "fact": {
      const link = e.link as { action?: string } | undefined;
      if (link?.action && link.action in target && !target[link.action]) delete e.link;
      return null;
    }
  }
  return null;
}

/**
 * The element as the schema takes it, or null. An array item that doesn't parse (its slot was empty, or its value
 * doesn't fit) is removed and the element tried again; any other failure drops the element.
 */
function settle(raw: Record<string, unknown>): Element | null {
  const e: unknown = raw;
  for (let tries = 0; tries <= 2 * MAX_ELEMENTS; tries++) {
    const r = Element.safeParse(e);
    if (r.success) return r.data;
    const at = r.error.issues.map((i) => i.path).find((p) => p.some((k) => typeof k === "number"));
    if (!at) return null;
    const n = at.findIndex((k) => typeof k === "number");
    let parent: unknown = e;
    for (const k of at.slice(0, n)) parent = (parent as Record<PropertyKey, unknown>)[k as PropertyKey];
    if (!Array.isArray(parent)) return null;
    parent.splice(at[n] as number, 1);
  }
  return null;
}

export interface DroppedElement {
  id: string;
  kind: string;
  /** The slots (or business facts) it had no value for; empty when its values didn't fit the schema. */
  missing: string[];
}

export type FillResult =
  | { ok: true; props: ComposedProps; dropped: DroppedElement[]; repairs: string[] }
  | {
      ok: false;
      /** needs: a slot in `needs` is empty; empty: nothing with words is left; hole: a dropped element left a gap no neighbour closes; invalid: the props or the guards fail. */
      reason: "needs" | "empty" | "hole" | "invalid";
      missing: string[];
      dropped: DroppedElement[];
      issues: string[];
    };

/** Fluid kinds widen into a dropped neighbour's columns; the rest keep their size (a button, a fact object, a drawing). */
const FLUID: ReadonlySet<string> = new Set(["heading", "text", "list", "prices", "hours", "contact", "quote", "ribbon", "image", "photos", "map", "iconFacts", "steps", "qa"]);

interface Box {
  c0: number;
  c1: number;
  r0: number;
  r1: number;
}
const box = (d: Place): Box => ({ c0: d.col, c1: d.col + d.span - 1, r0: d.row, r1: d.row + (d.rowSpan ?? 1) - 1 });
const meets = (a: Box, b: Box): boolean => a.c0 <= b.c1 && b.c0 <= a.c1 && a.r0 <= b.r1 && b.r0 <= a.r1;
const rowsMeet = (a: Box, b: Box): boolean => a.r0 <= b.r1 && b.r0 <= a.r1;

/**
 * Closes the gap a dropped element leaves: the preset's own reflow when it has one, else the fluid elements beside it
 * in its rows widen into its columns (left neighbours first), never over another element. Returns false when the gap
 * stays a hole: its rows still hold other elements, none of them covers any of its cells, and something sits below it
 * in its columns (an empty band between content, not a column that ends early).
 */
function closeGap(gone: Element, els: Element[], reflow: PresetReflow | undefined): boolean {
  const g = box(gone.desk);
  const moves = reflow?.[gone.id];
  if (moves) {
    for (const [id, place] of Object.entries(moves)) {
      const e = els.find((x) => x.id === id);
      if (e) e.desk = { ...e.desk, ...place };
    }
  } else {
    const beside = els.filter((e) => FLUID.has(e.kind) && rowsMeet(box(e.desk), g));
    const left = beside.filter((e) => box(e.desk).c1 < g.c0);
    const right = beside.filter((e) => box(e.desk).c0 > g.c1);
    const free = (e: Element, next: Box) => els.every((o) => o === e || !meets(box(o.desk), next));
    if (left.length) {
      for (const e of left) {
        const b = box(e.desk);
        const next = { ...b, c1: g.c1 };
        if (free(e, next)) e.desk = { ...e.desk, span: g.c1 - b.c0 + 1 };
      }
    } else {
      for (const e of right) {
        const b = box(e.desk);
        const next = { ...b, c0: g.c0 };
        if (free(e, next)) e.desk = { ...e.desk, col: g.c0, span: b.c1 - g.c0 + 1 };
      }
    }
  }
  const sharing = els.filter((e) => rowsMeet(box(e.desk), g));
  if (sharing.length === 0 || sharing.some((e) => meets(box(e.desk), g))) return true;
  // An empty end of a column (nothing below it in its columns) is the column ending early, not a hole.
  return !els.some((e) => {
    const b = box(e.desk);
    return b.r0 > g.r1 && b.c0 <= g.c1 && g.c0 <= b.c1;
  });
}

/** Removes the desktop rows no element covers, moving the rows below up (and the field layers with them). */
function compactRows(props: Record<string, unknown>, els: Element[]): void {
  const rows = props.rows as number;
  const used = new Set<number>();
  for (const e of els) for (let r = e.desk.row; r < e.desk.row + (e.desk.rowSpan ?? 1); r++) used.add(r);
  const keep = Array.from({ length: rows }, (_, i) => i + 1).filter((r) => used.has(r));
  if (keep.length === rows || keep.length === 0) return;
  const to = new Map(keep.map((r, i) => [r, i + 1]));
  for (const e of els) e.desk = { ...e.desk, row: to.get(e.desk.row)! };
  props.rows = keep.length;
  const bg = props.background as { kind: string; rows?: { from: number; to: number } }[] | undefined;
  if (!bg) return;
  const layers = bg.flatMap((l) => {
    if (l.kind !== "field" || !l.rows) return [l];
    const inside = keep.filter((r) => r >= l.rows!.from && r <= l.rows!.to);
    return inside.length ? [{ ...l, rows: { from: to.get(inside[0]!)!, to: to.get(inside[inside.length - 1]!)! } }] : [];
  });
  if (layers.length) props.background = layers;
  else delete props.background;
}

/**
 * Fills a preset from the sources. Markers get their values; an element whose required slots (or business facts)
 * have no value is dropped and its gap closed; the section is repaired (repairComposition) and must then pass the
 * composition guards on its own (validateComposition without a page: the h1 and display-size rules across sections
 * are the caller's). Nothing is invented.
 */
export function fillPreset(preset: CompositionPreset, src: PresetSources): FillResult {
  const fail = (reason: "needs" | "empty" | "hole" | "invalid", missing: string[], dropped: DroppedElement[], issues: string[] = []): FillResult => ({ ok: false, reason, missing, dropped, issues });
  const needed = (preset.needs ?? []).filter((n) => slotValue(n, src) === undefined);
  if (needed.length) return fail("needs", needed, []);

  const { elements: rawElements, ...rest } = preset.props as unknown as Record<string, unknown> & { elements: unknown[] };
  const sectionMissing = new Set<string>();
  const props = fill(rest, src, sectionMissing) as Record<string, unknown>;
  if (sectionMissing.size) return fail("needs", [...sectionMissing], []);

  const els: Element[] = [];
  const gone: Element[] = [];
  const dropped: DroppedElement[] = [];
  for (const raw of rawElements) {
    const original = raw as Element;
    const missing = new Set<string>();
    const filled = fill(raw, src, missing) as Record<string, unknown>;
    const need = kindNeeds(filled, src);
    if (need) missing.add(need);
    const e = need ? null : settle(filled);
    if (e) els.push(e);
    else {
      gone.push(original);
      dropped.push({ id: original.id, kind: original.kind, missing: [...missing] });
    }
  }
  if (!els.some((e) => !["image", "photos", "decor"].includes(e.kind))) return fail("empty", dropped.flatMap((d) => d.missing), dropped);
  for (const g of gone) if (!closeGap(g, els, preset.reflow)) return fail("hole", dropped.flatMap((d) => d.missing), dropped, [`${g.id} leaves a hole`]);
  compactRows(props, els);

  const parsed = ComposedProps.safeParse({ ...props, elements: els });
  if (!parsed.success) return fail("invalid", [], dropped, parsed.error.issues.map((i) => `${i.path.join("/")}: ${i.message}`));
  const ctx = presetContext(src);
  const section = { id: "s_preset", type: "composed", variant: "free", ...(preset.tone ? { tone: preset.tone } : {}), props: parsed.data } as unknown as ComposedSection;
  const repaired = repairComposition(section, ctx);
  const issues = validateComposition(repaired.section, ctx).map((i) => `${i.path}: ${i.message}`);
  if (issues.length) return fail("invalid", [], dropped, issues);
  return { ok: true, props: repaired.section.props, dropped, repairs: repaired.repairs };
}

/** A filled preset as a section of a page. */
export const presetSection = (preset: CompositionPreset, props: ComposedProps, id = "s_preset"): ComposedSection =>
  ({ id, type: "composed", variant: "free", ...(preset.tone ? { tone: preset.tone } : {}), props }) as unknown as ComposedSection;

// ---------- checking a preset ----------

/** Keys whose strings are references, not copy: element ids, images, link targets. */
const REF_KEYS: ReadonlySet<string> = new Set(["id", "image", "images", "fillImage", "page", "section", "url"]);
const KEY_TYPE: Readonly<Record<string, "price" | "image" | "amenity">> = { price: "price", image: "image", images: "image", fillImage: "image", fact: "amenity" };

/** Sources with every slot filled by a short neutral value: a preset must fill from them with nothing dropped. */
export function fullSources(): PresetSources {
  const n = MAX_SLOT_INDEX + 1;
  return {
    business: {
      name: "Ime",
      phone: "+38641000000",
      email: "ime@primer.example",
      address: { street: "Ulica", postalCode: "1000", city: "Kraj" },
      hours: { entries: [{ from: "mon", to: "fri", open: "08:00", close: "16:00" }], note: "Opomba" },
      bookingUrl: "https://primer.example/termin",
      amenities: PRACTICAL_FACTS.slice(0, n),
    },
    images: Array.from({ length: n }, (_, i) => ({ id: `img_s${i}`, origin: "client" as const })),
    brief: {
      summary: "Povzetek",
      highlights: Array.from({ length: n }, () => "Poudarek"),
      offerings: Array.from({ length: n }, () => ({ name: "Storitev", description: "Opis", group: "Skupina", price: { amount: 10, from: false, unit: null } })),
      facts: { people: Array.from({ length: n }, () => ({ name: "Oseba", role: "Vloga" })) },
      steps: Array.from({ length: n }, () => ({ title: "Korak", text: "Opis koraka" })),
      faq: Array.from({ length: n }, () => ({ question: "Vprašanje", answer: "Odgovor" })),
    },
    copy: { headline: "Naslov", lead: "Uvod" },
  };
}

/**
 * Everything wrong with a preset, as messages (empty: none): its id, its markers (each a known slot; price, image and
 * amenity slots only as a whole value of their field), fixed copy without numbers (a number is a fact, and facts come
 * only from slots), image fields only from slots, `needs` and `reflow` naming real slots and elements, and filling from
 * full sources with nothing dropped and 0 guard issues.
 */
export function validatePreset(preset: CompositionPreset): string[] {
  const out: string[] = [];
  const parts = parsePresetId(preset.id);
  const intent = (preset.props as { intent?: unknown }).intent;
  if (!parts) out.push(`id ${preset.id}: not composition/<intent>/<name>`);
  else if (!ComposedIntent.safeParse(parts.intent).success) out.push(`id ${preset.id}: ${parts.intent} is not a composed intent`);
  else if (parts.intent !== intent) out.push(`id ${preset.id}: intent ${parts.intent} but props.intent ${String(intent)}`);

  walkStrings(preset.props, (v, p, key) => {
    for (const token of bracedIn(v)) {
      const name = token.slice(1, -1);
      const problem = slotsIn(token).length === 1 ? slotProblem(name) : `malformed marker ${token}`;
      if (problem) out.push(`${p}: ${problem}`);
      const type = slotType(name);
      const want = KEY_TYPE[key];
      if (type && type !== "text" && (v !== token || want !== type)) out.push(`${p}: {${name}} fills a ${type} and must be the whole value of a ${type} field`);
      if (type === "text" && want) out.push(`${p}: {${name}} is text; a ${want} field takes a ${want} slot`);
    }
    if (key in KEY_TYPE && KEY_TYPE[key] !== "amenity" && slotsIn(v).length === 0) out.push(`${p}: ${key} must be a slot (images come from the client), not ${JSON.stringify(v)}`);
    if (!REF_KEYS.has(key) && !COMPOSED_LAYOUT_KEYS.has(key) && /\d/.test(replaceSlots(v, () => ""))) out.push(`${p}: fixed copy with a number ${JSON.stringify(v)}; numbers are facts and come from slots`);
  });

  walkObjects(preset.props, (o, p) => {
    if ("price" in o && typeof o.price !== "string") out.push(`${p}/price: a price must be a slot (prices come from the brief), not ${JSON.stringify(o.price)}`);
  });
  for (const n of preset.needs ?? []) {
    const problem = slotProblem(n);
    if (problem) out.push(`needs: ${problem}`);
  }
  const ids = new Set(((preset.props as { elements?: { id?: string }[] }).elements ?? []).map((e) => e.id));
  for (const [gone, moves] of Object.entries(preset.reflow ?? {})) {
    if (!ids.has(gone)) out.push(`reflow: no element ${gone}`);
    for (const id of Object.keys(moves)) if (!ids.has(id)) out.push(`reflow ${gone}: no element ${id}`);
  }
  if (out.length) return out;

  const full = fillPreset(preset, fullSources());
  if (!full.ok) out.push(`full sources: ${full.reason} ${[...full.missing, ...full.issues].join("; ")}`);
  else {
    if (full.dropped.length) out.push(`full sources: dropped ${full.dropped.map((d) => `${d.id} (${d.missing.join(", ") || "schema"})`).join(", ")}`);
  }
  return out;
}

/** Every slot name (with indices) a preset uses. */
export function presetSlots(preset: CompositionPreset): string[] {
  const names = new Set<string>();
  walkStrings(preset.props, (v) => {
    for (const n of slotsIn(v)) names.add(n);
  });
  for (const n of preset.needs ?? []) names.add(n);
  return [...names];
}

