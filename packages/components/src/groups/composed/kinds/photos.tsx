import type { CSSProperties } from "react";
import { Picture, cx } from "../../../primitives/index.tsx";
import type { RenderCtx } from "../../../types.ts";
import { placement } from "../elements.tsx";
import { PHOTO_FRAME, imageSizes, type ElOf } from "../layout.ts";
import { kindText } from "./strings.ts";

type Photos = ElOf<"photos">;

/** Arrangements that lay their frames over each other in one box: fan and stack at most 4 frames, the pair 2 (G21). */
/** A fan opens from the middle: the first photo in the centre (on top), the next to its left, then right, and so on. */
const fanOffset = (i: number) => (i === 0 ? 0 : (i % 2 ? -1 : 1) * Math.ceil(i / 2));

const PILED = new Set<Photos["arrangement"]>(["fan", "stack", "offset-pair"]);

/**
 * A set of the client's photos as one object (spec v20 `photos`, docs/plans/studio-phase1-design.md §1.5, §2 phones).
 * fan, stack, offset-pair: frames piled in one box at preset offsets (the first photo on top), their captions as a list
 * under the box. strip: a row that scrolls inside itself (never the page), snapping frame by frame, focusable and labelled
 * so the keyboard scrolls it. before-after: two frames side by side (stacked on phones), each labelled before and after.
 * The first photo is the element's lead (the LCP one when it opens the page).
 */
export function PhotosBlock({ el, ctx, width, priority }: { el: Photos; ctx: RenderCtx; width: "contained" | "wide" | "full"; priority: boolean }) {
  const piled = PILED.has(el.arrangement);
  const images = el.images.slice(0, el.arrangement === "offset-pair" || el.arrangement === "before-after" ? 2 : piled ? 4 : 12);
  const caps = el.captions ?? [];
  const sizes = imageSizes(width, el, PHOTO_FRAME[el.arrangement]);
  const p = placement(el, false, piled ? { "--n": images.length } : {});
  const frameClass = cx("cx-img cx-ph__f", `cx-mask-${el.mask ?? "none"}`, el.treatment && el.treatment !== "none" && `cx-tr-${el.treatment}`);
  const frame = (id: string, i: number) => <Picture id={id} ctx={ctx} sizes={sizes} priority={priority && i === 0} className="media--contained" />;

  if (piled) {
    const shown = caps.slice(0, images.length).filter(Boolean);
    return (
      <div {...p} className={cx(p.className, "cx-ph", `cx-ph--${el.arrangement}`)}>
        <div className="cx-ph__box">
          {images.map((id, i) => (
            <div key={i} className={frameClass} style={{ "--i": i, "--o": fanOffset(i) } as CSSProperties}>
              {frame(id, i)}
            </div>
          ))}
        </div>
        {shown.length > 0 && (
          <ul className="cx-ph__caps" role="list">
            {shown.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const before = el.arrangement === "before-after";
  const label = (i: number) => (before ? kindText(ctx, i === 0 ? "before" : "after") : undefined);
  const figures = images.map((id, i) => (
    <figure key={i} className="cx-ph__fig">
      <div className={frameClass}>{frame(id, i)}</div>
      {(label(i) || caps[i]) && (
        <figcaption className="cx-ph__cap">
          {label(i) && <span className="cx-ph__ba">{label(i)}</span>}
          {caps[i]}
        </figcaption>
      )}
    </figure>
  ));
  if (before) {
    return (
      <div {...p} className={cx(p.className, "cx-ph", "cx-ph--before-after")}>
        {figures}
      </div>
    );
  }
  return (
    <div {...p} className={cx(p.className, "cx-ph", "cx-ph--strip")}>
      {/* The row scrolls by itself: a labelled region in the tab order, so arrow keys scroll it (WCAG 2.1.1). */}
      <div className="cx-ph__row" role="region" aria-label={kindText(ctx, "photos")} tabIndex={0}>
        {figures}
      </div>
    </div>
  );
}
