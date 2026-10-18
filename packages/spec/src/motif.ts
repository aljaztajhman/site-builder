/**
 * Which motif a site draws (variety engine Step 3): its template direction's motif, and on that template's layout the
 * sub-trade motif its business subtype picks (an electrician on Cevi gets the wire line, a florist on Etiketa the
 * stem). A subtype without a motif of its own (plumbing, deli, tyres) keeps the template's; a sub-trade motif is drawn
 * only on the template it belongs to (SUBMOTIF_BASE). Without a subtype nothing changes.
 */
import type { BusinessSubtype, BusinessType } from "./business.ts";
import { SUBMOTIF_BASE, type Motif, type SubMotif } from "./design.ts";
import { DIRECTIONS } from "./directions.ts";

export const SUBTYPE_MOTIF: Partial<Record<BusinessSubtype, SubMotif>> = {
  electrical: "wire",
  carpentry: "joint",
  roofing: "tiles",
  painting: "strip",
  florist: "stem",
  boutique: "tag",
};

export interface SiteMotif {
  /** The template's motif (its layout and stylesheet); undefined outside a template direction. */
  motif?: Motif;
  /** The sub-trade motif drawn on that layout; undefined when the subtype has none or the template isn't its base. */
  sub?: SubMotif;
}

export function siteMotif(site: { design: { direction: string }; business: { type?: string; subtype?: BusinessSubtype | undefined; name?: unknown }; pages?: readonly { sections: readonly object[] }[] }): SiteMotif {
  const motif = DIRECTIONS.find((d) => d.id === site.design.direction)?.template?.motif;
  // A motif that doesn't fit the trade (MOTIF_TRADES) isn't drawn: the site keeps the direction without it.
  if (!motif || !motifFitsTrade(motif, site.business.type ?? motifAnyTrade(motif))) return {};
  // The plate also needs a business that works on vehicles: the type alone was wrong for an appliance repairer.
  if (motif === "plate" && site.business.type !== undefined && !worksOnVehicles(siteText(site))) return {};
  const sub = site.business.subtype ? SUBTYPE_MOTIF[site.business.subtype] : undefined;
  return sub && SUBMOTIF_BASE[sub] === motif ? { motif, sub } : { motif };
}

/**
 * The trades each template motif fits (the outside review, 2026-10-14: a locksmith's site drew the licence plate). A
 * motif that is the trade's own object, read as that trade anywhere it appears, lists its trades; "any" draws for any
 * business (a pipe, a receipt or a bent line reads as a shape, not as a car or a tooth). The plate is a Slovenian
 * registration plate: car repair only.
 */
export const MOTIF_TRADES: Record<Motif, readonly BusinessType[] | "any"> = {
  plate: ["car-repair"],
  pipes: "any",
  crust: "any",
  ledger: "any",
  label: "any",
  spoon: "any",
  mirror: "any",
  smile: "any",
  trail: "any",
  bend: "any",
};

/**
 * Word stems that say a business works on vehicles (Slovene): cars, tyres, bodywork, towing, motorbikes, tractors. The
 * plate is a registration plate, so it also needs this evidence beyond the classified type: the M1 final check drew it
 * for an appliance repairer ("Servis gospodinjskih aparatov") that the classifier had filed as car-repair. "avto" but
 * not "avtomat" (a washing machine) or "avtor"; "gume" but not "gumb". Not the van a tradesman drives ("v kombiju").
 */
const VEHICLE_WORDS =
  /(?<!\p{L})(?:avto(?!mat|r)|vozil|vozni[kš]|gum(?:a|e|i|o|ah|am|ami)?(?!\p{L})|pnevmati|vulkaniz|karoser|klepar|vleka|vlečn|tovornjak|motocik|skuter|traktor|platišč|sklopk|zavor|menjalnik|izpuh|tehničn\p{L}* pregled|registracij\p{L}* vozil)/iu;

/**
 * Whether a business's own words show it works on vehicles (VEHICLE_WORDS). Without any words (a caller that passes
 * only the type) there is nothing to judge by: it does.
 */
export function worksOnVehicles(text: string): boolean {
  return text.trim() === "" || VEHICLE_WORDS.test(text);
}

/** The site's own words: its name and every string in its sections. */
function siteText(site: { business: { name?: unknown }; pages?: readonly { sections: readonly object[] }[] }): string {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(site.business.name);
  for (const p of site.pages ?? []) for (const s of p.sections) walk((s as { props?: unknown }).props);
  return out.join(" ");
}

/** A trade the motif fits, for callers that don't know the business type (no gate then). */
function motifAnyTrade(motif: Motif): string | undefined {
  const trades = MOTIF_TRADES[motif];
  return trades === "any" ? undefined : trades[0];
}

/** Whether a template motif fits the business type (no motif, or one open to any trade, always fits). */
export function motifFitsTrade(motif: Motif | undefined, type: string | undefined): boolean {
  if (!motif) return true;
  const trades = MOTIF_TRADES[motif];
  return trades === "any" || (type !== undefined && (trades as readonly string[]).includes(type));
}

/** Whether a direction may be used for the business type: a template's motif must fit the trade (MOTIF_TRADES). */
export function directionFitsTrade(directionId: string, type: string | undefined, words?: string): boolean {
  const motif = DIRECTIONS.find((d) => d.id === directionId)?.template?.motif;
  // `words`: the business's own (its name, what it does); the plate also needs them to show vehicles (worksOnVehicles).
  return motifFitsTrade(motif, type) && (motif !== "plate" || words === undefined || worksOnVehicles(words));
}

/** Banned (docs/PRODUCT.md): a template motif drawn for a trade it doesn't fit (the plate on a locksmith). */
export function tradeMotifIssues(site: { design: { direction: string }; business: { type: string; name?: unknown }; pages?: readonly { sections: readonly object[] }[] }): { path: string; message: string }[] {
  const motif = DIRECTIONS.find((d) => d.id === site.design.direction)?.template?.motif;
  if (!motifFitsTrade(motif, site.business.type)) return [{ path: "/design/direction", message: `the ${motif} motif of direction ${site.design.direction} is for ${(MOTIF_TRADES[motif!] as readonly string[]).join(", ")}, not ${site.business.type}` }];
  if (motif === "plate" && !worksOnVehicles(siteText(site))) return [{ path: "/design/direction", message: `the plate motif of direction ${site.design.direction} is for vehicles; nothing on the site names one` }];
  return [];
}

/** The stylesheet a site loads: site.css, site-<motif>.css or site-<motif>-<sub>.css (render shared.ts). */
export function stylesheetName(m: SiteMotif): string {
  return m.motif ? `site-${m.motif}${m.sub ? `-${m.sub}` : ""}.css` : "site.css";
}
