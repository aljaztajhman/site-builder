import { cx } from "../../../primitives/index.tsx";
import { placement } from "../elements.tsx";
import type { ElOf } from "../layout.ts";

/**
 * The business's own process in order (spec v21 `steps`): an ordered list, a title and a sentence to a step. The order is
 * the <ol>'s, so no step carries a written number. numbered (default): the list's own decimal markers; line: a list with
 * marker "line" (the same class, so the same timeline ring and rail rules, composed-v2.css). A step's title is an h3, as in
 * the steps section: a composed section names itself with its own heading element, which is an h2.
 */
export function StepsBlock({ el, over }: { el: ElOf<"steps">; over: boolean }) {
  const p = placement(el, over);
  return (
    <ol {...p} className={cx(p.className, "cx-l", el.style === "line" ? "cx-l--line" : "cx-st")} role="list">
      {el.items.map((s, i) => (
        <li key={i}>
          <h3>{s.title}</h3>
          <p>{s.text}</p>
        </li>
      ))}
    </ol>
  );
}
