import { cx } from "../../../primitives/index.tsx";
import type { RenderCtx } from "../../../types.ts";
import { placement } from "../elements.tsx";
import type { ElOf } from "../layout.ts";
import { ICON_STROKE, factIconPath } from "./icons.ts";
import { factLabel } from "./strings.ts";

/**
 * A practical fact's icon (icons.ts: one line style on a 24 grid, currentColor, ≤ 1 KiB each); nothing for a name outside
 * PRACTICAL_FACTS. Every key has its own drawing, so there is no fallback icon.
 */
export function FactIcon({ fact }: { fact: string }) {
  const d = factIconPath(fact);
  if (d === undefined) return null;
  return (
    <svg
      className="cx-if__ic"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth={ICON_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}

/** Phones show two items a row when every label fits in about half of 360 px. */
const TWO_UP = 16;

/**
 * Practical facts from business.amenities, each an icon and a short label (spec v20 `iconFacts`): a tidy row or grid,
 * one column on phones (two when every label is short), a client's note under its label. A list, not a row of cards: no
 * card ground, no circle round the icon (the banned three-feature-cards row; G25).
 */
export function IconFactsBlock({ el, ctx, over }: { el: ElOf<"iconFacts">; ctx: RenderCtx; over: boolean }) {
  // Only a fact the business has: the guards and the facts check say so at generation, and a client who later takes an amenity out
  // of business.amenities must not keep it on the site.
  const has = new Set<string>(ctx.site.business.amenities ?? []);
  const items = el.items.flatMap((it) => {
    if (!has.has(it.fact)) return [];
    const label = factLabel(ctx, it.fact);
    return label ? [{ ...it, label }] : [];
  });
  if (items.length === 0) return null;
  // --n: how many; the grid's column minimum falls with it (composed-v2.css), so six sit in a row and four stay two and two.
  const p = placement(el, over, { "--n": items.length });
  const twoUp = items.every((it) => it.label.length <= TWO_UP && !it.note);
  return (
    <ul {...p} className={cx(p.className, "cx-if", `cx-if--${el.icons ?? "line"}`, twoUp && "cx-if--2")} role="list">
      {items.map((it) => (
        <li key={it.fact} className="cx-if__i" data-fact={it.fact}>
          <FactIcon fact={it.fact} />
          <span className="cx-if__l">{it.label}</span>
          {it.note && <span className="cx-if__n">{it.note}</span>}
        </li>
      ))}
    </ul>
  );
}
