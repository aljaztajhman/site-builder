import {
  collectionEntries,
  dateBadge,
  formatDateRange,
  formatLongDate,
  formatTimeRange,
  plural,
  readingMinutes,
  type CollectionKind,
  type Event,
  type Person,
  type Post,
  type ResolvedEntry,
  type Service,
} from "@sb/spec";
import type { ReactNode } from "react";
import { Picture, PriceText, Section, SectionHead, cx, titleId } from "../../primitives/index.tsx";
import type { RenderCtx, SectionProps } from "../../types.ts";
import type { UiKey } from "../../i18n.ts";

/** The link from a short list to the collection's page. */
const MORE: Record<CollectionKind, UiKey> = { blog: "moreBlog", events: "moreEvents", services: "moreServices", team: "moreTeam" };

export const COLLECTION_CARD_SIZES = "(min-width: 64rem) 24rem, (min-width: 48rem) 50vw, 100vw";
const PORTRAIT_SIZES = "6rem";

/** An entry's title, a link to its page when it has one. */
function EntryTitle({ e, ctx, children }: { e: ResolvedEntry; ctx: RenderCtx; children: ReactNode }) {
  return <h3 className="coll__title">{e.path ? <a href={ctx.entryHref(e.path)}>{children}</a> : children}</h3>;
}

/** When and where an event is: the days, the time and the place, each only when given. */
export function eventWhen(ev: Event, ctx: RenderCtx): string {
  return [formatDateRange(ev.date, ev.endDate, ctx.locale), ev.start ? formatTimeRange(ev.start, ev.end) : null].filter(Boolean).join(", ");
}

function PostItem({ e, ctx, cards }: { e: ResolvedEntry<"blog">; ctx: RenderCtx; cards: boolean }) {
  const p: Post = e.entry;
  return (
    <li className="coll__item">
      {cards && p.image && <Picture id={p.image} ctx={ctx} className="media--contained coll__media" sizes={COLLECTION_CARD_SIZES} alt="" />}
      <div className="coll__body">
        <p className="coll__meta">
          <time dateTime={p.date}>{formatLongDate(p.date, ctx.locale)}</time>
        </p>
        <EntryTitle e={e} ctx={ctx}>
          {p.title}
        </EntryTitle>
        <p>{p.summary}</p>
      </div>
    </li>
  );
}

function EventItem({ e, ctx, cards, hidden }: { e: ResolvedEntry<"events">; ctx: RenderCtx; cards: boolean; hidden: boolean }) {
  const ev: Event = e.entry;
  const badge = dateBadge(ev.date, ctx.locale);
  return (
    // data-ends: events.js hides the event once its last day has passed (the page itself never changes by date).
    <li className="coll__item coll__item--event" data-ends={ev.endDate ?? ev.date} hidden={hidden || undefined}>
      {cards && ev.image && <Picture id={ev.image} ctx={ctx} className="media--contained coll__media" sizes={COLLECTION_CARD_SIZES} alt="" />}
      <p className="coll__badge" aria-hidden="true">
        <span className="coll__badge-day">{badge.day}</span>
        <span className="coll__badge-month">{badge.month}</span>
      </p>
      <div className="coll__body">
        <EntryTitle e={e} ctx={ctx}>
          {ev.title}
        </EntryTitle>
        <p className="coll__meta">
          <time dateTime={ev.date}>{eventWhen(ev, ctx)}</time>
          {ev.place && <span className="coll__place">{ev.place}</span>}
          {ev.price && (
            <span className="coll__price">
              <PriceText price={ev.price} ctx={ctx} />
            </span>
          )}
        </p>
        <p>{ev.summary}</p>
      </div>
    </li>
  );
}

