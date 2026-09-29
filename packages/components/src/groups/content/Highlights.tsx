import { Section, SectionHead } from "../../primitives/index.tsx";
import type { SectionProps } from "../../types.ts";

/** Short points set with rules and bold titles; no icons, no cards. */
export function Highlights({ section }: SectionProps<"highlights">) {
  const { props } = section;
  return (
    <Section id={section.id} type={section.type} variant={section.variant} tone={section.tone}>
      <SectionHead id={section.id} eyebrow={props.eyebrow} title={props.heading} intro={props.intro} />
      <ul className="highlights">
        {props.items.map((item, i) => (
          <li className="highlights__item" key={i}>
            <h3 className="highlights__title">{item.title}</h3>
            <p className="highlights__text">{item.text}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
