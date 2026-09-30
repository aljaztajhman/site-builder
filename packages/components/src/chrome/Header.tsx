import type { RenderCtx } from "../types.ts";
import { cx } from "../primitives/index.tsx";
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
                    <a href={ctx.pageHref(p.id)} aria-current={p.id === page.id ? "page" : undefined}>
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
