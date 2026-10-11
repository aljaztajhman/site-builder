import { cx } from "../../../primitives/index.tsx";
import { placement } from "../elements.tsx";
import type { ElOf } from "../layout.ts";

/**
 * Questions and answers (spec v21 `qa`), in the client's words, as a ruled list (the list's own rules, composed.css), one
 * item to a question. open (default): every answer shown under its question. toggle: a details element per question, so it
 * works with the keyboard (Enter or Space on the summary) and without script; the question stays a heading inside the summary,
 * as in the faq section. Questions are headings one level below the section's own (h3 under an h2; h2 under an h1 or with
 * none: `level`, from composed/index.tsx).
 */
export function QaBlock({ el, over, level }: { el: ElOf<"qa">; over: boolean; level: number }) {
  const p = placement(el, over);
  const H = `h${level}` as "h3";
  const toggle = el.style === "toggle";
  return (
    <ul {...p} className={cx(p.className, "cx-l cx-l--rule", toggle && "cx-ask")} role="list">
      {el.items.map((it, i) => (
        <li key={i}>
          {toggle ? (
            <details>
              <summary>
                <H>{it.question}</H>
              </summary>
              <p>{it.answer}</p>
            </details>
          ) : (
            <>
              <H>{it.question}</H>
              <p>{it.answer}</p>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
