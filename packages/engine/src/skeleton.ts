/**
 * The variety engine, Step 4 (docs/plans/variety-engine.md), behind config `variety.skeleton`: each site gets its own
 * frame instead of the one every site shared. No model call; everything here is chosen in code from the site's seed,
 * its business and its neighbours, and written into the spec (design.skeleton, section tones, the hero's eyebrow).
 *
 * - pickSkeleton: header family, where the call lives on phones (by the business's goal), footer family and tone,
 *   section width, cards, buttons, dividers and photo ratio; in the seed's order, the first combination of header,
 *   phone actions and footer no neighbour of the same trade has.
 * - holdPrimary / holdRhythm: the direction's primary hue and saturation range and its section rhythm, held in code
 *   (they were prompt-only rules).
 * - heroEyebrow: never the street address or the town alone; per site the eyebrow may go altogether.
 * - preferPhotoHero: with a hero-suitable picture, a family's photo hero over a type-only or drawn one.
 */
import {
  FAMILIES,
  NEW_HEADER_FAMILIES,
  SIGNATURE_PHOTO_VARIANTS,
  canOverlay,
  hexToHsl,
  hslToHex,
  isPlaceholder,
  type BusinessType,
  type Design,
  type Direction,
  type FooterFamily,
  type HeaderFamily,
  type Page,
  type PhoneActions,
  type SiteSpec,
  type Skeleton,
} from "@sb/spec";
import { seededOrder } from "./variety.ts";

/** What the business mainly wants a visitor to do (Step 3 will read it from the brief; until then from the trade). */
export type Goal = "call" | "visit" | "book";

export function goalOf(type: BusinessType, hasBooking: boolean): Goal {
  if (hasBooking && (type === "hairdresser" || type === "dental" || type === "physio")) return "book";
  if (type === "restaurant" || type === "bakery" || type === "shop" || type === "tourist-farm") return "visit";
  return "call";
}

/** Where the call lives on phones, by goal: the bar for call-first trades, the corner button where people come by. */
const ACTIONS_BY_GOAL: Record<Goal, PhoneActions[]> = {
  call: ["bar", "header"],
  visit: ["float", "bar"],
  book: ["header", "bar"],
};

const OLD_HEADERS: HeaderFamily[] = ["bar", "split-cta", "stacked"];
const NEW_FOOTERS: FooterFamily[] = ["wordmark", "visit"];
const OLD_FOOTERS: FooterFamily[] = ["compact", "columns"];

export interface SkeletonInput {
  seed: number;
  dir: Direction;
  design: Design;
  /** The homepage's first section. */
  hero: { type: string; variant: string; props: unknown } | undefined;
  business: SiteSpec["business"];
  hasLogo: boolean;
  /** Skeletons of the same trade's sites (same town first). */
  neighbours: Skeleton[];
}

const sameFrame = (a: Skeleton, b: Pick<Skeleton, "header" | "actions" | "footer">) => a.header === b.header && a.actions === b.actions && a.footer === b.footer;

