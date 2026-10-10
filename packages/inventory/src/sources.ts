/**
 * Today's assets, read from @sb/spec and the files @sb/render ships (nothing copied): fonts, font pairs, palettes
 * (direction fallbacks and template family palettes), trade and sub-trade motifs, imagery treatments, shapes (image
 * masks), fact objects, header and footer families, and every section type:variant as a preset. They ship today, so
 * they start approved.
 *
 * Tags come from existing data only: trades from the directions that use an asset (bestFor, template firstFor) and
 * from the sub-trade table (SUBTYPE_MOTIF); ground and density from those directions' palettes and ranges; mood words
 * from the asset itself (serif or sans, a palette's temperature). Nothing is tagged by guesswork.
 */
import {
  DIRECTIONS,
  FACT_TREATMENTS,
  FAMILIES,
  FONTS,
  FONT_PAIRS,
  FOOTER_FAMILIES,
  HEADER_FAMILIES,
  IMAGE_MASKS,
  IMAGE_TREATMENTS,
  Imagery,
  MOTIFS,
  SECTION_DEFS,
  SUBMOTIFS,
  SUBMOTIF_BASE,
  SUBTYPE_MOTIF,
  acceptedFontPairs,
  composedStylesheetBytes,
  hexToHsl,
  intentOf,
  luminance,
  subtypesOf,
  type BusinessType,
  type Colors,
  type Direction,
  type FontFace,
} from "./spec.ts";
import { composedRuleBytes, fontBytes, motifBytes, sharedRuleBytes, subMotifBytes, word } from "./bytes.ts";
import type { Asset, AssetTags, Ground } from "./schema.ts";
import { CURATED_PALETTES } from "./palettes/curated.ts";

const uniq = <T>(xs: Iterable<T>): T[] => [...new Set(xs)];
const sorted = <T extends string>(xs: Iterable<T>): T[] => uniq(xs).sort();

/** The trades a direction is made for: its bestFor and, for a trade template, the trades it is first choice for. */
const directionTrades = (d: Direction): BusinessType[] => uniq([...(d.template?.firstFor ?? []), ...d.bestFor]);

/** Tags shared by the directions an asset belongs to (trades, ground, density). */
function fromDirections(dirs: readonly Direction[]): Pick<AssetTags, "trades" | "ground" | "density"> {
  return {
    trades: sorted(dirs.flatMap(directionTrades)),
    ground: sorted(dirs.map((d) => d.palette.background)),
    density: sorted(dirs.flatMap((d) => d.ranges.density)),
  };
}

const tags = (t: Partial<AssetTags>): AssetTags => ({ trades: [], stances: [], intents: [], mood: [], ground: [], density: [], ...t });
const ALL_GROUNDS: Ground[] = ["dark", "tint", "white"];
const ALL_DENSITIES: AssetTags["density"] = ["airy", "compact", "regular"];

/** The page ground a palette sets: white, a tinted light page, or a dark page. */
export function groundOf(c: Colors): Ground {
  if (c.background.toLowerCase() === "#ffffff") return "white";
  return luminance(c.background) < 0.2 ? "dark" : "tint";
}

/** A palette's temperature, read from its primary (or band) hue. */
export function temperatureOf(c: Colors): "warm" | "cool" | "neutral" {
  const { h, s } = hexToHsl(c.band ?? c.primary);
  const hp = hexToHsl(c.primary);
  const hue = hp.s >= 0.15 ? hp.h : h;
  if (Math.max(s, hp.s) < 0.15) return "neutral";
  return hue < 75 || hue >= 300 ? "warm" : "cool";
}

const faceKey = (f: FontFace): string => f.file;
const dirsUsingPair = (pairId: string): Direction[] => DIRECTIONS.filter((d) => acceptedFontPairs(d).includes(pairId));

