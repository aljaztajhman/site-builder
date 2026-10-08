import { formatPhone, headerFamilyFor, type HeaderFamily, type Page, type Skeleton } from "@sb/spec";
import type { RenderCtx } from "../types.ts";
import { Icon, cx } from "../primitives/index.tsx";
import { heroOwnsCall } from "../groups/heroes/HeroSignature.tsx";
import type { UiKey } from "../i18n.ts";
import { navFit, type NavRow } from "./nav-fit.ts";

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
  const navPages = site.pages.filter((p) => p.nav.show);
  const ctaHref = cta === "none" ? null : ctx.href({ action: cta });
  // On phones, don't repeat an action that is already on screen: the action bar carries call and
  // directions, and the page's first section often opens with the same action (e.g. booking).
  const heroProps = page.sections[0]?.props as { primary?: { target?: { action?: string } }; secondary?: { target?: { action?: string } } } | undefined;
  const heroHasCta = cta !== "none" && [heroProps?.primary?.target?.action, heroProps?.secondary?.target?.action].includes(cta);
  const ctaWideOnly = (site.chrome.mobileActionBar && (cta === "call" || cta === "directions")) || heroHasCta;
  const logo = site.assets.logo;

  return (
    <header className={cx("site-header", `site-header--${variant}`, site.chrome.header.tone && site.chrome.header.tone !== "default" && `site-header--${site.chrome.header.tone}`)}>
      <script dangerouslySetInnerHTML={{ __html: JS_FLAG }} />
      <div className="container site-header__inner">
        <a className="site-header__brand" href={home ? ctx.pageHref(home.id) : undefined}>
          {logo ? (
            <img className="site-header__logo" src={ctx.media(logo.file)} width={logo.width} height={logo.height} alt={site.business.name} />
          ) : (
            <span className="site-header__name">{site.business.name}</span>
          )}
        </a>
        {navPages.length > 0 && (
          <>
            <button type="button" className="nav-toggle" aria-expanded="false" aria-controls={NAV_ID} data-nav-toggle="">
              <span className="nav-toggle__icon" aria-hidden="true" />
              {ctx.t("menu")}
            </button>
            <SiteNav ctx={ctx} navPages={navPages} />
          </>
        )}
        {cta !== "none" && ctaHref && (
          <a
            className={cx("btn btn--primary site-header__cta", ctaWideOnly && "site-header__cta--wide-only")}
            href={ctaHref}
            {...(cta === "call" ? {} : { rel: "noopener", target: "_blank" })}
          >
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
  const navPages = site.pages.filter((p) => p.nav.show);
  const logo = site.assets.logo;
  const sticky = family === "compact" || inHeader;
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
      )}
    >
      <script dangerouslySetInnerHTML={{ __html: JS_FLAG }} />
      <div className="container site-header__inner">
        <a className="site-header__brand" href={home ? ctx.pageHref(home.id) : undefined}>
          {logo ? (
            <img className="site-header__logo" src={ctx.media(logo.file)} width={logo.width} height={logo.height} alt={site.business.name} />
          ) : (
            <span className="site-header__name">{site.business.name}</span>
          )}
        </a>
        {family === "phone" && callHref && (
          <a className="site-header__phone" href={callHref} {...wait}>
            <Icon name="phone" />
            <span className="visually-hidden">{ctx.t("phone")}: </span>
            {formatPhone(site.business.phone as string)}
          </a>
        )}
        {navPages.length > 0 && (
          <>
            <button type="button" className={`nav-toggle nav-toggle--${toggle}`} aria-expanded="false" aria-controls={NAV_ID} data-nav-toggle="">
              <span className="nav-toggle__icon" aria-hidden="true" />
              <span className={toggle === "icon" ? "visually-hidden" : "nav-toggle__label"}>{ctx.t("menu")}</span>
            </button>
            <SiteNav ctx={ctx} navPages={navPages} />
          </>
        )}
        {(button !== null || (inHeader && directionsHref)) && (
          <div className={cx("site-header__actions", !inHeader && "site-header__actions--wide-only")}>
            {button && (
              <a
                className="btn btn--primary site-header__cta"
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
  const base = { design: site.design, more: ctx.t("moreNav"), brand: logo ? { logo } : { name: site.business.name } };
  const skeleton = site.design.skeleton;
  if (!skeleton) {
    const { variant, cta } = site.chrome.header;
    return {
      ...base,
      family: variant,
      ...(cta !== "none" && ctx.href({ action: cta }) ? { button: { label: ctx.t(CTA_LABEL[cta]), icon: false, large: variant === "split-cta" } } : {}),
    };
  }
  const { family, inHeader, callHref, directionsHref, button } = skeletonParts(ctx, skeleton);
  return {
    ...base,
    family,
    ...(family === "phone" && callHref ? { phone: formatPhone(site.business.phone as string) } : {}),
    ...(button ? { button: { label: ctx.t(CTA_LABEL[button]), icon: button === "call", large: family === "split-cta" } } : {}),
    ...(inHeader && directionsHref ? { directions: ctx.t("directions") } : {}),
  };
}

const navFits = (ctx: RenderCtx, navPages: Page[]) =>
  navFit(
    navPages.map((p) => p.nav.label),
    navRow(ctx),
  );

/** Whether this page's wide header puts menu entries under "Več" (the page then loads nav-more.js). */
export function navHasMore(ctx: RenderCtx): boolean {
  return navFits(
    ctx,
    ctx.site.pages.filter((p) => p.nav.show),
  ).some((f) => f !== undefined);
}

/**
 * The menu (both header kinds). Every entry is in the one list the phone menu shows. On wide screens the entries that
 * don't fit in the header's row (navFit: Plus has up to 20 pages) are hidden there from their breakpoint down and
 * listed again under "Več", a native disclosure at the end of the row (it works without JS; nav-more.js closes it on
 * Escape, an outside tap or focus leaving it). A site whose entries all fit renders as before.
 */
function SiteNav({ ctx, navPages }: { ctx: RenderCtx; navPages: Page[] }) {
  const fits = navFits(ctx, navPages);
  const current = (p: Page) => (p.id === ctx.page.id ? (ctx.entry ? "true" : "page") : undefined);
  const link = (p: Page) => (
    <a href={ctx.pageHref(p.id)} aria-current={current(p)}>
      {p.nav.label}
    </a>
  );
  const rest = navPages.flatMap((p, i) => (fits[i] ? [{ p, fit: fits[i] }] : []));
  return (
    <nav id={NAV_ID} className="site-nav" aria-label={ctx.t("mainNav")}>
      <ul className="site-nav__list" role="list">
        {navPages.map((p, i) => (
          <li key={p.id} data-nav-fit={fits[i]}>
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
                  <li key={p.id} data-nav-fit={fit}>
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
