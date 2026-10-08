/**
 * How alike two generated homepages look (docs/plans/variety-engine.md, Step 0): a look distance from 0 (the same
 * site) to 1, from the spec and from the first screens at 360 and 1280 px, reported per trade and across trades. Plus
 * brand fit (does a logo colour reach the site's colour roles) and motif fit (does the drawn motif belong to the
 * trade). Free and offline: no model call.
 */
import sharp from "sharp";
import { deltaE, hexToHsl, siteMotif, type Motif, type SiteSpec, type SubMotif } from "@sb/spec";

/** What a homepage's look is made of, read from its spec. */
export interface LookFeatures {
  direction: string;
  fontPair: string;
  /** Primary, band (primary when none) and page background. */
  palette: { primary: string; band: string; background: string; accent: string };
  hero: { type: string; variant: string };
  header: { variant: string; tone: string };
  /** Homepage sections as type:variant:tone, top to bottom. */
  sequence: string[];
  /** The drawn motif: the sub-trade's on its template (spec v15 business.subtype), else the template's. */
  motif: Motif | SubMotif | null;
}

export function lookFeatures(spec: SiteSpec): LookFeatures {
  const home = spec.pages.find((p) => p.kind === "home") ?? spec.pages[0]!;
  const c = spec.design.colors;
  const first = home.sections[0];
  const header = spec.chrome.header as { variant: string; tone?: string };
  return {
    direction: spec.design.direction,
    fontPair: spec.design.fontPair,
    palette: { primary: c.primary, band: c.band ?? c.primary, background: c.background, accent: c.accent },
    hero: { type: first?.type ?? "none", variant: first?.variant ?? "none" },
    header: { variant: header.variant, tone: header.tone ?? "default" },
    sequence: home.sections.map((s) => `${s.type}:${s.variant}:${(s as { tone?: string }).tone ?? "default"}`),
    motif: ((m) => m.sub ?? m.motif ?? null)(siteMotif(spec)),
  };
}

/** Levenshtein distance of two sequences. */
function editDistance(a: string[], b: string[]): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length]!;
}

/** ΔE at which two colours count as entirely different for the distance (a saturated yellow vs a dark navy ≈ 90). */
const DELTA_E_FULL = 50;

/** The spec's part of the look distance, each component 0..1. */
export function specDistance(a: LookFeatures, b: LookFeatures): { total: number; parts: Record<string, number> } {
  const de = (x: string, y: string) => Math.min(1, deltaE(x, y) / DELTA_E_FULL);
  const parts = {
    direction: a.direction === b.direction ? 0 : 1,
    fontPair: a.fontPair === b.fontPair ? 0 : 1,
    palette: (de(a.palette.primary, b.palette.primary) + de(a.palette.band, b.palette.band) + de(a.palette.background, b.palette.background)) / 3,
    hero: a.hero.type !== b.hero.type ? 1 : a.hero.variant !== b.hero.variant ? 0.5 : 0,
    header: (a.header.variant === b.header.variant ? 0 : 0.5) + (a.header.tone === b.header.tone ? 0 : 0.5),
    sections: editDistance(a.sequence, b.sequence) / Math.max(1, a.sequence.length, b.sequence.length),
  };
  const values = Object.values(parts);
  return { total: values.reduce((s, v) => s + v, 0) / values.length, parts };
}

/** A first screen reduced for comparison: a small grey thumbnail's gradients and a coarse colour histogram. */
export interface ScreenPrint {
  width: number;
  height: number;
  gradient: Float64Array;
  histogram: Float64Array;
}

const THUMB_W = 48;
const BINS = 4;

