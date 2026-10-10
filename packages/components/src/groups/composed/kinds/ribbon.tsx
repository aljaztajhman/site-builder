import type { ReactNode } from "react";
import { cx } from "../../../primitives/index.tsx";
import type { RenderCtx } from "../../../types.ts";
import { DrawingSvg } from "../drawing.tsx";
import { drawingData } from "../drawings/index.ts";
import { placement } from "../elements.tsx";
import type { ElOf } from "../layout.ts";
import { kindText } from "./strings.ts";

type Ribbon = ElOf<"ribbon">;

/** The default separator: a short slanted stroke in the ribbon's text colour. */
function Slash() {
  return (
    <svg className="cx-rb__sep" viewBox="0 0 12 16" aria-hidden="true" focusable="false">
      <path d="M3 14L9 2" style={{ fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" }} />
    </svg>
  );
}

/** Rough width of one run of the ribbon in CSS pixels (about 0.55 em a character at 20 px, plus the separators). */
const runPx = (items: readonly string[]) => items.reduce((n, t) => n + t.length * 11 + 40, 0);
/** Copies in the moving track: enough that every copy but the first covers a 2560 px screen, 2 to 12. */
const copies = (items: readonly string[]) => Math.min(12, Math.max(2, 1 + Math.ceil(2560 / runPx(items))));

/**
 * Short lines of copy on a band of their own (spec v20 `ribbon`): the items in a row between separators (a drawing by id,
 * else a slanted stroke). still: the row, wrapping on phones. drift: the row moves sideways as the page scrolls past it
 * (scroll timelines only). loop: a marquee with a pause button (owner decision D2, WCAG 2.2.2): it pauses off screen and
 * on hover or focus, never runs under reduced motion, and without JS stays still with no button.
 *
 * The words are always in the static row, which screen readers read; a moving ribbon adds a track of copies hidden from
 * them, shown (and the static row visually hidden) only where the motion may run (composed-v2.css, region kinds).
 */
export function RibbonBlock({ el, ctx, over }: { el: Ribbon; ctx: RenderCtx; over: boolean }) {
  const move = el.move ?? "still";
  const sep = el.separator && drawingData(el.separator) ? <DrawingSvg id={el.separator} ink className="cx-rb__sep" /> : <Slash />;
  const run = (last: boolean): ReactNode[] =>
    el.items.flatMap((t, i) => [
      <span key={`t${i}`} className="cx-rb__i">
        {t}
      </span>,
      // A space between items, so screen readers don't run the words together (flex drops it from the layout).
      " ",
      ...(last || i < el.items.length - 1
        ? [
            <span key={`s${i}`} className="cx-rb__s" aria-hidden="true">
              {sep}
            </span>,
            " ",
          ]
        : []),
    ]);
  const n = copies(el.items);
  const extra: Record<string, string | number> = move === "still" ? {} : { "--rb-n": n, "--rb-t": `${Math.round(runPx(el.items) / 40)}s` };
  const p = placement(el, over, extra);
  return (
    <div {...p} className={cx(p.className, "cx-rb", `cx-rb--${move}`)} {...(move === "loop" ? { "data-cx-loop": "" } : {})}>
      <p className="cx-rb__t">{run(false)}</p>
      {move !== "still" && (
        <div className="cx-rb__track" aria-hidden="true">
          {Array.from({ length: n }, (_, i) => (
            <span key={i} className="cx-rb__run">
              {run(true)}
            </span>
          ))}
        </div>
      )}
      {move === "loop" && (
        // A toggle button with a fixed label (WAI-ARIA button pattern): aria-pressed says whether the motion is stopped.
        <button type="button" className="cx-rb__btn" aria-pressed="false" hidden>
          {kindText(ctx, "pause")}
        </button>
      )}
    </div>
  );
}