function ServiceItem({ e, ctx, cards }: { e: ResolvedEntry<"services">; ctx: RenderCtx; cards: boolean }) {
  const sv: Service = e.entry;
  return (
    <li className={cx("coll__item", "coll__item--service", !sv.price && "coll__item--no-price")}>
      {cards && sv.image && <Picture id={sv.image} ctx={ctx} className="media--contained coll__media" sizes={COLLECTION_CARD_SIZES} />}
      <div className="coll__body">
        <EntryTitle e={e} ctx={ctx}>
          {sv.name}
        </EntryTitle>
        {sv.price && (
          <p className="coll__price">
            <PriceText price={sv.price} ctx={ctx} />
          </p>
        )}
        <p className="coll__summary">{sv.summary}</p>
      </div>
    </li>
  );
}

/** Initials for a portrait tile when a person has no photo (titles like "dr." skipped). */
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => w && !w.endsWith("."))
    .slice(0, 2)
    .map((w) => w[0]!.toLocaleUpperCase("sl"))
    .join("");

function PersonItem({ e, ctx }: { e: ResolvedEntry<"team">; ctx: RenderCtx }) {
  const m: Person = e.entry;
  return (
    <li className="coll__item coll__item--person">
      {m.image ? (
        <Picture id={m.image} ctx={ctx} className="coll__portrait" sizes={PORTRAIT_SIZES} />
      ) : (
        <span className="coll__portrait coll__initials" aria-hidden="true">
          {initials(m.name)}
        </span>
      )}
      <div className="coll__body">
        <EntryTitle e={e} ctx={ctx}>
          {m.name}
        </EntryTitle>
        <p className="coll__meta">{m.role}</p>
        {m.bio && <p>{m.bio}</p>}
      </div>
    </li>
  );
}

/**
 * The `collection` section: one of the owner's collections on a page. Posts newest first, events soonest first;
 * with a limit only the first entries and a link to the collection's page. Events are all in the HTML and
 * events.js hides the past ones in the visitor's browser, so the published page needn't change each day.
 * An empty collection shows nothing, except events, which say there are none coming up.
 */
export function Collection({ section, ctx }: SectionProps<"collection">) {
  const { props } = section;
  const kind = props.kind;
  const all = collectionEntries(ctx.site.collections, kind);
  if (all.length === 0 && kind !== "events") return null;
  const cards = section.variant === "cards";
  const limit = props.limit ?? all.length;
  // Events: every one is rendered, those over the limit hidden until events.js has dropped the past ones.
  const shown = kind === "events" ? all : all.slice(0, limit);
  const listPage = ctx.site.collections?.[kind]?.page;
  const more = all.length > limit && listPage && listPage !== ctx.page.id ? ctx.pageHref(listPage) : null;
  const items = shown.map((e, i) => {
    switch (e.kind) {
      case "blog":
        return <PostItem key={i} e={e as ResolvedEntry<"blog">} ctx={ctx} cards={cards} />;
      case "events":
        return <EventItem key={i} e={e as ResolvedEntry<"events">} ctx={ctx} cards={cards} hidden={i >= limit} />;
      case "services":
        return <ServiceItem key={i} e={e as ResolvedEntry<"services">} ctx={ctx} cards={cards} />;
      case "team":
        return <PersonItem key={i} e={e as ResolvedEntry<"team">} ctx={ctx} />;
    }
  });
  return (
    <Section id={section.id} type={section.type} variant={section.variant} tone={section.tone}>
      <SectionHead id={section.id} eyebrow={props.eyebrow} title={props.title} intro={props.intro} />
      <ul className={cx("coll", `coll--${kind}`, cards && "coll--cards")} aria-labelledby={titleId(section.id)} {...(kind === "events" ? { "data-upcoming": "", "data-limit": String(limit) } : {})}>
        {items}
      </ul>
      {kind === "events" && (
        <p className="coll__empty" hidden={all.length > 0 || undefined}>
          {ctx.t("noUpcoming")}
        </p>
      )}
      {more && (
        <p className="coll__more">
          <a className="text-link" href={more}>
            {ctx.t(MORE[kind])}
          </a>
        </p>
      )}
    </Section>
  );
}

