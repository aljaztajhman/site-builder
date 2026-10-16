import { deskColumns, type ColorRole, type ComposedProps } from "@sb/spec";

/** One element of a composed section, and one kind of them. */
export type El = ComposedProps["elements"][number];
export type ElOf<K extends El["kind"]> = Extract<El, { kind: K }>;

/** Colour roles of design.colors as the CSS custom properties @sb/render tokens.ts writes. Band falls back like base.css does. */
export const ROLE_VAR: Record<ColorRole, string> = {
  background: "var(--c-bg)",
  surface: "var(--c-surface)",
  text: "var(--c-text)",
  muted: "var(--c-muted)",
  primary: "var(--c-primary)",
  onPrimary: "var(--c-on-primary)",
  accent: "var(--c-accent)",
  border: "var(--c-border)",
  inverse: "var(--c-inverse)",
  onInverse: "var(--c-on-inverse)",
  band: "var(--c-band, var(--c-primary))",
  onBand: "var(--c-on-band, var(--c-on-primary))",
};

/**
 * Elements in reading order: phone.order, ties in the order of the spec. The DOM follows this order, so assistive
 * technology and the phone's stack read the same; the desktop places every element by the grid alone.
 */
export function readingOrder(elements: readonly El[]): El[] {
  return elements
    .map((el, i) => ({ el, i }))
    .sort((a, b) => a.el.phone.order - b.el.phone.order || a.i - b.i)
    .map((x) => x.el);
}

/** The desktop rectangle of an element on the grid: columns and rows, both inclusive. */
function rect(el: El) {
  const { col, span, row, rowSpan = 1 } = el.desk;
  return { c0: col, c1: col + span - 1, r0: row, r1: row + rowSpan - 1 };
}

/**
 * Whether two elements' desktop rectangles share a grid cell. A shift of REACH_SHIFT steps (@sb/spec deskColumns) reaches
 * into the next column: a split headline shifted over a photo's edge is over the photo, as the guards (G3, G26) count it.
 */
export function overlaps(a: El, b: El): boolean {
  const p = { ...rect(a), ...deskColumns(a.desk) };
  const q = { ...rect(b), ...deskColumns(b.desk) };
  return p.c0 <= q.c1 && q.c0 <= p.c1 && p.r0 <= q.r1 && q.r0 <= p.r1;
}

/** Elements that carry no text of their own to put on a photo. */
const TEXTLESS: ReadonlySet<El["kind"]> = new Set(["image", "photos", "decor"]);

/**
 * A text-bearing element whose desktop rectangle overlaps a photo: it gets a solid backing panel (composed.css, .cx-over)
 * so its contrast holds whatever the photo. Measuring the photo's luminance under the text to size a scrim is a later
 * step (docs/plans/ai-designer-spec.md §2.3); until then the panel is always the section's own ground at high opacity.
 * Objects with a ground of their own (a plate, a seal, a ticket, a hang tag, a primary button) need none, and an image
 * with a `scrim` (spec v20) is no photo to back against: its flat scrim is the ground the text is read on (the guards
 * check its contrast, G3), so text over it gets no panel (§3.1).
 */
export function overPhoto(el: El, all: readonly El[]): boolean {
  if (TEXTLESS.has(el.kind)) return false;
  if (el.kind === "fact" && ["plate", "seal", "ticket", "tag"].includes(el.treatment)) return false;
  // Prices as hang tags or plates: each item is an object on its own ground, the gaps between them show the photo.
  if (el.kind === "prices" && (el.style === "tags" || el.style === "plates")) return false;
  if (el.kind === "action" && el.style === "primary") return false;
  // A sticker and a ribbon are objects on a ground of their own (composed-v2.css, region kinds).
  if (el.kind === "sticker" || el.kind === "ribbon") return false;
  return all.some((o) => ((o.kind === "image" && o.scrim === undefined) || o.kind === "photos") && o.id !== el.id && overlaps(el, o));
}

/** The heading that names the section (the first in reading order), if it has one. */
export function firstHeading(ordered: readonly El[]): ElOf<"heading"> | undefined {
  return ordered.find((e): e is ElOf<"heading"> => e.kind === "heading");
}

/**
 * The photo element the page's LCP preload and the eager photo refer to: the first image or photos element in reading
 * order that phones show (a photos element leads with its first image).
 */
export function firstImage(elements: readonly El[]): ElOf<"image"> | ElOf<"photos"> | undefined {
  return readingOrder(elements).find((e): e is ElOf<"image"> | ElOf<"photos"> => (e.kind === "image" || e.kind === "photos") && !e.phone.hidden);
}

