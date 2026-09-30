import { ActionLink, Actions, AddressText, HoursList, PhoneLink, Section, titleId } from "../../primitives/index.tsx";
import type { RenderCtx, SectionProps } from "../../types.ts";

/** Phone, address with a directions link, and opening hours, straight from the business facts. */
function HeroFacts({ ctx }: { ctx: RenderCtx }) {
  const hours = ctx.site.business.hours;
  return (
    <dl className="hero-facts">
      <div className="hero-facts__item">
        <dt>{ctx.t("phone")}</dt>
        <dd>
          <PhoneLink ctx={ctx} className="hero-facts__phone" />
        </dd>
      </div>
      <div className="hero-facts__item">
        <dt>{ctx.t("address")}</dt>
        <dd>
          <AddressText ctx={ctx} />
          <ActionLink link={{ label: ctx.t("directions"), target: { action: "directions" } }} ctx={ctx} kind="text" />
        </dd>
      </div>
      {hours && (
        <div className="hero-facts__item">
          <dt>{ctx.t("openingHours")}</dt>
          <dd>
            <HoursList ctx={ctx} hours={hours} short />
          </dd>
        </div>
      )}
    </dl>
  );
}

/** Typography-led hero for sites without strong photos. Left-aligned. */
export function HeroType({ section, ctx }: SectionProps<"hero-type">) {
  const { props } = section;
  return (
    <Section id={section.id} type={section.type} variant={section.variant} tone={section.tone}>
      <div className="hero-type">
        <div className="hero-type__head">
          {props.eyebrow && <p className="eyebrow">{props.eyebrow}</p>}
          <h1 id={titleId(section.id)} className={props.headline.length > 44 ? "hero-title hero-title--long" : "hero-title"}>
            {props.headline}
          </h1>
        </div>
        <div className="hero-type__body">
          <p className="lead">{props.intro}</p>
          <Actions primary={props.primary} secondary={props.secondary} ctx={ctx} />
        </div>
        {section.variant === "with-facts" && <HeroFacts ctx={ctx} />}
      </div>
    </Section>
  );
}
