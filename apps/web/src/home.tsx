import type { AppConfig } from "@sb/config";
import { html } from "./pages.tsx";
import { uiUrl } from "./ui/assets.ts";
import { PRODUCT_NAME } from "./ui/labels.ts";
import { Provider } from "./legal.tsx";
import { TURNSTILE_SCRIPT } from "./turnstile.ts";
import { chatEdits, daysAfterOd, moreHomepages } from "./limits.ts";
import { tradeCaption, tradeClientData, tradeShowcases, tradeTitle } from "./showcase.ts";
import { clientScriptUrl } from "./client-bundle.ts";
import { Beacon } from "./beacon.tsx";

/**
 * The start page at /nova: the description form (the intake) and the demo beside it. The story, the plans and the
 * questions are on the homepage, postavi.si (infra/coming-soon), which reads the plans from /api/cenik. Signed in, the header
 * links to the sites list instead of the login.
 * Stylesheet ui/home.css, script client/home.ts; the example sites are rendered by our engine into ui/examples/ (pnpm examples:build).
 * The prompt box is the intake, the only way to start a site, signed in or not: it posts the
 * description, photos, logo (and, for those who may, the scope) to /api/sites, where the limits decide.
 * Without an account the form carries the Turnstile widget. Going to the login from here, home.ts
 * carries the typed text across it (sessionStorage, never the URL) back to this page.
 */

/** The product's slogan (HQ decision sb-slogan): the hero's h1, the page title and the footer. Kept after the rename to Postavi (2026-10-17): stran, stranke. */
export const SLOGAN = "Stran za vaše stranke.";

const Brand = () => (
  <a className="brand" href="/">
    <i aria-hidden="true" />
    {PRODUCT_NAME}
  </a>
);

/** Homepage only or the whole site; shown only to those who may make a whole site. */
const Scope = () => (
  <fieldset className="seg">
    <legend className="sr-only">Obseg</legend>
    <input type="radio" id="scope-home" name="scope" value="home" defaultChecked />
    <label htmlFor="scope-home">Domača stran</label>
    <input type="radio" id="scope-full" name="scope" value="full" />
    <label htmlFor="scope-full">Celotna stran</label>
  </fieldset>
);

const EXAMPLE_TEXT =
  "Frizerski salon Lana v Celju, Prešernova 4. Striženje, barvanje in svečane pričeske. Odprto tor–pet 8.00–18.00, sobota 8.00–13.00. Naročila na 041 555 730 …";

export interface HomeProps {
  config: AppConfig;
  signedIn: boolean;
  /** This browser's CSRF token for the intake form. */
  csrf: string;
  /** The viewer may make a whole site (paid tier, admin); everyone else gets the homepage, so no switch. */
  fullSite: boolean;
  /** What the viewer has left, one Slovene sentence (limits.ts), under the prompt. */
  allowance: string;
  /** Turnstile's site key when the anonymous intake is bot-checked; null otherwise. */
  botSiteKey: string | null;
  /** Deployed without Turnstile keys: previews without an account are refused, so say so up front. */
  anonymousClosed?: boolean;
  /** This device's anonymous preview, when it already made one. */
  previous?: string;
  /** Without an account: where the upload ticket comes from, and the upload's caps (home.ts checks them first). */
  anonymousUpload?: { ticketUrl: string; maxPhotos: number; maxTotalBytes: number };
  /** A refused intake: the reason, shown above the prompt, and the description, kept. */
  error?: string;
  description?: string;
  /** `/nova?primer=<id>`: the demo opens on that trade's site, without the intro. */
  showcase?: string;
  /** The homepage (https://<PLATFORM_DOMAIN>/), where the menu and footer point. */
  homeUrl?: string | null;
  /** Cloudflare Web Analytics token for this response (beacon.tsx), or none. */
  beacon?: string | null;
  /** The visit's campaign (`?utm_source=`, analytics.ts campaignSource), carried by the intake form to intake_submitted. */
  source?: string | null;
}

