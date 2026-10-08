import { FONT_PAIRS, type Design, type HeaderFamily } from "@sb/spec";

/**
 * How many menu entries fit in one row of the wide header (it-plan-limits: Plus has up to 20 pages). The rest sit
 * under "Več", a disclosure at the end of the row; on phones the menu lists every entry. Decided when the page is
 * rendered, so the preview equals the published page and nothing moves after load: each entry's text width is
 * estimated from its characters and the site's type tokens, on the narrowest width of each wide range (the shared
 * stylesheet's 48, 64 and 80 rem breakpoints), with a measured margin for each of the site's two faces. An estimate that is
 * still short only wraps the row (the list wraps, 8 px apart); nothing is hidden or clipped.
 */

/** The breakpoint (rem) from which an entry stands in the row; undefined: from 48 rem (every wide width). */
export type NavFit = "64" | "80" | "never";

/** Viewport (px) and container content width (px) at each wide breakpoint: 2rem padding each side, 76rem at most. */
const STEPS: { fit: NavFit | undefined; viewport: number; content: number }[] = [
  { fit: undefined, viewport: 768, content: 704 },
  { fit: "64", viewport: 1024, content: 960 },
  { fit: "80", viewport: 1280, content: 1152 },
];

/** Families whose nav has a row of its own under the brand. */
const OWN_ROW: readonly HeaderFamily[] = ["stacked", "centred"];

/** Width of `text` in em at about weight 600–700, before the face's margin (BODY_FACE, HEADING_FACE). */
export function textEm(text: string, upper = false, tracking = 0): number {
  let em = 0;
  for (const ch of upper ? text.toUpperCase() : text) {
    em += tracking;
    if ("iljı'.,:;|!".includes(ch)) em += 0.28;
    else if ("ftr ".includes(ch)) em += 0.36;
    else if ("mw".includes(ch)) em += 0.86;
    else if ("MW".includes(ch)) em += 0.96;
    else if ("IJ".includes(ch)) em += 0.34;
    else if ((ch >= "A" && ch <= "Z") || "ČŠŽĆĐ".includes(ch)) em += 0.7;
    else em += 0.58;
  }
  return em;
}

/**
 * Each face's widest measured width over textEm (Chromium, 2026-10-08: Slovene menu labels and business names, weight
 * 600 for body faces, 400–900 with upper case and tracking for heading faces), times 1.05. A face not listed: the
 * widest of all (body 1.04, heading 1.15) times 1.05.
 */
const BODY_FACE: Record<string, number> = {
  Inter: 1.033,
  "Source Sans 3": 0.926,
  Karla: 1.002,
  Archivo: 1.004,
  "Public Sans": 0.992,
  "Nunito Sans": 0.996,
  "Libre Franklin": 1.026,
  Figtree: 0.983,
  "IBM Plex Sans": 0.985,
  "DM Sans": 1.021,
};
const HEADING_FACE: Record<string, number> = {
  "Inter Tight": 1.035,
  Fraunces: 1.117,
  "EB Garamond": 1.034,
  Archivo: 1.15,
  Manrope: 1.049,
  Bitter: 1.038,
  Newsreader: 1.088,
  "Bricolage Grotesque": 1.065,
  "Space Grotesk": 1.026,
  Lora: 1.041,
  "IBM Plex Sans": 1.016,
  Figtree: 1.025,
};
const MARGIN = 1.05;

type TypeTokens = Pick<Design, "fontPair" | "baseFontSize" | "scale" | "headingCase" | "headingTracking">;

/** --fs-lg at a viewport width (render tokens.ts: fluid from b × 1.06 at 360 px to b × scale at 1280 px). */
function fsLg(d: TypeTokens, viewport: number): number {
  const min = d.baseFontSize * 1.06;
  const max = d.baseFontSize * d.scale;
  if (max <= min) return min;
  return Math.min(max, Math.max(min, min + ((max - min) * (viewport - 360)) / 920));
}

export interface NavRow {
  family: HeaderFamily;
  design: TypeTokens;
  /** The business name as the brand, or the logo's size (shown at most 2.5rem tall, 2rem in the compact family). */
  brand: { name: string } | { logo: { width: number; height: number } };
  /** The header's button at wide widths. */
  button?: { label: string; icon: boolean; large: boolean };
  /** The directions link's label, when the header carries it. */
  directions?: string;
  /** The phone family's number. */
  phone?: string;
  /** The "Več" label. */
  more: string;
}

