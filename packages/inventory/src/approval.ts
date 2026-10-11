/**
 * The owner's approval round (docs/plans/studio-phase2-design.md P4b): the 30 composer example pages are shown with
 * their parts; the owner taps what they don't like. This file is the pure part: which registered assets a composed page
 * shows (`shownAssets`, with a per-part breakdown the rating page turns into tappable cards), and how the owner's taps
 * become inventory decisions (`approvalDecisions`). The pictures and the page are tools/approval and
 * tools/eval/src/approval-build.ts.
 */
import type { SiteSpec } from "@sb/spec";
import type { ComposeUsed } from "./composer.ts";
import type { GalleryRow } from "./decisions.ts";
import type { Registry } from "./registry.ts";

// ---------- what a composed page shows ----------

/** One tappable part of a page: a section, or a page-wide thing (colours, fonts, name lettering, motion). */
export interface ShownPart {
  /** Unique on the page: `s1`…`sN`, `colours`, `fonts`, `lettering`, `motion`, `drawing`. */
  id: string;
  /** Plain English, for the owner: "Section 3 — opening hours", "Colours". */
  label: string;
  /** Registered asset ids this part shows. */
  assets: string[];
}

export interface Shown {
  /** Every registered asset id the page shows (the union of the parts), sorted. */
  assets: string[];
  parts: ShownPart[];
}

const INTENT_LABEL: Record<string, string> = {
  area: "service area",
  booking: "booking",
  call: "call to action",
  contact: "contact",
  faq: "questions and answers",
  gallery: "gallery",
  hero: "opening",
  highlights: "highlights",
  hours: "opening hours",
  menu: "menu",
  notice: "notice bar",
  "page-head": "page heading",
  prices: "prices",
  products: "products",
  rooms: "rooms",
  services: "services",
  steps: "steps",
  story: "story",
  team: "team",
};

/** "composition/hours/heading-table" → "opening hours". */
export function intentLabel(presetId: string): string {
  const intent = presetId.split("/")[1] ?? "";
  return INTENT_LABEL[intent] ?? intent.replace(/-/g, " ");
}

type Json = unknown;
const isObject = (v: Json): v is Record<string, Json> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Which id prefixes a `treatment` value may name, by the kind of the element it sits in (image treatments, fact objects, type treatments). */
function treatmentPrefixes(kind: string): string[] {
  if (kind === "fact") return ["fact", "treatment", "type-treatment"];
  if (kind === "heading" || kind === "text" || kind === "quote") return ["type-treatment", "fact", "treatment"];
  return ["treatment", "fact", "type-treatment"];
}

/** Candidate asset ids for a spec field; only the registered ones are kept by the caller. */
function candidates(key: string, value: string, kind: string): string[] {
  switch (key) {
    case "drawing":
      return [value];
    case "motif":
      return [value.includes("/") ? value : `motif/${value}`];
    case "mask":
    case "texture":
    case "motion":
      return [`${key}/${value}`];
    case "treatment":
      return treatmentPrefixes(kind).map((p) => `${p}/${value}`);
    default:
      return [];
  }
}

const KEYS = new Set(["drawing", "motif", "mask", "texture", "motion", "treatment"]);

/** The registered asset ids a piece of spec (a section, a chrome part) refers to, found by walking its fields. */
function walkRefs(node: Json, kind: string, registry: Registry, amenities: readonly string[], out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const x of node) walkRefs(x, kind, registry, amenities, out);
    return;
  }
  if (!isObject(node)) return;
  const here = typeof node.kind === "string" ? node.kind : kind;
  if (here === "iconFacts") {
    const style = typeof node.icons === "string" ? node.icons : "line";
    for (const fact of amenities) if (registry.byId(`icon/${style}/${fact}`)) out.add(`icon/${style}/${fact}`);
  }
  for (const [k, v] of Object.entries(node)) {
    if (typeof v === "string" && KEYS.has(k)) {
      const hit = candidates(k, v, here).find((id) => registry.byId(id));
      if (hit) out.add(hit);
    } else walkRefs(v, here, registry, amenities, out);
  }
}

/**
 * Every registered asset a composed homepage shows, with the breakdown the owner taps: one part per section (the
 * composition preset and the drawings, motifs, masks, treatments, textures, motion, type treatments, fact objects and
 * icons its elements use), then Colours, Fonts, Name lettering and Motion for what is page-wide. Section i is preset i
 * (the composer builds the homepage's sections in the order of `used.presets`). Ids the inventory does not register
 * (a code-drawn thing with no asset) are left out.
 */
