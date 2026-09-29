import { ActionLink, Picture, Section, SectionHead } from "../../primitives/index.tsx";
import type { SectionProps } from "../../types.ts";

export const IMAGE_TEXT_SIZES = "(min-width: 76rem) 35rem, (min-width: 48rem) calc(50vw - 3.5rem), 100vw";

export function ImageText({ section, ctx, index }: SectionProps<"image-text">) {
  const { props } = section;
  return (
    <Section id={section.id} type={section.type} variant={section.variant} tone={section.tone}>
      <div className="image-text">
        <Picture id={props.image} ctx={ctx} className="image-text__media" sizes={IMAGE_TEXT_SIZES} priority={index === 0} />
        <div className="image-text__text">
          <SectionHead id={section.id} eyebrow={props.eyebrow} title={props.heading} />
          <div className="prose">
            {props.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          {props.link && <ActionLink link={props.link} ctx={ctx} kind="text" className="image-text__link" />}
        </div>
      </div>
    </Section>
  );
}
