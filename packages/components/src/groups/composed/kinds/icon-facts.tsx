import type { ReactElement } from "react";
import { cx } from "../../../primitives/index.tsx";
import type { RenderCtx } from "../../../types.ts";
import { placement } from "../elements.tsx";
import type { ElOf } from "../layout.ts";
import { factLabel } from "./strings.ts";

/**
 * Placeholder icons of some practical facts, in one line style on a 24 grid (currentColor, ≤ 1 KiB each). Batch I9 draws
 * the whole set (`icon/<style>/<fact>`, line, solid and cut); until then a fact without one takes the check mark.
 */
const ICONS: Partial<Record<string, ReactElement>> = {
  parking: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M9.5 17V7h3.5a3 3 0 0 1 0 6H9.5" />
    </>
  ),
  card: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="M2.5 10h19M6 15h4" />
    </>
  ),
  wifi: <path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0M12 19.5v.01" />,
  wheelchair: (
    <>
      <circle cx="11" cy="4" r="1.6" />
      <path d="M11 7.5V13h5l2.5 5.5M11 10h4.5M8 10.5a5.8 5.8 0 1 0 8 7" />
    </>
  ),
  terrace: <path d="M3 11a9 7 0 0 1 18 0ZM12 11v10M8 21h8" />,
  takeaway: <path d="M5 8h14l-1.2 13H6.2ZM9 8V6.5a3 3 0 0 1 6 0V8" />,
};
const FALLBACK = <path d="M5 12.5l4.5 4.5L19 7.5" />;

function FactIcon({ fact }: { fact: string }) {
  return (
    <svg
      className="cx-if__ic"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[fact] ?? FALLBACK}
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
  const items = el.items.flatMap((it) => {
    const label = factLabel(ctx, it.fact);
    return label ? [{ ...it, label }] : [];
  });
  if (items.length === 0) return null;
  const p = placement(el, over);
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
