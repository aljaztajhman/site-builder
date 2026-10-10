import type { ColorRole, ComposedProps } from "@sb/spec";

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

/** Whether two elements' desktop rectangles share a grid cell. */
export function overlaps(a: El, b: El): boolean {
  const p = rect(a);
  const q = rect(b);
  return p.c0 <= q.c1 && q.c0 <= p.c1 && p.r0 <= q.r1 && q.r0 <= p.r1;
}

/** Elements that carry no text of their own to put on a photo. */
const TEXTLESS: ReadonlySet<El["kind"]> = new Set(["image", "decor"]);

/**
 * A text-bearing element whose desktop rectangle overlaps a photo: it gets a solid backing panel (composed.css, .cx-over)
 * so its contrast holds whatever the photo. Measuring the photo's luminance under the text to size a scrim is a later
 * step (docs/plans/ai-designer-spec.md §2.3); until then the panel is always the section's own ground at high opacity.
 * Objects with a ground of their own (a plate, a seal, a ticket, a hang tag, a primary button) need none.
 */
export function overPhoto(el: El, all: readonly El[]): boolean {
  if (TEXTLESS.has(el.kind)) return false;
  if (el.kind === "fact" && ["plate", "seal", "ticket", "tag"].includes(el.treatment)) return false;
  if (el.kind === "action" && el.style === "primary") return false;
  return all.some((o) => o.kind === "image" && o.id !== el.id && overlaps(el, o));
}

/** The heading that names the section (the first in reading order), if it has one. */
export function firstHeading(ordered: readonly El[]): ElOf<"heading"> | undefined {
  return ordered.find((e): e is ElOf<"heading"> => e.kind === "heading");
}

/** The image the page's LCP preload and the eager photo refer to: the first in reading order that phones show. */
export function firstImage(elements: readonly El[]): ElOf<"image"> | undefined {
  return readingOrder(elements).find((e): e is ElOf<"image"> => e.kind === "image" && !e.phone.hidden);
}

/** Part of the container's width an image of `span` columns takes on desktop, and on phones, as a `sizes` attribute. */
export function imageSizes(width: ComposedProps["width"], el: ElOf<"image">): string {
  const span = el.desk.span;
  const phone = el.phone.span === "half" ? "calc((100vw - 3rem) / 2)" : el.phone.span === "inset" ? "calc((100vw - 2rem) * 0.82)" : "calc(100vw - 2rem)";
  const rem = (n: number) => `${Math.round(n * 100) / 100}rem`;
  // Contained: the container is 76 rem with 2 rem of padding each side; wide: 90 rem; full: the screen less its side padding.
  if (width === "full") return `(min-width: 64rem) calc(94vw * ${span} / 12), ${phone}`;
  const max = width === "wide" ? 90 : 76;
  return `(min-width: ${max}rem) ${rem(((max - 4) * span) / 12)}, (min-width: 64rem) calc((100vw - 4rem) * ${span} / 12), ${phone}`;
}

/** CSS variable of a type-scale step (composed.css defines --cx-fs-<step>; −1 is written m1). */
export const stepVar = (step: number): string => `var(--cx-fs-${step < 0 ? "m1" : step})`;

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

/**
 * The phone rows (1-based, inclusive) each element shown on phones takes on the 4-column phone grid, as composed.css
 * places them: in reading order, a half element takes two columns and the rest a full row (the grid's auto-placement).
 */
export function phoneRows(ordered: readonly El[]): Map<string, number> {
  const out = new Map<string, number>();
  let row = 1;
  let col = 0;
  for (const el of ordered) {
    if (el.phone.hidden) continue;
    const w = el.phone.span === "half" ? 2 : 4;
    if (col + w > 4) {
      row++;
      col = 0;
    }
    out.set(el.id, row);
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
