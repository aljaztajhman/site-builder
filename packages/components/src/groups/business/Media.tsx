import { isPlaceholder, plural, type Placeholder } from "@sb/spec";
import { ActionLink, MaybeText, Ph, Picture, PriceText, Section, SectionHead, cx } from "../../primitives/index.tsx";
import type { SectionProps } from "../../types.ts";
import { largestWebp } from "./shared.tsx";
import { motifOf } from "../../motifs/index.tsx";

export const TEAM_GRID_SIZES = "(min-width: 64rem) 17rem, (min-width: 48rem) 33vw, 50vw";
export const TEAM_LIST_SIZES = "(min-width: 48rem) 8rem, 6rem";

/** "Urška Lebar" -> "UL"; titles and abbreviations ("dr.", "dent.") are skipped. No initials for a placeholder name. */
export function initials(name: string | Placeholder): string {
  if (isPlaceholder(name)) return "";
  const words = name.split(/[\s,]+/).filter((w) => /^\p{L}/u.test(w) && !w.includes("."));
  return words.slice(0, 2).map((w) => w.charAt(0).toLocaleUpperCase("sl-SI")).join("");
}

/** photo: the team photo at 5/11 of the container on desktop, the screen width on phones; the inset a third of it. */
export const TEAM_PHOTO_SIZES = "(min-width: 64rem) 32rem, 100vw";
export const TEAM_INSET_SIZES = "(min-width: 64rem) 12rem, 34vw";

/** photo: the heading and the people as ruled rows (name, role) beside one photo, a second photo over its corner. */
function TeamPhoto({ section, ctx, index }: SectionProps<"team">) {
  const { props } = section;
  // Nasmeh: the practitioner round, the room in a tall arch, side by side with the people between them.
  const smile = motifOf(ctx) === "smile";
  return (
    <Section id={section.id} type={section.type} variant={section.variant} tone={section.tone}>
      <div className={cx("team-photo", props.image && "team-photo--has-image")}>
        <div className="team-photo__text">
          <SectionHead id={section.id} eyebrow={props.eyebrow} title={props.title} intro={props.intro} />
          <ul className="team-rows">
            {props.members.map((m, i) => (
              <li className="team-rows__member" key={i}>
                <h3 className="team-rows__name">
                  <MaybeText value={m.name} ctx={ctx} />
                </h3>
                <p className="team-rows__role muted">{m.role}</p>
                {m.bio && <p className="team-rows__bio">{m.bio}</p>}
              </li>
            ))}
          </ul>
        </div>
        {props.image && (
          <figure className="team-photo__figure">
            <Picture id={props.image} ctx={ctx} className={cx("team-photo__media media--contained", smile && "disc")} sizes={TEAM_PHOTO_SIZES} priority={index === 0} />
            {props.inset && <Picture id={props.inset} ctx={ctx} className={cx("team-photo__inset media--contained", smile && "arch-top")} sizes={TEAM_INSET_SIZES} />}
          </figure>
        )}
      </div>
    </Section>
  );
}

