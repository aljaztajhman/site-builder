import type { CSSProperties } from "react";
import { capitalize, dayName, formatAddress, hoursRows, isPlaceholder, weekChart, type Hours, type Placeholder } from "@sb/spec";
import {
  AddressText,
  EmailLink,
  HoursList,
  Icon,
  PhoneLink,
  Picture,
  Ph,
  Section,
  SectionHead,
  titleId,
} from "../../primitives/index.tsx";
import type { RenderCtx, SectionProps } from "../../types.ts";
import { CallObject } from "../../motifs/index.tsx";

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

/**
 * The hours as a week chart: one row per day, a bar per opening span on a scale from the earliest opening to the
 * latest closing, each bar labelled with its times (so the chart reads without the scale, which phones hide).
 * Positions are fractions of the scale in custom properties; the rows are a description list.
 */
function WeekChart({ hours, ctx, labelledBy }: { hours: Hours; ctx: RenderCtx; labelledBy: string }) {
  const chart = weekChart(hours);
  if (!chart) return <HoursTable hours={hours} ctx={ctx} labelledBy={labelledBy} />;
  const span = (chart.end - chart.start) * 60;
  const hoursOnScale = Array.from({ length: chart.end - chart.start }, (_, i) => chart.start + i);
  return (
    <div className="week" style={{ "--week-hours": chart.end - chart.start } as CSSProperties}>
      <div className="week__scale" aria-hidden="true">
        <span />
        <div className="week__ticks">
          {hoursOnScale.map((h, i) => (
            <span key={h}>{i % 2 === 0 ? `${h}.00` : ""}</span>
          ))}
        </div>
      </div>
      <dl className="week__days" aria-labelledby={labelledBy}>
        {chart.days.map((d) => (
          <div className="week__day" key={d.day}>
            <dt>{capitalize(dayName(d.day, ctx.locale))}</dt>
            <dd className="week__track">
              <span className="week__lines" aria-hidden="true">
                {hoursOnScale.map((h) => (
                  <i key={h} />
                ))}
              </span>
              {d.closed ? (
                <span className="week__closed">{ctx.locale === "sl" ? "zaprto" : "closed"}</span>
              ) : (
                d.bars.map((b) => (
                  <span
                    key={b.from}
                    className={b.to - b.from < span * 0.3 ? "week__bar week__bar--short" : "week__bar"}
                    style={{ "--at": ((b.from - chart.start * 60) / span).toFixed(4), "--len": ((b.to - b.from) / span).toFixed(4) } as CSSProperties}
                  >
                    {b.label}
                  </span>
                ))
              )}
            </dd>
          </div>
        ))}
      </dl>
      {hours.note && <p className="hours__note">{hours.note}</p>}
    </div>
  );
}

/** photo: the arch at 5/11 of the container on desktop, 78 % of the screen on phones; the inset disc beside it. */
export const OPENING_HOURS_PHOTO_SIZES = "(min-width: 64rem) 30rem, 78vw";

export function OpeningHours({ section, ctx, index }: SectionProps<"opening-hours">) {
  const { props } = section;
  const hours = ctx.site.business.hours ?? MISSING_HOURS;
  const image = section.variant === "photo" ? props.image : undefined;
  const text = (
    <>
      <SectionHead id={section.id} eyebrow={props.eyebrow} title={props.title} />
      <div className="oh__body">
        {isPlaceholder(hours) ? (
          <p>
            <Ph p={hours} ctx={ctx} />
          </p>
        ) : section.variant === "compact" ? (
          <HoursList ctx={ctx} hours={hours} short />
        ) : section.variant === "week" ? (
          <WeekChart hours={hours} ctx={ctx} labelledBy={titleId(section.id)} />
        ) : (
          <HoursTable hours={hours} ctx={ctx} labelledBy={titleId(section.id)} />
        )}
        {props.note && <p className="oh__note">{props.note}</p>}
      </div>
    </>
  );
  return (
    <Section id={section.id} type={section.type} variant={section.variant} tone={section.tone}>
      {image ? (
        <div className="oh oh--photo">
          <figure className="oh__door">
            <Picture id={image} ctx={ctx} className="oh__door-media arch-top media--contained" sizes={OPENING_HOURS_PHOTO_SIZES} priority={index === 0} />
            {props.inset && (
              <span className="oh__dot disc">
                <Picture id={props.inset} ctx={ctx} className="oh__dot-media media--contained" sizes="(min-width: 64rem) 12.5rem, 8rem" />
              </span>
            )}
          </figure>
          <div className="oh__text">{text}</div>
        </div>
      ) : (
        <div className="oh">{text}</div>
      )}
    </Section>
  );
}

/**
 * Closing call for businesses that live on calls: the phone at poster size as the direction's call object,
 * then address, hours (unless the page has its own opening-hours section) and e-mail (when there is one) in a
 * row. No map.
 */
function ContactCallOut({ section, ctx }: SectionProps<"contact">) {
  const { props } = section;
  const b = ctx.site.business;
  // Say each thing once: a page that has its own opening-hours section doesn't repeat the hours here.
  const hoursElsewhere = ctx.page.sections.some((s) => s.type === "opening-hours");
  const directions = ctx.href({ action: "directions" });
  return (
    <Section id={section.id} type={section.type} variant={section.variant} tone={section.tone}>
      <div className="callout">
        <SectionHead id={section.id} eyebrow={props.eyebrow} title={props.title} intro={props.intro} />
        <p className="callout__call">
          <CallObject ctx={ctx} size="poster" />
        </p>
        <dl className="callout__facts">
          <div className="callout__fact">
            <dt>{ctx.t("address")}</dt>
            <dd>
              <AddressText ctx={ctx} />
              {directions && (
                <a href={directions} className="text-link" rel="noopener" target="_blank">
                  {ctx.t("directions")}
                </a>
              )}
            </dd>
          </div>
          {b.hours !== undefined && !hoursElsewhere && (
            <div className="callout__fact">
              <dt>{ctx.t("openingHours")}</dt>
              <dd>
                <HoursList ctx={ctx} short />
              </dd>
            </div>
          )}
          {!isPlaceholder(b.email) && (
            <div className="callout__fact">
              <dt>{ctx.t("emailLabel")}</dt>
              <dd>
                <EmailLink ctx={ctx} className="text-link" />
              </dd>
            </div>
          )}
        </dl>
      </div>
    </Section>
  );
}

export function Contact({ section, ctx, index }: SectionProps<"contact">) {
  if (section.variant === "call-out") return <ContactCallOut section={section} ctx={ctx} index={index} />;
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
              <dt className="fact-label">
                <Icon name="phone" />
                {ctx.t("phone")}
              </dt>
              <dd>
                <PhoneLink ctx={ctx} className="contact__link contact__phone" />
              </dd>
            </div>
            <div className="contact__fact">
              <dt className="fact-label">
                <Icon name="mail" />
                {ctx.t("emailLabel")}
              </dt>
              <dd>
                <EmailLink ctx={ctx} className="contact__link" />
              </dd>
            </div>
            <div className="contact__fact">
              <dt className="fact-label">
                <Icon name="map-pin" />
                {ctx.t("address")}
              </dt>
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
                <dt className="fact-label">
                  <Icon name="clock" />
                  {ctx.t("openingHours")}
                </dt>
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
