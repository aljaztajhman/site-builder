import type { CSSProperties, ReactNode } from "react";
import type { Link } from "@sb/spec";
import { PlateStrip } from "../../motifs/index.tsx";
import { ActionLink, Picture, cx } from "../../primitives/index.tsx";
import type { RenderCtx } from "../../types.ts";
import { DecorDrawing } from "./decor.tsx";
import { ContactFact, HoursFact, PricesFact } from "./facts.tsx";
import { imageSizes, stepVar, type El, type ElOf } from "./layout.ts";

/**
 * What every element carries: its place as custom properties (composed.css reads them: --c column, --s span, --r row,
 * --rs row span, --z layer, --sx/--sy shifts in steps, --po phone order), classes for its phone place, data attributes
 * for its alignment. No colour and no size of its own is inline: those are classes and roles in composed.css.
 */
export function placement(el: El, over: boolean, extra: Record<string, string | number> = {}) {
  const d = el.desk;
  const p = el.phone;
  const style: Record<string, string | number> = { "--c": d.col, "--s": d.span, "--r": d.row, "--po": p.order, ...extra };
  if (d.rowSpan !== undefined && d.rowSpan > 1) style["--rs"] = d.rowSpan;
  if (d.layer) style["--z"] = d.layer;
  if (d.shiftX) style["--sx"] = d.shiftX;
  if (d.shiftY) style["--sy"] = d.shiftY;
  return {
    className: cx("cx-el", `cx-el--${el.kind}`, `cx-ps-${p.span}`, p.hidden && "cx-nophone", over && "cx-over"),
    style: style as CSSProperties,
    "data-ax": d.alignX,
    "data-ay": d.alignY,
    "data-pa": p.alignX,
  };
}

const HEADINGS = ["h1", "h2", "h3"] as const;

function Heading({ el, over, id }: { el: ElOf<"heading">; over: boolean; id: string | undefined }) {
  const H = HEADINGS[el.level - 1]!;
  const rotate = el.rotate === "90" || el.rotate === "-90" ? el.rotate : undefined;
  const p = placement(el, over, { "--fz": stepVar(el.size), ...(el.weight ? { "--w": el.weight } : {}) });
  return (
    <H id={id} {...p} className={cx(p.className, "cx-h", el.case && `cx-h--${el.case}`)} data-sz={el.size} data-measure={el.measure} data-rotate={rotate}>
      {el.text}
    </H>
  );
}

function TextBlock({ el, over }: { el: ElOf<"text">; over: boolean }) {
  const p = placement(el, over);
  return (
    <div {...p} className={cx(p.className, "cx-t", el.size === 1 && "cx-t--lead")}>
      {el.paragraphs.map((t, i) => (
        <p key={i}>{t}</p>
      ))}
    </div>
  );
}

