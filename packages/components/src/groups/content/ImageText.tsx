import { ActionLink, Picture, Section, SectionHead, titleId } from "../../primitives/index.tsx";
import type { SectionProps } from "../../types.ts";

export const IMAGE_TEXT_SIZES = "(min-width: 76rem) 35rem, (min-width: 48rem) calc(50vw - 3.5rem), 100vw";

/** round: a disc at 5/11 of the container on desktop, 70 % of the screen on phones. */
export const IMAGE_TEXT_ROUND_SIZES = "(min-width: 64rem) 30rem, 70vw";
/** pair: the tall photo at 5/11 of the container on desktop, the screen on phones; the inset about half of it. */
export const IMAGE_TEXT_PAIR_SIZES = "(min-width: 64rem) 30rem, 100vw";
export const IMAGE_TEXT_INSET_SIZES = "(min-width: 64rem) 14rem, 46vw";

/** pair: a tall photo with a second one over its corner; a number the client gave wall-sized above the heading. */
function ImageTextPair({ section, ctx, index }: SectionProps<"image-text">) {
  const { props } = section;
  return (
    <Section id={section.id} type={section.type} variant={section.variant} tone={section.tone}>
      <div className="image-text">
        <figure className="image-text__pair">
          <Picture id={props.image} ctx={ctx} className="image-text__media media--contained" sizes={IMAGE_TEXT_PAIR_SIZES} priority={index === 0} />
          {props.inset && <Picture id={props.inset} ctx={ctx} className="image-text__inset media--contained" sizes={IMAGE_TEXT_INSET_SIZES} />}
        </figure>
        <div className="image-text__text">
          {props.figure ? (
            // The number and the heading are one statement ("40 sedežev na terasi"): one h2, the number on its own line.
            <header className="section-head">
              {props.eyebrow && <p className="eyebrow">{props.eyebrow}</p>}
              <h2 id={titleId(section.id)} className="section-title">
                <span className="image-text__figure">{props.figure}</span> {props.heading}
              </h2>
            </header>
          ) : (
            <SectionHead id={section.id} eyebrow={props.eyebrow} title={props.heading} />
          )}
          <div className="prose">
            {props.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          {props.link && <ActionLink link={props.link} ctx={ctx} kind="primary" className="image-text__link" />}
        </div>
      </div>
    </Section>
  );
}

export function ImageText({ section, ctx, index }: SectionProps<"image-text">) {
  if (section.variant === "pair") return <ImageTextPair section={section} ctx={ctx} index={index} />;
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
