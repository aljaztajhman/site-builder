import { cx } from "../../../primitives/index.tsx";
import { placement } from "../elements.tsx";
import type { ElOf } from "../layout.ts";

/**
 * The business's own process in order (spec v21 `steps`): an ordered list, a title and, when the client gave one, a sentence to a step. The order is
 * the <ol>'s, so no step carries a written number. numbered (default): the list's own decimal markers; line: a list with
 * marker "line" (the same class, so the same timeline ring and rail rules, composed-v2.css). A step's title is a heading one level below the section's own
 * (h3 under the h2 element that names it; h2 under an h1 or in a section with none: `level`, from composed/index.tsx).
 */
export function StepsBlock({ el, over, level }: { el: ElOf<"steps">; over: boolean; level: number }) {
  const p = placement(el, over);
  const H = `h${level}` as "h3";
  return (
    <ol {...p} className={cx(p.className, "cx-l", el.style === "line" ? "cx-l--line" : "cx-st")} role="list">
      {el.items.map((s, i) => (
        <li key={i}>
          <H>{s.title}</H>
          {s.text !== undefined && <p>{s.text}</p>}
        </li>
      ))}
    </ol>
  );
}
