import { Section, SectionHead } from "../../primitives/index.tsx";
import type { SectionProps } from "../../types.ts";

/** Running text. narrow: one column; two-column: heading left, text right on desktop. */
export function Text({ section }: SectionProps<"text">) {
  const { props } = section;
  return (
    <Section id={section.id} type={section.type} variant={section.variant} tone={section.tone}>
      <div className="text-block">
        <SectionHead id={section.id} eyebrow={props.eyebrow} title={props.heading} />
        <div className="text-block__body prose">
          {props.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </div>
    </Section>
  );
}
