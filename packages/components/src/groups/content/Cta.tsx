import { Actions, Section, titleId } from "../../primitives/index.tsx";
import type { SectionProps } from "../../types.ts";

/** Call to action. Left-aligned in both variants. */
export function Cta({ section, ctx }: SectionProps<"cta">) {
  const { props } = section;
  return (
    <Section id={section.id} type={section.type} variant={section.variant} tone={section.tone}>
      <div className="cta">
        <div className="cta__text">
          <h2 id={titleId(section.id)} className="cta__title">
            {props.heading}
          </h2>
          {props.text && <p className="cta__lead">{props.text}</p>}
        </div>
        <Actions primary={props.primary} secondary={props.secondary} ctx={ctx} />
      </div>
    </Section>
  );
}
