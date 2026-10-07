import { formatPrice, isPlaceholder, type Price } from "@sb/spec";
import { Ph, Picture, PriceText, Section, SectionHead, cx, titleId } from "../../primitives/index.tsx";
import type { RenderCtx, SectionProps } from "../../types.ts";
import { TAG_KEYS, itemId } from "./shared.tsx";
import { LabelMark, PlateStrip, Spoon, motifOf } from "../../motifs/index.tsx";

/**
 * An item the owner marked as not available right now: it stays listed, says so in words (the price is
 * also struck through, which a screen reader doesn't announce), sentence case like every label.
 */
function Unavailable({ ctx, className }: { ctx: RenderCtx; className: string }) {
  return <span className={cx("unavailable", className)}>{ctx.t("unavailable")}</span>;
}

/**
 * Every price as a large object drawn by the direction's motif: a number plate in Tablica with the name under
 * it, a bottle label in Etiketa (branch, name, quantity, then the price, read top to bottom like a label).
 */
function PriceTags({ section, ctx }: SectionProps<"price-list">) {
  const { props } = section;
  const motif = motifOf(ctx);
  if (motif === "label" || motif === "bend") return <PriceLabels section={section} ctx={ctx} fold={motif === "bend"} />;
  const plate = motif === "plate";
  return (
    <Section id={section.id} type={section.type} variant={section.variant} tone={section.tone}>
      <SectionHead id={section.id} eyebrow={props.eyebrow} title={props.title} intro={props.intro} />
      {props.groups.map((g, gi) => {
        const Name = g.name ? "h4" : "h3";
        return (
          <div className="price-tags__group" key={gi}>
            {g.name && <h3 className="prices__group-title">{g.name}</h3>}
            <ul className="price-tags" role="list">
              {g.items.map((it, ii) => (
                <li className={cx("price-tags__item", it.unavailable && "is-unavailable")} key={ii}>
                  <p className={cx("price-tag", plate && "plate")}>
                    {plate && <PlateStrip />}
                    <span className="price-tag__value">
                      <PriceText price={it.price} ctx={ctx} />
                    </span>
                  </p>
                  <Name className="price-tags__name">{it.name}</Name>
                  {it.unavailable && (
                    <p>
                      <Unavailable ctx={ctx} className="price-tags__flag" />
                    </p>
                  )}
                  {it.note && <p className="price-tags__note muted">{it.note}</p>}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {props.footnote && <p className="prices__footnote muted">{props.footnote}</p>}
    </Section>
  );
}

/**
 * Prices on bottle labels (Etiketa): each item a framed label with the branch, its name, the note and the price.
 * fold (Pregib): the same order on a card with one cut corner, the price at the foot.
 */
function PriceLabels({ section, ctx, fold = false }: Omit<SectionProps<"price-list">, "index"> & { fold?: boolean }) {
  const { props } = section;
  return (
    <Section id={section.id} type={section.type} variant={section.variant} tone={section.tone}>
      <SectionHead id={section.id} eyebrow={props.eyebrow} title={props.title} intro={props.intro} />
      {props.groups.map((g, gi) => {
        const Name = g.name ? "h4" : "h3";
        return (
          <div className="price-tags__group" key={gi}>
            {g.name && <h3 className="prices__group-title">{g.name}</h3>}
            <ul className="price-labels" role="list">
              {g.items.map((it, ii) => (
                <li className={cx("price-label", fold ? "price-label--fold" : "label-card", it.unavailable && "is-unavailable")} key={ii}>
                  {!fold && <LabelMark ctx={ctx} />}
                  <Name className="price-label__name">{it.name}</Name>
                  {it.note && <p className="price-label__note">{it.note}</p>}
                  {it.unavailable && (
                    <p>
                      <Unavailable ctx={ctx} className="price-tags__flag" />
                    </p>
                  )}
                  <p className="price-label__price">
                    <PriceText price={it.price} ctx={ctx} />
                  </p>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {props.footnote && <p className="prices__footnote muted">{props.footnote}</p>}
    </Section>
  );
}

/**
 * Standing offers (a daily lunch, a Sunday menu) at headline size: each group one offer, its name saying when,
 * the item and what it includes, the price large; a spoon between them in Jedilnik. The heading is for screen
 * readers: the band itself is the statement.
 */
function PriceOffers({ section, ctx }: Omit<SectionProps<"price-list">, "index">) {
  const { props } = section;
  const spoon = motifOf(ctx) === "spoon";
  const offers = props.groups.flatMap((g) => g.items.map((it) => ({ when: g.name, it })));
  return (
    <Section id={section.id} type={section.type} variant={section.variant} tone={section.tone}>
      <h2 id={titleId(section.id)} className="section-title">
        {props.title}
      </h2>
      <ul className={cx("offers", spoon && "offers--spoon")} role="list">
        {offers.map(({ when, it }, i) => (
          <li className={cx("offers__item", it.unavailable && "is-unavailable")} key={i}>
            {spoon && i > 0 && <Spoon className="offers__spoon" />}
            <div className="offers__body">
              {when && <p className="offers__when">{when}</p>}
              <h3 className="offers__name">{it.name}</h3>
              {it.note && <p className="offers__note">{it.note}</p>}
              {it.unavailable && (
                <p>
                  <Unavailable ctx={ctx} className="prices__flag" />
                </p>
              )}
              <p className="offers__price">
                <PriceText price={it.price} ctx={ctx} />
              </p>
            </div>
          </li>
        ))}
      </ul>
      {props.footnote && <p className="prices__footnote muted">{props.footnote}</p>}
    </Section>
  );
}

/** rates: the photo beside it, at most 26 rem on desktop and 70 % of the screen on phones. */
export const PRICE_RATES_SIZES = "(min-width: 64rem) 26rem, 70vw";

/** A rate's amount large, its unit ("na osebo") small under it. */
function RateValue({ price, ctx }: { price: Price; ctx: RenderCtx }) {
  if (isPlaceholder(price)) return <Ph p={price} ctx={ctx} />;
  return (
    <>
      <span className="rates__amount">
        {price.from ? `${ctx.t("from")} ` : ""}
        {formatPrice(price.amount, ctx.locale)}
      </span>
      {price.unit && <span className="rates__unit">{price.unit}</span>}
    </>
  );
}

/**
 * Two to four prices at headline size on heavy rules (rooms per night), beside a photo of what they buy; the
 * footnote as a marked line under them (a trail blaze in Markacija).
 */
function PriceRates({ section, ctx }: Omit<SectionProps<"price-list">, "index">) {
  const { props } = section;
  const items = props.groups.flatMap((g) => g.items);
  return (
    <Section id={section.id} type={section.type} variant={section.variant} tone={section.tone}>
      <div className={cx("rates", props.image && "rates--image")}>
        {props.image && <Picture id={props.image} ctx={ctx} className="rates__media media--contained" sizes={PRICE_RATES_SIZES} />}
        <div className="rates__body">
          <SectionHead id={section.id} eyebrow={props.eyebrow} title={props.title} intro={props.intro} />
          <dl className="rates__list">
            {items.map((it, i) => (
              <div className={cx("rates__item", it.unavailable && "is-unavailable")} key={i}>
                <dt className="rates__name">
                  {it.name}
                  {it.note && <span className="rates__note muted">{it.note}</span>}
                  {it.unavailable && <Unavailable ctx={ctx} className="prices__flag" />}
                </dt>
                <dd className="rates__price">
                  <RateValue price={it.price} ctx={ctx} />
                </dd>
              </div>
            ))}
          </dl>
          {props.footnote && <p className="rates__footnote">{props.footnote}</p>}
        </div>
      </div>
    </Section>
  );
}

export function PriceList({ section, ctx, index }: SectionProps<"price-list">) {
  if (section.variant === "tags") return <PriceTags section={section} ctx={ctx} index={index} />;
  if (section.variant === "offers") return <PriceOffers section={section} ctx={ctx} />;
  if (section.variant === "rates") return <PriceRates section={section} ctx={ctx} />;
  const { props } = section;
  const table = section.variant === "table";
  return (
    <Section id={section.id} type={section.type} variant={section.variant} tone={section.tone}>
      <SectionHead id={section.id} eyebrow={props.eyebrow} title={props.title} intro={props.intro} />
      <div className={cx("prices", props.groups.length > 1 && "prices--multi")}>
        {props.groups.map((g, gi) =>
          table ? (
            <table className="prices__table" key={gi} aria-labelledby={g.name ? undefined : titleId(section.id)}>
              {g.name && (
                <caption>
                  <h3 className="prices__group-title">{g.name}</h3>
                </caption>
              )}
              <tbody>
                {g.items.map((it, ii) => (
                  <tr key={ii} className={it.unavailable ? "is-unavailable" : undefined}>
                    <th scope="row">
                      <span className="prices__name">{it.name}</span>
                      {it.unavailable && <Unavailable ctx={ctx} className="prices__flag" />}
                      {it.note && <span className="prices__note muted">{it.note}</span>}
                    </th>
                    <td>
                      <PriceText price={it.price} ctx={ctx} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="prices__group" key={gi}>
              {g.name && (
                <h3 className="prices__group-title">
                  {g.name}
                </h3>
              )}
              <dl className="prices__dl">
                {g.items.map((it, ii) => (
                  <div className={cx("prices__row", it.unavailable && "is-unavailable")} key={ii}>
                    <dt>
                      <span className="prices__name">{it.name}</span>
                      {it.unavailable && <Unavailable ctx={ctx} className="prices__flag" />}
                      {it.note && <span className="prices__note muted">{it.note}</span>}
                    </dt>
                    <dd>
                      <PriceText price={it.price} ctx={ctx} />
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ),
        )}
      </div>
      {props.footnote && <p className="prices__footnote muted">{props.footnote}</p>}
    </Section>
  );
}

export function Menu({ section, ctx }: SectionProps<"menu">) {
  const { props } = section;
  return (
    <Section id={section.id} type={section.type} variant={section.variant} tone={section.tone}>
      <SectionHead id={section.id} eyebrow={props.eyebrow} title={props.title} intro={props.intro} />
      <div className="menu">
        {props.categories.map((c, ci) => (
          <div className="menu__cat" key={ci}>
            <h3 className="menu__cat-title" id={itemId(section.id, ci, "cat")}>
              {c.name}
            </h3>
            <ul className="menu__dishes" aria-labelledby={itemId(section.id, ci, "cat")}>
              {c.dishes.map((d, di) => (
                <li className={cx("menu__dish", d.unavailable && "is-unavailable")} key={di}>
                  <p className="menu__line">
                    <span className="menu__name">{d.name}</span>
                    <span className="menu__leader" aria-hidden="true" />
                    <PriceText price={d.price} ctx={ctx} />
                  </p>
                  {d.unavailable && (
                    <p>
                      <Unavailable ctx={ctx} className="menu__flag" />
                    </p>
                  )}
                  {d.description && <p className="menu__desc muted">{d.description}</p>}
                  {d.tags && d.tags.length > 0 && (
                    <p className="menu__tags">
                      <span className="visually-hidden">{ctx.t("tagsLabel")}: </span>
                      {d.tags.map((t) => ctx.t(TAG_KEYS[t])).join(", ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {props.footnote && <p className="menu__footnote muted">{props.footnote}</p>}
    </Section>
  );
}
