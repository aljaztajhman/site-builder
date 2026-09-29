import { formatAddress, hoursRows, isPlaceholder, type Hours, type Placeholder } from "@sb/spec";
import {
  AddressText,
  EmailLink,
  HoursList,
  PhoneLink,
  Ph,
  Section,
  SectionHead,
  titleId,
} from "../../primitives/index.tsx";
import type { RenderCtx, SectionProps } from "../../types.ts";

const MISSING_HOURS: Placeholder = { $placeholder: "hours" };

function HoursTable({ hours, ctx, labelledBy }: { hours: Hours; ctx: RenderCtx; labelledBy: string }) {
  return (
    <div className="hours">
      <table className="oh__table" aria-labelledby={labelledBy}>
        <tbody>
          {hoursRows(hours, ctx.locale).map((r, i) => (
            <tr key={i} className={hours.entries[i]?.closed ? "oh__row--closed" : undefined}>
              <th scope="row">{r.days}</th>
              <td>{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {hours.note && <p className="hours__note">{hours.note}</p>}
    </div>
  );
}

export function OpeningHours({ section, ctx }: SectionProps<"opening-hours">) {
  const { props } = section;
  const hours = ctx.site.business.hours ?? MISSING_HOURS;
  return (
    <Section id={section.id} type={section.type} variant={section.variant} tone={section.tone}>
      <div className="oh">
        <SectionHead id={section.id} eyebrow={props.eyebrow} title={props.title} />
        <div className="oh__body">
          {isPlaceholder(hours) ? (
            <p>
              <Ph p={hours} ctx={ctx} />
            </p>
          ) : section.variant === "table" ? (
            <HoursTable hours={hours} ctx={ctx} labelledBy={titleId(section.id)} />
          ) : (
            <HoursList ctx={ctx} hours={hours} short />
          )}
          {props.note && <p className="oh__note">{props.note}</p>}
        </div>
      </div>
    </Section>
  );
}

export function Contact({ section, ctx }: SectionProps<"contact">) {
  const { props } = section;
  const b = ctx.site.business;
  const directions = ctx.href({ action: "directions" });
  const address = b.address;
  const embedSrc = isPlaceholder(address)
    ? null
    : `https://www.google.com/maps?q=${encodeURIComponent(`${formatAddress(address)}, ${address.country ?? "Slovenija"}`)}&output=embed`;
  return (
    <Section id={section.id} type={section.type} variant={section.variant} tone={section.tone}>
      <div className="contact">
        <div className="contact__details">
          <SectionHead id={section.id} eyebrow={props.eyebrow} title={props.title} intro={props.intro} />
          <dl className="contact__facts">
            <div className="contact__fact">
              <dt>{ctx.t("phone")}</dt>
              <dd>
                <PhoneLink ctx={ctx} className="contact__link contact__phone" />
              </dd>
            </div>
            <div className="contact__fact">
              <dt>{ctx.t("emailLabel")}</dt>
              <dd>
                <EmailLink ctx={ctx} className="contact__link" />
              </dd>
            </div>
            <div className="contact__fact">
              <dt>{ctx.t("address")}</dt>
              <dd>
                <AddressText ctx={ctx} />
                {directions && (
                  <a href={directions} className="btn btn--secondary contact__directions" rel="noopener" target="_blank">
                    {ctx.t("directions")}
                  </a>
                )}
              </dd>
            </div>
            {b.hours !== undefined && (
              <div className="contact__fact contact__fact--hours">
                <dt>{ctx.t("openingHours")}</dt>
                <dd>
                  <HoursList ctx={ctx} short />
                </dd>
              </div>
            )}
          </dl>
        </div>
        {embedSrc && directions && (
          <div className="contact__map">
            <div className="embed" data-embed-src={embedSrc} data-embed-title={`${ctx.t("map")}: ${b.name}`}>
              <div className="embed__notice">
                <p>{ctx.t("mapNotice")}</p>
                <div className="embed__actions">
                  <button type="button" className="btn btn--secondary" data-embed-load>
                    {ctx.t("showMap")}
                  </button>
                  <a href={directions} className="text-link" rel="noopener" target="_blank">
                    {ctx.t("openInMaps")}
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}

export function Faq({ section }: SectionProps<"faq">) {
  const { props } = section;
  const accordion = section.variant === "accordion";
  return (
    <Section id={section.id} type={section.type} variant={section.variant} tone={section.tone}>
      <div className="faq">
        <SectionHead id={section.id} eyebrow={props.eyebrow} title={props.title} intro={props.intro} />
        <div className="faq__items">
          {props.items.map((it, i) =>
            accordion ? (
              <details className="faq__item" key={i}>
                <summary className="faq__q">
                  <h3 className="faq__title">{it.question}</h3>
                  <span className="faq__marker" aria-hidden="true" />
                </summary>
                <div className="faq__a">
                  <p>{it.answer}</p>
                </div>
              </details>
            ) : (
              <div className="faq__item" key={i}>
                <h3 className="faq__title">{it.question}</h3>
                <p className="faq__a">{it.answer}</p>
              </div>
            ),
          )}
        </div>
      </div>
    </Section>
  );
}
