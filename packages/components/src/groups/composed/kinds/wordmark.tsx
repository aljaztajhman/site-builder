import type { CSSProperties } from "react";
import { wordmarkLayout, type WordmarkPlace, type WordmarkStyle } from "@sb/spec";
import { cx } from "../../../primitives/index.tsx";
import type { RenderCtx } from "../../../types.ts";
import { placement } from "../elements.tsx";
import { stepVar, type ElOf } from "../layout.ts";

/** The ring's path id: at most one circle is drawn on a page (it is a block-only style, G22 allows one wordmark block). */
const RING_ID = "wm-ring";

/**
 * The business name set as type in one of WORDMARK_STYLES (spec v20 `wordmark`, I9a): the one component the wordmark block,
 * the header and the footer draw, so the preview and the published site are the same markup. The words are the name's and
 * nothing else (a monogram is its initials); the look is the `wm-<style>` rules (plain: composed-v2.css kinds; the others:
 * the wordmarks family partials). A name a style cannot carry draws as plain (spec wordmarkLayout). The `place` header
 * is the chrome: small, and a circle there is a monogram.
 */
export function Wordmark({
  name,
  style,
  role,
  place = "block",
  as: Tag = "p",
  className,
  attrs,
}: {
  name: string;
  style: WordmarkStyle | undefined;
  role?: "display" | "text";
  place?: WordmarkPlace;
  as?: "p" | "span";
  className?: string;
  attrs?: Record<string, unknown> & { style?: CSSProperties };
}) {
  const { style: drawn, options } = wordmarkLayout(name, style ?? "plain", place);
  const [first = name, rest = ""] = options.lines;
  let body;
  switch (drawn) {
    case "lockup":
      body = (
        <>
          <span className="wm__a">{first}</span> <span className="wm__b">{rest}</span>
        </>
      );
      break;
    case "stamp":
    case "plate":
      body = <span className="wm__box">{name}</span>;
      break;
    case "stacked-caps":
      body = options.lines.map((l, i) => (
        <span key={i}>
          {i > 0 && " "}
          <span className="wm__l">{l}</span>
        </span>
      ));
      break;
    case "monogram":
      body = (
        <>
          <span className="wm__mk" aria-hidden="true">
            {options.monogram}
          </span>{" "}
          <span className="wm__nm">{name}</span>
        </>
      );
      break;
    case "circle":
      body = (
        <>
          <svg className="wm__ring" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
            <circle className="wm__c" cx="50" cy="50" r="47" />
            <circle className="wm__c" cx="50" cy="50" r="31" />
            <path id={RING_ID} d="M 12,50 a 38,38 0 1 1 76,0 a 38,38 0 1 1 -76,0" fill="none" />
            <text className="wm__rt">
              <textPath href={`#${RING_ID}`} startOffset="25%" textAnchor="middle">
                {name}
              </textPath>
            </text>
            <text className="wm__ini" x="50" y="50" textAnchor="middle" dominantBaseline="central">
              {options.monogram}
            </text>
          </svg>
          <span className="visually-hidden">{name}</span>
        </>
      );
      break;
    default:
      body = name;
  }
  return (
    <Tag className={cx(className, "cx-wm", `wm-${drawn}`, role === "text" && "cx-wm--text")} {...attrs}>
      {body}
    </Tag>
  );
}

/**
 * The business name set as type (spec v20 `wordmark`): the name from business, the style from design.wordmark (its
 * `wm-<style>` block is in composed-v2.css, region vocab; "plain" without one), in the display or the text face. A
 * typographic mark only, never a drawn symbol, and not a heading: the section's heading names the section.
 */
export function WordmarkBlock({ el, ctx, over }: { el: ElOf<"wordmark">; ctx: RenderCtx; over: boolean }) {
  const wm = ctx.site.design.wordmark;
  const p = placement(el, over, { "--fz": stepVar(el.size) });
  const { className, ...attrs } = p;
  return <Wordmark name={ctx.site.business.name} style={wm?.style as WordmarkStyle | undefined} role={wm?.role} className={className} attrs={{ ...attrs, "data-sz": el.size }} />;
}

/**
 * The mark the header and footer show for a site with a design.wordmark and no logo, drawn through the same Wordmark as
 * the block (the chrome's size is the header name's, fs-lg). null when there is none, or it draws as plain in the display
 * face: they then keep their own markup, byte for byte (a site without design.wordmark is untouched).
 */
export function ChromeWordmark({ ctx }: { ctx: RenderCtx }) {
  const wm = ctx.site.design.wordmark;
  if (!wm || ctx.site.assets.logo) return null;
  const style = wm.style as WordmarkStyle;
  if (wordmarkLayout(ctx.site.business.name, style, "header").style === "plain" && wm.role !== "text") return null;
  return <Wordmark name={ctx.site.business.name} style={style} role={wm.role} place="header" as="span" attrs={{ style: { "--fz": "var(--fs-lg)" } as CSSProperties }} />;
}
