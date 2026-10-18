import type { CSSProperties } from "react";
import { DIRECTIONS, isPlaceholder, isWebUrl } from "@sb/spec";
import type { RenderCtx } from "../types.ts";
import { AddressText, EmailLink, HoursList, Icon, MaybeText, PhoneLink, cx } from "../primitives/index.tsx";
import { ChromeWordmark } from "../groups/composed/kinds/wordmark.tsx";
import { contactShown, pageFacts } from "./page-facts.ts";
import { menuPages } from "./nav-fit.ts";

/** Characters of the longest word: the wordmark's size is set so it fits the width (skeleton.css). */
const longestWord = (s: string): number => Math.max(4, ...s.split(/\s+/).map((w) => w.length));

const NETWORK_LABEL = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  linkedin: "LinkedIn",
} as const;

/**
 * Site footer with the provider information ZEPT requires (legal name, address, registration and
 * tax numbers, registry, contact). Missing facts render as required placeholders.
 */
export function Footer({ ctx }: { ctx: RenderCtx }) {
  const { site } = ctx;
  const b = site.business;
  const p = b.provider;
  // Spec v15: a skeleton's footer family and tone (its wordmark and visit families hold the compact rows below).
  const skeleton = site.design.skeleton;
  const variant = skeleton?.footer ?? site.chrome.footer.variant;
  const compact = variant !== "columns";
  const wordmark = variant === "wordmark";
  const directions = ctx.href({ action: "directions" });
  // A band footer needs a band colour (a template always has one); without it the dark ground.
  const hasBand = site.design.colors.band !== undefined || DIRECTIONS.some((d) => d.id === site.design.direction && d.template);
  const tone = skeleton && skeleton.footerTone === "band" && !hasBand ? "inverse" : skeleton?.footerTone;
  const navPages = menuPages(site);
  const legalPages = (["privacy", "accessibility"] as const)
    .map((kind) => site.pages.find((x) => x.kind === kind))
    .filter((x) => x !== undefined);
  const links = [...navPages, ...legalPages.filter((x) => !navPages.includes(x))];
  const taxLabel = p.vatPayer ? ctx.t("vatId") : ctx.t("taxNumber");
  const headingClass = compact ? "visually-hidden" : "site-footer__heading";
  // Only http(s) links: z.url() also accepts javascript: and data:.
  const social = (b.social ?? []).filter((s) => isWebUrl(s.url));
  // Say each thing once: the visit block leaves out what a section of this page already shows (the address with its
  // directions, the hours); with both shown above, the footer has no visit block. The provider rows always stay.
  const shown = variant === "visit" ? pageFacts(ctx.page, b) : { address: false, hours: false };
  const visitWhere = !shown.address;
  const visitHours = b.hours !== undefined && !shown.hours;
  // After a contact section the contact row keeps only the name (owner's decision 2026-10-15): the provider rows
  // (legal name, registration and tax numbers) stay, phone, e-mail and address are already on the page.
  const reach = contactShown(ctx.page, b);

  return (
    <footer
      className={
        skeleton
          ? cx("site-footer", variant !== "columns" && variant !== "compact" && "site-footer--compact", `site-footer--${variant}`, `site-footer--tone-${tone}`)
          : cx("site-footer", `site-footer--${variant}`)
      }
    >
      <div className="container">
        {wordmark && (
          // The name set large as the page's last word; decorative for screen readers (they read the name line below).
          // A name with Č Š Ž gets room for the marks (render markMarkedLines, base.css).
          <p className="site-footer__wordmark" aria-hidden="true" style={{ "--wm-chars": longestWord(b.name), "--wm-line": b.name.length } as CSSProperties}>
            {b.name}
          </p>
        )}
        {variant === "visit" && (visitWhere || visitHours) && (
          <div className="site-footer__visit">
            {visitWhere && (
              <div className="site-footer__visit-where">
                <h2 className="site-footer__visit-title">{ctx.t("visitUs")}</h2>
                <AddressText ctx={ctx} />
                {directions && (
                  <a className="text-link site-footer__directions" href={directions} rel="noopener" target="_blank">
                    <Icon name="map-pin" />
                    {ctx.t("directions")}
                  </a>
                )}
              </div>
            )}
            {visitHours && (
              <div className="site-footer__visit-hours">
                <h2 className="site-footer__visit-title">{ctx.t("openingHours")}</h2>
                <HoursList ctx={ctx} />
              </div>
            )}
          </div>
        )}
        <div className="site-footer__grid">
          {/* A contact block left with nothing to show (the name under the wordmark, the rest on the page) keeps its
              text for screen readers but no empty grid row. */}
          <div className={cx("site-footer__block site-footer__contact", wordmark && reach.address && reach.phone && reach.email && "visually-hidden")}>
            <h2 className={headingClass}>{ctx.t("contact")}</h2>
            {wordmark ? (
              // Under the big wordmark a visible name line was the name's third print with the © line (Fable, M1 final
              // check): it stays for screen readers only, since the wordmark is aria-hidden.
              <p className="site-footer__name visually-hidden">{b.name}</p>
            ) : (
              <p className="site-footer__name">{ChromeWordmark({ ctx }) ?? b.name}</p>
            )}
            {variant !== "visit" && !reach.address && <AddressText ctx={ctx} />}
            {(!reach.phone || !reach.email) && (
              <ul className="site-footer__facts" role="list">
                {!reach.phone && (
                  <li>
                    <span className="visually-hidden">{ctx.t("phone")}: </span>
                    <PhoneLink ctx={ctx} className="site-footer__link" />
                  </li>
                )}
                {!reach.email && (
                  <li>
                    <span className="visually-hidden">{ctx.t("emailLabel")}: </span>
                    <EmailLink ctx={ctx} className="site-footer__link" />
                  </li>
                )}
              </ul>
            )}
          </div>

          <div className="site-footer__block site-footer__provider">
            <h2 className={headingClass}>{ctx.t("providerInfo")}</h2>
            <dl className="site-footer__dl">
              <div>
                <dt>{ctx.t("legalName")}</dt>
                <dd>
                  <MaybeText value={p.legalName} ctx={ctx} />
                </dd>
              </div>
              <div>
                <dt>{ctx.t("registrationNumber")}</dt>
                <dd>
                  <MaybeText value={p.registrationNumber} ctx={ctx} />
                </dd>
              </div>
              <div>
                <dt>{taxLabel}</dt>
                <dd>
                  <MaybeText value={p.taxNumber} ctx={ctx} />
                </dd>
              </div>
              {p.registry && (
                <div>
                  <dt>{ctx.t("registry")}</dt>
                  <dd>{p.registry}</dd>
                </div>
              )}
            </dl>
          </div>

          {links.length > 0 && (
            <nav className="site-footer__block site-footer__nav" aria-label={ctx.t("footerNav")}>
              <h2 className={headingClass}>{ctx.t("links")}</h2>
              <ul className="site-footer__links" role="list">
                {links.map((x) => (
                  <li key={x.id}>
                    <a className="site-footer__link" href={ctx.pageHref(x.id)} aria-current={x.id === ctx.page.id ? (ctx.entry ? "true" : "page") : undefined}>
                      {x.nav.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          {social.length > 0 && (
            <div className="site-footer__block site-footer__social">
              <h2 className={headingClass}>{ctx.t("social")}</h2>
              <ul className="site-footer__links" role="list">
                {social.map((s) => (
                  <li key={s.url}>
                    <a className="site-footer__link" href={s.url} rel="noopener">
                      {NETWORK_LABEL[s.network]}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="site-footer__bottom">
          <p>
            © {ctx.site.chrome.footer.year ?? ctx.today.getFullYear()} {isPlaceholder(p.legalName) ? b.name : p.legalName}
          </p>
          {/* Shown by consent.js: on pages with consent-gated embeds, and on the privacy page of a site that has them. */}
          <button type="button" className="site-footer__consent" data-consent-open="" hidden>
            {ctx.t("cookieSettings")}
          </button>
        </div>
      </div>
    </footer>
  );
}
