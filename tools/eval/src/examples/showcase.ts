import { readFileSync } from "node:fs";
import path from "node:path";
import {
  SHOWCASES,
  collectPlaceholders,
  contrast,
  ensureContrast,
  fontPair,
  hexToRgb,
  luminance,
  migrateSpec,
  rgbToHex,
  validateSite,
  type Showcase,
  type SiteSpec,
} from "@sb/spec";
import { sharedBundle } from "@sb/render";
import { ROOT } from "./examples.ts";

/**
 * The landing page's trade showcase (packages/spec/src/showcase.ts): each golden site in its showcase
 * colourway, with its few homepage gaps filled the way an owner would, and the landing page's own tokens
 * recoloured from it. `pnpm examples:build` writes the sites and apps/web/src/ui/examples/showcase.json.
 */

/** Gaps a golden homepage leaves (missing prices, the provider's details), filled for the showcase. */
const PRICES: Record<string, Record<string, number>> = {
  "frizerstvo-lana": { "/pages/0/sections/2/props/groups/0/items/5/price": 35, "/pages/0/sections/2/props/groups/0/items/6/price": 18 },
  "gostilna-zlata-zlica": { "/pages/0/sections/2/props/items/3/price": 7.5, "/pages/0/sections/2/props/items/4/price": 12.9 },
  "pekarna-kvas": { "/pages/0/sections/2/props/items/4/price": 0.9, "/pages/0/sections/2/props/items/5/price": 1.6 },
};

function setAt(doc: unknown, pointer: string, value: unknown): void {
  const keys = pointer.split("/").slice(1);
  const last = keys.pop()!;
  let node = doc as Record<string, unknown>;
  for (const k of keys) node = node[k] as Record<string, unknown>;
  if (!node || !(last in node)) throw new Error(`no value at ${pointer}`);
  node[last] = value;
}

export const showcaseSlug = (s: Showcase) => `primer-${s.id}`;

export function showcaseSpec(s: Showcase): SiteSpec {
  const raw = JSON.parse(readFileSync(path.join(ROOT, "tools/eval/golden", `${s.golden}.json`), "utf8")) as SiteSpec;
  raw.slug = showcaseSlug(s);
  raw.design.colors = { ...s.colors };
  const name = raw.business.name;
  for (const p of collectPlaceholders(migrateSpec(structuredClone(raw)))) {
    if (p.path.startsWith("/pages/") && !p.path.startsWith("/pages/0/")) continue;
    const price = PRICES[s.golden]?.[p.path];
    if (price !== undefined) setAt(raw, p.path, { amount: price });
    else if (p.kind === "legalName") setAt(raw, p.path, `${name} d.o.o.`);
    else if (p.kind === "registrationNumber") setAt(raw, p.path, "8123456000");
    else if (p.kind === "taxNumber") setAt(raw, p.path, "81234567");
    else if (p.kind === "email") setAt(raw, p.path, `info@${s.golden}.example`);
    else throw new Error(`${s.id}: no fill for ${p.path} (${p.kind})`);
  }
  const spec = migrateSpec(raw);
  const v = validateSite(spec);
  if (!v.ok) throw new Error(`${s.id}: ${v.issues.map((i) => `${i.path} ${i.message}`).join("; ")}`);
  const left = collectPlaceholders(spec).filter((p) => p.path.startsWith("/pages/0/") || !p.path.startsWith("/pages/"));
  if (left.length) throw new Error(`${s.id}: unfilled on the homepage: ${left.map((p) => p.path).join(", ")}`);
  return spec;
}

const mix = (a: string, b: string, t: number): string => {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex([0, 1, 2].map((i) => Math.round(x[i]! * (1 - t) + y[i]! * t)) as [number, number, number]);
};

/** The text colour that passes 4.5:1 on every background in `bgs`. */
function passOnAll(fg: string, bgs: string[], min = 4.5): string {
  let c = fg;
  for (let pass = 0; pass < 4; pass++) for (const bg of bgs) c = ensureContrast(c, bg, min);
  return c;
}

