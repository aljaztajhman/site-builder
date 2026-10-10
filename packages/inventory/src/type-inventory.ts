/**
 * The type inventory (design studio I1, design-studio.md §4.1): the families in @sb/spec INVENTORY_FONTS and the
 * pairings in INVENTORY_FONT_PAIRS, registered as drafts with their tags. The director curates them and the owner
 * approves them in the gallery; until then they never reach a shortlist (shortlist.ts takes approved assets only).
 *
 * Tags: stances are the stance families of §5.2 (print, signage, craft, modernist, nature, contemporary) until the
 * stance deck exists (I8); a pairing's voice words (warm, exact, loud, quiet, old, new) and a family's class words go in
 * mood; trades are the business types a pairing suits (empty: any trade).
 */
import { INVENTORY_FONTS, INVENTORY_FONT_PAIRS, type BusinessType, type InventoryFontFace, type InventoryFontPair } from "@sb/spec";
import { fontBytes } from "./bytes.ts";
import type { Asset, AssetTags } from "./schema.ts";
import { PAIRING_TAGS } from "./pairing-tags.ts";

export const STANCE_FAMILIES = ["print", "signage", "craft", "modernist", "nature", "contemporary"] as const;
export type StanceFamily = (typeof STANCE_FAMILIES)[number];
export const VOICES = ["warm", "exact", "loud", "quiet", "old", "new"] as const;
export type Voice = (typeof VOICES)[number];

type FontKey = keyof typeof INVENTORY_FONTS;

/** A family's class words (mood) and the stance families it serves. */
export const FONT_TAGS: Record<FontKey, { classes: string[]; stances: StanceFamily[] }> = {
  aleo: { classes: ["slab", "soft"], stances: ["craft", "nature"] },
  rokkitt: { classes: ["slab", "narrow"], stances: ["signage", "print"] },
  besley: { classes: ["slab", "clarendon"], stances: ["print", "signage"] },
  oswald: { classes: ["grotesque", "condensed"], stances: ["signage", "contemporary"] },
  bigShoulders: { classes: ["grotesque", "condensed"], stances: ["signage", "contemporary"] },
  sofiaSansCondensed: { classes: ["grotesque", "condensed"], stances: ["signage", "modernist"] },
  unbounded: { classes: ["grotesque", "wide"], stances: ["contemporary"] },
  syne: { classes: ["grotesque", "wide"], stances: ["contemporary", "modernist"] },
  kronaOne: { classes: ["grotesque", "wide"], stances: ["signage", "modernist"] },
  bodoniModa: { classes: ["didone", "high-contrast"], stances: ["contemporary", "print"] },
  dmSerifDisplay: { classes: ["didone", "high-contrast"], stances: ["contemporary", "print"] },
  cormorant: { classes: ["old-style", "garalde"], stances: ["print", "nature"] },
  youngSerif: { classes: ["old-style", "heavy"], stances: ["craft", "print"] },
  jost: { classes: ["geometric"], stances: ["modernist"] },
  leagueSpartan: { classes: ["geometric", "heavy"], stances: ["modernist", "signage"] },
  overpass: { classes: ["grotesque", "signage"], stances: ["signage", "nature"] },
  bigShouldersStencil: { classes: ["stencil", "condensed"], stances: ["signage", "craft"] },
  chivo: { classes: ["grotesque"], stances: ["contemporary", "print"] },
  epilogue: { classes: ["grotesque"], stances: ["contemporary"] },
  courierPrime: { classes: ["mono", "typewriter"], stances: ["print"] },
  sometypeMono: { classes: ["mono", "typewriter"], stances: ["print"] },
  brygada1918: { classes: ["transitional", "central-european"], stances: ["print", "modernist"] },
  poltawskiNowy: { classes: ["old-style", "central-european"], stances: ["print", "craft"] },
  yrsa: { classes: ["old-style", "central-european"], stances: ["print", "nature"] },
  signika: { classes: ["humanist", "central-european"], stances: ["signage", "nature"] },
  sourceSerif4: { classes: ["transitional"], stances: ["print", "contemporary"] },
  literata: { classes: ["transitional"], stances: ["print", "contemporary"] },
  crimsonPro: { classes: ["old-style", "garalde"], stances: ["print"] },
  alegreya: { classes: ["humanist", "calligraphic"], stances: ["craft", "nature"] },
  vollkorn: { classes: ["old-style"], stances: ["craft", "print"] },
  libreCaslonText: { classes: ["old-style", "caslon"], stances: ["print"] },
  atkinsonNext: { classes: ["grotesque", "legible"], stances: ["contemporary", "modernist"] },
  workSans: { classes: ["grotesque"], stances: ["print", "contemporary"] },
  schibstedGrotesk: { classes: ["grotesque"], stances: ["print", "contemporary"] },
  instrumentSans: { classes: ["grotesque"], stances: ["contemporary"] },
  albertSans: { classes: ["grotesque", "geometric"], stances: ["modernist", "nature"] },
  ibmPlexMono: { classes: ["mono", "tabular"], stances: ["print", "modernist"] },
  redHatMono: { classes: ["mono", "tabular"], stances: ["print", "modernist"] },
};

/** A pairing's tags: the stance families it serves, its voice, and the trades it suits (empty: any trade). */
export interface PairingTags {
  stances: StanceFamily[];
  voice: Voice[];
  trades: BusinessType[];
}

const sorted = <T extends string>(xs: Iterable<T>): T[] => [...new Set(xs)].sort();
const tags = (t: Partial<AssetTags>): AssetTags => ({ trades: [], stances: [], intents: [], mood: [], ground: [], density: [], ...t });
const kindWord = (f: { fallback: string }): string => (f.fallback === "monospace" ? "mono" : f.fallback === "serif" ? "serif" : "sans");

export function inventoryFontAssets(): Asset[] {
  return (Object.entries(INVENTORY_FONTS) as [FontKey, InventoryFontFace][]).map(([key, face]) => {
    const t = FONT_TAGS[key];
    const axis = face.weights[0] === face.weights[1] ? `static ${face.weights[0]}` : `variable wght ${face.weights[0]}–${face.weights[1]}`;
    return {
      id: `font/${face.file}`,
      kind: "font",
      tags: tags({ stances: sorted(t.stances), mood: sorted([kindWord(face), face.role, ...t.classes]) }),
      phone: "ok",
      bytes: fontBytes(face.file),
      license: "OFL-1.1",
      status: "draft",
      note: `${face.family}, ${axis}; ${face.note} (google/fonts ofl/${face.source})`,
    } satisfies Asset;
  });
}

export function inventoryPairingAssets(): Asset[] {
  return INVENTORY_FONT_PAIRS.map((p: InventoryFontPair) => {
    const t = PAIRING_TAGS[p.id];
    if (!t) throw new Error(`No tags for pairing ${p.id}`);
    const files = [...new Set([p.heading.file, p.body.file, ...(p.utility ? [p.utility.file] : [])])];
    return {
      id: `pairing/${p.id}`,
      kind: "pairing",
      tags: tags({
        trades: sorted(t.trades),
        stances: sorted(t.stances),
        mood: sorted([...t.voice, `${kindWord(p.heading)}-heading`, ...(p.utility ? ["utility"] : [])]),
      }),
      phone: "ok",
      bytes: files.reduce((n, f) => n + fontBytes(f), 0),
      license: "OFL-1.1",
      status: "draft",
      note: p.label,
    } satisfies Asset;
  });
}
