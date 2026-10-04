import { readFileSync } from "node:fs";
import path from "node:path";
import { SHOWCASES, collectPlaceholders, migrateSpec, validateSite, type Showcase, type SiteSpec } from "@sb/spec";
import { ROOT } from "./examples.ts";

/**
 * The landing page's trade showcase (packages/spec/src/showcase.ts): each golden site in its showcase
 * colourway, with its few homepage gaps filled the way an owner would. `pnpm examples:build` writes the
 * sites and apps/web/src/ui/examples/showcase.json; the landing page itself keeps its own look.
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

/** One showcase as the landing page uses it (showcase.json). Paths are under the examples folder. */
export interface ShowcaseEntry {
  id: string;
  label: string;
  forWhom: string;
  name: string;
  page: string;
  /** Photos on the site (the caption says they were made with AI). */
  photos: number;
  /** What the demo types before it builds this site (packages/spec showcase.ts). */
  intro: string;
}

export function showcaseEntry(s: Showcase): ShowcaseEntry {
  const spec = showcaseSpec(s);
  return {
    id: s.id,
    label: s.label,
    forWhom: s.forWhom,
    name: spec.business.name,
    page: `${showcaseSlug(s)}/index.html`,
    photos: spec.assets.images.length,
    intro: s.intro,
  };
}

/** Where the landing page reads the showcase (under the examples folder). */
export const SHOWCASE_JSON = "showcase.json";

/** showcase.json: every showcase (the landing page shows LANDING_TRADES of them). */
export function showcaseJson(): string {
  return `${JSON.stringify(SHOWCASES.map((s) => showcaseEntry(s)), null, 2)}\n`;
}

export { SHOWCASES };