/** The site's skeleton: see the module comment. Deterministic for one seed and one set of neighbours. */
export function pickSkeleton(o: SkeletonInput): Skeleton {
  const b = o.business;
  const hasPhone = !isPlaceholder(b.phone);
  const hasAddress = !isPlaceholder(b.address);
  const goal = goalOf(b.type, b.bookingUrl !== undefined);
  // The new families first (in the seed's order), today's three after them.
  const headers = [...seededOrder(NEW_HEADER_FAMILIES, o.seed, "header"), ...seededOrder(OLD_HEADERS, o.seed, "header-old")].filter(
    (h) => (h !== "overlay" || canOverlay(o.hero, o.hasLogo)) && (h !== "phone" || hasPhone),
  );
  const actionsList = hasPhone ? seededOrder(ACTIONS_BY_GOAL[goal], o.seed, "actions") : (["bar"] as PhoneActions[]);
  const footers = [...seededOrder(NEW_FOOTERS, o.seed, "footer"), ...seededOrder(OLD_FOOTERS, o.seed, "footer-old")].filter((f) => f !== "visit" || hasAddress);
  let frame = { header: headers[0]!, actions: actionsList[0]!, footer: footers[0]! };
  search: for (const actions of actionsList) {
    // The header that carries the call stays on screen; the one over the photo can't.
    for (const header of headers.filter((h) => actions !== "header" || h !== "overlay")) {
      for (const footer of footers) {
        if (!o.neighbours.some((n) => sameFrame(n, { header, actions, footer }))) {
          frame = { header, actions, footer };
          break search;
        }
      }
    }
  }
  // The footer's tone from the design: a dark closing band where the direction sets dark accents, the alternate ground
  // where it alternates, the page's own where it is flat; a band where the design has one; the seed picks among them.
  const preferred = o.dir.template ? "inverse" : o.dir.layout.rhythm === "inverse-accents" ? "inverse" : o.dir.layout.rhythm === "alternate" ? "alt" : "default";
  const tones = [...new Set([preferred, ...seededOrder(["inverse", "alt", "default", ...(o.design.colors.band || o.dir.template ? ["band"] : [])], o.seed, "footer-tone")])] as Skeleton["footerTone"][];
  const footerTone = tones[o.seed % 2 === 0 ? 0 : 1]!;
  return {
    ...frame,
    footerTone,
    width: seededOrder(["contained", "wide", "full"] as const, o.seed, "width")[0]!,
    cards: seededOrder(["bordered", "filled", "none"] as const, o.seed, "cards")[0]!,
    buttons: seededOrder(["square", "soft", "underline"] as const, o.seed, "buttons")[0]!,
    dividers: seededOrder(o.dir.template ? (["motif", "rule", "none"] as const) : (["rule", "none"] as const), o.seed, "dividers")[0]!,
    photoRatio: seededOrder(["standard", "landscape", "square", "portrait"] as const, o.seed, "ratio")[0]!,
  };
}

const clamp = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, v));

/**
 * The direction's primary hue range and saturation range, held in code (prompt-only before Step 4). A trade template
 * keeps its family's palettes (they are its own); the caller enforces contrast afterwards (enforceDesign).
 */
export function holdPrimary(design: Design, dir: Direction): Design {
  if (dir.template) return design;
  const hsl = hexToHsl(design.colors.primary);
  const [lo, hi] = dir.palette.primaryHue ?? [0, 360];
  let h = hsl.h;
  if (dir.palette.primaryHue && (h < lo || h > hi)) {
    // The nearer end of the range, around the wheel.
    const dist = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
    h = dist(h, lo) <= dist(h, hi) ? lo : hi;
  }
  const s = clamp(hsl.s, dir.palette.primarySaturation);
  if (h === hsl.h && s === hsl.s) return design;
  return { ...design, colors: { ...design.colors, primary: hslToHex({ h, s, l: hsl.l }) } };
}

type Section = Page["sections"][number];
const toneOf = (s: Section): string => s.tone ?? "default";
const withTone = (s: Section, tone: "default" | "alt"): Section => {
  const out = { ...s } as Section & { tone?: string };
  if (tone === "default") delete out.tone;
  else out.tone = tone;
  return out as Section;
};

/**
 * The direction's section rhythm, held in code on every page below its first section (the hero keeps its own):
 * alternate: neighbours on the light grounds alternate page and surface; flat: one ground, a dark or band section only
 * as the page's last; inverse-accents: never two dark sections in a row. Trade templates keep their outline's tones.
 */
export function holdRhythm(sections: Section[], rhythm: Direction["layout"]["rhythm"]): Section[] {
  const out = sections.slice(0, 1);
  for (const [i, s] of sections.entries()) {
    if (i === 0) continue;
    const prev = toneOf(out[i - 1]!);
    const tone = toneOf(s);
    const last = i === sections.length - 1;
    if (rhythm === "flat") out.push(tone === "alt" || ((tone === "inverse" || tone === "band") && !last) ? withTone(s, "default") : s);
    else if (rhythm === "alternate") out.push((tone === "default" || tone === "alt") && tone === prev ? withTone(s, tone === "default" ? "alt" : "default") : s);
    else out.push(tone === "inverse" && prev === "inverse" ? withTone(s, "alt") : s);
  }
  return out;
}

