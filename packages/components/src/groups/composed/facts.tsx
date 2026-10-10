/**
 * Business facts inside a composed section: opening hours, contact details, price lists. They show only what the
 * business facts hold; a missing fact is the same marked placeholder every other section shows (so publishing is
 * blocked until it is filled). Markup and classes are the preset sections' own (business.css), so they look and behave
 * the same; the week chart and the hours table are copies of Info.tsx's, which keeps those files untouched.
 */
import type { CSSProperties } from "react";
import { capitalize, dayName, hoursRows, isPlaceholder, weekChart, type Hours, type Placeholder } from "@sb/spec";
import { AddressText, EmailLink, HoursList, Icon, Ph, PhoneLink, PriceText, cx } from "../../primitives/index.tsx";
import { PlateStrip } from "../../motifs/index.tsx";
import type { RenderCtx } from "../../types.ts";
import type { ElOf } from "./layout.ts";

const MISSING_HOURS: Placeholder = { $placeholder: "hours" };

function HoursTable({ hours, ctx }: { hours: Hours; ctx: RenderCtx }) {
  return (
    <div className="hours">
      <table className="oh__table" aria-label={ctx.t("openingHours")}>
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

/** One row per day, a bar per opening span on a scale from the earliest opening to the latest closing (see Info.tsx). */
function WeekChart({ hours, ctx }: { hours: Hours; ctx: RenderCtx }) {
  const chart = weekChart(hours);
  if (!chart) return <HoursTable hours={hours} ctx={ctx} />;
  const span = (chart.end - chart.start) * 60;
  const onScale = Array.from({ length: chart.end - chart.start }, (_, i) => chart.start + i);
  return (
    <div className="week" style={{ "--week-hours": chart.end - chart.start } as CSSProperties}>
      <div className="week__scale" aria-hidden="true">
        <span />
        <div className="week__ticks">
          {onScale.map((h, i) => (
            <span key={h}>{i % 2 === 0 ? `${h}.00` : ""}</span>
          ))}
        </div>
      </div>
      <dl className="week__days">
        {chart.days.map((d) => (
          <div className="week__day" key={d.day}>
            <dt>{capitalize(dayName(d.day, ctx.locale))}</dt>
            <dd className="week__track">
              <span className="week__lines" aria-hidden="true">
                {onScale.map((h) => (
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

export function HoursFact({ el, ctx }: { el: ElOf<"hours">; ctx: RenderCtx }) {
  const hours = ctx.site.business.hours ?? MISSING_HOURS;
  if (isPlaceholder(hours))
    return (
      <p>
        <Ph p={hours} ctx={ctx} />
      </p>
    );
  if (el.style === "compact") return <HoursList ctx={ctx} hours={hours} short />;
  if (el.style === "week") return <WeekChart hours={hours} ctx={ctx} />;
  return <HoursTable hours={hours} ctx={ctx} />;
}

/** Phone, e-mail, address, and a plain link to the map (no embed: a composed section loads no script and no third party). */
export function ContactFact({ el, ctx }: { el: ElOf<"contact">; ctx: RenderCtx }) {
  const directions = ctx.href({ action: "directions" });
  return (
    <dl className="contact__facts">
      {el.show.map((what) => {
        switch (what) {
          case "phone":
            return (
              <div className="contact__fact" key={what}>
                <dt className="fact-label">
                  <Icon name="phone" />
                  {ctx.t("phone")}
                </dt>
                <dd>
                  <PhoneLink ctx={ctx} className="contact__link contact__phone" />
                </dd>
              </div>
            );
          case "email":
            return (
              <div className="contact__fact" key={what}>
                <dt className="fact-label">
                  <Icon name="mail" />
                  {ctx.t("emailLabel")}
                </dt>
                <dd>
                  <EmailLink ctx={ctx} className="contact__link" />
                </dd>
              </div>
            );
          case "address":
            return (
              <div className="contact__fact" key={what}>
                <dt className="fact-label">
                  <Icon name="map-pin" />
                  {ctx.t("address")}
                </dt>
                <dd>
                  <AddressText ctx={ctx} />
                </dd>
              </div>
            );
          case "map":
            // Without an address there is nothing to point at; the address fact shows the placeholder.
            return directions ? (
              <div className="contact__fact" key={what}>
                <dt className="fact-label">
                  <Icon name="map-pin" />
                  {ctx.t("map")}
                </dt>
                <dd>
                  <a href={directions} className="text-link" rel="noopener" target="_blank">
                    {ctx.t("openInMaps")}
                  </a>
                </dd>
              </div>
            ) : null;
        }
      })}
    </dl>
  );
}

/** What a price list item says when it is not available right now (as Prices.tsx). */
const Unavailable = ({ ctx }: { ctx: RenderCtx }) => <span className="unavailable prices__flag">{ctx.t("unavailable")}</span>;

export function PricesFact({ el, ctx }: { el: ElOf<"prices">; ctx: RenderCtx }) {
  if (el.style === "plates" || el.style === "tags") {
    const plate = el.style === "plates";
    return (
      <ul className={cx("price-tags", "cx-prices", plate ? "cx-prices--plates" : "cx-prices--tags")} role="list">
        {el.items.map((it, i) => (
          <li className={cx("price-tags__item", it.unavailable && "is-unavailable")} key={i}>
            {plate ? (
              <>
                <p className="price-tag plate">
                  <PlateStrip />
                  <span className="price-tag__value">
                    <PriceText price={it.price} ctx={ctx} />
                  </span>
                </p>
                <p className="price-tags__name">{it.name}</p>
                {it.unavailable && (
                  <p>
                    <Unavailable ctx={ctx} />
                  </p>
                )}
                {it.note && <p className="price-tags__note">{it.note}</p>}
              </>
            ) : (
              <div className="cx-tag">
                <p className="cx-tag__name">{it.name}</p>
                {it.note && <p className="cx-tag__note">{it.note}</p>}
                {it.unavailable && (
                  <p>
                    <Unavailable ctx={ctx} />
                  </p>
                )}
                <p className="cx-tag__price">
                  <PriceText price={it.price} ctx={ctx} />
                </p>
              </div>
            )}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="prices cx-prices cx-prices--rows">
      <dl className="prices__dl">
        {el.items.map((it, i) => (
          <div className={cx("prices__row", it.unavailable && "is-unavailable")} key={i}>
            <dt>
              <span className="prices__name">{it.name}</span>
              {it.unavailable && <Unavailable ctx={ctx} />}
              {it.note && <span className="prices__note muted">{it.note}</span>}
            </dt>
            <dd>
              <PriceText price={it.price} ctx={ctx} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
