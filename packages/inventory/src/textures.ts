/**
 * Section textures (kind `texture`, docs/plans/studio-phase1-design.md §1.1, §5 I4c): the names batch I4c added to the
 * spec's TEXTURES list. Each is one CSS partial, `packages/components/styles/vocab/textures/<name>.css`, and that file is
 * the only source: a `::before` over the section painted in the section's text colour (`currentColor`, so it follows
 * every tone) at a low opacity, through a mask that is one hand-written SVG data-URI tile. This module reads the tile
 * (the dot/grid detector's input, tiles.ts) and the opacity (the texture's max alpha, for the contrast check) from it.
 *
 * The starter names (grain, lines) are drawn by the core sheet and not registered here. New textures register as
 * drafts; the owner's gallery decisions (decisions.json) approve them.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { STARTER_NAMES, VOCAB_DIR } from "@sb/render";
import { TEXTURES } from "@sb/spec";
import { composedRuleBytes, word } from "./bytes.ts";
import type { Asset, AssetTags } from "./schema.ts";

type TextureTags = Pick<AssetTags, "trades" | "stances" | "mood">;

/** Tags per texture: trades and stances it is made for (the stance deck's texture signatures where one fits), mood words read from the drawing. */
export const TEXTURE_TAGS: Readonly<Record<string, TextureTags & { note: string }>> = {
  "press-grain": {
    trades: ["bakery", "restaurant", "shop"],
    stances: ["letterpress-proof", "risograph"],
    mood: ["fine", "horizontal", "ink", "print"],
    note: "Letterpress ink grain: a sparse mottle dragged sideways, as a press squeezes ink.",
  },
  "linen-weave": {
    trades: ["bakery", "restaurant", "shop", "tourist-farm"],
    stances: ["cross-stitch", "sewing-pattern"],
    mood: ["fine", "textile", "woven"],
    note: "Linen weave: uneven thread slubs in two directions, drawn as noise, never as crossing lines.",
  },
  stone: {
    trades: ["builder", "restaurant", "shop", "tourist-farm"],
    stances: ["karst-stone", "plecnik-classicism"],
    mood: ["mineral", "speckled", "stone"],
    note: "Karst limestone: weathered pits of every size, scattered unevenly.",
  },
  bark: {
    trades: ["builder/carpentry", "builder/roofing", "physio", "restaurant", "tourist-farm"],
    stances: ["pohorje-forest"],
    mood: ["ridged", "vertical", "wood"],
    note: "Spruce bark: ridged furrows running up the section.",
  },
  "raw-board": {
    trades: ["builder", "car-repair", "shop"],
    stances: ["stencil-crate", "hayrack"],
    mood: ["horizontal", "sawn", "wood"],
    note: "Sawn board: thin grain veins that waver, in one direction.",
  },
  "board-concrete": {
    trades: ["accountant", "builder", "car-repair", "physio"],
    stances: ["yugoslav-modernism", "brutalist-minimal"],
    mood: ["concrete", "horizontal", "mottled"],
    note: "Board-formed concrete: plank seams in one direction over a soft mottle.",
  },
  "laid-paper": {
    trades: ["bakery", "restaurant", "shop", "tourist-farm"],
    stances: ["herbarium-sheet", "kitchen-index-card"],
    mood: ["paper", "vertical"],
    note: "Laid paper: wavering chain lines in one direction over a faint fibre cloud.",
  },
  "kraft-fibre": {
    trades: ["bakery", "shop", "tourist-farm"],
    stances: ["seed-packet", "hang-tag"],
    mood: ["fibre", "horizontal", "paper"],
    note: "Kraft paper: short fibres along the machine direction, and fleck.",
  },
  gouge: {
    trades: ["bakery", "builder", "restaurant", "shop", "tourist-farm"],
    stances: ["woodcut"],
    mood: ["cut", "horizontal", "print"],
    note: "Woodcut gouge: broken rows of tapered cuts, as a cutter clears the ground of a block.",
  },
  terrazzo: {
    trades: ["dental", "hairdresser", "physio", "restaurant", "shop"],
    stances: ["adriatic-resort-modernism"],
    mood: ["chips", "speckled", "stone"],
    note: "Terrazzo: stone chips of three sizes, each turned its own way, scattered unevenly.",
  },
};

/** The texture names that have a partial (every TEXTURES name beyond the starters and "none"). */
export const textureNames = (): string[] => TEXTURES.filter((n) => !STARTER_NAMES.textures.includes(n));

export const texturePartialFile = (name: string, dir: string = VOCAB_DIR): string => path.join(dir, "textures", `${name}.css`);

export interface TexturePartial {
  css: string;
  /** The mask's SVG data URI (the dot/grid detector's tile). */
  tile: string;
  /** The `::before` opacity: the most the texture darkens or lightens its ground (the mask's alpha is at most 1). */
  maxAlpha: number;
}

/** A texture's tile and max alpha, read from its partial; undefined when it has none. */
export function texturePartial(name: string, dir: string = VOCAB_DIR): TexturePartial | undefined {
  const file = texturePartialFile(name, dir);
  if (!existsSync(file)) return undefined;
  const css = readFileSync(file, "utf8");
  const tile = /\bmask:\s*url\("(data:image\/svg\+xml,[^"]*)"\)/.exec(css)?.[1];
  const opacity = /\bopacity:\s*([\d.]+)/.exec(css)?.[1];
  if (!tile || !opacity) throw new Error(`${file}: a texture partial needs one mask: url("data:image/svg+xml,…") and an opacity`);
  return { css, tile, maxAlpha: Number(opacity) };
}

const ALL_GROUNDS: AssetTags["ground"] = ["dark", "tint", "white"];
const ALL_DENSITIES: AssetTags["density"] = ["airy", "compact", "regular"];

/** The textures as inventory assets: drafts, bytes measured on the textures family sheet. */
export function textureAssets(): Asset[] {
  return textureNames().map((name) => {
    const t = TEXTURE_TAGS[name];
    if (!t) throw new Error(`texture ${name} has no TEXTURE_TAGS entry (packages/inventory/src/textures.ts)`);
    const { note, ...tags } = t;
    return {
      id: `texture/${name}`,
      kind: "texture",
      tags: { ...tags, intents: [], ground: ALL_GROUNDS, density: ALL_DENSITIES },
      phone: "ok",
      bytes: composedRuleBytes(word(`.cx-tex-${name}`)),
      license: "own",
      status: "draft",
      note,
    } satisfies Asset;
  });
}
