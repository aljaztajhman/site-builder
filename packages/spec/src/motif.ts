/**
 * Which motif a site draws (variety engine Step 3): its template direction's motif, and on that template's layout the
 * sub-trade motif its business subtype picks (an electrician on Cevi gets the wire line, a florist on Etiketa the
 * stem). A subtype without a motif of its own (plumbing, deli, tyres) keeps the template's; a sub-trade motif is drawn
 * only on the template it belongs to (SUBMOTIF_BASE). Without a subtype nothing changes.
 */
import type { BusinessSubtype } from "./business.ts";
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

/** The stylesheet a site loads: site.css, site-<motif>.css or site-<motif>-<sub>.css (render shared.ts). */
export function stylesheetName(m: SiteMotif): string {
  return m.motif ? `site-${m.motif}${m.sub ? `-${m.sub}` : ""}.css` : "site.css";
}