/** Each entry's NavFit, in order; an entry fits from a breakpoint on, and so does every entry before it. */
export function navFit(labels: string[], row: NavRow): (NavFit | undefined)[] {
  const d = row.design;
  const upper = d.headingCase === "uppercase";
  const pair = FONT_PAIRS.find((p) => p.id === d.fontPair);
  const headingFace = (HEADING_FACE[pair?.heading.family ?? ""] ?? 1.15) * MARGIN;
  const bodyFace = (BODY_FACE[pair?.body.family ?? ""] ?? 1.04) * MARGIN;
  const heading = (s: string, size: number) => textEm(s, upper, d.headingTracking) * size * headingFace;
  const body = (s: string, size: number) => textEm(s) * size * bodyFace;
  const ks = STEPS.map((step) => {
    const lg = fsLg(d, step.viewport);
    const b = d.baseFontSize;
    const sm = Math.max(14, b / d.scale);
    // The entries' own type (chrome.css, skeleton.css): the heading face in word and overlay, small in compact.
    const face = row.family === "word" || row.family === "overlay" ? (s: string) => heading(s, lg) : (s: string) => body(s, row.family === "compact" ? sm : b);
    const gap = row.family === "centred" ? 40 : row.family === "word" || row.family === "overlay" ? 32 : 24;
    const width = (s: string) => Math.max(44, face(s));
    // "Več" and its chevron.
    const more = Math.max(44, face(row.more) + 0.9 * (row.family === "word" || row.family === "overlay" ? lg : b));
    let avail = step.content;
    if (!OWN_ROW.includes(row.family)) {
      const parts: number[] = [];
      if ("logo" in row.brand) {
        const h = row.family === "compact" ? 32 : 40;
        parts.push(Math.max(44, (row.brand.logo.width / row.brand.logo.height) * h));
      } else parts.push(Math.max(44, heading(row.brand.name, row.family === "compact" ? b : lg)));
      if (row.phone) parts.push(heading(row.phone, lg) + 1.15 * lg + 0.4 * lg);
      const actions: number[] = [];
      if (row.button) {
        const size = row.button.large ? lg : b;
        actions.push(body(row.button.label, size) + (row.button.large ? 48 : 28) + 4 + (row.button.icon ? 1.15 * size + 8 : 0));
      }
      if (row.directions) actions.push(body(row.directions, b) + 1.15 * b + 0.4 * b);
      if (actions.length) parts.push(actions.reduce((a, w) => a + w, 0) + 16 * (actions.length - 1));
      // The nav and every part, 2rem apart.
      avail -= parts.reduce((a, w) => a + w, 0) + 32 * parts.length;
    }
    let k = 0;
    let used = 0;
    for (const [i, label] of labels.entries()) {
      const next = used + (i > 0 ? gap : 0) + width(label);
      const rest = i < labels.length - 1 ? gap + more : 0;
      if (next + rest > avail) break;
      used = next;
      k = i + 1;
    }
    return k;
  });
  // An entry in the row at one width stays in it at every wider one (the heading face grows with the viewport).
  for (let s = ks.length - 2; s >= 0; s--) ks[s] = Math.min(ks[s]!, ks[s + 1]!);
  return labels.map((_, i) => {
    const s = ks.findIndex((k) => i < k);
    return s < 0 ? "never" : STEPS[s]!.fit;
  });
}

/**
 * The business name's width in em of the site's heading face (its case and tracking, the face's measured margin
 * included): the phone header of a site with a skeleton sets the name at the size that fits its row (skeleton.css
 * --name-em), so a long name stays on one line (HQ it-skeleton-phone-header-wrap).
 */
export function nameEm(name: string, d: TypeTokens): number {
  const pair = FONT_PAIRS.find((p) => p.id === d.fontPair);
  return textEm(name, d.headingCase === "uppercase", d.headingTracking) * (HEADING_FACE[pair?.heading.family ?? ""] ?? 1.15) * MARGIN;
}
