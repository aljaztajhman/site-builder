import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import type { SiteRow } from "@sb/platform";
import { uiUrl } from "./ui/assets.ts";
import { PRODUCT_NAME, formatDate, formatEur, siteStatus } from "./ui/labels.ts";

/** Page shell for every dashboard page: the shared stylesheet (apps/web/src/ui/app.css), no inline CSS. */
export function Doc({ title, children, script }: { title: string; children: ReactNode; script?: string }) {
  return (
    <html lang="sl">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <title>{`${title} · ${PRODUCT_NAME}`}</title>
        <link rel="preload" href={uiUrl("fonts/figtree.woff2")} as="font" type="font/woff2" crossOrigin="" />
        <link rel="preload" href={uiUrl("fonts/bricolage-grotesque.woff2")} as="font" type="font/woff2" crossOrigin="" />
        <link rel="stylesheet" href={uiUrl("app.css")} />
        <link rel="icon" href={uiUrl("icon.svg")} type="image/svg+xml" />
      </head>
      <body>
        {children}
        {script && <script type="module" src={script} />}
      </body>
    </html>
  );
}

export const html = (el: ReactNode): string => `<!doctype html>${renderToStaticMarkup(el as never)}`;

/** The sites list; "/" is the public landing page. */
export const DASHBOARD = "/sites";

/** Wordmark: in the app bar it goes to the sites list, on the login page to the landing page. */
export const Brand = ({ href = DASHBOARD }: { href?: string }) => (
  <a className="brand" href={href}>
    <i aria-hidden="true" />
    {PRODUCT_NAME}
  </a>
);

/**
 * App bar: wordmark, then page-specific items; sign-out on every dashboard page. The admin also sees
 * today's model spend against the cap and a link to the admin page; owners never see internal numbers.
 */
export function TopBar({ children, spend, csrf, admin }: { children?: ReactNode; spend?: { today: number; cap: number }; csrf: string; admin?: boolean }) {
  return (
    <header className="top">
      <Brand />
      {children}
      <span className="sp" />
      {admin && spend && (
        <span className="pill plain spend num" title="Poraba modela danes in dnevna omejitev">
          {`${formatEur(spend.today)} / ${formatEur(spend.cap)} danes`}
        </span>
      )}
      {admin && (
        <a className="btn quiet sm" href="/admin">
          Skrbnik
        </a>
      )}
      <form method="post" action="/logout">
        <input type="hidden" name="_csrf" value={csrf} />
        <button className="btn quiet sm" type="submit">
          Odjava
        </button>
      </form>
    </header>
  );
}

function SiteCard({ site, badge }: { site: SiteRow; badge: string | null }) {
  const status = siteStatus(site);
  const scope = site.intake?.scope === "full" ? "celotna stran" : "domača stran";
  const meta = site.current_version
    ? [`v${site.current_version}`, site.published_version && site.published_version !== site.current_version ? `objavljena v${site.published_version}` : null, formatDate(site.updated_at)]
    : [scope, formatDate(site.created_at)];
  return (
    <li className="site-card">
      <div className="shot" inert>
        {site.current_version ? (
          <iframe src={`/preview/${site.id}/index.html?v=${site.current_version}`} title={`Predogled: ${site.name}`} loading="lazy" />
        ) : (
          <p className="empty">{site.status === "failed" ? "Ustvarjanje ni uspelo." : site.status === "generating" ? "Stran se ustvarja …" : "Še brez vsebine."}</p>
        )}
      </div>
      <div className="body">
        <h2>
          <a href={`/sites/${site.id}`}>{site.name}</a>
        </h2>
        <span className={`pill ${status.tone}`}>{status.label}</span>
        {/* Beside the status, not on the thumbnail (it covered the site); never in the site's own HTML. */}
        {site.current_version && badge ? <span className="preview-badge">{badge}</span> : null}
        <span className="meta num">{meta.filter(Boolean).join(" · ")}</span>
        {site.published_version ? (
          <a className="pub" href={`/s/${site.slug}/`}>
            {`/s/${site.slug}/`}
          </a>
        ) : null}
      </div>
    </li>
  );
}

export interface SitesPageProps {
  sites: SiteRow[];
  spendToday: number;
  cap: number;
  csrf: string;
  /** The admin sees every site; an owner only theirs. */
  admin: boolean;
  /** For an owner: the signed-in address and what their plan allows, in Slovene. */
  account?: { email: string; note: string | null };
  /** The free-preview badge for a site's thumbnail (limits.ts previewBadge); none when absent. */
  badgeFor?: (site: SiteRow) => string | null;
}

export function sitesPage({ sites, spendToday, cap, csrf, admin, account, badgeFor }: SitesPageProps): string {
  return html(
    <Doc title={admin ? "Strani" : "Moje strani"}>
      <TopBar spend={{ today: spendToday, cap }} csrf={csrf} admin={admin} />
      <main className="wrap sites">
        {account && (
          <p className="muted">
            {`Prijavljeni ste kot ${account.email}.`}
            {account.note ? ` ${account.note}` : ""}
          </p>
        )}
        <div className="head">
          <h1>{admin ? "Strani" : "Moje strani"}</h1>
          <span className="muted num">{sites.length}</span>
          <a className="btn primary" href="/#zacni">
            Nova stran
          </a>
        </div>
        {sites.length ? (
          <ul className="cards">
            {sites.map((s) => (
              <SiteCard key={s.id} site={s} badge={badgeFor?.(s) ?? null} />
            ))}
          </ul>
        ) : (
          <p className="empty-list">
            Še nimate nobene strani. <a href="/#zacni">Opišite svoje podjetje</a> na domači strani in predogled je narejen v približno dveh minutah.
          </p>
        )}
      </main>
    </Doc>,
  );
}

export function sitePage({ site }: { site: SiteRow }): string {
  return html(
    <Doc title={site.name} script="/assets/editor.js">
      <div id="app" data-site-id={site.id}>
        <p className="loading">Nalagam urejevalnik …</p>
      </div>
    </Doc>,
  );
}
