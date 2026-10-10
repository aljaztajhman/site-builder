import type { CSSProperties } from "react";
import { Section, cx, titleId } from "../../primitives/index.tsx";
import type { SectionOf } from "@sb/spec";
import type { LcpResolvers, SectionProps } from "../../types.ts";
import { ElementView } from "./elements.tsx";
import { firstHeading, firstImage, imageSizes, overPhoto, readingOrder } from "./layout.ts";

/**
 * Spec v19 composed sections (packages/spec/src/composition; docs/plans/ai-designer-spec.md §2.3). The elements sit on a
 * 12-column grid from 64 rem, each by its own place (custom properties in its style attribute, composed.css); on phones
 * they stack on a 4-column grid in phone.order, no rotation, no shift, no overlap. The DOM is in phone order, so the
 * reading order is the phone's whatever the desktop shows. One static stylesheet (composed.css), loaded only by pages
 * that have a composed section (@sb/render shared.ts, site.tsx): sites without one get exactly the HTML and CSS they had.
 */
export function Composed({ section, ctx, index }: SectionProps<"composed">) {
  const { props } = section;
  const ordered = readingOrder(props.elements);
  const heading = firstHeading(ordered);
  // The page's opening section loads its first photo eagerly, the one composedLcp preloads.
  const lead = index === 0 ? firstImage(props.elements) : undefined;
  const surface = props.surface;
  return (
    <Section
      id={section.id}
      type={section.type}
      variant={section.variant}
      tone={section.tone}
      labelled={heading !== undefined}
      className={cx(`cx-w-${props.width}`, surface?.texture && surface.texture !== "none" && `cx-tex-${surface.texture}`, surface?.divider && surface.divider !== "none" && `cx-div-${surface.divider}`)}
    >
      <div className={cx("cx", `cx--mh-${props.minHeight ?? "none"}`)} style={{ "--rows": props.rows, "--g": props.gap ?? 3 } as CSSProperties} data-intent={props.intent}>
        {ordered.map((el) => (
          <ElementView
            key={el.id}
            el={el}
            ctx={ctx}
            width={props.width}
            over={overPhoto(el, props.elements)}
            titleId={el === heading ? titleId(section.id) : undefined}
            priority={lead?.id === el.id}
          />
        ))}
      </div>
    </Section>
  );
}

export const composedRenderers = { composed: Composed };

/**
 * The actions a composed section shows as buttons or links (data-action: call, booking, directions, email), in reading
 * order: its action elements, a "link" one by its target's action. For the phone bar, as signatureActions for a hero.
 */
export function composedActions(section: SectionOf<"composed">): string[] {
  return readingOrder(section.props.elements).flatMap((el) => {
    if (el.kind !== "action") return [];
    if (el.action === "link") return el.link && "action" in el.link.target ? [el.link.target.action] : [];
    return [el.action === "book" ? "booking" : el.action];
  });
}

/** The first photo in reading order that phones show, with the `sizes` Composed renders it with. */
export const composedLcp: LcpResolvers = {
  composed: (section) => {
    const lead = firstImage(section.props.elements);
    return lead ? { image: lead.image, sizes: imageSizes(section.props.width, lead) } : null;
  },
};