export async function screenPrint(png: Uint8Array): Promise<ScreenPrint> {
  const meta = await sharp(png).metadata();
  const height = Math.max(8, Math.round((THUMB_W * (meta.height ?? THUMB_W)) / (meta.width ?? THUMB_W)));
  const rgb = await sharp(png).removeAlpha().resize(THUMB_W, height, { fit: "fill" }).raw().toBuffer();
  const grey = new Float64Array(THUMB_W * height);
  const histogram = new Float64Array(BINS ** 3);
  for (let i = 0; i < grey.length; i++) {
    const [r, g, b] = [rgb[i * 3]!, rgb[i * 3 + 1]!, rgb[i * 3 + 2]!];
    grey[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    const bin = (v: number) => Math.min(BINS - 1, Math.floor((v * BINS) / 256));
    histogram[bin(r) * BINS * BINS + bin(g) * BINS + bin(b)]! += 1 / grey.length;
  }
  // Gradient magnitude: where the layout's edges are (blocks, text lines, photo borders).
  const gradient = new Float64Array(grey.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < THUMB_W; x++) {
      const at = (xx: number, yy: number) => grey[Math.min(height - 1, Math.max(0, yy)) * THUMB_W + Math.min(THUMB_W - 1, Math.max(0, xx))]!;
      gradient[y * THUMB_W + x] = Math.hypot(at(x + 1, y) - at(x - 1, y), at(x, y + 1) - at(x, y - 1));
    }
  }
  return { width: THUMB_W, height, gradient, histogram };
}

/** 0..1: (1 − correlation of the gradient maps) / 2 for structure; 1 − histogram intersection for colour. */
export function screenDistance(a: ScreenPrint, b: ScreenPrint): { structure: number; colour: number } {
  const n = Math.min(a.gradient.length, b.gradient.length);
  const mean = (v: Float64Array) => v.slice(0, n).reduce((s, x) => s + x, 0) / n;
  const ma = mean(a.gradient);
  const mb = mean(b.gradient);
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    const da = a.gradient[i]! - ma;
    const db = b.gradient[i]! - mb;
    cov += da * db;
    va += da * da;
    vb += db * db;
  }
  const corr = va && vb ? cov / Math.sqrt(va * vb) : va === vb ? 1 : 0;
  let shared = 0;
  for (let i = 0; i < a.histogram.length; i++) shared += Math.min(a.histogram[i]!, b.histogram[i]!);
  return { structure: (1 - corr) / 2, colour: 1 - shared };
}

/** One site for the look comparison. `shots`: the first screens, when the run made them. */
export interface LookSite {
  id: string;
  /** The trade group: the business type. */
  trade: string;
  features: LookFeatures;
  shots?: { mobile: ScreenPrint; desktop: ScreenPrint };
}

export interface PairDistance {
  a: string;
  b: string;
  sameTrade: boolean;
  spec: number;
  screens: number | null;
  /** Spec and screens weighted equally; the spec alone when there are no screens. */
  total: number;
  /** Same palette family (primary and band within ΔE 10), font pair and hero: a visitor would see one template. */
  collide: boolean;
}

export function pairDistance(a: LookSite, b: LookSite): PairDistance {
  const spec = specDistance(a.features, b.features);
  let screens: number | null = null;
  if (a.shots && b.shots) {
    const m = screenDistance(a.shots.mobile, b.shots.mobile);
    const d = screenDistance(a.shots.desktop, b.shots.desktop);
    screens = (m.structure + m.colour + d.structure + d.colour) / 4;
  }
  const samePalette = deltaE(a.features.palette.primary, b.features.palette.primary) < 10 && deltaE(a.features.palette.band, b.features.palette.band) < 10;
  return {
    a: a.id,
    b: b.id,
    sameTrade: a.trade === b.trade,
    spec: spec.total,
    screens,
    total: screens === null ? spec.total : (spec.total + screens) / 2,
    collide: samePalette && a.features.fontPair === b.features.fontPair && a.features.hero.type === b.features.hero.type && a.features.hero.variant === b.features.hero.variant,
  };
}

export interface LookSummary {
  pairs: PairDistance[];
  /** Mean look distance of pairs of different trades (null: fewer than two trades). */
  acrossTrades: number | null;
  /** Mean look distance of pairs within one trade, per trade (trades with one site have none). */
  withinTrade: Record<string, { pairs: number; mean: number; min: number }>;
  /** Mean over every within-trade pair (null: none). */
  withinTradeAll: number | null;
  collisions: PairDistance[];
}