/** A hero eyebrow that is the street address or the town alone (the default before Step 4). */
export function isAddressEyebrow(eyebrow: string, address: SiteSpec["business"]["address"]): boolean {
  if (isPlaceholder(address)) return false;
  const e = eyebrow.toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  const street = address.street.toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  return e.includes(street) || e === address.city.toLowerCase().trim();
}

/** The homepage hero's eyebrow under the skeleton: an address one goes; with `drop`, any goes. */
export function heroEyebrow(eyebrow: string | undefined, address: SiteSpec["business"]["address"], drop: boolean): string | undefined {
  if (eyebrow === undefined || drop || isAddressEyebrow(eyebrow, address)) return undefined;
  return eyebrow;
}

const isPhotoHero = (hero: string): boolean => {
  const [type, variant] = hero.split(":");
  return type === "hero-split" || type === "hero-image" || (type === "hero-signature" && SIGNATURE_PHOTO_VARIANTS.includes(variant ?? ""));
};

/**
 * With a hero-suitable picture (the alt-text step's heroSuitable, or a generated one), a template family's photo hero
 * instead of a type-only or drawn one, in the seed's order. Unchanged otherwise, and for directions without a family.
 */
export function preferPhotoHero(dir: Direction, hero: string, heroSuitable: boolean, seed: number): string {
  const family = FAMILIES[dir.id];
  if (!heroSuitable || !family || isPhotoHero(hero)) return hero;
  return seededOrder(family.heroes.filter(isPhotoHero), seed, "photo-hero")[0] ?? hero;
}

export interface AppliedSkeleton {
  spec: SiteSpec;
  skeleton: Skeleton;
  /** What changed besides the skeleton, for the job log. */
  changes: string[];
}

/** The skeleton step on a generated spec: the skeleton in the design, the rhythm held, the hero's eyebrow fixed. */
export function applySkeleton(spec: SiteSpec, o: { seed: number; dir: Direction; neighbours: Skeleton[] }): AppliedSkeleton {
  const home = spec.pages.find((p) => p.kind === "home");
  const hero = home?.sections[0];
  const skeleton = pickSkeleton({ seed: o.seed, dir: o.dir, design: spec.design, hero, business: spec.business, hasLogo: spec.assets.logo !== undefined, neighbours: o.neighbours });
  const changes: string[] = [];
  const pages = spec.pages.map((p) => {
    let sections = p.sections;
    if (!o.dir.template && (p.kind === "home" || p.kind === "standard")) {
      sections = holdRhythm(p.sections, o.dir.layout.rhythm);
      const moved = sections.filter((s, i) => s !== p.sections[i]).map((s) => `${s.id} → ${s.tone ?? "default"}`);
      if (moved.length) changes.push(`rhythm ${o.dir.layout.rhythm} on ${p.id}: ${moved.join(", ")}`);
    }
    if (p === home && sections[0]) {
      const first = sections[0];
      const props = first.props as { eyebrow?: string };
      const drop = seededOrder(["keep", "drop"], o.seed, "eyebrow")[0] === "drop";
      const next = heroEyebrow(props.eyebrow, spec.business.address, drop);
      if (next !== props.eyebrow) {
        const rest = { ...props };
        delete rest.eyebrow;
        sections = [{ ...first, props: next === undefined ? rest : { ...rest, eyebrow: next } } as Section, ...sections.slice(1)];
        changes.push(`hero eyebrow "${props.eyebrow}" left out`);
      }
    }
    return sections === p.sections ? p : { ...p, sections };
  });
  return { spec: { ...spec, design: { ...spec.design, skeleton }, pages }, skeleton, changes };
}

/** The content step's extra lines with the skeleton on (none with it off, so the prompt is unchanged). */
export function skeletonLine(): string {
  return "Hero eyebrow: optional. Leave it out, or a short label in the client's own words; never the street address or the town alone (the facts show them). One call button per screen: the phone bar or the header carries the call on phones, so a later section offers the call as the phone number or a text link, not another call button.";
}
