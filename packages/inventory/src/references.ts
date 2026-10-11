/**
 * Studio reference homepages (kind `reference`, docs/plans/studio-phase1-design.md §5 I10, decision D3): v20 site specs
 * under tools/eval/references/<id>/ with a fixture brief and a gap note, checked by tools/eval's references harness.
 * A reference is listed here once it passes that harness (validateSite and checkFacts clean, renders at 360 and 1280 px);
 * tools/eval/test/references.test.ts keeps this list equal to the folders and their meta (stance, trades). Drafts until
 * the owner rates them in Okus and approves them in the gallery (decisions.json).
 */
import type { BusinessType } from "@sb/spec";
import type { Asset } from "./schema.ts";

export interface ReferenceEntry {
  /** The folder name under tools/eval/references; the asset is reference/<id>. */
  id: string;
  /** The stance it was made in (meta.json `stance`). */
  stance: string;
  /** The trades it is for (meta.json `trades`). */
  trades: readonly BusinessType[];
}

/** Every studio reference that passes the harness, by id. */
export const STUDIO_REFERENCES: readonly ReferenceEntry[] = [
  { id: "avtoservis-golob", stance: "enamel-house-plate", trades: ["car-repair"] },
  { id: "pekarna-zrno", stance: "kitchen-index-card", trades: ["bakery"] },
  // I10b: the first ten of the forty (decision D3).
  { id: "mizarstvo-rozman", stance: "technical-drawing", trades: ["builder"] },
  { id: "zobna-ambulanta-hribar", stance: "station-timetable", trades: ["dental"] },
  { id: "cebelarstvo-zalokar", stance: "beehive-panel", trades: ["shop"] },
  { id: "kmetija-ravnjak", stance: "pratika-almanac", trades: ["tourist-farm"] },
  { id: "gostilna-horvat", stance: "prekmurje-pottery", trades: ["restaurant"] },
  { id: "frizerstvo-vesna", stance: "ljubljana-sixties-poster", trades: ["hairdresser"] },
  { id: "racunovodstvo-kovac", stance: "brass-door-plate", trades: ["accountant"] },
  { id: "fizioterapija-kobal", stance: "soca-green", trades: ["physio"] },
  { id: "cvetlicarna-pirc", stance: "line-drawing", trades: ["shop"] },
  { id: "siviljstvo-mlakar", stance: "sewing-pattern", trades: ["shop"] },
  // I10c: twelve more (24 in all).
  { id: "pekarna-zitnik", stance: "woodcut", trades: ["bakery"] },
  { id: "gostilna-pod-lipo", stance: "bracket-sign", trades: ["restaurant"] },
  { id: "jedilnica-brin", stance: "colour-block", trades: ["restaurant"] },
];

/** The references as inventory assets: drafts, no bytes of their own (a page, not a part of one). */
export function referenceAssets(): Asset[] {
  return STUDIO_REFERENCES.map((r) => ({
    id: `reference/${r.id}`,
    kind: "reference",
    tags: { trades: [...r.trades], stances: [r.stance], intents: [], mood: [], ground: [], density: [] },
    phone: "ok",
    bytes: 0,
    license: "own",
    status: "draft",
  }));
}