export function fontAssets(): Asset[] {
  return Object.values(FONTS).map((face) => {
    const pairs = FONT_PAIRS.filter((p) => p.heading.file === face.file || p.body.file === face.file);
    const roles = [...(pairs.some((p) => p.heading.file === face.file) ? ["heading"] : []), ...(pairs.some((p) => p.body.file === face.file) ? ["body"] : [])];
    const dirs = uniq(pairs.flatMap((p) => dirsUsingPair(p.id)));
    return {
      id: `font/${faceKey(face)}`,
      kind: "font",
      tags: tags({ ...fromDirections(dirs), mood: [face.fallback === "serif" ? "serif" : "sans", ...roles] }),
      phone: "ok",
      bytes: fontBytes(face.file),
      license: "OFL-1.1",
      status: "approved",
      note: `${face.family}, variable wght ${face.weights[0]}–${face.weights[1]} (${face.source})`,
    } satisfies Asset;
  });
}

export function pairingAssets(): Asset[] {
  return FONT_PAIRS.map((p) => {
    const files = uniq([p.heading.file, p.body.file]);
    return {
      id: `pairing/${p.id}`,
      kind: "pairing",
      tags: tags({
        ...fromDirections(dirsUsingPair(p.id)),
        mood: sorted([`${p.heading.fallback === "serif" ? "serif" : "sans"}-heading`, ...(files.length === 1 ? ["one-family"] : [])]),
      }),
      phone: "ok",
      bytes: files.reduce((n, f) => n + fontBytes(f), 0),
      license: "OFL-1.1",
      status: "approved",
      note: p.label,
    } satisfies Asset;
  });
}

/**
 * A registered palette's colours and the direction it belongs to (for its extra text pairs and its render-time
 * repair). A curated palette (palettes/curated.ts) belongs to no direction.
 */
