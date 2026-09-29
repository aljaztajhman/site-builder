import { ActionLink, Section, titleId } from "../../primitives/index.tsx";
import type { SectionProps } from "../../types.ts";

/** A static notice from the client. No motion, no dismiss button. */
export function Announcement({ section, ctx }: SectionProps<"announcement">) {
  const { props } = section;
  return (
    <Section id={section.id} type={section.type} variant={section.variant} tone={section.tone}>
      <div className={section.variant === "card" ? "announcement card" : "announcement"}>
        <h2 id={titleId(section.id)} className="announcement__title">
          {props.title}
        </h2>
        <p className="announcement__text">{props.text}</p>
        {props.link && <ActionLink link={props.link} ctx={ctx} kind="text" className="announcement__link" />}
      </div>
    </Section>
  );
}
