import type { SectionOf } from "@sb/spec";
import { Picture, Section, titleId } from "../../primitives/index.tsx";
import type { SectionProps } from "../../types.ts";

export const PAGE_HEADER_SIZES = "(min-width: 76rem) 72rem, (min-width: 48rem) calc(100vw - 4rem), 100vw";

/** The image actually shown: only with-image shows one, and only when it is set. */
export function pageHeaderImage(section: SectionOf<"page-header">): string | null {
  return section.variant === "with-image" && section.props.image ? section.props.image : null;
}

/** Inner-page opener: the page h1, optional intro, optional wide photo. */
export function PageHeader({ section, ctx, index }: SectionProps<"page-header">) {
  const { props } = section;
  const image = pageHeaderImage(section);
  return (
    <Section
      id={section.id}
      type={section.type}
      variant={section.variant}
      tone={section.tone}
      className={image ? "page-header--has-image" : undefined}
    >
      <header className="page-header">
        {props.eyebrow && <p className="eyebrow">{props.eyebrow}</p>}
        <h1 id={titleId(section.id)} className="page-header__title">
          {props.title}
        </h1>
        {props.intro && <p className="lead">{props.intro}</p>}
      </header>
      {image && <Picture id={image} ctx={ctx} className="page-header__media" sizes={PAGE_HEADER_SIZES} priority={index === 0} />}
    </Section>
  );
}
