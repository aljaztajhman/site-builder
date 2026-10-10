import type { CSSProperties, ReactNode } from "react";
import { UPPERCASE_MIN, type Link, type LinkTarget } from "@sb/spec";
import { PlateStrip } from "../../motifs/index.tsx";
import { ActionLink, Picture, cx } from "../../primitives/index.tsx";
import type { RenderCtx } from "../../types.ts";
import { DecorDrawing } from "./decor.tsx";
import { ContactFact, HoursFact, PricesFact, townCode } from "./facts.tsx";
import { InlineDrawing, resolveDrawing } from "./inline-drawing.tsx";
import { IconFactsBlock } from "./kinds/icon-facts.tsx";
import { MapBlock } from "./kinds/map.tsx";
import { PhotosBlock } from "./kinds/photos.tsx";
import { QuoteBlock } from "./kinds/quote.tsx";
import { RibbonBlock } from "./kinds/ribbon.tsx";
import { StickerBlock } from "./kinds/sticker.tsx";
import { WordmarkBlock } from "./kinds/wordmark.tsx";
import { imageSizes, stepVar, type El, type ElOf } from "./layout.ts";

/**
 * What every element carries: its place as custom properties (composed.css reads them: --c column, --s span, --r row,
 * --rs row span, --z layer, --sx/--sy shifts in steps, --po phone order), classes for its phone place, data attributes
 * for its alignment. No colour and no size of its own is inline: those are classes and roles in the sheets.
 *
 * Spec v20 (composed-v2.css, region extensions): --tilt (degrees, desktop only: class cx-tilt), cx-bx-<start|end|both>
 * and cx-by-<top|bottom> (a bleed to the page edge or past the section edge, desktop), cx-ps-bleed (the phone place),
 * and the element's Paint: cx-pf cx-fg-<role> for its text colour, cx-pb cx-bg-<role> for its own ground. An element with
 * its own ground needs no backing panel over a photo, so it never gets cx-over. The new kinds (F1b-R2) use this too.
 */
