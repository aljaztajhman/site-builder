import type { RenderCtx } from "../types.ts";

/**
 * Small non-blocking notice for consent-gated embeds (maps). Rendered by the page shell only when
 * the page loads consent.js; hidden until consent.js finds no stored choice. Both choices have equal
 * weight. The choice lives in localStorage under `sb-consent` (not a cookie).
 */
export function CookieConsent({ ctx }: { ctx: RenderCtx }) {
  const privacy = ctx.site.pages.find((p) => p.kind === "privacy");
  return (
    <section id="consent" className="consent" aria-labelledby="consent-title" data-consent-notice="" hidden>
      <h2 id="consent-title" className="consent__title">
        {ctx.t("cookieTitle")}
      </h2>
      <p className="consent__text">
        {ctx.t("cookieText")}
        {privacy && (
          <>
            {" "}
            <a href={ctx.pageHref(privacy.id)}>{privacy.nav.label}</a>
          </>
        )}
      </p>
      <div className="consent__actions">
        <button type="button" className="btn btn--secondary" data-consent="denied">
          {ctx.t("cookieDecline")}
        </button>
        <button type="button" className="btn btn--secondary" data-consent="granted">
          {ctx.t("cookieAccept")}
        </button>
      </div>
    </section>
  );
}
