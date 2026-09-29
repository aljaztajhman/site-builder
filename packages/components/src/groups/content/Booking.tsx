import { Actions, HoursList, PhoneLink, Section, titleId } from "../../primitives/index.tsx";
import type { SectionProps } from "../../types.ts";

/** Book or call. with-hours adds opening hours and the phone number from the business facts. */
export function Booking({ section, ctx }: SectionProps<"booking">) {
  const { props } = section;
  const hours = ctx.site.business.hours;
  return (
    <Section id={section.id} type={section.type} variant={section.variant} tone={section.tone}>
      <div className="booking">
        <div className="booking__text">
          <h2 id={titleId(section.id)} className="section-title">
            {props.heading}
          </h2>
          <p className="lead">{props.text}</p>
          <Actions primary={props.action} secondary={props.secondary} ctx={ctx} />
        </div>
        {section.variant === "with-hours" && (
          <div className="booking__facts card">
            {hours && (
              <>
                <h3 className="booking__facts-title">{ctx.t("openingHours")}</h3>
                <HoursList ctx={ctx} hours={hours} />
              </>
            )}
            <p className="booking__phone">
              <span className="booking__phone-label">{ctx.t("phone")}</span>
              <PhoneLink ctx={ctx} className="booking__phone-link" />
            </p>
          </div>
        )}
      </div>
    </Section>
  );
}