export function placement(el: El, over: boolean, extra: Record<string, string | number> = {}) {
  const d = el.desk;
  const p = el.phone;
  const style: Record<string, string | number> = { "--c": d.col, "--s": d.span, "--r": d.row, "--po": p.order, ...extra };
  if (d.rowSpan !== undefined && d.rowSpan > 1) style["--rs"] = d.rowSpan;
  if (d.layer) style["--z"] = d.layer;
  if (d.shiftX) style["--sx"] = d.shiftX;
  if (d.shiftY) style["--sy"] = d.shiftY;
  if (d.tilt) style["--tilt"] = d.tilt;
  const color = "color" in el ? el.color : undefined;
  const fill = "fill" in el ? el.fill : undefined;
  return {
    className: cx(
      "cx-el",
      `cx-el--${el.kind}`,
      `cx-ps-${p.span}`,
      p.hidden && "cx-nophone",
      over && !fill && "cx-over",
      d.tilt ? "cx-tilt" : false,
      d.bleedX && `cx-bx-${d.bleedX}`,
      d.bleedY && `cx-by-${d.bleedY}`,
      color && `cx-pf cx-fg-${color}`,
      fill && `cx-pb cx-bg-${fill}`,
    ),
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
  // Below size 2 a heading is never all caps, whatever the direction's --case-heading: a small uppercase line is the
  // banned tracked eyebrow (an explicit uppercase there is the guard's to drop).
  const textCase = el.size < UPPERCASE_MIN.size ? "normal" : el.case;
  return (
    // The type treatment (spec v20) is a hook: the class cx-tt-<name> and its rules are the inventory's (composed-v2.css, region vocab).
    <H id={id} {...p} className={cx(p.className, "cx-h", textCase && `cx-h--${textCase}`, el.treatment && el.treatment !== "none" && `cx-tt-${el.treatment}`)} data-sz={el.size} data-measure={el.measure} data-rotate={rotate}>
      {el.text}
    </H>
  );
}

function TextBlock({ el, over }: { el: ElOf<"text">; over: boolean }) {
  const p = placement(el, over);
  return (
    <div {...p} className={cx(p.className, "cx-t", el.size === 1 && "cx-t--lead", el.dropCap && "cx-t--drop")}>
      {el.paragraphs.map((t, i) => (
        <p key={i}>{t}</p>
      ))}
    </div>
  );
}

function ListBlock({ el, over }: { el: ElOf<"list">; over: boolean }) {
  const p = placement(el, over);
  // Spec v20: an item may carry a lead (a date or a step, a column of its own), the marker may be a dash, a timeline rail
  // (line) or a drawing, the list a weight and a size. A drawing marker with no drawing to draw falls back to the dash.
  const leads = el.items.some((t) => typeof t !== "string");
  const drawn = el.marker === "drawing" && el.drawing && resolveDrawing(el.drawing) ? el.drawing : undefined;
  const marker = el.marker === "drawing" && !drawn ? "dash" : (el.marker ?? "none");
  // base.css strips the list style from classed lists, which drops the list role in some screen readers: say it again.
  return (
    <ul
      {...p}
      className={cx(p.className, "cx-l", `cx-l--${marker}`, leads && "cx-l--leads", el.weight && el.weight !== "regular" && `cx-lw-${el.weight}`, el.size ? `cx-ls-${el.size}` : false)}
      role="list"
    >
      {el.items.map((t, i) => (
        <li key={i}>
          {drawn && <InlineDrawing id={drawn} className="cx-l__mk" />}
          {typeof t !== "string" ? (
            <>
              <span className="cx-l__lead">{t.lead}</span> <span className="cx-l__txt">{t.text}</span>
            </>
          ) : leads ? (
            <span className="cx-l__txt">{t}</span>
          ) : (
            t
          )}
        </li>
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
function FactBlock({ el, ctx, over }: { el: ElOf<"fact">; ctx: RenderCtx; over: boolean }) {
  const t = el.treatment;
  // The plate's registration area, written by code from the business address (a town that is no area seat: none).
  const code = el.plateCode && t === "plate" ? townCode(ctx) : null;
  // --n sizes the object's type to its cell: the value's characters, and on a plate the code with its dot.
  const p = placement(el, over, { "--fz": stepVar(el.size), "--n": Math.min(Math.max(el.value.length + (code ? code.length + 1 : 0), 3), 24) });
  // A seal sizes its label by the longest word, which never breaks (composed.css).
  const longest = t === "seal" ? Math.max(...el.label.split(/\s+/).map((w) => w.length)) : undefined;
  const label = (
    <p className="cx-fact__label" style={longest ? ({ "--lw": longest } as CSSProperties) : undefined}>
      {el.label}
    </p>
  );
  const outside = t === "plate" || t === "numeral";
  const before = el.labelAt === "before";
  // Spec v20: a count-up value is a whole number from the client; its final value is the text and the label from the
  // start, the island (islands/composed/count.js) only animates the text (reduced motion and no script: final value).
  const value = el.count && /^\d{1,9}$/.test(el.value) ? (
    <span className="cx-count" data-count={el.value} role="img" aria-label={el.value}>
      {el.value}
    </span>
  ) : (
    el.value
  );
  const obj =
    t === "plate" ? (
      <p className="plate cx-fact__obj">
        <PlateStrip />
        <span className="plate__num">
          {code && (
            <span className="plate__code" aria-hidden="true">
              {code}
              <span className="plate__dot" />
            </span>
          )}
          {value}
        </span>
      </p>
    ) : (
      <div className="cx-fact__obj">
        {!outside && before && label}
        <p className="cx-fact__value">{value}</p>
        {!outside && !before && label}
      </div>
    );
  const body = (
    <>
      {outside && before && label}
      {obj}
      {outside && !before && label}
    </>
  );
  // The whole object is the link (a target of at least 44 px); a target that depends on a missing fact is no link. It has
  // no data-action: chrome.css hides a call link marked so in the opener on phones (the call bar covers it), and that
  // would hide the whole object. Taps are counted by the href (stats.js).
  const href = el.link ? ctx.href(el.link) : null;
  return (
    <div {...p} className={cx(p.className, "cx-fact", `cx-fact--${t}`, before && "cx-fact--lb")}>
      {el.link && href ? (
        <a className="cx-fact__a" href={href} {...linkAttrs(el.link)}>
          {body}
        </a>
      ) : (
        body
      )}
    </div>
  );
}

/** Links that leave the site open as ActionLink's do. */
function linkAttrs(target: LinkTarget): { rel?: string; target?: string } {
  return "url" in target || ("action" in target && target.action === "directions") ? { rel: "noopener", target: "_blank" } : {};
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
  // A bleed runs to the page edge: the picture is as wide as the screen where it bleeds (phones, or a desktop bleedX).
  let sizes = imageSizes(width, el);
  if (el.desk.bleedX) sizes = "100vw";
  else if (el.phone.span === "bleed") sizes = sizes.replace(/, calc\(100vw - 2rem\)$/, ", 100vw");
  return (
    <div {...p} className={cx(p.className, "cx-img", RATIO_CLASS[el.ratio], `cx-mask-${el.mask ?? "none"}`, el.treatment && el.treatment !== "none" && `cx-tr-${el.treatment}`)}>
      <Picture id={el.image} ctx={ctx} sizes={sizes} priority={priority} className="media--contained" />
      {/* A flat scrim over the picture (spec v20): a role at a strength, the section's photo layer's own classes. */}
      {el.scrim && <span className={cx("cx-scrim", `cx-scrim-${el.scrim.strength}`, `cx-ro-${el.scrim.role}`)} aria-hidden="true" />}
    </div>
  );
}

/** A drawing: fixed size (--sz, size × 2 rem; phones at most 40vw) or its cell; a repeating drawing is a strip as wide as its cell. */
function DecorBlock({ el, over }: { el: ElOf<"decor">; over: boolean }) {
  const strip = el.repeat !== undefined && el.drawing !== undefined;
  const fixed = el.fit === "fixed" && el.size !== undefined;
  const p = placement(el, over, fixed || strip ? { "--sz": el.size ?? 2 } : {});
  return (
    <div {...p} className={cx(p.className, "cx-decor", fixed && "cx-decor--fx", strip && "cx-decor--strip")}>
      <DecorDrawing el={el} />
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
      return <FactBlock el={el} ctx={ctx} over={over} />;
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
      return <DecorBlock el={el} over={false} />;
    // Spec v20 kinds (kinds/*.tsx; their rules are in composed-v2.css, region kinds).
    case "photos":
      return <PhotosBlock el={el} ctx={ctx} width={width} priority={priority} />;
    case "wordmark":
      return <WordmarkBlock el={el} ctx={ctx} over={over} />;
    case "ribbon":
      return <RibbonBlock el={el} ctx={ctx} over={over} />;
    case "sticker":
      return <StickerBlock el={el} over={over} />;
    case "map":
      return <MapBlock el={el} ctx={ctx} over={over} />;
    case "iconFacts":
      return <IconFactsBlock el={el} ctx={ctx} over={over} />;
    case "quote":
      return <QuoteBlock el={el} ctx={ctx} over={over} />;
  }
}
