import { MaybeText, Picture, Section, SectionHead } from "../../primitives/index.tsx";
import type { SectionProps } from "../../types.ts";

export const ABOUT_SIZES = "(min-width: 76rem) 28rem, (min-width: 48rem) 40vw, 100vw";

/** The business's own story; the photo shows only in image-side, the client's number only in figure. */
export function About({ section, ctx, index }: SectionProps<"about">) {
  const { props } = section;
  if (section.variant === "figure" && props.figure) {
    return (
      <Section id={section.id} type={section.type} variant={section.variant} tone={section.tone}>
        <div className="about about--figure">
          <p className="figure">
            <span className="figure__label">{props.figure.label}</span>
            <span className="figure__value">{props.figure.value}</span>
          </p>
          <div className="about__text">
            <SectionHead id={section.id} eyebrow={props.eyebrow} title={props.heading} />
            {props.ownerName && (
              <p className="about__owner">
                <span className="about__owner-name">
                  <MaybeText value={props.ownerName} ctx={ctx} />
                </span>
                {props.ownerRole && <span className="about__owner-role muted">{props.ownerRole}</span>}
              </p>
            )}
            <div className="prose">
              {props.paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </div>
        </div>
      </Section>
    );
  }
  const image = section.variant === "image-side" ? props.image : undefined;
  return (
    <Section
      id={section.id}
      type={section.type}
      variant={section.variant}
      tone={section.tone}
      className={image ? "about--has-image" : undefined}
    >
      <div className="about">
        {image && <Picture id={image} ctx={ctx} className="about__media" sizes={ABOUT_SIZES} priority={index === 0} />}
        <div className="about__text">
          <SectionHead id={section.id} eyebrow={props.eyebrow} title={props.heading} />
          <div className="prose">
            {props.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          {props.ownerName && (
            <p className="about__owner">
              <span className="about__owner-name">
                <MaybeText value={props.ownerName} ctx={ctx} />
              </span>
              {props.ownerRole && <span className="about__owner-role muted">{props.ownerRole}</span>}
            </p>
          )}
        </div>
      </div>
    </Section>
  );
}
