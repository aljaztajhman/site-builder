import { cx } from "../../../primitives/index.tsx";
import { placement } from "../elements.tsx";
import type { ElOf } from "../layout.ts";

/**
 * Questions and answers (spec v21 `qa`), in the client's words, as a ruled list (the list's own rules, composed.css), one
 * item to a question. open (default): every answer shown under its question. toggle: a details element per question, so it
 * works with the keyboard (Enter or Space on the summary) and without script; the question stays an h3 inside the summary,
 * as in the faq section. Questions are h3, as the steps titles are: a composed section names itself with an h2 element.
 */
export function QaBlock({ el, over }: { el: ElOf<"qa">; over: boolean }) {
  const p = placement(el, over);
  const toggle = el.style === "toggle";
  return (
    <ul {...p} className={cx(p.className, "cx-l cx-l--rule", toggle && "cx-ask")} role="list">
      {el.items.map((it, i) => (
        <li key={i}>
          {toggle ? (
            <details>
              <summary>
                <h3>{it.question}</h3>
              </summary>
              <p>{it.answer}</p>
            </details>
          ) : (
            <>
              <h3>{it.question}</h3>
              <p>{it.answer}</p>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