export function Team({ section, ctx, index }: SectionProps<"team">) {
  if (section.variant === "photo") return <TeamPhoto section={section} ctx={ctx} index={index} />;
  const { props } = section;
  const grid = section.variant === "grid";
  // Some members with a portrait and some without: the others get a tile of the same size with their
  // initials, so names and roles line up across the row instead of jumping to the top.
  const mixed = props.members.some((m) => m.image) && props.members.some((m) => !m.image);
  return (
    <Section id={section.id} type={section.type} variant={section.variant} tone={section.tone}>
      <SectionHead id={section.id} eyebrow={props.eyebrow} title={props.title} intro={props.intro} />
      <ul className={cx("team", props.members.some((m) => m.bio) && "team--bios")}>
        {props.members.map((m, i) => (
          <li className={cx("team__member", !m.image && !mixed && "team__member--text")} key={i}>
            {m.image ? (
              <Picture id={m.image} ctx={ctx} className="media--contained team__photo" sizes={grid ? TEAM_GRID_SIZES : TEAM_LIST_SIZES} />
            ) : mixed ? (
              <span className="media media--contained team__photo team__initials" aria-hidden="true">
                {initials(m.name)}
              </span>
            ) : null}
            <div className="team__text">
              <h3 className="team__name">
                <MaybeText value={m.name} ctx={ctx} />
              </h3>
              <p className="team__role muted">{m.role}</p>
              {m.bio && <p className="team__bio">{m.bio}</p>}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export const GALLERY_GRID_SIZES = "(min-width: 64rem) 18rem, (min-width: 48rem) 33vw, 50vw";
export const GALLERY_MOSAIC_SIZES = "(min-width: 64rem) 24rem, (min-width: 48rem) 33vw, 50vw";

export function Gallery({ section, ctx }: SectionProps<"gallery">) {
  const { props } = section;
  const sizes = section.variant === "mosaic" ? GALLERY_MOSAIC_SIZES : GALLERY_GRID_SIZES;
  return (
    <Section id={section.id} type={section.type} variant={section.variant} tone={section.tone}>
      <SectionHead id={section.id} eyebrow={props.eyebrow} title={props.title} intro={props.intro} />
      <ul
        className="gallery"
        data-gallery=""
        data-label-dialog={props.title}
        data-label-close={ctx.t("galleryClose")}
        data-label-prev={ctx.t("galleryPrev")}
        data-label-next={ctx.t("galleryNext")}
      >
        {props.images.map((g, i) => {
          const img = ctx.image(g.image);
          const label = img.alt ? undefined : (g.caption ?? ctx.t("galleryOpen"));
          return (
            <li className="gallery__item" key={i}>
              <figure className="gallery__figure">
                <a className="gallery__link" href={largestWebp(img)} data-gallery-item="" aria-label={label}>
                  <Picture id={g.image} ctx={ctx} className="media--contained gallery__media" sizes={sizes} />
                </a>
                {g.caption && <figcaption className="gallery__caption">{g.caption}</figcaption>}
              </figure>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

export const PRODUCT_GRID_SIZES = "(min-width: 64rem) 17rem, (min-width: 48rem) 33vw, 50vw";
export const PRODUCT_LIST_SIZES = "5rem";

/** plates: a plate photo at a third of the container on desktop, half the screen on a tablet, 82 % on phones. */
export const PRODUCT_PLATE_SIZES = "(min-width: 64rem) 22rem, (min-width: 40rem) 45vw, 82vw";

/** plates: dishes with a photo as round plates, the rest as a ruled list with dotted leaders. */
function ProductPlates({ section, ctx }: SectionProps<"products">) {
  const { props } = section;
  const plated = props.items.filter((p) => p.image);
  const listed = props.items.filter((p) => !p.image);
  return (
    <Section id={section.id} type={section.type} variant={section.variant} tone={section.tone}>
      <SectionHead id={section.id} eyebrow={props.eyebrow} title={props.title} intro={props.intro} />
      {plated.length > 0 && (
        <ul className="plates">
          {plated.map((p, i) => (
            <li className="plates__item" key={i}>
              <Picture id={p.image!} ctx={ctx} className="plates__media disc media--contained" sizes={PRODUCT_PLATE_SIZES} />
              <div className="plates__caption">
                <h3 className="plates__name">{p.name}</h3>
                {p.price && (
                  <p className="plates__price">
                    <PriceText price={p.price} ctx={ctx} />
                  </p>
                )}
              </div>
              {p.description && <p className="plates__desc muted">{p.description}</p>}
            </li>
          ))}
        </ul>
      )}
      {listed.length > 0 && (
        <ul className="plates-list">
          {listed.map((p, i) => (
            <li className="plates-list__item" key={i}>
              <h3 className="plates-list__name">{p.name}</h3>
              <span className="plates-list__leader" aria-hidden="true" />
              <p className="plates-list__price">{p.price ? <PriceText price={p.price} ctx={ctx} /> : p.unit ?? null}</p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function Products({ section, ctx, index }: SectionProps<"products">) {
  if (section.variant === "plates") return <ProductPlates section={section} ctx={ctx} index={index} />;
  const { props } = section;
  const grid = section.variant === "grid";
  return (
    <Section id={section.id} type={section.type} variant={section.variant} tone={section.tone}>
      <SectionHead id={section.id} eyebrow={props.eyebrow} title={props.title} intro={props.intro} />
      <ul className="products">
        {props.items.map((p, i) => (
          <li className={cx("product", !p.image && "product--text")} key={i}>
            {p.image && (
              <Picture id={p.image} ctx={ctx} className="media--contained product__media" sizes={grid ? PRODUCT_GRID_SIZES : PRODUCT_LIST_SIZES} />
            )}
            <div className="product__body">
              <h3 className="product__name">{p.name}</h3>
              {p.description && <p className="product__desc">{p.description}</p>}
            </div>
            {(p.price || p.unit) && (
              <p className="product__meta">
                {p.price && <PriceText price={p.price} ctx={ctx} />}
                {p.unit && <span className="product__unit muted">{p.unit}</span>}
              </p>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

export const ROOM_CARD_SIZES = "(min-width: 64rem) 36rem, (min-width: 48rem) 50vw, 100vw";
export const ROOM_ROW_SIZES = "(min-width: 64rem) 32rem, (min-width: 48rem) 45vw, 100vw";

export function Rooms({ section, ctx }: SectionProps<"rooms">) {
  const { props } = section;
  const cards = section.variant === "cards";
  const persons = (n: number) =>
    plural(
      n,
      { one: ctx.t("personOne"), two: ctx.t("personTwo"), few: ctx.t("personFew"), other: ctx.t("personOther") },
      ctx.locale,
    );
  return (
    <Section id={section.id} type={section.type} variant={section.variant} tone={section.tone}>
      <SectionHead id={section.id} eyebrow={props.eyebrow} title={props.title} intro={props.intro} />
      <ul className="rooms">
        {props.items.map((r, i) => (
          <li className={cx("room", cards && "card", !r.image && "room--text")} key={i}>
            {r.image && (
              <Picture id={r.image} ctx={ctx} className="media--contained room__media" sizes={cards ? ROOM_CARD_SIZES : ROOM_ROW_SIZES} />
            )}
            <div className="room__body">
              <h3 className="room__name">{r.name}</h3>
              {r.capacity !== undefined && (
                <p className="room__capacity">
                  <span className="muted">{ctx.t("capacity")}:</span> {r.capacity}&nbsp;{persons(r.capacity)}
                </p>
              )}
              <p className="room__desc">{r.description}</p>
              {r.features && r.features.length > 0 && (
                <ul className="room__features" aria-label={ctx.t("roomFeatures")}>
                  {r.features.map((f, fi) => (
                    <li key={fi}>{f}</li>
                  ))}
                </ul>
              )}
              {(r.price || r.link) && (
                <div className="room__foot">
                  {r.price && (
                    <p className="room__price">
                      <PriceText price={r.price} ctx={ctx} />
                    </p>
                  )}
                  {r.link && <ActionLink link={r.link} ctx={ctx} kind="secondary" />}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function ServiceArea({ section, ctx }: SectionProps<"service-area">) {
  const { props } = section;
  const areas = ctx.site.business.serviceArea ?? [];
  return (
    <Section id={section.id} type={section.type} variant={section.variant} tone={section.tone}>
      <div className="area">
        <SectionHead id={section.id} eyebrow={props.eyebrow} title={props.title} intro={props.intro} />
        <div className="area__body">
          {areas.length > 0 ? (
            <ul className="area__list" aria-label={ctx.t("serviceArea")}>
              {areas.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          ) : (
            <p>
              <Ph p={{ $placeholder: "text", note: ctx.t("serviceArea") }} ctx={ctx} />
            </p>
          )}
          {props.action && (
            <div className="actions">
              <ActionLink link={props.action} ctx={ctx} kind="primary" />
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}