/** "4 minute branja", "1 minute read". */
export function readingTime(paragraphs: readonly string[], ctx: RenderCtx): string {
  const n = readingMinutes(paragraphs);
  return `${n} ${plural(n, { one: ctx.t("readOne"), two: ctx.t("readTwo"), few: ctx.t("readFew"), other: ctx.t("readOther") }, ctx.locale)}`;
}

/** Image widths of an entry page's picture: the text column. */
export const ENTRY_IMAGE_SIZES = "(min-width: 48rem) 44rem, 100vw";

/**
 * The main content of an entry's own page (a post, an event, a service, a person): the page's h1, what the
 * list shows, the facts of an event, the picture and the body. A link leads back to the collection's page.
 */
export function EntryArticle({ e, ctx }: { e: ResolvedEntry; ctx: RenderCtx }) {
  const listPage = ctx.site.pages.find((p) => p.id === ctx.site.collections?.[e.kind]?.page);
  const entry = e.entry;
  const title = "title" in entry ? entry.title : entry.name;
  const body = "body" in entry ? (entry.body ?? []) : [];
  const id = `entry-${e.kind}`;
  let kicker: ReactNode = null;
  let facts: ReactNode = null;
  let lead: string | undefined;
  switch (e.kind) {
    case "blog": {
      const p = entry as Post;
      lead = p.summary;
      kicker = (
        <p className="coll__meta">
          <time dateTime={p.date}>{formatLongDate(p.date, ctx.locale)}</time>
          <span>{readingTime(p.body, ctx)}</span>
        </p>
      );
      break;
    }
    case "events": {
      const ev = entry as Event;
      lead = ev.summary;
      facts = (
        <dl className="entry__facts">
          <div>
            <dt>{ctx.t("eventWhen")}</dt>
            <dd>
              <time dateTime={ev.date}>{eventWhen(ev, ctx)}</time>
            </dd>
          </div>
          {ev.place && (
            <div>
              <dt>{ctx.t("eventPlace")}</dt>
              <dd>{ev.place}</dd>
            </div>
          )}
          {ev.price && (
            <div>
              <dt>{ctx.t("priceLabel")}</dt>
              <dd>
                <PriceText price={ev.price} ctx={ctx} />
              </dd>
            </div>
          )}
        </dl>
      );
      break;
    }
    case "services": {
      const sv = entry as Service;
      lead = sv.summary;
      if (sv.price)
        facts = (
          <p className="entry__price">
            <PriceText price={sv.price} ctx={ctx} />
          </p>
        );
      break;
    }
    case "team": {
      const m = entry as Person;
      kicker = <p className="coll__meta">{m.role}</p>;
      lead = m.bio;
      break;
    }
  }
  const url = e.kind === "events" ? (entry as Event).url : undefined;
  const image = entry.image;
  return (
    <article className="s s-entry tone-default" aria-labelledby={titleId(id)} data-ends={e.kind === "events" ? ((entry as Event).endDate ?? (entry as Event).date) : undefined}>
      <div className="container entry">
        {listPage && (
          <p className="entry__back">
            <a href={ctx.pageHref(listPage.id)}>{listPage.nav.label}</a>
          </p>
        )}
        <header className="entry__head">
          {kicker}
          <h1 id={titleId(id)} className="section-title">
            {title}
          </h1>
          {lead && <p className="lead">{lead}</p>}
          {e.kind === "events" && (
            <p className="entry__past" hidden>
              {ctx.t("eventPast")}
            </p>
          )}
          {facts}
          {url && /^https?:\/\//i.test(url) && (
            <p>
              <a className="btn btn--primary" href={url} rel="noopener">
                {ctx.t("eventTickets")}
              </a>
            </p>
          )}
        </header>
        {image && <Picture id={image} ctx={ctx} className="entry__media" sizes={ENTRY_IMAGE_SIZES} priority />}
        <div className="entry__body">
          {body.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </div>
    </article>
  );
}
