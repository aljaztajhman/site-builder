import type { CSSProperties } from "react";
import {
  formatDayRange,
  formatHoursValue,
  formatPhone,
  formatPhoneNational,
  headerFamilyFor,
  intentOfSection,
  isPlaceholder,
  type HeaderFamily,
  type Hours,
  type Intent,
  type Locale,
  type Page,
  type Section,
  type SectionOf,
  type Skeleton,
} from "@sb/spec";
import type { RenderCtx } from "../types.ts";
import { Icon, cx } from "../primitives/index.tsx";
import { heroOwnsCall } from "../groups/heroes/HeroSignature.tsx";
import { composedActions } from "../groups/composed/index.tsx";
import type { UiKey } from "../i18n.ts";
import { nameEm, navFit, type NavRow } from "./nav-fit.ts";
import { ChromeWordmark } from "../groups/composed/kinds/wordmark.tsx";

const CTA_LABEL: Record<"call" | "booking" | "directions", UiKey> = { call: "call", booking: "book", directions: "directions" };

/**
 * Marks the document as JS-capable before the header paints, so the mobile menu starts collapsed
 * without a layout shift. nav.js sets the same class; without JS the nav stays visible.
 */
/** The only inline script on a site (marks JS as available before first paint); the CSP allows it by hash. */
export const JS_FLAG = 'document.documentElement.classList.add("js")';

export const NAV_ID = "site-nav";

export function Header({ ctx }: { ctx: RenderCtx }) {
  const skeleton = ctx.site.design.skeleton;
  if (skeleton) return <SkeletonHeader ctx={ctx} skeleton={skeleton} />;
  const { site, page } = ctx;
  const { variant, cta } = site.chrome.header;
  const home = site.pages.find((p) => p.kind === "home");
  const items = navItems(ctx);
  const ctaHref = cta === "none" ? null : ctx.href({ action: cta });
  const callButton = cta === "call" && ctx.details?.cta === true;
  // On phones, don't repeat an action that is already on screen: the action bar carries call and
  // directions, and the page's first section often opens with the same action (e.g. booking).
  const heroProps = page.sections[0]?.props as { primary?: { target?: { action?: string } }; secondary?: { target?: { action?: string } } } | undefined;
  const heroHasCta = cta !== "none" && [heroProps?.primary?.target?.action, heroProps?.secondary?.target?.action].includes(cta);
  const ctaWideOnly = (site.chrome.mobileActionBar && (cta === "call" || cta === "directions")) || heroHasCta;
  // A composed opener that shows the same action (a call button, or a plate or number that calls) carries it on the first
  // screen; this header is not sticky, so its button would only repeat it beside the opener's: two calls on one screen.
  const first = page.sections[0];
  const openerCarries = cta !== "none" && first?.type === "composed" && composedActions(first as SectionOf<"composed">).includes(cta);
  const logo = site.assets.logo;
  const masthead = variant === "stacked" && ctx.details?.header === true;

  return (
    <header
      className={cx(
        "site-header",
        `site-header--${variant}`,
        site.chrome.header.tone && site.chrome.header.tone !== "default" && `site-header--${site.chrome.header.tone}`,
        masthead && "site-header--masthead",
      )}
    >
      <script dangerouslySetInnerHTML={{ __html: JS_FLAG }} />
      <div className="container site-header__inner">
        <a className="site-header__brand" href={home ? ctx.pageHref(home.id) : undefined}>
          {logo ? (
            <img className="site-header__logo" src={ctx.media(logo.file)} width={logo.width} height={logo.height} alt={site.business.name} />
          ) : (
            (ChromeWordmark({ ctx }) ?? <span className="site-header__name">{site.business.name}</span>)
          )}
        </a>
        {masthead && <MastheadFacts ctx={ctx} />}
        {items.length > 0 && (
          <>
            <button type="button" className="nav-toggle" aria-expanded="false" aria-controls={NAV_ID} data-nav-toggle="">
              <span className="nav-toggle__icon" aria-hidden="true" />
              {ctx.t("menu")}
            </button>
            <SiteNav ctx={ctx} items={items} />
          </>
        )}
        {cta !== "none" && ctaHref && !openerCarries && (
          <a
            className={cx("btn btn--primary site-header__cta", ctaWideOnly && "site-header__cta--wide-only", callButton && "btn--call")}
            href={ctaHref}
            {...(cta === "call" ? {} : { rel: "noopener", target: "_blank" })}
          >
            {callButton && <Icon name="phone" />}
            {ctx.t(CTA_LABEL[cta])}
          </a>
        )}
      </div>
    </header>
  );
}

