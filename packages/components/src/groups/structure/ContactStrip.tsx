import { formatAddress, isPlaceholder } from "@sb/spec";
import { HoursList, Icon, PhoneLink, Ph, Section, cx, titleId } from "../../primitives/index.tsx";
import type { SectionProps } from "../../types.ts";

/**
 * Quick facts near the top of the homepage: phone, address with directions, weekly hours.
 * Facts come only from ctx.site.business. Pages are static, so hours show the compact weekly list
 * instead of computing "today" at render time.
 */
export function ContactStrip({ section, ctx }: SectionProps<"contact-strip">) {
  const { props } = section;
  const b = ctx.site.business;
  const directions = ctx.href({ action: "directions" });
  return (
    <Section id={section.id} type={section.type} variant={section.variant} tone={section.tone}>
      <h2 id={titleId(section.id)} className={props.title ? "section-title contact-strip__title" : "visually-hidden"}>
        {props.title ?? ctx.t("contact")}
      </h2>
      <ul className="contact-strip__list" role="list">
        <li className={cx("contact-strip__item", section.variant === "cards" && "card")}>
          <h3 className="contact-strip__label fact-label">
            <Icon name="phone" />
            {ctx.t("phone")}
          </h3>
          <PhoneLink ctx={ctx} className="contact-strip__action contact-strip__phone" />
        </li>
        <li className={cx("contact-strip__item", section.variant === "cards" && "card")}>
          <h3 className="contact-strip__label fact-label">
            <Icon name="map-pin" />
            {ctx.t("address")}
          </h3>
          {isPlaceholder(b.address) ? (
            <Ph p={b.address} ctx={ctx} />
          ) : (
            <>
              <p className="contact-strip__value">{formatAddress(b.address)}</p>
              {directions && (
                <a className="contact-strip__action" href={directions} rel="noopener" target="_blank">
                  {ctx.t("directions")}
                </a>
              )}
            </>
          )}
        </li>
        {b.hours !== undefined && (
          <li className={cx("contact-strip__item", section.variant === "cards" && "card")}>
            <h3 className="contact-strip__label fact-label">
              <Icon name="clock" />
              {ctx.t("openingHours")}
            </h3>
            <HoursList ctx={ctx} short />
          </li>
        )}
      </ul>
    </Section>
  );
}
