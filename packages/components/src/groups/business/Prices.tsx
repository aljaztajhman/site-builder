import { PriceText, Section, SectionHead, cx, titleId } from "../../primitives/index.tsx";
import type { SectionProps } from "../../types.ts";
import { TAG_KEYS, itemId } from "./shared.tsx";
import { PlateStrip, motifOf } from "../../motifs/index.tsx";

/** Every price as a large object drawn by the direction's motif (a number plate in Tablica), the name under it. */
function PriceTags({ section, ctx }: SectionProps<"price-list">) {
  const { props } = section;
  const plate = motifOf(ctx) === "plate";
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
                <li className="price-tags__item" key={ii}>
                  <p className={cx("price-tag", plate && "plate")}>
                    {plate && <PlateStrip />}
                    <span className="price-tag__value">
                      <PriceText price={it.price} ctx={ctx} />
                    </span>
                  </p>
                  <Name className="price-tags__name">{it.name}</Name>
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

export function PriceList({ section, ctx, index }: SectionProps<"price-list">) {
  if (section.variant === "tags") return <PriceTags section={section} ctx={ctx} index={index} />;
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
                  <tr key={ii}>
                    <th scope="row">
                      <span className="prices__name">{it.name}</span>
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
                  <div className="prices__row" key={ii}>
                    <dt>
                      <span className="prices__name">{it.name}</span>
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
                <li className="menu__dish" key={di}>
                  <p className="menu__line">
                    <span className="menu__name">{d.name}</span>
                    <span className="menu__leader" aria-hidden="true" />
                    <PriceText price={d.price} ctx={ctx} />
                  </p>
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