export function paletteOf(id: string): { colors: Colors; direction?: Direction } | undefined {
  const name = id.replace(/^palette\//, "");
  const curated = CURATED_PALETTES.find((p) => p.id === name);
  if (curated) return { colors: curated.colors };
  const plain = DIRECTIONS.find((d) => d.id === name && !(d.template && FAMILIES[d.id]));
  if (plain) return { colors: plain.palette.fallback, direction: plain };
  for (const [family, f] of Object.entries(FAMILIES)) {
    const p = f.palettes.find((x) => `${family}-${x.id}` === name);
    if (p) return { colors: p.colors, direction: DIRECTIONS.find((d) => d.id === family)! };
  }
  return undefined;
}

const paletteMood = (c: Colors): string[] => sorted([temperatureOf(c), ...(c.band ? ["band"] : [])]);

/**
 * Direction fallback palettes for directions without a template family, and every family palette (a template's first
 * family palette is its direction's fallback, so it is registered once, as the family's).
 */
export function paletteAssets(): Asset[] {
  const out: Asset[] = [];
  for (const d of DIRECTIONS) {
    if (d.template && FAMILIES[d.id]) continue;
    out.push({
      id: `palette/${d.id}`,
      kind: "palette",
      tags: tags({ trades: sorted(directionTrades(d)), ground: [d.palette.background], density: sorted(d.ranges.density), mood: paletteMood(d.palette.fallback) }),
      phone: "ok",
      bytes: 0,
      license: "own",
      status: "approved",
      note: `${d.name} fallback`,
    });
  }
  for (const [family, f] of Object.entries(FAMILIES)) {
    const d = DIRECTIONS.find((x) => x.id === family)!;
    for (const p of f.palettes) {
      out.push({
        id: `palette/${family}-${p.id}`,
        kind: "palette",
        tags: tags({ trades: sorted(directionTrades(d)), ground: [groundOf(p.colors)], density: sorted(d.ranges.density), mood: paletteMood(p.colors) }),
        phone: "ok",
        bytes: 0,
        license: "own",
        status: "approved",
        note: `${d.name} family`,
      });
    }
  }
  return out;
}

/** The curated palettes (palettes/curated.ts): new, so drafts until the owner approves them in the gallery. */
export function curatedPaletteAssets(): Asset[] {
  return CURATED_PALETTES.map((p) => ({
    id: `palette/${p.id}`,
    kind: "palette",
    tags: tags({ trades: sorted(p.trades), stances: [...p.stances], mood: sorted(p.mood), ground: [p.ground] }),
    phone: "ok",
    bytes: 0,
    license: "own",
    status: "draft",
    note: p.source,
  }));
}

/** The trades a template motif belongs to: the template's own trades and those of their sub-trades that have no motif of their own. */
function motifTrades(types: readonly BusinessType[]): string[] {
  const out: string[] = [...types];
  for (const t of types) for (const sub of subtypesOf(t)) if (!SUBTYPE_MOTIF[sub]) out.push(`${t}/${sub}`);
  return sorted(out);
}

export function motifAssets(): Asset[] {
  return MOTIFS.map((m) => {
    const d = DIRECTIONS.find((x) => x.template?.motif === m)!;
    return {
      id: `motif/${m}`,
      kind: "motif",
      tags: tags({ trades: motifTrades(d.template!.firstFor), ground: [d.palette.background], density: sorted(d.ranges.density) }),
      phone: "adapted",
      bytes: motifBytes(m),
      license: "own",
      status: "approved",
      note: `Template ${d.template!.id} ${d.name}: drawn in code from the site's colours`,
    } satisfies Asset;
  });
}

export function subMotifAssets(): Asset[] {
  return SUBMOTIFS.map((s) => {
    const base = SUBMOTIF_BASE[s];
    const d = DIRECTIONS.find((x) => x.template?.motif === base)!;
    const trades = Object.entries(SUBTYPE_MOTIF)
      .filter(([, v]) => v === s)
      .map(([sub]) => {
        const type = DIRECTIONS.flatMap((x) => x.template?.firstFor ?? []).find((t) => (subtypesOf(t) as readonly string[]).includes(sub));
        return `${type ?? "unknown"}/${sub}`;
      });
    return {
      id: `submotif/${s}`,
      kind: "submotif",
      tags: tags({ trades: sorted(trades), ground: [d.palette.background], density: sorted(d.ranges.density) }),
      phone: "adapted",
      bytes: subMotifBytes(base, s),
      license: "own",
      status: "approved",
      note: `Drawn on ${base}'s layout (template ${d.template!.id})`,
    } satisfies Asset;
  });
}

/** Site imagery treatments (design.imagery) and composed image treatments, one asset per name. */
export function treatmentAssets(): Asset[] {
  const names = uniq([...Imagery.options, ...IMAGE_TREATMENTS]);
  return names.map((t) => {
    const site = (Imagery.options as readonly string[]).includes(t);
    const element = (IMAGE_TREATMENTS as readonly string[]).includes(t);
    const dirs = DIRECTIONS.filter((d) => d.imagery === t);
    const bytes = (site ? sharedRuleBytes(new RegExp(`\\[data-imagery="${t}"\\]`)) : 0) + (element ? composedRuleBytes(word(`.cx-tr-${t}`)) : 0);
    return {
      id: `treatment/${t}`,
      kind: "treatment",
      tags: tags(dirs.length ? fromDirections(dirs) : { ground: ALL_GROUNDS }),
      phone: t === "full-bleed" ? "adapted" : "ok",
      bytes,
      license: "own",
      status: "approved",
      note: [site && "site imagery (design.imagery)", element && "composed image element"].filter(Boolean).join(" and "),
    } satisfies Asset;
  });
}

export function shapeAssets(): Asset[] {
  return IMAGE_MASKS.map((m) => ({
    id: `shape/${m}`,
    kind: "shape",
    tags: tags({ ground: ALL_GROUNDS }),
    phone: "ok",
    bytes: composedRuleBytes(word(`.cx-mask-${m}`)),
    license: "own",
    status: "approved",
    note: "Image mask in composed sections",
  }));
}

export function factObjectAssets(): Asset[] {
  return FACT_TREATMENTS.map((f) => ({
    id: `fact/${f}`,
    kind: "factObject",
    tags: tags({ ground: ALL_GROUNDS }),
    phone: "ok",
    bytes: composedRuleBytes(word(`.cx-fact--${f}`)),
    license: "own",
    status: "approved",
    note: "Fact element treatment in composed sections; the value always comes from the client's facts",
  }));
}

/** A header or footer family's own rules: its modifier class and its own elements (site-footer__wordmark). */
const chromeNeedle = (block: string, family: string): RegExp => new RegExp(`\\.${block}(?:--|__)${family}(?![a-z0-9_])`);

export function chromeAssets(): Asset[] {
  const header = HEADER_FAMILIES.map(
    (h): Asset => ({
      id: `header/${h}`,
      kind: "header",
      tags: tags({ ground: ALL_GROUNDS, density: ALL_DENSITIES }),
      phone: "ok",
      bytes: sharedRuleBytes(chromeNeedle("site-header", h)),
      license: "own",
      status: "approved",
      note: "Skeleton header family (spec v15)",
    }),
  );
  const footer = FOOTER_FAMILIES.map(
    (f): Asset => ({
      id: `footer/${f}`,
      kind: "footer",
      tags: tags({ ground: ALL_GROUNDS, density: ALL_DENSITIES }),
      phone: "ok",
      bytes: sharedRuleBytes(chromeNeedle("site-footer", f)),
      license: "own",
      status: "approved",
      note: "Skeleton footer family (spec v15)",
    }),
  );
  return [...header, ...footer];
}

/** The directions that name a section "type:variant" (heroes, preferred variants, template outline, family heroes). */
function directionsUsing(key: string): Direction[] {
  return DIRECTIONS.filter((d) => {
    const named = [...d.layout.heroes, ...d.layout.prefer, ...(FAMILIES[d.id]?.heroes ?? []), ...(d.template?.homepage ?? []).map((l) => l.split(/\s/)[0]!.replace(/:$/, ""))];
    return named.includes(key);
  });
}

export function sectionAssets(): Asset[] {
  const out: Asset[] = [];
  for (const def of SECTION_DEFS) {
    const intent = intentOf(def.type);
    for (const v of def.variants) {
      const key = `${def.type}:${v}`;
      const bytes = def.type === "composed" ? composedStylesheetBytes() : sharedRuleBytes(word(`.s-${def.type}--${v}`));
      const pickable = !def.systemOnly && !def.ownerOnly;
      out.push({
        id: `section/${key}`,
        kind: "section",
        tags: tags({ trades: fromDirections(directionsUsing(key)).trades, intents: intent ? [intent] : [], ground: ALL_GROUNDS, density: ALL_DENSITIES }),
        phone: "ok",
        bytes,
        license: "own",
        status: "approved",
        ...(pickable ? {} : { pickable: false }),
        note: [`photos ${def.images}`, def.systemOnly && "system only", def.ownerOnly && "owner only (editor)", def.designerOnly && "AI designer only"].filter(Boolean).join("; "),
      });
    }
  }
  return out;
}

/** Every asset that ships today, in a fixed order. */
export function todaysAssets(): Asset[] {
  return [
    ...fontAssets(),
    ...pairingAssets(),
    ...paletteAssets(),
    ...motifAssets(),
    ...subMotifAssets(),
    ...treatmentAssets(),
    ...shapeAssets(),
    ...factObjectAssets(),
    ...chromeAssets(),
    ...sectionAssets(),
  ];
}

/** New assets of the inventory phase, registered as drafts (design-studio.md §4.3): the director curates, the owner approves. */
export function draftAssets(): Asset[] {
  return [...curatedPaletteAssets()];
}