export function lookSummary(sites: LookSite[]): LookSummary {
  const pairs: PairDistance[] = [];
  for (let i = 0; i < sites.length; i++) for (let j = i + 1; j < sites.length; j++) pairs.push(pairDistance(sites[i]!, sites[j]!));
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  const within: LookSummary["withinTrade"] = {};
  for (const trade of [...new Set(sites.map((s) => s.trade))].sort()) {
    const ps = pairs.filter((p) => p.sameTrade && sites.find((s) => s.id === p.a)!.trade === trade).map((p) => p.total);
    if (ps.length) within[trade] = { pairs: ps.length, mean: mean(ps)!, min: Math.min(...ps) };
  }
  return {
    pairs,
    acrossTrades: mean(pairs.filter((p) => !p.sameTrade).map((p) => p.total)),
    withinTrade: within,
    withinTradeAll: mean(pairs.filter((p) => p.sameTrade).map((p) => p.total)),
    collisions: pairs.filter((p) => p.collide),
  };
}

/** ΔE under which a logo colour counts as having reached a colour role. */
export const BRAND_FIT_DELTA_E = 20;

export type BrandFit = { kind: "no-logo" } | { kind: "no-colour" } | { kind: "fit" | "miss"; deltaE: number; logo: string; role: "primary" | "band" | "accent" };

/**
 * Whether a usable logo colour (not near-white, near-black or grey; extractSwatches already skips those) reaches
 * primary, band or accent: the closest pair, and "fit" when it is within BRAND_FIT_DELTA_E.
 */
export function brandFit(features: LookFeatures, logoColours: string[] | null): BrandFit {
  if (!logoColours) return { kind: "no-logo" };
  const usable = logoColours.filter((h) => hexToHsl(h).s >= 0.15);
  if (!usable.length) return { kind: "no-colour" };
  let best: { deltaE: number; logo: string; role: "primary" | "band" | "accent" } | null = null;
  for (const logo of usable) {
    for (const role of ["primary", "band", "accent"] as const) {
      const d = deltaE(logo, features.palette[role]);
      if (!best || d < best.deltaE) best = { deltaE: d, logo, role };
    }
  }
  return { kind: best!.deltaE <= BRAND_FIT_DELTA_E ? "fit" : "miss", ...best! };
}

/**
 * Which trades each drawn motif belongs to: "<business type>" for the type's usual trade, "<type>/<trade>" for a
 * trade the fixture names (tools/eval fixture `trade`). The pipes belong to plumbing and heating, not to an
 * electrician or a carpenter; the bottle label to a deli, not to a florist.
 */
export const MOTIF_TRADES: Record<Motif | SubMotif, string[]> = {
  plate: ["car-repair", "car-repair/servis", "car-repair/gume", "car-repair/karoserija"],
  pipes: ["builder", "builder/vodovod", "builder/ogrevanje"],
  crust: ["bakery"],
  ledger: ["accountant"],
  label: ["shop"],
  spoon: ["restaurant", "restaurant/pizzerija"],
  mirror: ["hairdresser", "hairdresser/brivnica"],
  smile: ["dental"],
  trail: ["tourist-farm"],
  bend: ["physio"],
  // Sub-trade motifs (variety engine Step 3), drawn when the business subtype picks them.
  wire: ["builder/elektro"],
  joint: ["builder/mizar"],
  tiles: ["builder/krovec"],
  strip: ["builder/pleskar"],
  stem: ["shop/cvetličarna"],
  tag: ["shop/butik"],
};

export type MotifFit = "fit" | "misfit" | "no-motif";

export function motifFit(motif: Motif | SubMotif | null, businessType: string, trade?: string): MotifFit {
  if (!motif) return "no-motif";
  return MOTIF_TRADES[motif].includes(trade ? `${businessType}/${trade}` : businessType) ? "fit" : "misfit";
}