/** How each header family draws the menu button: today's outlined box, the icon alone, or the word without a box. */
const TOGGLE: Record<HeaderFamily, "box" | "icon" | "word"> = {
  bar: "box",
  "split-cta": "box",
  stacked: "box",
  centred: "icon",
  compact: "icon",
  phone: "word",
  word: "word",
  overlay: "word",
};

/**
 * The header of a site with a skeleton (spec v15, design.skeleton): its family (headerFamilyFor: overlay only over a
 * photo hero), where the call lives, and one call button per screen. With actions "header" the header carries the call
 * (the phone family's number is the call) and the directions at every width, and stays on screen (sticky); otherwise
 * the bar or the floating button carries them on phones and the header never repeats the call.
 */
function skeletonParts(ctx: RenderCtx, skeleton: Skeleton) {
  const family = headerFamilyFor(skeleton, ctx.page.sections[0], ctx.site.assets.logo !== undefined);
  const inHeader = skeleton.actions === "header";
  const callHref = ctx.href({ action: "call" });
  const directionsHref = ctx.href({ action: "directions" });
  const cta = ctx.site.chrome.header.cta;
  // The header's button: the call when the header carries it (the phone family shows the number instead), else the
  // chrome's own action unless it is a call or the directions (the bar, the floating button or the hero carry those).
  const own = cta === "booking" && ctx.href({ action: "booking" }) ? "booking" : null;
  const button: "call" | "booking" | null = inHeader ? (callHref ? (family === "phone" ? null : "call") : own) : own;
  return { family, inHeader, callHref, directionsHref, button };
}

