/**
 * The design genome (docs/plans/variety-engine.md, Step 5; spec v18): a site's look as independent axes instead of one
 * bundled direction. The axes are type, palette, page ground, hero, header, footer, rhythm, imagery, shape, density and
 * motif (genome-rules.ts `GenomeView`). Directions and trade templates stay as presets: the direction a site names is the
 * preset its genome started from.
 *
 * Most axes already have a home in the spec, and the genome doesn't store them twice (two copies could disagree after an
 * edit): type is `design.fontPair` (with its heading case, weight and tracking), ground is `colors.background`, imagery and
 * density are the design's tokens, header and footer are `design.skeleton` (or `chrome`), the hero is the homepage's first
 * section, and the motif follows the preset and the business subtype (motif.ts). `design.genome` stores what has no other
 * home: where the palette came from, the section rhythm, the shape language, and whether the axes were picked
 * independently (`source`).
 *
 * - source "preset": the genome is the direction's own (a migrated site, a site made with config `variety.genome` off, a
 *   style switched in the editor). The direction's token ranges hold the design, exactly as before v18, and nothing renders
 *   differently.
 * - source "picked": the axes were chosen independently (config `variety.genome`). The genome's compatibility rules hold
 *   the design instead of the direction's ranges (genome-rules.ts), and the shape language renders (`data-shape`).
 */
import { z } from "zod";

/** Section tone rhythm down a page (Direction.layout.rhythm). */
export const RHYTHMS = ["alternate", "flat", "inverse-accents"] as const;
export type Rhythm = (typeof RHYTHMS)[number];

/**
 * Shape language. square and soft are the radius token (square at most 2 px, soft from 3 px; pills stay banned); cut adds
 * one cut corner to photos and cards; arch arches the top of photos and rounds the top of cards (genome.css).
 */
export const SHAPES = ["square", "soft", "cut", "arch"] as const;
export type Shape = (typeof SHAPES)[number];

/** The page ground: a white page, a light tinted page or a dark page (colors.background; banned: cream, off-white). */
export const GROUNDS = ["white", "tint", "dark"] as const;
export type Ground = (typeof GROUNDS)[number];

export const GENOME_SOURCES = ["preset", "picked"] as const;

/**
 * Where the palette came from: "preset" (the design step's colours within the preset: the logo's where it gave them),
 * "<direction>" (a direction's own palette) or "<template>/<palette>" (a template family's palette, families.ts).
 */
export const PaletteId = z
  .string()
  .regex(/^(preset|[a-z-]+(\/[a-z-]+)?)$/)
  .max(60);

export const Genome = z.strictObject({
  source: z.enum(GENOME_SOURCES),
  palette: PaletteId,
  rhythm: z.enum(RHYTHMS),
  shape: z.enum(SHAPES),
});
export type Genome = z.infer<typeof Genome>;