export function shownAssets(spec: SiteSpec, used: ComposeUsed, registry: Registry): Shown {
  const sections = spec.pages[0]?.sections ?? [];
  const amenities = ((spec.business as { amenities?: string[] }).amenities ?? []) as string[];
  const known = (id: string | null | undefined): id is string => !!id && !!registry.byId(id);
  const parts: ShownPart[] = [];
  used.presets.forEach((preset, i) => {
    const ids = new Set<string>();
    if (known(preset)) ids.add(preset);
    walkRefs(sections[i], "", registry, amenities, ids);
    parts.push({ id: `s${i + 1}`, label: `Section ${i + 1} — ${intentLabel(preset)}`, assets: [...ids].sort() });
  });
  const inSections = new Set(parts.flatMap((p) => p.assets));
  if (known(used.drawing) && !inSections.has(used.drawing)) parts.push({ id: "drawing", label: "Background drawing", assets: [used.drawing] });
  if (known(used.palette)) parts.push({ id: "colours", label: "Colours", assets: [used.palette] });
  if (known(used.pairing)) parts.push({ id: "fonts", label: "Fonts", assets: [used.pairing] });
  if (known(used.wordmark)) parts.push({ id: "lettering", label: "Name lettering", assets: [used.wordmark] });
  const motion = new Set<string>();
  walkRefs({ motion: (spec.design as { motion?: string }).motion }, "", registry, [], motion);
  if (motion.size) parts.push({ id: "motion", label: "Motion", assets: [...motion] });
  return { assets: [...new Set(parts.flatMap((p) => p.assets))].sort(), parts };
}

// ---------- the round's files ----------

export interface ApprovalPart extends ShownPart {
  /** The crop's path relative to the page (`img/p03-s2.jpg`), or null for a card without a picture. */
  image: string | null;
  /** Colours: the palette's swatches. */
  swatches?: string[];
}

export interface ApprovalItemPage {
  /** `p01`…`p30`. */
  id: string;
  title: string;
  fixtureId: string;
  stance: string;
  seed: number;
  kind: "named" | "extra";
  /** Whole-page pictures at 1280 and 360 px. */
  desktop: string;
  phone: string;
  parts: ApprovalPart[];
}

export interface ApprovalItems {
  pages: ApprovalItemPage[];
}

/** What the rating page stores per page (artifact collection `flags`, doc id = page id). */
export interface PageFlags {
  pageId: string;
  /** Part ids the owner tapped ("I don't like this"). */
  flagged: string[];
  note?: string;
  /** "Done with this page": the parts not flagged count as seen and fine. */
  done: boolean;
  at?: string;
}

// ---------- taps into decisions ----------

export interface DecisionPage {
  id: string;
  parts: { id: string; assets: readonly string[] }[];
}

/**
 * The inventory decisions the owner's taps amount to. An asset flagged on any page is rejected; an asset shown on a
 * page marked done and never flagged is approved; an asset never shown stays draft (no row). A page not marked done
 * counts as not shown, but a flag on it still counts. Only assets that are draft in the registry and have no entry in
 * `current` (the decisions already made) get a row: earlier ratings and the starter set are never overwritten.
 */
export function approvalDecisions(
  pages: readonly DecisionPage[],
  flags: readonly PageFlags[],
  current: Readonly<Record<string, unknown>>,
  registry: Registry,
): GalleryRow[] {
  const byPage = new Map(flags.map((f) => [f.pageId, f]));
  const flaggedOn = new Map<string, string[]>();
  const shownOn = new Map<string, string[]>();
  for (const page of pages) {
    const f = byPage.get(page.id);
    const tapped = new Set(f?.flagged ?? []);
    for (const part of page.parts) {
      const bucket = tapped.has(part.id) ? flaggedOn : f?.done ? shownOn : null;
      if (!bucket) continue;
      for (const id of part.assets) {
        const list = bucket.get(id) ?? [];
        if (!list.includes(page.id)) list.push(page.id);
        bucket.set(id, list);
      }
    }
  }
  const rows: GalleryRow[] = [];
  const open = (id: string) => registry.byId(id)?.status === "draft" && !(id in current);
  for (const [id, on] of [...flaggedOn].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (open(id)) rows.push({ id, status: "rejected", reason: `flagged on ${on.join(", ")}`.slice(0, 400) });
  }
  for (const [id, on] of [...shownOn].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (flaggedOn.has(id) || !open(id)) continue;
    rows.push({ id, status: "approved", reason: `shown on ${on.join(", ")}, not flagged`.slice(0, 400) });
  }
  return rows;
}

export interface ApprovalSummary {
  approved: number;
  rejected: number;
  /** Draft assets (no decision yet) that this round's export leaves as they are, by kind. */
  stillDraft: Record<string, number>;
  stillDraftTotal: number;
}

/** Counts for the export's printout: rows per status, and the draft assets the rows leave undecided. */
export function summarizeApproval(rows: readonly GalleryRow[], current: Readonly<Record<string, unknown>>, registry: Registry): ApprovalSummary {
  const decided = new Set(rows.map((r) => r.id));
  const stillDraft: Record<string, number> = {};
  for (const a of registry.all()) {
    if (a.status !== "draft" || a.id in current || decided.has(a.id)) continue;
    stillDraft[a.kind] = (stillDraft[a.kind] ?? 0) + 1;
  }
  return {
    approved: rows.filter((r) => r.status === "approved").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
    stillDraft,
    stillDraftTotal: Object.values(stillDraft).reduce((n, v) => n + v, 0),
  };
}