function SkeletonHeader({ ctx, skeleton }: { ctx: RenderCtx; skeleton: Skeleton }) {
  const { site, page } = ctx;
  const { family, inHeader, callHref, directionsHref, button } = skeletonParts(ctx, skeleton);
  const home = site.pages.find((p) => p.kind === "home");
  const items = navItems(ctx);
  const logo = site.assets.logo;
  const sticky = family === "compact" || inHeader;
  const masthead = family === "stacked" && ctx.details?.header === true;
  const toggle = TOGGLE[family];
  const tone = family === "overlay" ? undefined : site.chrome.header.tone;
  // The hero's call object owns the call on the first screen: the header's call waits until it has gone (reveal.js).
  const wait = inHeader && heroOwnsCall(page.sections[0]) ? { "data-after-hero": "" } : {};

  return (
    <header
      className={cx(
        "site-header",
        `site-header--${family}`,
        tone && tone !== "default" && `site-header--${tone}`,
        sticky && "site-header--sticky",
        inHeader && "site-header--carries-call",
        masthead && "site-header--masthead",
      )}
    >
      <script dangerouslySetInnerHTML={{ __html: JS_FLAG }} />
      <div className="container site-header__inner">
        <a className="site-header__brand" href={home ? ctx.pageHref(home.id) : undefined}>
          {logo ? (
            <img className="site-header__logo" src={ctx.media(logo.file)} width={logo.width} height={logo.height} alt={site.business.name} />
          ) : (
            // On phones the name is set at the size that fits its row (skeleton.css), so a long name stays on one line.
            (ChromeWordmark({ ctx }) ?? (
              <span className="site-header__name site-header__name--fit">
                <span className="site-header__name-text" style={{ "--name-em": nameEm(site.business.name, site.design).toFixed(2) } as CSSProperties}>
                  {site.business.name}
                </span>
              </span>
            ))
          )}
        </a>
        {family === "phone" && callHref && (
          <a className="site-header__phone" href={callHref} {...wait}>
            <Icon name="phone" />
            <span className="visually-hidden">{ctx.t("phone")}: </span>
            {formatPhone(site.business.phone as string)}
          </a>
        )}
        {family === "phone" && callHref && !inHeader && directionsHref && (
          // Phones only: the number's own row carries the directions too, so they are in the first screen however tall
          // the hero is (the bar or the floating button carries them once the hero's call has gone).
          <a className="text-link site-header__directions site-header__directions--phone-row" href={directionsHref} rel="noopener" target="_blank">
            <Icon name="map-pin" />
            {ctx.t("directions")}
          </a>
        )}
        {masthead && <MastheadFacts ctx={ctx} />}
        {items.length > 0 && (
          <>
            <button type="button" className={`nav-toggle nav-toggle--${toggle}`} aria-expanded="false" aria-controls={NAV_ID} data-nav-toggle="">
              <span className="nav-toggle__icon" aria-hidden="true" />
              <span className={toggle === "icon" ? "visually-hidden" : "nav-toggle__label"}>{ctx.t("menu")}</span>
            </button>
            <SiteNav ctx={ctx} items={items} />
          </>
        )}
        {(button !== null || (inHeader && directionsHref)) && (
          <div className={cx("site-header__actions", !inHeader && "site-header__actions--wide-only")}>
            {button && (
              <a
                className={cx("btn btn--primary site-header__cta", button === "call" && ctx.details?.cta === true && "btn--call")}
                href={ctx.href({ action: button })!}
                data-action={button}
                {...(button === "call" ? wait : { rel: "noopener", target: "_blank" })}
              >
                {button === "call" && <Icon name="phone" />}
                {ctx.t(CTA_LABEL[button])}
              </a>
            )}
            {inHeader && directionsHref && (
              <a className="text-link site-header__directions" href={directionsHref} rel="noopener" target="_blank">
                <Icon name="map-pin" />
                {ctx.t("directions")}
              </a>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

/** What shares the wide header's row with the menu (navFit), for either header kind. */
function navRow(ctx: RenderCtx): NavRow {
  const { site } = ctx;
  const logo = site.assets.logo;
  // details: the brand set larger (header, details.css BRAND_SCALE) and a call button as wide as a large one (cta).
  const base = {
    design: site.design,
    more: ctx.t("moreNav"),
    brand: logo ? { logo } : { name: site.business.name },
    ...(ctx.details?.header === true ? { brandScale: BRAND_SCALE } : {}),
  };
  const bigCall = (action: string) => action === "call" && ctx.details?.cta === true;
  const skeleton = site.design.skeleton;
  if (!skeleton) {
    const { variant, cta } = site.chrome.header;
    return {
      ...base,
      family: variant,
      ...(cta !== "none" && ctx.href({ action: cta }) ? { button: { label: ctx.t(CTA_LABEL[cta]), icon: bigCall(cta), large: variant === "split-cta" || bigCall(cta) } } : {}),
    };
  }
  const { family, inHeader, callHref, directionsHref, button } = skeletonParts(ctx, skeleton);
  return {
    ...base,
    family,
    ...(family === "phone" && callHref ? { phone: formatPhone(site.business.phone as string) } : {}),
    ...(button ? { button: { label: ctx.t(CTA_LABEL[button]), icon: button === "call", large: family === "split-cta" || bigCall(button) } } : {}),
    ...(inHeader && directionsHref ? { directions: ctx.t("directions") } : {}),
  };
}

/** How much larger details.header sets the brand (details.css zooms it by the same factor on wide screens). */
const BRAND_SCALE = 1.35;

/** A menu entry: a page, or (details.header on a one-page menu) a section of the home page. */
interface NavItem {
  key: string;
  href: string;
  label: string;
  current: "page" | "true" | undefined;
}

/** A section's own heading: its title, a hero's headline or a composed section's first heading; none without one. */
function sectionHeading(s: Section): string | undefined {
  if (s.type === "composed") return (s as SectionOf<"composed">).props.elements.find((e) => e.kind === "heading")?.text;
  const p = s.props as { title?: unknown; headline?: unknown };
  return typeof p.title === "string" ? p.title : typeof p.headline === "string" ? p.headline : undefined;
}

/** Short words a menu label never ends on (it reads cut off: "Kaj delamo za"). */
const DANGLING = new Set(["in", "ter", "ali", "za", "na", "v", "s", "z", "o", "pri", "od", "do", "po", "k", "h", "ki", "je", "se", "vse", "and", "or", "for", "of", "the", "to", "at", "a", "an", "with"]);
const ANCHORS_MAX = 4;
const LABEL_WORDS = 3;

/** A heading as a menu label: at most three words, without a dangling short word or the punctuation after the last. */
export function anchorLabel(heading: string): string {
  const words = heading.trim().split(/\s+/).slice(0, LABEL_WORDS);
  while (words.length > 1 && DANGLING.has(words[words.length - 1]!.toLowerCase().replace(/[^\p{L}]/gu, ""))) words.pop();
  return words.join(" ").replace(/[\p{P}]+$/u, "");
}

/** The menu's word for a section by what it is (spec intents), for a heading too long to stand in the menu. */
const INTENT_LABEL: Partial<Record<Intent, UiKey>> = {
  story: "navStory",
  services: "navServices",
  prices: "navPrices",
  menu: "navMenu",
  hours: "navHours",
  contact: "navContact",
  form: "navContact",
  faq: "navFaq",
  team: "navTeam",
  gallery: "navGallery",
  products: "navProducts",
  rooms: "navRooms",
  area: "navArea",
  steps: "navSteps",
  booking: "navBooking",
};

/** A section's menu label: its heading when it has three words or fewer, else the word for what it is, else the heading shortened. */
function sectionLabel(ctx: RenderCtx, s: Section, heading: string): string {
  if (heading.trim().split(/\s+/).length <= LABEL_WORDS) return heading.trim().replace(/[\p{P}]+$/u, "");
  const key = INTENT_LABEL[intentOfSection(s) ?? "system"];
  return key ? ctx.t(key) : anchorLabel(heading);
}

/**
 * The menu's entries: the pages shown in it. With details.header a menu of one page (the proof pages' lone "Domov")
 * lists the home page's headed sections instead, the opener left out (at most four), and nothing when fewer than two.
 */
function navItems(ctx: RenderCtx): NavItem[] {
  const pages = ctx.site.pages.filter((p) => p.nav.show);
  if (ctx.details?.header === true && pages.length === 1) {
    const home = ctx.site.pages.find((p) => p.kind === "home");
    if (!home) return [];
    const at = home.id === ctx.page.id && !ctx.entry ? "" : ctx.pageHref(home.id);
    const anchors = home.sections.slice(1).flatMap((s) => {
      const h = sectionHeading(s);
      const label = h ? sectionLabel(ctx, s, h) : "";
      return label ? [{ key: s.id, href: `${at}#${s.id}`, label, current: undefined }] : [];
    });
    // Two sections of one kind would be two entries of one word: the first one stands.
    const unique = anchors.filter((a, i) => anchors.findIndex((b) => b.label === a.label) === i);
    return unique.length >= 2 ? unique.slice(0, ANCHORS_MAX) : [];
  }
  const current = (p: Page) => (p.id === ctx.page.id ? (ctx.entry ? "true" : "page") : undefined);
  return pages.map((p) => ({ key: p.id, href: ctx.pageHref(p.id), label: p.nav.label, current: current(p) }));
}

const navFits = (ctx: RenderCtx, items: NavItem[]) =>
  navFit(
    items.map((p) => p.label),
    navRow(ctx),
  );

/** Whether this page's wide header puts menu entries under "Več" (the page then loads nav-more.js). */
export function navHasMore(ctx: RenderCtx): boolean {
  return navFits(ctx, navItems(ctx)).some((f) => f !== undefined);
}

const WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/**
 * The opening hours in a few words: the first run of days that open at the same hours ("pon–pet 8.00–16.00", spec
 * entries of one day each joined); none when every day is closed or the first run is one day of several with other
 * hours. The full table stays on the page.
 */
function hoursSummary(h: Hours, locale: Locale): string | undefined {
  const day = (d: string) => WEEK.indexOf(d as (typeof WEEK)[number]);
  const open = h.entries.filter((e) => !e.closed && e.open && e.close).sort((a, b) => day(a.from) - day(b.from));
  const first = open[0];
  if (!first) return undefined;
  let last = first;
  for (const e of open.slice(1)) {
    if (e.open !== first.open || e.close !== first.close || day(e.from) !== day(last.to) + 1) break;
    last = e;
  }
  // One day alone ("Pon 8.00–16.00") would read as the only open day: hours that change daily stay on the page.
  if (first.from === last.to && open.length > 1) return undefined;
  return `${formatDayRange({ ...first, to: last.to }, locale, true)} ${formatHoursValue(first, locale)}`;
}

/**
 * details.header, the stacked family as a masthead: the town, the number and the first line of the opening hours, each
 * only when the spec has it (nothing invented, a missing fact left out, no row with none). The number is text, not a
 * second call link: the header's button, the bar or the floating button carry the call.
 */
function MastheadFacts({ ctx }: { ctx: RenderCtx }) {
  const b = ctx.site.business;
  const town = isPlaceholder(b.address) ? undefined : b.address.city;
  const phone = isPlaceholder(b.phone) ? undefined : formatPhoneNational(b.phone);
  const hours = b.hours && !isPlaceholder(b.hours) ? hoursSummary(b.hours, ctx.locale) : undefined;
  if (!town && !phone && !hours) return null;
  return (
    <p className="site-header__facts">
      {town && <span className="site-header__fact">{town}</span>}
      {phone && (
        <span className="site-header__fact site-header__fact--phone">
          <span className="visually-hidden">{ctx.t("phone")}: </span>
          {phone}
        </span>
      )}
      {hours && <span className="site-header__fact site-header__fact--hours">{hours}</span>}
    </p>
  );
}

/**
 * The menu (both header kinds). Every entry is in the one list the phone menu shows. On wide screens the entries that
 * don't fit in the header's row (navFit: Plus has up to 20 pages) are hidden there from their breakpoint down and
 * listed again under "Več", a native disclosure at the end of the row (it works without JS; nav-more.js closes it on
 * Escape, an outside tap or focus leaving it). A site whose entries all fit renders as before.
 */
function SiteNav({ ctx, items }: { ctx: RenderCtx; items: NavItem[] }) {
  const fits = navFits(ctx, items);
  const link = (p: NavItem) => (
    <a href={p.href} aria-current={p.current}>
      {p.label}
    </a>
  );
  const rest = items.flatMap((p, i) => (fits[i] ? [{ p, fit: fits[i] }] : []));
  const current = (p: NavItem) => p.current;
  return (
    <nav id={NAV_ID} className="site-nav" aria-label={ctx.t("mainNav")}>
      <ul className="site-nav__list" role="list">
        {items.map((p, i) => (
          <li key={p.key} data-nav-fit={fits[i]}>
            {link(p)}
          </li>
        ))}
        {rest.length > 0 && (
          // Shown up to the breakpoint of the last entry it holds (the entries fit in order).
          <li className="site-nav__more" data-until={rest[rest.length - 1]!.fit}>
            <details>
              <summary data-nav-more="" data-current={rest.find((r) => current(r.p))?.fit}>
                {ctx.t("moreNav")}
              </summary>
              <ul className="site-nav__sub" role="list">
                {rest.map(({ p, fit }) => (
                  <li key={p.key} data-nav-fit={fit}>
                    {link(p)}
                  </li>
                ))}
              </ul>
            </details>
          </li>
        )}
      </ul>
    </nav>
  );
}
