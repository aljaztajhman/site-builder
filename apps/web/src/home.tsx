import type { AppConfig } from "@sb/config";
import { html } from "./pages.tsx";
import { uiUrl } from "./ui/assets.ts";
import { PRODUCT_NAME } from "./ui/labels.ts";
import { TURNSTILE_SCRIPT } from "./turnstile.ts";
import { chatEdits, count, daysAfterOd, moreHomepages } from "./limits.ts";
import { tradeCaption, tradeClientData, tradeShowcases, tradeTitle } from "./showcase.ts";
import { clientScriptUrl } from "./client-bundle.ts";

/**
 * The product's landing page at / (docs/design/homepage.html), for everyone; signed in, the header
 * links to the sites list instead of the login.
 * Stylesheet ui/home.css, script client/home.ts; the example sites are rendered by our engine into ui/examples/ (pnpm examples:build).
 * The prompt box is the intake, the only way to start a site, signed in or not: it posts the
 * description, photos, logo (and, for those who may, the scope) to /api/sites, where the limits decide.
 * Without an account the form carries the Turnstile widget. Going to the login from here, home.ts
 * carries the typed text across it (sessionStorage, never the URL) back to this page.
 */

const wholeEur = new Intl.NumberFormat("sl-SI", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
/** "3 ustvarjene slike", "10 ustvarjenih slik". */
const pictures = (n: number) => count(n, { one: "ustvarjena slika", two: "ustvarjeni sliki", few: "ustvarjene slike", other: "ustvarjenih slik" });
/** "še 100 prostih mest", "še 1 prosto mesto". */
const placesLeft = (n: number) => `še ${count(n, { one: "prosto mesto", two: "prosti mesti", few: "prosta mesta", other: "prostih mest" })}`;

/** The product's slogan (HQ decision sb-slogan): the hero's h1, the page title and the footer. Stran, stranke, Stranko. */
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
  /** `/?primer=<id>`: the demo opens on that trade's site, without the intro. */
  showcase?: string;
  /** The founding offer's places left (its size in config minus the places given); null without an offer. */
  foundingLeft?: number | null;
}

