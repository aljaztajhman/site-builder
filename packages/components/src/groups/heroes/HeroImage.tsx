import { Actions, Picture, Section, titleId } from "../../primitives/index.tsx";
import type { SectionProps } from "../../types.ts";

/** The photo spans the container: full viewport on mobile, container width (max 72rem) on desktop. */
export const HERO_IMAGE_SIZES = "(min-width: 76rem) 72rem, (min-width: 48rem) calc(100vw - 4rem), 100vw";

/**
 * Wide photo with the headline on a solid inverse panel. The panel overlaps the photo on desktop
 * and sits directly below it on mobile; text is never placed on the photo itself.
 */
export function HeroImage({ section, ctx, index }: SectionProps<"hero-image">) {
  const { props } = section;
  return (
    <Section id={section.id} type={section.type} variant={section.variant} tone={section.tone}>
      <div className="hero-image">
        <Picture id={props.image} ctx={ctx} className="hero-image__media" sizes={HERO_IMAGE_SIZES} priority={index === 0} />
        <div className="hero-image__panel tone-inverse">
          {props.eyebrow && <p className="eyebrow">{props.eyebrow}</p>}
          <h1 id={titleId(section.id)} className={props.headline.length > 44 ? "hero-title hero-title--long" : "hero-title"}>
            {props.headline}
          </h1>
          <p className="lead">{props.intro}</p>
          <Actions primary={props.primary} secondary={props.secondary} ctx={ctx} />
        </div>
      </div>
    </Section>
  );
}
