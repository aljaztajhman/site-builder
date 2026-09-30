import { Actions, Picture, Section, titleId } from "../../primitives/index.tsx";
import type { SectionProps } from "../../types.ts";

export const HERO_SPLIT_SIZES = "(min-width: 64rem) 36rem, (min-width: 48rem) 50vw, 100vw";

export function HeroSplit({ section, ctx, index }: SectionProps<"hero-split">) {
  const { props } = section;
  return (
    <Section id={section.id} type={section.type} variant={section.variant} tone={section.tone}>
      <div className="hero-split">
        <div className="hero-split__text">
          {props.eyebrow && <p className="eyebrow">{props.eyebrow}</p>}
          <h1 id={titleId(section.id)} className={props.headline.length > 44 ? "hero-title hero-title--long" : "hero-title"}>
            {props.headline}
          </h1>
          <p className="lead">{props.intro}</p>
          <Actions primary={props.primary} secondary={props.secondary} ctx={ctx} />
        </div>
        <Picture
          id={props.image}
          ctx={ctx}
          className="hero-split__media"
          sizes={HERO_SPLIT_SIZES}
          priority={index === 0}
        />
      </div>
    </Section>
  );
}
