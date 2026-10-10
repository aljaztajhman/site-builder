import { cx } from "../../../primitives/index.tsx";
import type { RenderCtx } from "../../../types.ts";
import { placement } from "../elements.tsx";
import { stepVar, type ElOf } from "../layout.ts";

/** Quote size 0–4 as a type-scale step: 4 is a display size (it counts toward the display budget, G24). */
const STEP = [1, 2, 3, 4, 6] as const;

/** Opening and closing quotation marks by the quote's language: Slovene (and German, Croatian) „…“, English “…”. */
const marks = (lang: string): [string, string] => (lang === "en" ? ["“", "”"] : ["„", "“"]);

/**
 * The client's own words, verbatim (spec v20 `quote`): never translated, so on another locale's page it keeps the
 * language it was written in (lang). Set in the display face with its opening mark hanging in the margin, the speaker
 * after an en dash. No bar beside it (banned: accent single-side borders) and no oversized decorative mark.
 */
export function QuoteBlock({ el, ctx, over }: { el: ElOf<"quote">; ctx: RenderCtx; over: boolean }) {
  const source = ctx.site.locales.default;
  const [open, close] = marks(source);
  const size = el.size ?? 1;
  const p = placement(el, over, { "--fz": stepVar(STEP[size] ?? 2) });
  return (
    <figure {...p} className={cx(p.className, "cx-q")} data-sz={size}>
      <blockquote className="cx-q__b" lang={ctx.locale !== source ? source : undefined}>
        <p className="cx-q__t">
          <span className="cx-q__o">{open}</span>
          {el.text}
          {close}
        </p>
      </blockquote>
      {el.by && (
        <figcaption className="cx-q__by">
          <span aria-hidden="true">– </span>
          {el.by}
        </figcaption>
      )}
    </figure>
  );
}
