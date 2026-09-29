import { ActionLink, Picture, PriceText, Section, SectionHead, cx } from "../../primitives/index.tsx";
import type { SectionProps } from "../../types.ts";

export function ServicesList({ section, ctx }: SectionProps<"services-list">) {
  const { props } = section;
  return (
    <Section id={section.id} type={section.type} variant={section.variant} tone={section.tone}>
      <SectionHead id={section.id} eyebrow={props.eyebrow} title={props.title} intro={props.intro} />
      <ul className="svc-list">
        {props.items.map((item, i) => (
          <li className={cx("svc-list__item", !item.price && "svc-list__item--no-price")} key={i}>
            <h3 className="svc-list__name">{item.name}</h3>
            {item.price && (
              <p className="svc-list__price">
                <PriceText price={item.price} ctx={ctx} />
              </p>
            )}
            <div className="svc-list__body">
              <p>{item.description}</p>
              {item.link && <ActionLink link={item.link} ctx={ctx} kind="text" />}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** Card photo widths: one column on phones, two on tablets, up to three on desktop. */
export const SERVICE_CARD_SIZES = "(min-width: 64rem) 24rem, (min-width: 48rem) 50vw, 100vw";
export const SERVICE_CARD_COMPACT_SIZES = "7rem";

export function ServicesCards({ section, ctx }: SectionProps<"services-cards">) {
  const { props } = section;
  const compact = section.variant === "compact";
  const n = props.items.length;
  return (
    <Section id={section.id} type={section.type} variant={section.variant} tone={section.tone}>
      <SectionHead id={section.id} eyebrow={props.eyebrow} title={props.title} intro={props.intro} />
      <ul className={cx("svc-cards", n >= 4 && "svc-cards--many", n === 3 && "svc-cards--three")} data-count={n}>
        {props.items.map((item, i) => (
          <li className={cx("svc-card", "card", !item.image && "svc-card--text")} key={i}>
            {item.image && (
              <Picture
                id={item.image}
                ctx={ctx}
                className="media--contained svc-card__media"
                sizes={compact ? SERVICE_CARD_COMPACT_SIZES : SERVICE_CARD_SIZES}
              />
            )}
            <div className="svc-card__body">
              <h3 className="svc-card__title">{item.title}</h3>
              <p>{item.text}</p>
              {item.link && <ActionLink link={item.link} ctx={ctx} kind="text" />}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
