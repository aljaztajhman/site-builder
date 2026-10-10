import type { CSSProperties, ReactNode } from "react";
import { MOTION_META, type ComposedProps, type SectionOf } from "@sb/spec";
import { Picture, Section, cx, titleId } from "../../primitives/index.tsx";
import type { LcpResolvers, RenderCtx, SectionProps } from "../../types.ts";
import { ElementView } from "./elements.tsx";
import {
  TONE_GROUND,
  fieldRect,
  firstHeading,
  firstImage,
  headerGround,
  imageSizes,
  insideField,
  overPhoto,
  phoneRowCount,
  phoneRows,
  photoLayer,
  readingOrder,
  type El,
  type Layer,
  type LayerOf,
} from "./layout.ts";

/**
 * Spec v19 composed sections (packages/spec/src/composition; docs/plans/ai-designer-spec.md §2.3). The elements sit on a
 * 12-column grid from 64 rem, each by its own place (custom properties in its style attribute, composed.css); on phones
 * they stack on a 4-column grid in phone.order, no rotation, no shift, no overlap. The DOM is in phone order, so the
 * reading order is the phone's whatever the desktop shows. One static stylesheet (composed.css), loaded only by pages
 * that have a composed section (@sb/render shared.ts, site.tsx): sites without one get exactly the HTML and CSS they had.
 *
 * Spec v20 section level (docs/plans/studio-phase1-design.md §1.3, §3.1, §3.4): background layers, the top edge and rise,
 * a motion preset, a pinned column and the header over the opener. Their rules are in composed-v2.css (region: section),
 * linked only by pages that use one (@sb/render shared.ts composedSheets). A section without any renders as in v19.
 */
export function Composed({ section, ctx, index }: SectionProps<"composed">) {
  const { props } = section;
  const ordered = readingOrder(props.elements);
  const heading = firstHeading(ordered);
  const photo = photoLayer(props);
  // The page's opening section loads its first photo eagerly, the one composedLcp preloads: the photo layer if it has
  // one, else its first image element.
  const lead = index === 0 && !photo ? firstImage(props.elements) : undefined;
  const surface = props.surface;
  const top = index > 0 ? props.top : undefined;
  const motion = props.motion && (index > 0 || MOTION_META[props.motion as keyof typeof MOTION_META]?.safeAtLoad) ? props.motion : undefined;
  const headerOver = index === 0 && props.headerOver === true;
  // What the header sits on (composed-v2.css takes its colours from these classes through body[data-hdr="over"]:has()).
  const hg = headerOver ? headerGround(props, section.tone) : undefined;
  const layers = props.background ?? [];
  // Sections with a layer, an edge or the header over them set their own paddings (composed-v2.css .cx-v2).
  const own = layers.length > 0 || top !== undefined || headerOver;
  const rows = phoneRows(ordered);
  const fields = layers.filter((l): l is LayerOf<"field"> => l.kind === "field");
  const fieldOf = (el: El) => fields.find((f) => insideField(el, f, props.rows));

  const view = (el: El) => {
    const node = (
      <ElementView
        key={el.id}
        el={el}
        ctx={ctx}
        width={props.width}
        over={overPhoto(el, props.elements)}
        titleId={el === heading ? titleId(section.id) : undefined}
        priority={lead?.id === el.id}
      />
    );
    // Text on a field takes the field's ground: its colour and the ground a backing panel paints (G2, G9).
    const f = fieldOf(el);
    return f ? <OnField key={el.id} role={f.role}>{node}</OnField> : node;
  };
  const pinned = pinRun(ordered, props.pin);
  const children: ReactNode[] = [];
  for (let i = 0; i < ordered.length; i++) {
    if (pinned && i === pinned.from) {
      children.push(
        <div key="pin" className="cx-pin" style={{ "--pc": props.pin!.col, "--ps": props.pin!.span } as CSSProperties}>
          {ordered.slice(pinned.from, pinned.to).map(view)}
        </div>,
      );
      i = pinned.to - 1;
    } else children.push(view(ordered[i]!));
  }

  const grid = (
    <div className={cx("cx", `cx--mh-${props.minHeight ?? "none"}`)} style={{ "--rows": props.rows, "--g": props.gap ?? 3 } as CSSProperties} data-intent={props.intent}>
      {fields.map((f, i) => (
        <FieldLayer key={`f${i}`} field={f} rows={props.rows} ordered={ordered} phone={rows} />
      ))}
      {children}
    </div>
  );
  return (
    <Section
      id={section.id}
      type={section.type}
      variant={section.variant}
      tone={section.tone}
      labelled={heading !== undefined}
      bleed={own}
      className={cx(
        `cx-w-${props.width}`,
        surface?.texture && surface.texture !== "none" && `cx-tex-${surface.texture}`,
        surface?.divider && surface.divider !== "none" && `cx-div-${surface.divider}`,
        own && "cx-v2",
        layers.length > 0 && "cx-bgl",
        photo && `cx-bgp cx-bgp--${photo.phone ?? "band"}`,
        top && `cx-edge-${top.edge}`,
        top?.rise ? `cx-rise-${top.rise}` : undefined,
        motion && `cx-mo-${motion}`,
        pinned && "cx-pinned",
        hg && `cx-hdr0 cx-hg-${hg.desk}`,
        hg && hg.phone !== hg.desk && `cx-hgp-${hg.phone}`,
      )}
    >
      {own ? (
        <>
          {top?.edge === "drawing" && top.drawing && <div className="cx-edge-art" data-drawing={top.drawing} aria-hidden="true" />}
          {layers.map((l, i) => (l.kind === "field" ? null : <SectionLayer key={`l${i}`} layer={l} ctx={ctx} priority={index === 0} />))}
          <div className="container">{grid}</div>
        </>
      ) : (
        grid
      )}
    </Section>
  );
}

