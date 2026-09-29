import { ActionLink, Section, SectionHead } from "../../primitives/index.tsx";
import type { SectionProps } from "../../types.ts";

/** Ordered steps on a timeline. Order is carried by the <ol>; no numbered labels are drawn. */
export function Steps({ section, ctx }: SectionProps<"steps">) {
  const { props } = section;
  return (
    <Section id={section.id} type={section.type} variant={section.variant} tone={section.tone}>
      <SectionHead id={section.id} eyebrow={props.eyebrow} title={props.heading} intro={props.intro} />
      <ol className="steps" data-count={props.steps.length}>
        {props.steps.map((step, i) => (
          <li className="steps__item" key={i}>
            <h3 className="steps__title">{step.title}</h3>
            <p className="steps__text">{step.text}</p>
          </li>
        ))}
      </ol>
      {props.action && (
        <div className="actions steps__actions">
          <ActionLink link={props.action} ctx={ctx} kind="primary" />
        </div>
      )}
    </Section>
  );
}
