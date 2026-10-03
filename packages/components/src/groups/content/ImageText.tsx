import { ActionLink, Picture, Section, SectionHead } from "../../primitives/index.tsx";
import type { SectionProps } from "../../types.ts";

export const IMAGE_TEXT_SIZES = "(min-width: 76rem) 35rem, (min-width: 48rem) calc(50vw - 3.5rem), 100vw";

/** round: a disc at 5/11 of the container on desktop, 70 % of the screen on phones. */
export const IMAGE_TEXT_ROUND_SIZES = "(min-width: 64rem) 30rem, 70vw";

export function ImageText({ section, ctx, index }: SectionProps<"image-text">) {
  const { props } = section;
  const round = section.variant === "round";
  return (
    <Section id={section.id} type={section.type} variant={section.variant} tone={section.tone}>
      <div className="image-text">
        <Picture id={props.image} ctx={ctx} className={round ? "image-text__media disc media--contained" : "image-text__media"} sizes={round ? IMAGE_TEXT_ROUND_SIZES : IMAGE_TEXT_SIZES} priority={index === 0} />
        <div className="image-text__text">
          <SectionHead id={section.id} eyebrow={props.eyebrow} title={props.heading} />
          <div className="prose">
            {props.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          {props.link && <ActionLink link={props.link} ctx={ctx} kind={round ? "primary" : "text"} className="image-text__link" />}
        </div>
      </div>
    </Section>
  );
}