/** The share of an element's width one frame of a photos arrangement takes, on desktop and on phones (composed-v2.css). */
export const PHOTO_FRAME: Record<ElOf<"photos">["arrangement"], { desk: number; phone: number }> = {
  fan: { desk: 0.62, phone: 0.62 },
  stack: { desk: 0.72, phone: 0.72 },
  "offset-pair": { desk: 0.62, phone: 0.62 },
  strip: { desk: 0.4, phone: 0.8 },
  "before-after": { desk: 0.5, phone: 1 },
};

/**
 * Part of the container's width an image of `span` columns takes on desktop, and on phones, as a `sizes` attribute;
 * `part` scales both for a photo that takes a share of its element (a frame of a photos arrangement).
 */
export function imageSizes(width: ComposedProps["width"], el: El, part: { desk: number; phone: number } = { desk: 1, phone: 1 }): string {
  const span = el.desk.span * part.desk;
  const base = el.phone.span === "tile" ? "100vw / 2" : el.phone.span === "half" ? "(100vw - 3rem) / 2" : el.phone.span === "inset" ? "(100vw - 2rem) * 0.82" : "100vw - 2rem";
  const phone = part.phone === 1 ? `calc(${base})` : `calc((${base}) * ${part.phone})`;
  const rem = (n: number) => `${Math.round(n * 100) / 100}rem`;
  const cols = Math.round(span * 100) / 100;
  // Contained: the container is 76 rem with 2 rem of padding each side; wide: 90 rem; full: the screen less its side padding.
  if (width === "full") return `(min-width: 64rem) calc(94vw * ${cols} / 12), ${phone}`;
  const max = width === "wide" ? 90 : 76;
  return `(min-width: ${max}rem) ${rem(((max - 4) * span) / 12)}, (min-width: 64rem) calc((100vw - 4rem) * ${cols} / 12), ${phone}`;
}

/** The lead photo of an image or photos element and the `sizes` it renders with (the LCP preload must match it). */
export function leadPhoto(width: ComposedProps["width"], el: ElOf<"image"> | ElOf<"photos">): { image: ElOf<"image">["image"]; sizes: string } {
  if (el.kind === "image") return { image: el.image, sizes: imageSizes(width, el) };
  return { image: el.images[0]!, sizes: imageSizes(width, el, PHOTO_FRAME[el.arrangement]) };
}

/** CSS variable of a type-scale step (composed.css defines --cx-fs-<step>; −1 is written m1). */
export const stepVar = (step: number): string => `var(--cx-fs-${step < 0 ? "m1" : step})`;

/**
 * A fact object's type size: the heading ramp, and from step 6 a display floor (8, 10, 12 rem) so a size 8 numeral or plate is a
 * wall-sized object on a desktop. A phone shrinks it to its cell (composed.css .cx-fact__obj), not to the ramp's 12vw cap.
 */
const FACT_DISPLAY_REM: Record<number, number> = { 6: 8, 7: 10, 8: 12 };
export const factStepVar = (step: number): string => (FACT_DISPLAY_REM[step] ? `max(${stepVar(step)}, ${FACT_DISPLAY_REM[step]}rem)` : stepVar(step));

/* ---------- spec v20 section level (docs/plans/studio-phase1-design.md §1.3, §3.4) ---------- */

/** One background layer of a composed section, and one kind of them. */
export type Layer = NonNullable<ComposedProps["background"]>[number];
export type LayerOf<K extends Layer["kind"]> = Extract<Layer, { kind: K }>;

/** The section's own ground per tone (base.css .tone-*): what text, a backing panel and the header sit on. */
export const TONE_GROUND: Record<"default" | "alt" | "inverse" | "band", ColorRole> = { default: "background", alt: "surface", inverse: "inverse", band: "band" };

/** The section's photo layer, if it has one. */
export const photoLayer = (props: ComposedProps): LayerOf<"photo"> | undefined => props.background?.find((l): l is LayerOf<"photo"> => l.kind === "photo");

/** A field layer's desktop rectangle: columns and rows, both inclusive (default: the whole grid). */
export function fieldRect(f: LayerOf<"field">, rows: number) {
  return { c0: f.cols?.from ?? 1, c1: f.cols?.to ?? 12, r0: f.rows?.from ?? 1, r1: Math.min(f.rows?.to ?? rows, rows) };
}

/** Whether an element's desktop rectangle lies wholly inside a field layer (G2: text is wholly inside or wholly outside). */
export function insideField(el: El, f: LayerOf<"field">, rows: number): boolean {
  const e = rect(el);
  const r = fieldRect(f, rows);
  return e.c0 >= r.c0 && e.c1 <= r.c1 && e.r0 >= r.r0 && e.r1 <= r.r1;
}

/** Phone places two to a row: half, and tile (half without the gap and the side padding). */
const pairs = (el: El): boolean => el.phone.span === "half" || el.phone.span === "tile";