/**
 * The landing page's tokens (apps/web/src/ui/home.css :root) recoloured from a showcase: the page
 * itself takes the trade's colours, heading face and corner radius. Every text pair keeps 4.5:1.
 */
export function landingVars(spec: SiteSpec): Record<string, string> {
  const c = spec.design.colors;
  const dark = luminance(c.background) < 0.2;
  const canvas = dark ? c.background : mix(c.surface, c.background, 0.5);
  const surface = dark ? c.surface : c.background;
  const surface2 = dark ? mix(c.surface, c.border, 0.5) : c.surface;
  const grounds = [canvas, surface, surface2];
  const ink = passOnAll(c.text, grounds);
  const ink2 = passOnAll(c.muted, grounds);
  const accentHover = mix(c.primary, dark ? "#ffffff" : "#000000", 0.16);
  const accentSoft = mix(c.primary, surface, dark ? 0.8 : 0.88);
  const onInk = c.background;
  const r = spec.design.radius;
  const heading = fontPair(spec.design.fontPair).heading;
  const generic = heading.fallback === "serif" ? "Georgia, serif" : "system-ui, sans-serif";
  return {
    "--canvas": canvas,
    "--surface": surface,
    "--surface-2": surface2,
    "--ink": ink,
    "--ink-2": ink2,
    "--ink-3": ink2,
    "--line": c.border,
    "--line-2": mix(c.border, c.text, 0.18),
    "--accent": c.primary,
    "--accent-ink": passOnAll(c.onPrimary, [c.primary, accentHover]),
    "--accent-hover": accentHover,
    "--accent-soft": accentSoft,
    "--accent-text": passOnAll(c.primary, [accentSoft, ...grounds]),
    "--on-ink": onInk,
    "--on-ink-2": passOnAll(mix(onInk, ink, 0.3), [ink]),
    "--calling": passOnAll(mix(c.primary, onInk, 0.6), [ink]),
    "--link": passOnAll(dark ? "#8ab4f8" : "#1a4fa8", [surface]),
    "--font-display": `"${heading.family}", ${generic}`,
    "--h1-weight": String(Math.min(800, Math.max(500, spec.design.headingWeight))),
    "--r-1": `${Math.min(r, 4)}px`,
    "--r-2": `${r}px`,
    "--r-3": `${r === 0 ? 0 : Math.min(16, r + 4)}px`,
    "color-scheme": dark ? "dark" : "light",
  };
}

/** One showcase as the landing page uses it (showcase.json). Paths are under the examples folder. */
export interface ShowcaseEntry {
  id: string;
  label: string;
  forWhom: string;
  name: string;
  page: string;
  /** Photos on the site (the caption says they were made with AI). */
  photos: number;
  font: { family: string; file: string; weights: [number, number] };
  vars: Record<string, string>;
}

export function showcaseEntry(s: Showcase, sharedHash: string): ShowcaseEntry {
  const spec = showcaseSpec(s);
  const heading = fontPair(spec.design.fontPair).heading;
  return {
    id: s.id,
    label: s.label,
    forWhom: s.forWhom,
    name: spec.business.name,
    page: `${showcaseSlug(s)}/index.html`,
    photos: spec.assets.images.length,
    font: { family: heading.family, file: `_shared/${sharedHash}/fonts/${heading.file}.woff2`, weights: heading.weights },
    vars: landingVars(spec),
  };
}

/** Where the landing page reads the showcase (under the examples folder). */
export const SHOWCASE_JSON = "showcase.json";

/** showcase.json: every showcase in chip order. The shared hash is masked in tests (line endings). */
export function showcaseJson(): string {
  const hash = sharedBundle().hash;
  return `${JSON.stringify(SHOWCASES.map((s) => showcaseEntry(s, hash)), null, 2)}\n`;
}

export { SHOWCASES, contrast };