export function homePage({ config, signedIn, csrf, fullSite, allowance, botSiteKey, anonymousClosed, previous, anonymousUpload, error, description, showcase, homeUrl = null, beacon = null, source = null }: HomeProps): string {
  // The homepage (postavi.si) carries the story, the plans and the questions; this page is only the start.
  const home = homeUrl ?? "/";
  const trades = tradeShowcases();
  // The trade the demo opens on: /nova?primer=<id>, else the first, which the intro types and builds.
  const chosen = trades.find((t) => t.id === showcase);
  const shown = chosen ?? trades[0]!;
  return html(
    <html lang="sl">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <title>{`${PRODUCT_NAME} · ${SLOGAN}`}</title>
        <meta name="description" content="Opišite podjetje v nekaj stavkih in v minuti dobite spletno stran. Brezplačno, brez prijave." />
        <link rel="preload" href={uiUrl("fonts/figtree.woff2")} as="font" type="font/woff2" crossOrigin="" />
        <link rel="preload" href={uiUrl("fonts/bricolage-grotesque.woff2")} as="font" type="font/woff2" crossOrigin="" />
        <link rel="stylesheet" href={uiUrl("home.css")} />
        <link rel="icon" href={uiUrl("icon.svg")} type="image/svg+xml" />
        {/* html.js before the first paint: the demo's intro starts from its first frame, never from the finished site. */}
        <script src={uiUrl("js-flag.js")} />
      </head>
      <body>
        <header className="hd">
          <div className="wrap">
            <Brand />
            <nav aria-label="Glavni meni">
              <a href={`${home}#zakaj`}>Zakaj</a>
              <a href={`${home}#hero`}>Kako začnete</a>
              <a href={`${home}#cenik`}>Cenik</a>
            </nav>
            <span className="sp" />
            <a className="btn quiet sm login" href={signedIn ? "/sites" : "/login?next=/nova"}>
              {signedIn ? "Moje strani" : "Prijava"}
            </a>
            <a className="btn primary sm" href="#zacni">
              Poskusite brezplačno
            </a>
          </div>
        </header>

        <main>
          <section className="hero" id="zacni" aria-labelledby="h1">
            <div className="wrap">
              <div>
                <h1 id="h1">{SLOGAN}</h1>
                <p className="lead">Opišite podjetje v nekaj stavkih. V minuti vidite svojo spletno stran.</p>
                {error && (
                  <p className="note bad" role="alert">
                    {error}
                  </p>
                )}
                {previous && error && (
                  <p className="note">
                    Vaš brezplačni predogled: <a href={previous}>odprite ga</a>.
                  </p>
                )}
                {previous && !error && (
                  <p className="note">
                    Brezplačni predogled ste že naredili: <a href={previous}>odprite ga</a>. <a href="/login?next=/nova">Prijavite se z e-pošto</a>
                    {`: predogled ostane vaš in naredite lahko še ${moreHomepages(config.tiers.free.homepages)}.`}
                  </p>
                )}
                {anonymousClosed && (
                  <p className="note">
                    Predogled brez prijave trenutno ni na voljo. <a href="/login?next=/nova">Prijavite se z e-pošto</a> in ga naredite po prijavi.
                  </p>
                )}
                {/* One intake for everyone: the first homepage needs no account; the server decides what is left. */}
                <form
                  className="prompt"
                  method="post"
                  action="/api/sites"
                  encType="multipart/form-data"
                  data-home-intake=""
                  data-intake=""
                  data-ticket={anonymousUpload?.ticketUrl}
                  data-max-photos={anonymousUpload?.maxPhotos}
                  data-max-bytes={anonymousUpload?.maxTotalBytes}
                >
                  <input type="hidden" name="_csrf" value={csrf} />
                  {source && <input type="hidden" name="source" value={source} />}
                  {!fullSite && <input type="hidden" name="scope" value="home" />}
                  <label htmlFor="opis" className="sr-only">
                    Opis podjetja
                  </label>
                  <textarea
                    id="opis"
                    name="description"
                    required
                    minLength={config.tiers.junk.minDescriptionChars}
                    placeholder={EXAMPLE_TEXT}
                    defaultValue={description}
                    aria-describedby="opis-help"
                  />
                  {botSiteKey && (
                    // Turnstile (bot check for previews without an account). home.ts loads Cloudflare's script only once the visitor starts on the form.
                    <div className="bot" data-turnstile-src={TURNSTILE_SCRIPT}>
                      <div className="cf-turnstile" data-sitekey={botSiteKey} data-size="flexible" data-theme="light" />
                    </div>
                  )}
                  <div className="bar">
                    <label className="btn sm attach">
                      <input className="sr-only" type="file" name="photos" accept="image/jpeg,image/png,image/webp,image/avif" multiple />＋ Fotografije
                    </label>
                    <label className="btn sm attach">
                      <input className="sr-only" type="file" name="logo" accept="image/svg+xml,image/png,image/jpeg,image/webp" />＋ Logotip
                    </label>
                    <span className="sp" />
                    {fullSite && <Scope />}
                    <button className="btn primary" type="submit">
                      Ustvari stran
                    </button>
                  </div>
                </form>
                {/* One short line: the promise and what is left (limits.ts). The details are in the prices and the questions. */}
                <p className="under">
                  <span id="opis-help">Česar ne napišete, si ne izmislimo.</span> <span data-allowance="">{allowance}</span>
                </p>
              </div>
              {/* The demo: the first trade's description is typed and its site builds itself, then the site transforms
                    into the next trade's every few seconds (client/demo.ts). Without JavaScript the tabs are links. */}
              <div className="devwrap">
                <div className="demo-top">
                  <p className="trades-q" id="trades-q">
                    Poglejte primer za svojo dejavnost:
                  </p>
                  <div className="demo-tools" hidden>
                    <div className="views" role="radiogroup" aria-label="Pogled">
                      <button type="button" role="radio" aria-checked="false" data-mode="phone" aria-label="Telefon" title="Telefon">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <rect x="7" y="2.5" width="10" height="19" rx="2.2" />
                          <path d="M11 18.5h2" />
                        </svg>
                      </button>
                      <button type="button" role="radio" aria-checked="true" data-mode="desk" aria-label="Računalnik" title="Računalnik">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <rect x="2.5" y="4" width="19" height="12.5" rx="1.8" />
                          <path d="M8.5 20.5h7M12 16.5v4" />
                        </svg>
                      </button>
                    </div>
                    <button className="pause" type="button" aria-pressed="false" aria-label="Ustavi" title="Ustavi">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M9 6v12M15 6v12" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="tabbar">
                  <div className="tabs" role="tablist" aria-labelledby="trades-q">
                    {trades.map((t) => (
                      <a
                        key={t.id}
                        className="tab"
                        role="tab"
                        href={`/nova?primer=${t.id}#zacni`}
                        aria-selected={t === shown ? "true" : "false"}
                        aria-controls="demo"
                        tabIndex={t === shown ? 0 : -1}
                        data-id={t.id}
                      >
                        {t.label}
                      </a>
                    ))}
                  </div>
                </div>
                <div className="devbox" data-intro={chosen ? undefined : ""}>
                  {!chosen && (
                    <div className="intro" aria-hidden="true">
                      <div className="ask">
                        <div className="ask-type">
                          <p className="ask-text">
                            <span className="typed" />
                            <span className="caret" />
                            <span className="rest">{shown.intro}</span>
                          </p>
                          <div className="ask-bar">
                            <span className="ask-chip">＋ 5 fotografij</span>
                            <span className="ask-go">Ustvari</span>
                          </div>
                        </div>
                        <ol className="ask-steps">
                          <li>Razumevanje opisa</li>
                          <li>Oblikovna smer in barve</li>
                          <li>Fotografije</li>
                          <li>Besedila in postavitev</li>
                        </ol>
                      </div>
                    </div>
                  )}
                  <div className="dev" data-mode="desk" id="demo" role="tabpanel">
                    <span className="chrome" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                    <div className="screen">
                      <iframe className="stage" title="" tabIndex={-1} aria-hidden="true" />
                      <iframe className="main" src={uiUrl(`examples/${shown.page}`)} title={tradeTitle(shown)} inert />
                    </div>
                  </div>
                </div>
                <p className="cap">{tradeCaption(shown)}</p>
                <p className="sr-only" aria-live="polite" data-demo-status="" />
                <script type="application/json" id="trades-data" dangerouslySetInnerHTML={{ __html: JSON.stringify(tradeClientData(trades)).replace(/</g, "\\u003c") }} />
              </div>
            </div>
          </section>

        </main>

        <footer>
          <div className="wrap">
            <div className="cols">
              <div>
                <Brand />
                <p className="about">{`${SLOGAN} Spletne strani za mala podjetja in s.p., narejene iz vašega opisa.`}</p>
              </div>
              <div>
                <h2>Izdelek</h2>
                <ul>
                  <li>
                    <a href={`${home}#zakaj`}>Zakaj spletna stran</a>
                  </li>
                  <li>
                    <a href={`${home}#hero`}>Kako začnete</a>
                  </li>
                  <li>
                    <a href={`${home}#cenik`}>Cenik</a>
                  </li>
                  <li>
                    <a href="/pregled">Brezplačen pregled strani</a>
                  </li>
                </ul>
              </div>
              <div>
                <h2>Pomoč</h2>
                <ul>
                  <li>
                    <a href={`${home}#vprasanja`}>Pogosta vprašanja</a>
                  </li>
                  <li>
                    Pišite nam: <Provider config={config} field="email" />
                  </li>
                </ul>
              </div>
              <div>
                <h2>Ponudnik</h2>
                <ul>
                  <li>
                    <Provider config={config} field="companyName" />
                  </li>
                  <li>
                    <Provider config={config} field="address" />
                  </li>
                  <li>
                    Matična št. <Provider config={config} field="registrationNumber" />
                  </li>
                  <li>
                    Davčna št. <Provider config={config} field="taxNumber" />
                  </li>
                </ul>
              </div>
            </div>
            <div className="legal">
              <span>
                {`© ${new Date().getFullYear()} ${PRODUCT_NAME}, `}
                <Provider config={config} field="companyName" />
              </span>
              <a href="/zasebnost">Zasebnost</a>
              <a href="/pogoji">Pogoji uporabe</a>
              <a href="/dostopnost">Izjava o dostopnosti</a>
            </div>
          </div>
        </footer>
        <script type="module" src={clientScriptUrl("home")} />
        <Beacon token={beacon} />
      </body>
    </html>,
  );
}