/**
 * The phone rows (1-based, inclusive) each element shown on phones takes on the 4-column phone grid, as composed.css
 * places them: in reading order, a half or tile element takes two columns and the rest a full row (the grid's auto-placement).
 */
export function phoneRows(ordered: readonly El[]): Map<string, number> {
  return new Map([...phoneCells(ordered)].map(([id, c]) => [id, c.row]));
}

/** Each shown element's phone row and its first column (0 or 2), as phoneRows places them. */
export function phoneCells(ordered: readonly El[]): Map<string, { row: number; col: number }> {
  const out = new Map<string, { row: number; col: number }>();
  let row = 1;
  let col = 0;
  for (const el of ordered) {
    if (el.phone.hidden) continue;
    const w = pairs(el) ? 2 : 4;
    if (col + w > 4) {
      row++;
      col = 0;
    }
    out.set(el.id, { row, col });
    col += w;
    if (col === 4) {
      row++;
      col = 0;
    }
  }
  return out;
}

/** The number of phone rows the elements shown on phones fill. */
export const phoneRowCount = (rows: ReadonlyMap<string, number>): number => Math.max(0, ...rows.values());

/**
 * Where each phone tile sits in its 2-column mosaic (composed.css .cx-ps-tile): the side of the screen it runs to, and
 * whether the phone row above holds a tile too (then it closes the gap between the two rows).
 */
export interface TileEdge {
  side: "l" | "r";
  joined: boolean;
}
export function tileEdges(ordered: readonly El[]): Map<string, TileEdge> {
  const cells = phoneCells(ordered);
  const tileRows = new Set<number>();
  for (const el of ordered) {
    const c = cells.get(el.id);
    if (el.phone.span === "tile" && c) tileRows.add(c.row);
  }
  const out = new Map<string, TileEdge>();
  for (const el of ordered) {
    const c = cells.get(el.id);
    if (el.phone.span !== "tile" || !c) continue;
    out.set(el.id, { side: c.col === 0 ? "l" : "r", joined: tileRows.has(c.row - 1) });
  }
  return out;
}

/**
 * Each rendered tile's edge, by its element (the section sets them from tileEdges before its elements render; placement
 * reads them). Keyed by the element object, so it holds only for the render that set it and frees itself with the spec.
 */
export const TILE_EDGES = new WeakMap<El, TileEdge>();

/**
 * The custom properties of an image cropped on thirds (image `crop: "thirds"`, Design 5): the focal point (--fx, --fy,
 * 0–1 of the photo), the third line each goes to (--tx, --ty: ⅓ or ⅔, the nearer; a point at the very centre goes to ⅓)
 * and the photo's width / height (--ia). composed.css works the object-position out from the frame's own size
 * (container units), so it is exact on every screen and for a "fill" frame too: on the axis the photo overflows, the
 * offset t·frame − f·photo, clamped so the photo still covers the frame (the focal point then stays inside it). Without
 * a focal point the photo's centre goes to the left third and stays centred vertically. Browsers without container
 * units show the focal point as it is (composed.css).
 */
export function thirdsVars(focal: { x: number; y: number } | undefined, photo: { width: number; height: number }): Record<string, number> {
  const third = (f: number) => (f > 0.5 ? 2 / 3 : 1 / 3);
  const r = (v: number) => Math.round(v * 1000) / 1000;
  const fx = focal?.x ?? 0.5;
  const fy = focal?.y ?? 0.5;
  return { "--fx": r(fx), "--fy": r(fy), "--tx": r(third(fx)), "--ty": r(focal ? third(fy) : fy), "--ia": r(photo.width / photo.height) };
}

/**
 * What the header sits on when the section opens the page with `headerOver`, on desktop and on phones: the photo's scrim
 * role (the photo covers the section on desktop; on phones the band or the cover photo is at the top), else a field that
 * covers the top row from edge to edge (on phones: a field holding the first phone row), else the tone's ground.
 */
export function headerGround(props: ComposedProps, tone: keyof typeof TONE_GROUND = "default"): { desk: ColorRole; phone: ColorRole } {
  const ground = TONE_GROUND[tone];
  const photo = photoLayer(props);
  if (photo) return { desk: photo.scrim.role, phone: photo.scrim.role };
  const fields = (props.background ?? []).filter((l): l is LayerOf<"field"> => l.kind === "field");
  const desk = fields.find((f) => {
    const r = fieldRect(f, props.rows);
    return r.r0 === 1 && r.c0 === 1 && r.c1 === 12;
  });
  const ordered = readingOrder(props.elements);
  const rows = phoneRows(ordered);
  const first = ordered.find((el) => rows.get(el.id) === 1);
  const phone = first && fields.find((f) => insideField(first, f, props.rows));
  return { desk: desk?.role ?? ground, phone: phone?.role ?? ground };
}