export function homePage({ config, signedIn, csrf, fullSite, allowance, botSiteKey, anonymousClosed, previous, anonymousUpload, error, description, showcase, foundingLeft = null }: HomeProps): string {
  const plans = config.plans;
  const std = plans.standard;
  const plus = plans.premium;
  const example = uiUrl("examples/primer/index.html");
  // Example sites rendered by our engine (pnpm examples:build): a different business in each place.
  const dentistExample = uiUrl("examples/zobozdravstvo-lebar/index.html");
  const trades = tradeShowcases();
  // The trade the demo opens on: /?primer=<id>, else the first, which the intro types and builds.
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
              <a href="#kaj">Kaj dobite</a>
              <a href="#kako">Kako deluje</a>
              <a href="#primer">Primer</a>
              <a href="#cena">Cena</a>
              <a href="#vprasanja">Vprašanja</a>
            </nav>
            <span className="sp" />
            <a className="btn quiet sm login" href={signedIn ? "/sites" : "/login"}>
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
                    Brezplačni predogled ste že naredili: <a href={previous}>odprite ga</a>. <a href="/login">Prijavite se z e-pošto</a>
                    {`: predogled ostane vaš in naredite lahko še ${moreHomepages(config.tiers.free.homepages)}.`}
                  </p>
                )}
                {anonymousClosed && (
                  <p className="note">
                    Predogled brez prijave trenutno ni na voljo. <a href="/login">Prijavite se z e-pošto</a> in ga naredite po prijavi.
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
                    into the next trade's every few seconds (client/home.ts). Without JavaScript the tabs are links. */}
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
                          href={`/?primer=${t.id}#zacni`}
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

          <section id="kaj" aria-labelledby="h-kaj">
            <div className="wrap">
              <h2 id="h-kaj">Kaj dobite</h2>

              {/* Three outcomes, each shown with the real example site or the real editor, played once in view. */}
              <div className="win">
                <div className="win-vis call-vis" aria-hidden="true">
                  <div className="phone-wrap">
                    <div className="phone sm" inert>
                      <iframe src={dentistExample} title="" tabIndex={-1} loading="lazy" />
                    </div>
                    <i className="tap" />
                    <div className="calling">
                      <b>Klicanje …</b>
                      <span>Zobozdravstvo Lebar</span>
                    </div>
                  </div>
                </div>
                <div className="win-text">
                  <h3>Stranka vas pokliče z enim dotikom</h3>
                  <p>Gumba za klic in pot sta na telefonu vedno na dnu zaslona. Delovni čas in naslov sta takoj na vrhu.</p>
                  <p className="proof">Vsako stran preverimo na telefonu, preden jo vidite.</p>
                </div>
              </div>

              <div className="win flip">
                <div className="win-vis search-vis" aria-hidden="true">
                  <div className="q">
                    <svg viewBox="0 0 24 24">
                      <circle cx="11" cy="11" r="6" />
                      <path d="M20 20l-4.5-4.5" />
                    </svg>
                    <span className="typed">pekarna kamnik</span>
                  </div>
                  <div className="result">
                    <span className="url">Pekarna Kvas › Kamnik</span>
                    <span className="title">Pekarna Kvas · Kruh z drožmi, Kamnik</span>
                    <span className="desc">Kruh z lastnimi drožmi, pečen vsak dan. Mala družinska pekarna na začetku stare ulice Šutna.</span>
                    <span className="facts">
                      <b>Odprto</b> · zapre ob 18.00 · Šutna 30, Kamnik
                    </span>
                  </div>
                </div>
                <div className="win-text">
                  <h3>Pripravljena za Google</h3>
                  <p>Ime, naslov, telefon, delovni čas in ponudba so zapisani tako, da jih Google in pomočniki z umetno inteligenco preberejo. Brez dodatnega dela.</p>
                  <p className="proof">Uvrstitev določi Google. Vse, kar je odvisno od strani, uredimo mi.</p>
                </div>
              </div>

              <div className="win">
                <div className="win-vis edit-vis" aria-hidden="true">
                  <div className="hours">
                    <span className="h">Delovni čas</span>
                    <span className="row">
                      <span>Pon–pet</span>
                      <span>6.30–18.00</span>
                    </span>
                    <span className="row sat">
                      <span>Sobota</span>
                      <span className="val">
                        <s>6.30–12.00</s>
                        <b>7.00–12.00</b>
                      </span>
                    </span>
                    <span className="row">
                      <span>Nedelja</span>
                      <span>7.00–10.00</span>
                    </span>
                  </div>
                  <div className="say">Ob sobotah odpiramo ob sedmih</div>
                  <div className="done">Spremenjeno na strani</div>
                </div>
                <div className="win-text">
                  <h3>Spremembe naredite sami</h3>
                  <p>Tapnite besedilo in ga popravite. Ali napišite, kaj naj spremenimo: nov delovni čas, nova cena, dopust.</p>
                  <p className="proof">Prejšnjo različico obnovite z enim klikom.</p>
                </div>
              </div>

              {/* The assurances, in the owner's words: no jargon, each one checkable on the example. */}
              <ul className="promises">
                <li>
                  <b>Slovenščina, ne prevod.</b> Tudi datumi, cene in telefonske številke.
                </li>
                <li>
                  <b>Nič izmišljenega.</b> Cene, ure in imena so samo vaši. Kar manjka, označimo.
                </li>
                <li>
                  <b>Hitra in dostopna.</b> Naloži se tudi na slabem signalu in je berljiva za vse.
                </li>
                <li>
                  <b>Brez sledenja.</b> Nobenih sledilnih piškotkov brez privolitve obiskovalca.
                </li>
                <li>
                  <b>Vaša tudi, ko odidete.</b> Stran kadarkoli prenesete in jo objavite drugje.
                </li>
              </ul>

              {/* Primerjam.si (2026): business-card site from a freelancer €500–810, average €690; maintenance average €63/month (docs/GO-TO-MARKET.md §15). */}
              <div className="versus">
                <div>
                  <h3>Pri oblikovalcu</h3>
                  <ul>
                    <li>
                      <b>{wholeEur.format(690)}</b> povprečno za izdelavo
                    </li>
                    <li>
                      <b>{wholeEur.format(63)}</b> na mesec za vzdrževanje
                    </li>
                    <li>Popravke naročite in počakate</li>
                  </ul>
                </div>
                <div className="us">
                  <h3>{PRODUCT_NAME}</h3>
                  <ul>
                    <li>
                      <b>Brezplačen</b> predogled v minuti
                    </li>
                    <li>
                      <b>{`od ${wholeEur.format(std.monthlyEur)}`}</b> na mesec{plans.billingEnabled ? "" : " (načrtovana cena)"}
                    </li>
                    <li>Popravke naredite sami, takoj</li>
                  </ul>
                  <a className="btn primary" href="#zacni">
                    Poskusite brezplačno
                  </a>
                </div>
              </div>
              <p className="src">Cene pri oblikovalcu: povprečje za predstavitveno stran, primerjam.si, 2026.</p>
            </div>
          </section>

          <section id="kako" className="how-sec" aria-labelledby="h-kako">
            <div className="wrap">
              <h2 id="h-kako">Kako deluje</h2>
              <div className="how">
                <div>
                  <h3>Opišete</h3>
                  <p>Nekaj stavkov o podjetju, logotip in fotografije. Če fotografij nimate, dodamo največ dve, ustvarjeni z umetno inteligenco, in ju označimo.</p>
                </div>
                <div>
                  <h3>Naredimo stran</h3>
                  <p>Iz opisa vzamemo ponudbo, kontakt in delovni čas, barve pa iz logotipa in fotografij. Česar v opisu ni, označimo.</p>
                </div>
                <div>
                  <h3>Preverimo</h3>
                  <p>Preden jo vidite, stran preverimo na telefonu in računalniku: hitrost, berljivost, gumbi.</p>
                </div>
                <div>
                  <h3>Uredite in objavite</h3>
                  <p>Popravite s klikom ali napišite, kaj naj spremenimo. Objavite, ko ste zadovoljni.</p>
                </div>
                {/* eval/report-home.md, 2026-09-30: 10 fixtures, median time to first preview 23.4 s, whole checked job 73 s. */}
                <p className="note">Preizkus na desetih podjetjih (30. 9. 2026): predogled je bil običajno gotov v 23 sekundah, preverjena stran v 73.</p>
              </div>
            </div>
          </section>

          <section id="primer" aria-labelledby="h-primer">
            <div className="wrap">
              <h2 id="h-primer">Primer</h2>
              <p className="lead">Izmišljena Pekarna Kvas iz Kamnika. Cena cimetovih polžev manjka, zato je označena. Dokler je ne vpišete, strani ni mogoče objaviti.</p>
              <div className="ex">
                <div className="deskwrap" inert>
                  <iframe src={example} title="Primer strani na namizju" loading="lazy" />
                </div>
                <div className="chat" aria-label="Primer urejanja s pogovorom">
                  <h3>Ali pa napišite, kaj spremeniti</h3>
                  <div className="msg user">Spremeni telefonsko na 041 555 731</div>
                  <div className="msg">
                    Urejeno. Nova številka je povsod na strani.<small>različica 13</small>
                  </div>
                  <div className="msg user">Dodaj pogosta vprašanja o naročanju potice</div>
                  <div className="msg">
                    Dodali smo tri vprašanja pod Ponudbo. Preverite odgovore, preden objavite.<small>različica 14</small>
                  </div>
                  <p className="muted">Prejšnjo različico obnovite z enim klikom.</p>
                </div>
              </div>
            </div>
          </section>

          <section id="cena" aria-labelledby="h-cena">
            <div className="wrap">
              <h2 id="h-cena">Cene z DDV</h2>
              <div className="price">
                <div className="plan">
                  <h3>Predogled</h3>
                  <div className="amt">{wholeEur.format(0)}</div>
                  <p className="muted">Da vidite, kaj dobite. Za objavo izberite paket.</p>
                  <ul>
                    <li>Prva domača stran brez prijave</li>
                    <li>{`Z e-pošto še ${moreHomepages(config.tiers.free.homepages)} in ${chatEdits(config.tiers.free.chatEdits)}`}</li>
                    <li>Ogled na telefonu in računalniku</li>
                    <li>Kartice ne potrebujete</li>
                  </ul>
                  <a className="btn" href="#zacni">
                    Poskusite brezplačno
                  </a>
                </div>
                <div className="plan">
                  <h3>{std.name}</h3>
                  <div className="amt">
                    {`${wholeEur.format(std.monthlyEur)} `}
                    <small>na mesec</small>
                  </div>
                  <p className="yearly">{`ali ${wholeEur.format(std.yearlyEur)} na leto${std.yearlyIncludesDomain ? ", domena vključena" : ""}`}</p>
                  <p className="muted">Celotna stran, ki jo vodite sami.</p>
                  <ul>
                    <li>{`Do ${std.site.maxPages} strani: ponudba, cenik, o nas, kontakt`}</li>
                    <li>Neomejeno urejanje, pomočnik vsak mesec</li>
                    <li>Objava in gostovanje</li>
                    <li>Stran lahko kadarkoli prenesete</li>
                    <li>{`${pictures(std.site.generatedPicturesPerMonth)} na mesec, kjer fotografij manjka`}</li>
                  </ul>
                  {std.foundingOffer && (
                    <dl className="extra">
                      {foundingLeft !== 0 && (
                        <div id="founding">
                          <dt>
                            {`Prvo leto za prvih ${std.foundingOffer.customers} strank`}
                            {foundingLeft !== null && <span className="left">{` · ${placesLeft(foundingLeft)}`}</span>}
                          </dt>
                          <dd>{wholeEur.format(std.foundingOffer.firstYearEur)}</dd>
                        </div>
                      )}
                      <div>
                        <dt>Postavitev skupaj z vami, po želji</dt>
                        <dd>{`${wholeEur.format(std.setupService.eur)} enkratno`}</dd>
                      </div>
                    </dl>
                  )}
                  <a className="btn primary" href="#zacni">
                    Začnite s predogledom
                  </a>
                </div>
                <div className="plan">
                  <h3>{plus.name}</h3>
                  <div className="amt">
                    {`${wholeEur.format(plus.monthlyEur)} `}
                    <small>na mesec</small>
                  </div>
                  <p className="yearly">{`ali ${wholeEur.format(plus.yearlyEur)} na leto${plus.yearlyIncludesDomain ? ", domena vključena" : ""}`}</p>
                  <p className="muted">{`Vse iz paketa ${std.name} in še:`}</p>
                  <ul>
                    <li>{`Do ${plus.site.maxPages} strani`}</li>
                    <li>{`${pictures(plus.site.generatedPicturesPerMonth)} na mesec`}</li>
                    <li>Več sprememb s pomočnikom vsak mesec</li>
                    {plus.setupService.includedYearly && <li>Letni paket: postavitev skupaj z vami vključena</li>}
                    <li>Odgovor na vprašanja isti dan</li>
                    <li>{`Stran v ${plus.site.locales} jezikih`}</li>
                    <li>Novice, dogodki, storitve in ekipa</li>
                  </ul>
                  <a className="btn" href="#zacni">
                    Začnite s predogledom
                  </a>
                </div>
              </div>
              {/* No billing until the legal entity exists (config plans.billingEnabled, TASKS: billing phase). */}
              <p className="muted fine">
                {plans.billingEnabled
                  ? "Cene so z DDV. Letni paket plačate po računu z bančnim nakazilom."
                  : "Načrtovane cene z DDV. Zaenkrat ničesar ne zaračunamo. Letni paket bo plačljiv po računu z bančnim nakazilom."}
              </p>
            </div>
          </section>

          <section id="vprasanja" aria-labelledby="h-faq">
            <div className="wrap">
              <h2 id="h-faq">Pogosta vprašanja</h2>
              <div className="faq">
                {faq(config).map(([q, a]) => (
                  <details key={q}>
                    <summary>{q}</summary>
                    <p>{a}</p>
                  </details>
                ))}
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
                    <a href="#kaj">Kaj dobite</a>
                  </li>
                  <li>
                    <a href="#kako">Kako deluje</a>
                  </li>
                  <li>
                    <a href="#cena">Cena</a>
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
                    <a href="#vprasanja">Pogosta vprašanja</a>
                  </li>
                  <li>
                    Pišite nam: <mark className="ph">[e-pošta]</mark>
                  </li>
                </ul>
              </div>
              <div>
                <h2>Ponudnik</h2>
                <ul>
                  <li>
                    <mark className="ph">[polno ime podjetja]</mark>
                  </li>
                  <li>
                    <mark className="ph">[naslov]</mark>
                  </li>
                  <li>
                    Matična št. <mark className="ph">[matična številka]</mark>
                  </li>
                  <li>
                    Davčna št. <mark className="ph">[davčna številka]</mark>
                  </li>
                </ul>
              </div>
            </div>
            <div className="legal">
              <span>
                {`© ${new Date().getFullYear()} `}
                <mark className="ph">[ime izdelka]</mark>
              </span>
              <a href="/zasebnost">Zasebnost</a>
              {/* Written once the legal entity exists (TASKS: billing phase). */}
              <span>Pogoji uporabe</span>
              <span>Izjava o dostopnosti</span>
            </div>
          </div>
        </footer>
        <script type="module" src={clientScriptUrl("home")} />
      </body>
    </html>,
  );
}

const faq = (config: AppConfig): [string, string][] => [
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
