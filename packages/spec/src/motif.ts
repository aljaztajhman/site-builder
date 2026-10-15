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

export function siteMotif(site: { design: { direction: string }; business: { subtype?: BusinessSubtype | undefined } }): SiteMotif {
  const motif = DIRECTIONS.find((d) => d.id === site.design.direction)?.template?.motif;
  if (!motif) return {};
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

/** Whether a template motif fits the business type (no motif, or one open to any trade, always fits). */
export function motifFitsTrade(motif: Motif | undefined, type: string | undefined): boolean {
  if (!motif) return true;
  const trades = MOTIF_TRADES[motif];
  return trades === "any" || (type !== undefined && (trades as readonly string[]).includes(type));
}

/** Whether a direction may be used for the business type: a template's motif must fit the trade (MOTIF_TRADES). */
export function directionFitsTrade(directionId: string, type: string | undefined): boolean {
  return motifFitsTrade(DIRECTIONS.find((d) => d.id === directionId)?.template?.motif, type);
}

/** Banned (docs/PRODUCT.md): a template motif drawn for a trade it doesn't fit (the plate on a locksmith). */
export function tradeMotifIssues(site: { design: { direction: string }; business: { type: string } }): { path: string; message: string }[] {
  const motif = DIRECTIONS.find((d) => d.id === site.design.direction)?.template?.motif;
  return motifFitsTrade(motif, site.business.type) ? [] : [{ path: "/design/direction", message: `the ${motif} motif of direction ${site.design.direction} is for ${(MOTIF_TRADES[motif!] as readonly string[]).join(", ")}, not ${site.business.type}` }];
}

/** The stylesheet a site loads: site.css, site-<motif>.css or site-<motif>-<sub>.css (render shared.ts). */
export function stylesheetName(m: SiteMotif): string {
  return m.motif ? `site-${m.motif}${m.sub ? `-${m.sub}` : ""}.css` : "site.css";
}