export const faq = (config: AppConfig): [string, string][] => [
  [
    "Koliko predogledov lahko naredim brezplačno?",
    `Prvo domačo stran naredite brez prijave; hranimo jo ${config.tiers.anonymous.keepDays} dni. Ko se prijavite z e-pošto, ostane vaša, naredite pa lahko še ${moreHomepages(config.tiers.free.homepages)} in ${chatEdits(config.tiers.free.chatEdits)}. Besedila in fotografije urejate sami, brez omejitev. Celotna stran, objava in prenos so del naročnine.`,
  ],
  ["Nimam dobrih fotografij. Je to težava?", "Ne. Če pošljete manj kot dve fotografiji, dodamo največ dve sliki, ustvarjeni z umetno inteligenco, in ju na strani označimo. Prikazujeta orodje, sestavine ali pokrajino vašega kraja, nikoli pa vas, vaših prostorov ali vašega dela. Kupljenih fotografij ne uporabljamo."],
  [
    "Si bo stran izmislila podatke?",
    "Ne. Cene, delovni čas, naslov, imena in telefonske številke so samo iz vašega opisa. Kar manjka, je rumeno označeno. Dokler tega ne vpišete, strani ni mogoče objaviti.",
  ],
  [
    "Lahko stran urejam sam, tudi s telefona?",
    // What retention keeps (config versions.retention): every version of the last keepAllDays days, the last one of
    // each older day, every published one. The old wording ("every change, restorable") read as forever.
    `Da. Besedilo popravite s klikom, večje spremembe opišete pomočniku. Obnovite lahko vsako različico, ki ni starejša od ${daysAfterOd(config.versions.retention.keepAllDays)}, iz starejših dni zadnjo različico dneva, objavljene pa vedno.`,
  ],
  ["Kaj, če želim oditi?", "Stran prenesete kot datoteke, ki delujejo na katerem koli gostovanju. Nič ni zaklenjeno."],
  [
    "Kaj je s piškotki in GDPR?",
    "Stran ne naloži nobenih sledilnih skript, dokler obiskovalec ne privoli. Pisave so na našem strežniku, zemljevidi se naložijo šele po kliku. Politiko zasebnosti in izjavo o dostopnosti pripravimo kot predlogo, ki jo pregledate sami.",
  ],
  [
    "Ali dobim svojo domeno?",
    `Stran dobi svoj naslov takoj. Povezava lastne domene in nakup nove sta v pripravi.${config.plans.standard.yearlyIncludesDomain ? " Pri letnem paketu bo domena vključena v ceno." : ""}`,
  ],
];