function ListBlock({ el, over }: { el: ElOf<"list">; over: boolean }) {
  const p = placement(el, over);
  // base.css strips the list style from classed lists, which drops the list role in some screen readers: say it again.
  return (
    <ul {...p} className={cx(p.className, "cx-l", `cx-l--${el.marker ?? "none"}`)} role="list">
      {el.items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}

/**
 * A fact as an object. plate: a registration plate (the template motif's own plate CSS, in the palette's roles on sites
 * without that motif); numeral: the value as a large figure; stamp, ticket, seal and tag: the value and its label in a
 * stamped box, a ticket with notches, a round seal in the band colour, a hang tag. The seal here is not motifs.css's
 * `.seal` (that one is a fixed 9 or 12 rem disc, tilted 9 degrees on every width, built for one opening time): it grows
 * with the value and never tilts on a phone.
 */
function FactBlock({ el, over }: { el: ElOf<"fact">; over: boolean }) {
  const t = el.treatment;
  const p = placement(el, over, { "--fz": stepVar(el.size), "--n": Math.min(Math.max(el.value.length, 3), 24) });
  // A seal sizes its label by the longest word, which never breaks (composed.css).
  const longest = t === "seal" ? Math.max(...el.label.split(/\s+/).map((w) => w.length)) : undefined;
  const label = (
    <p className="cx-fact__label" style={longest ? ({ "--lw": longest } as CSSProperties) : undefined}>
      {el.label}
    </p>
  );
  const outside = t === "plate" || t === "numeral";
  return (
    <div {...p} className={cx(p.className, "cx-fact", `cx-fact--${t}`)}>
      {t === "plate" ? (
        <p className="plate cx-fact__obj">
          <PlateStrip />
          <span className="plate__num">{el.value}</span>
        </p>
      ) : (
        <div className="cx-fact__obj">
          <p className="cx-fact__value">{el.value}</p>
          {!outside && label}
        </div>
      )}
      {outside && label}
    </div>
  );
}

const RATIO_CLASS: Record<ElOf<"image">["ratio"], string> = {
  "1:1": "cx-r-1-1",
  "4:5": "cx-r-4-5",
  "3:4": "cx-r-3-4",
  "4:3": "cx-r-4-3",
  "3:2": "cx-r-3-2",
  "16:9": "cx-r-16-9",
  "21:9": "cx-r-21-9",
  fill: "cx-r-fill",
};

function ImageBlock({ el, ctx, width, priority }: { el: ElOf<"image">; ctx: RenderCtx; width: "contained" | "wide" | "full"; priority: boolean }) {
  const p = placement(el, false);
  return (
    <div {...p} className={cx(p.className, "cx-img", RATIO_CLASS[el.ratio], `cx-mask-${el.mask ?? "none"}`, el.treatment && el.treatment !== "none" && `cx-tr-${el.treatment}`)}>
      <Picture id={el.image} ctx={ctx} sizes={imageSizes(width, el)} priority={priority} className="media--contained" />
    </div>
  );
}

/** call: the phone, directions: the maps link, book: the booking link, link: its own target. A fact still missing renders nothing, as ActionLink does. */
function ActionBlock({ el, ctx, over }: { el: ElOf<"action">; ctx: RenderCtx; over: boolean }) {
  const link: Link | null =
    el.action === "link" ? (el.link ? { label: el.label, target: el.link.target } : null) : { label: el.label, target: { action: el.action === "book" ? "booking" : el.action } };
  if (!link || ctx.href(link.target) === null) return null;
  const p = placement(el, over);
  return (
    <div {...p} className={cx(p.className, "cx-act")}>
      <ActionLink link={link} ctx={ctx} kind={el.style} />
    </div>
  );
}

function Block({ el, over, className, children }: { el: El; over: boolean; className: string; children: ReactNode }) {
  const p = placement(el, over);
  return (
    <div {...p} className={cx(p.className, className)}>
      {children}
    </div>
  );
}

export interface ElementProps {
  el: El;
  ctx: RenderCtx;
  width: "contained" | "wide" | "full";
  /** Overlaps a photo on desktop: gets the backing panel. */
  over: boolean;
  /** The heading that names the section carries its id. */
  titleId: string | undefined;
  /** This image is the page's opening one (eager, high priority). */
  priority: boolean;
}

export function ElementView({ el, ctx, width, over, titleId, priority }: ElementProps) {
  switch (el.kind) {
    case "heading":
      return <Heading el={el} over={over} id={titleId} />;
    case "text":
      return <TextBlock el={el} over={over} />;
    case "list":
      return <ListBlock el={el} over={over} />;
    case "fact":
      return <FactBlock el={el} over={over} />;
    case "image":
      return <ImageBlock el={el} ctx={ctx} width={width} priority={priority} />;
    case "action":
      return <ActionBlock el={el} ctx={ctx} over={over} />;
    case "hours":
      return (
        <Block el={el} over={over} className="cx-hours">
          <HoursFact el={el} ctx={ctx} />
        </Block>
      );
    case "contact":
      return (
        <Block el={el} over={over} className="cx-contact contact">
          <ContactFact el={el} ctx={ctx} />
        </Block>
      );
    case "prices":
      return (
        <Block el={el} over={over} className="cx-prices-el">
          <PricesFact el={el} ctx={ctx} />
        </Block>
      );
    case "decor":
      return (
        <Block el={el} over={false} className="cx-decor">
          <DecorDrawing el={el} />
        </Block>
      );
  }
}
