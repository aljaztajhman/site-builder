import { formatPhone, headerFamilyFor, type HeaderFamily, type Skeleton } from "@sb/spec";
import type { RenderCtx } from "../types.ts";
import { Icon, cx } from "../primitives/index.tsx";
import { heroOwnsCall } from "../groups/heroes/HeroSignature.tsx";
import type { UiKey } from "../i18n.ts";

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
            <nav id={NAV_ID} className="site-nav" aria-label={ctx.t("mainNav")}>
              <ul className="site-nav__list" role="list">
                {navPages.map((p) => (
                  <li key={p.id}>
                    <a href={ctx.pageHref(p.id)} aria-current={p.id === page.id ? (ctx.entry ? "true" : "page") : undefined}>
                      {p.nav.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
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
function SkeletonHeader({ ctx, skeleton }: { ctx: RenderCtx; skeleton: Skeleton }) {
  const { site, page } = ctx;
  const family = headerFamilyFor(skeleton, page.sections[0], site.assets.logo !== undefined);
  const home = site.pages.find((p) => p.kind === "home");
  const navPages = site.pages.filter((p) => p.nav.show);
  const logo = site.assets.logo;
  const inHeader = skeleton.actions === "header";
  const callHref = ctx.href({ action: "call" });
  const directionsHref = ctx.href({ action: "directions" });
  const cta = site.chrome.header.cta;
  const sticky = family === "compact" || inHeader;
  const toggle = TOGGLE[family];
  // The header's button: the call when the header carries it (the phone family shows the number instead), else the
  // chrome's own action unless it is a call or the directions (the bar, the floating button or the hero carry those).
  const own = cta === "booking" && ctx.href({ action: "booking" }) ? "booking" : null;
  const button: "call" | "booking" | null = inHeader ? (callHref ? (family === "phone" ? null : "call") : own) : own;
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
            <nav id={NAV_ID} className="site-nav" aria-label={ctx.t("mainNav")}>
              <ul className="site-nav__list" role="list">
                {navPages.map((p) => (
                  <li key={p.id}>
                    <a href={ctx.pageHref(p.id)} aria-current={p.id === page.id ? (ctx.entry ? "true" : "page") : undefined}>
                      {p.nav.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
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