/** Colour-role class of a layer or a ground: sets --cx-rc (the role) and --cx-ro (the text role on it), composed-v2.css. */
const roleClass = (role: string) => `cx-ro-${role}`;

/** The run of elements a pin holds: those wholly inside its columns, contiguous in reading order (G6), else none. */
function pinRun(ordered: readonly El[], pin: ComposedProps["pin"]): { from: number; to: number } | undefined {
  if (!pin) return undefined;
  const inPin = ordered.map((el) => el.desk.col >= pin.col && el.desk.col + el.desk.span <= pin.col + pin.span);
  const from = inPin.indexOf(true);
  if (from < 0) return undefined;
  const to = inPin.indexOf(false, from) < 0 ? inPin.length : inPin.indexOf(false, from);
  if (inPin.slice(to).includes(true)) return undefined;
  return { from, to };
}

/** Elements on a field: the field's ground for their colour and their backing panel. display: contents, no box of its own. */
function OnField({ role, children }: { role: string; children: ReactNode }) {
  const tone = (Object.keys(TONE_GROUND) as (keyof typeof TONE_GROUND)[]).find((t) => TONE_GROUND[t] === role);
  return <div className={cx("cx-on", roleClass(role), tone && `tone-${tone}`)}>{children}</div>;
}

/**
 * A field layer: a flat colour on the grid, positioned on the grid's lines (absolutely, so it takes no cell from the
 * elements); touching column 1 or 12 it runs to the page edge, touching the first or last row to the section's edge.
 * On phones it is a full-bleed band over the phone rows of the elements inside it (G2: they are contiguous), and hidden
 * when none of them shows on phones.
 */
function FieldLayer({ field, rows, ordered, phone }: { field: LayerOf<"field">; rows: number; ordered: readonly El[]; phone: ReadonlyMap<string, number> }) {
  const r = fieldRect(field, rows);
  const inside = ordered.filter((el) => insideField(el, field, rows) && phone.has(el.id)).map((el) => phone.get(el.id)!);
  const p0 = inside.length ? Math.min(...inside) : 0;
  const p1 = inside.length ? Math.max(...inside) : 0;
  const last = phoneRowCount(phone);
  const style: Record<string, number> = { "--fc0": r.c0, "--fc1": r.c1 + 1, "--fr0": r.r0, "--fr1": r.r1 + 1 };
  if (inside.length) Object.assign(style, { "--pr0": p0, "--pr1": p1 + 1 });
  return (
    <div
      className={cx(
        "cx-field",
        roleClass(field.role),
        r.c0 === 1 && "cx-fb-s",
        r.c1 === 12 && "cx-fb-e",
        r.r0 === 1 && "cx-fb-t",
        r.r1 === rows && "cx-fb-b",
        inside.length === 0 && "cx-nophone",
        inside.length > 0 && p0 === 1 && "cx-fpb-t",
        inside.length > 0 && p1 === last && "cx-fpb-b",
      )}
      style={style as CSSProperties}
      aria-hidden="true"
    />
  );
}

/**
 * A photo or drawing layer: the first children of the section, behind its container. The photo keeps its alt text (it
 * is the section's picture) and carries the scrim; a drawing is decoration (R2's Drawing fills the hook by its id).
 */
function SectionLayer({ layer, ctx, priority }: { layer: Exclude<Layer, LayerOf<"field">>; ctx: RenderCtx; priority: boolean }) {
  if (layer.kind === "photo") {
    return (
      <div className={cx("cx-bg-photo", layer.treatment && layer.treatment !== "none" && `cx-tr-${layer.treatment}`)}>
        <Picture id={layer.image} ctx={ctx} sizes={BG_PHOTO_SIZES} priority={priority} className="media--contained" />
        <span className={cx("cx-scrim", `cx-scrim-${layer.scrim.strength}`, roleClass(layer.scrim.role))} aria-hidden="true" />
      </div>
    );
  }
  return <div className={cx("cx-bg-art", `cx-bga-${layer.anchor}`, `cx-bgs-${layer.scale}`, roleClass(layer.color ?? "border"))} data-drawing={layer.drawing} aria-hidden="true" />;
}

/** A photo layer covers the section, full bleed, on desktop and phones alike. */
const BG_PHOTO_SIZES = "100vw";

export const composedRenderers = { composed: Composed };

/**
 * The actions a composed section shows as buttons or links (data-action: call, booking, directions, email), in reading
 * order: its action elements, a "link" one by its target's action. For the phone bar, as signatureActions for a hero.
 */
export function composedActions(section: SectionOf<"composed">): string[] {
  return readingOrder(section.props.elements).flatMap((el) => {
    if (el.kind !== "action") return [];
    if (el.action === "link") return el.link && "action" in el.link.target ? [el.link.target.action] : [];
    return [el.action === "book" ? "booking" : el.action];
  });
}

/** The photo the opener shows first: its photo layer, else its first image in reading order that phones show, with the `sizes` Composed renders it with. */
export const composedLcp: LcpResolvers = {
  composed: (section) => {
    const photo = photoLayer(section.props);
    if (photo) return { image: photo.image, sizes: BG_PHOTO_SIZES };
    const lead = firstImage(section.props.elements);
    return lead ? { image: lead.image, sizes: imageSizes(section.props.width, lead) } : null;
  },
};
