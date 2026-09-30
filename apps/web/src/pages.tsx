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

export const Brand = () => (
  <a className="brand" href="/">
    <i aria-hidden="true" />
    {PRODUCT_NAME}
  </a>
);

/** App bar: wordmark, then page-specific items; the spend counter and sign-out on every dashboard page. */
export function TopBar({ children, spend }: { children?: ReactNode; spend?: { today: number; cap: number } }) {
  return (
    <header className="top">
      <Brand />
      {children}
      <span className="sp" />
      {spend && (
        <span className="pill plain spend num" title="Poraba modela danes in dnevna omejitev">
          {`${formatEur(spend.today)} / ${formatEur(spend.cap)} danes`}
        </span>
      )}
      <form method="post" action="/logout">
        <button className="btn quiet sm" type="submit">
          Odjava
        </button>
      </form>
    </header>
  );
}

export function loginPage({ next, error }: { next: string; error?: string }): string {
  return html(
    <Doc title="Prijava">
      <main className="login">
        <Brand />
        <h1>Prijava</h1>
        <form method="post" action="/login">
          <input type="hidden" name="next" value={next} />
          <label htmlFor="pw">Geslo za dostop</label>
          <input id="pw" type="password" name="password" autoComplete="current-password" required autoFocus aria-describedby={error ? "pw-err" : undefined} aria-invalid={error ? true : undefined} />
          {error && (
            <p id="pw-err" className="help err" role="alert">
              {error}
            </p>
          )}
          <button className="btn primary block" type="submit">
            Prijava
          </button>
        </form>
      </main>
    </Doc>,
  );
}

interface IntakeProps {
  spendToday: number;
  cap: number;
  maxPhotos: number;
  hasSites: boolean;
  error?: string;
  description?: string;
}

function Intake({ maxPhotos, hasSites, error, description }: IntakeProps) {
  return (
    <main className="intake">
      <form method="post" action="/api/sites" encType="multipart/form-data" data-intake="">
        <h1>
          Opišite svoje podjetje.
          <br />
          Stran naredimo mi.
        </h1>
        {error && (
          <p className="note bad" role="alert">
            {error}
          </p>
        )}
        <div className="prompt">
          <label htmlFor="d" className="sr-only">
            Opis podjetja
          </label>
          <textarea
            id="d"
            name="description"
            required
            minLength={30}
            aria-describedby="d-help"
            defaultValue={description}
            placeholder="Pekarna v Kamniku, odprta od leta 1996. Kruh z lastnimi drožmi, rogljički, torte po naročilu. Šutna 12, odprto pon–sob 6.00–13.00 …"
          />
          <div className="bar">
            <label className="btn sm attach">
              <input className="sr-only" type="file" name="photos" accept="image/jpeg,image/png,image/webp,image/avif" multiple />+ Fotografije
            </label>
            <label className="btn sm attach">
              <input className="sr-only" type="file" name="logo" accept="image/svg+xml,image/png,image/jpeg,image/webp" />+ Logotip
            </label>
            <span className="sp" />
            <fieldset className="seg">
              <legend className="sr-only">Obseg</legend>
              <input type="radio" id="scope-home" name="scope" value="home" defaultChecked />
              <label htmlFor="scope-home">Domača stran</label>
              <input type="radio" id="scope-full" name="scope" value="full" />
              <label htmlFor="scope-full">Celotna stran</label>
            </fieldset>
            <button className="btn primary" type="submit">
              Ustvari
            </button>
          </div>
        </div>
        <p id="d-help" className="help">
          {`Napišite, kdo ste, kaj ponujate, kje ste in kako vas dosežejo. Česar ne napišete, si ne izmislimo: manjkajoči podatki ostanejo označeni, dokler jih ne vpišete. Do ${maxPhotos} fotografij (JPG, PNG, WebP, AVIF) in logotip. Domača stran je navadno gotova v približno dveh minutah, celotna v približno treh.`}
        </p>
      </form>
      {hasSites && (
        <a className="back" href="/">
          ← Vse strani
        </a>
      )}
    </main>
  );
}

export function intakePage(props: IntakeProps): string {
  return html(
    <Doc title="Nova stran" script="/assets/dashboard.js">
      <TopBar spend={{ today: props.spendToday, cap: props.cap }} />
      <Intake {...props} />
    </Doc>,
  );
}

function SiteCard({ site }: { site: SiteRow }) {
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

export function sitesPage({ sites, spendToday, cap, maxPhotos }: { sites: SiteRow[]; spendToday: number; cap: number; maxPhotos: number }): string {
  // No sites yet: the intake is the whole page.
  if (sites.length === 0) return intakePage({ spendToday, cap, maxPhotos, hasSites: false });
  return html(
    <Doc title="Strani">
      <TopBar spend={{ today: spendToday, cap }} />
      <main className="wrap sites">
        <div className="head">
          <h1>Strani</h1>
          <span className="muted num">{sites.length}</span>
          <a className="btn primary" href="/new">
            Nova stran
          </a>
        </div>
        <ul className="cards">
          {sites.map((s) => (
            <SiteCard key={s.id} site={s} />
          ))}
        </ul>
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
