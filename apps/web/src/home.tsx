import type { AppConfig } from "@sb/config";
import { html } from "./pages.tsx";
import { uiUrl } from "./ui/assets.ts";
import { PRODUCT_NAME } from "./ui/labels.ts";

/**
 * The product's landing page at / (docs/design/homepage.html), for everyone; signed in, the header
 * links to the sites list instead of the login.
 * Stylesheet ui/home.css, script client/home.ts; the example site is ui/example-home.html.
 * The prompt box is the intake, the only way to start a site: signed in, it posts the description,
 * photos, logo and scope to /api/sites; signed out, it goes to the login, and home.ts carries the typed
 * text across it (sessionStorage, never the URL) back to this page.
 */

const wholeEur = new Intl.NumberFormat("sl-SI", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

const Brand = () => (
  <a className="brand" href="/">
    <i aria-hidden="true" />
    {PRODUCT_NAME}
  </a>
);

/** Homepage only (the free preview) or the whole site. Signed out, the choice rides along in the draft (home.ts). */
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
  /** A refused intake: the reason, shown above the prompt, and the description, kept. */
  error?: string;
  description?: string;
}

export function homePage({ config, signedIn, error, description }: HomeProps): string {
  const paid = config.plans.paid;
  const example = uiUrl("example-home.html");
  return html(
    <html lang="sl">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <title>Spletna stran za vaše podjetje</title>
        <meta name="description" content="Opišete podjetje, dobite spletno stran v naravni slovenščini, enako dobro na telefonu in računalniku." />
        <link rel="preload" href={uiUrl("fonts/figtree.woff2")} as="font" type="font/woff2" crossOrigin="" />
        <link rel="preload" href={uiUrl("fonts/bricolage-grotesque.woff2")} as="font" type="font/woff2" crossOrigin="" />
        <link rel="stylesheet" href={uiUrl("home.css")} />
        <link rel="icon" href={uiUrl("icon.svg")} type="image/svg+xml" />
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
              Naredite predogled
            </a>
          </div>
        </header>

        <main>
          <section className="hero" id="zacni" aria-labelledby="h1">
            <div className="wrap">
              <div>
                <h1 id="h1">
                  Opišite svoje podjetje.
                  <br />
                  Spletna stran je narejena.
                </h1>
                <p className="lead">
                  Za frizerje, gostilne, servise, ambulante, obrtnike in trgovine. Napišete, kdo ste in kaj ponujate, dodate logotip in svoje fotografije. Predogled domače strani
                  vidite v manj kot minuti, v naravni slovenščini, enako dober na telefonu in računalniku.
                </p>
                {error && (
                  <p className="note bad" role="alert">
                    {error}
                  </p>
                )}
                {signedIn ? (
                  <form className="prompt" method="post" action="/api/sites" encType="multipart/form-data" data-home-intake="" data-intake="">
                    <label htmlFor="opis" className="sr-only">
                      Opis podjetja
                    </label>
                    <textarea id="opis" name="description" required minLength={30} placeholder={EXAMPLE_TEXT} defaultValue={description} aria-describedby="opis-help" />
                    <div className="bar">
                      <label className="btn sm attach">
                        <input className="sr-only" type="file" name="photos" accept="image/jpeg,image/png,image/webp,image/avif" multiple />＋ Fotografije
                      </label>
                      <label className="btn sm attach">
                        <input className="sr-only" type="file" name="logo" accept="image/svg+xml,image/png,image/jpeg,image/webp" />＋ Logotip
                      </label>
                      <span className="sp" />
                      <Scope />
                      <button className="btn primary" type="submit">
                        Ustvari
                      </button>
                    </div>
                  </form>
                ) : (
                  // Signed out: files can't survive a login, so the prompt goes to the login and home.ts keeps the text.
                  <form className="prompt" method="get" action="/login" data-home-intake="">
                    <input type="hidden" name="next" value="/" />
                    <label htmlFor="opis" className="sr-only">
                      Opis podjetja
                    </label>
                    <textarea id="opis" placeholder={EXAMPLE_TEXT} aria-describedby="opis-help" />
                    <div className="bar">
                      <button className="btn sm" type="submit" data-attach="photos">
                        ＋ Fotografije
                      </button>
                      <button className="btn sm" type="submit" data-attach="logo">
                        ＋ Logotip
                      </button>
                      <span className="sp" />
                      <Scope />
                      <button className="btn primary" type="submit">
                        Ustvari
                      </button>
                    </div>
                  </form>
                )}
                <p className="under" id="opis-help">
                  {`Napišite, kdo ste, kaj ponujate, kje ste in kako vas dosežejo. Česar ne napišete, si ne izmislimo. Do ${config.limits.maxPhotos} fotografij in logotip.`}
                </p>
                <p className="under">Brezplačen predogled domače strani. Potrebujete le e-poštni naslov, kartice ne.</p>
              </div>
              <div>
                <div className="phone" inert>
                  <iframe src={example} title="Primer strani: Pekarna Kvas" loading="lazy" />
                </div>
                <p className="phone-cap">Primer: izmišljena Pekarna Kvas iz Kamnika, stran iz enega opisa in treh fotografij. Fotografije v primeru so ustvarjene z UI in tako tudi označene.</p>
              </div>
            </div>
          </section>

          <section id="kaj" aria-labelledby="h-kaj">
            <div className="wrap">
              <h2 id="h-kaj">Kaj dobite</h2>
              <p className="lead">Stran, ki jo danes pokažete strankam. In ki jih pripelje do vas.</p>

              {/* Three outcomes, each shown with the real example site or the real editor, played once in view. */}
              <div className="win">
                <div className="win-vis call-vis" aria-hidden="true">
                  <div className="phone-wrap">
                    <div className="phone sm" inert>
                      <iframe src={example} title="" tabIndex={-1} loading="lazy" />
                    </div>
                    <i className="tap" />
                    <div className="calling">
                      <b>Klicanje …</b>
                      <span>Pekarna Kvas</span>
                    </div>
                  </div>
                </div>
                <div className="win-text">
                  <h3>Stranka vas pokliče z enim dotikom</h3>
                  <p>
                    Klic in navodila za pot sta na dnu zaslona na vsaki strani. Delovni čas in naslov sta takoj na vrhu domače strani. Kdor vas najde na telefonu, vas pokliče,
                    namesto da išče naprej.
                  </p>
                  <p className="proof">Vsako stran preverimo na telefonu: gumbi dovolj veliki za palec, nič ne uhaja čez rob.</p>
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
                  <h3>Na iskalniku ste videti kot pravo podjetje</h3>
                  <p>
                    Za vsako stran pripravimo naslov in opis za iskalnike ter podatke, ki jih iskalniki znajo prebrati: ime, naslov, telefon in delovni čas. Iz vašega opisa, brez
                    dodatnega dela.
                  </p>
                  <p className="proof">Kako visoko se prikažete, odloči iskalnik. Vse, kar je odvisno od strani, je pripravljeno.</p>
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
                  <h3>Spremembe naredite sami, v minuti</h3>
                  <p>
                    Tapnite besedilo na strani in ga popravite. Ali pa napišite, kaj naj spremenimo: nov delovni čas, nova cena, dopust. Brez pisanja agenciji in čakanja na
                    odgovor.
                  </p>
                  <p className="proof">Vsaka sprememba se shrani. Prejšnjo različico obnovite z enim klikom.</p>
                </div>
              </div>

              {/* The assurances, in the owner's words: no jargon, each one checkable on the example. */}
              <ul className="promises">
                <li>
                  <b>Naravna slovenščina.</b> Besedila, datumi, cene in telefonske številke v slovenski obliki, ne prevod.
                </li>
                <li>
                  <b>Nič izmišljenega.</b> Cene, ure, imena in mnenja so samo vaši. Kar manjka, je označeno, dokler ne vpišete.
                </li>
                <li>
                  <b>Hitra in dostopna.</b> Hitro se naloži tudi na slabem signalu in je berljiva za vse, tudi z bralnikom zaslona.
                </li>
                <li>
                  <b>Brez vohunjenja za obiskovalci.</b> Nobenega sledenja, preden obiskovalec privoli.
                </li>
                <li>
                  <b>Vaša, tudi ko odidete.</b> Stran kadarkoli prenesete kot datoteke in jo gostite, kjer želite.
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
                      <b>Brezplačen</b> predogled v manj kot minuti
                    </li>
                    <li>
                      <b>{wholeEur.format(config.plans.paid.monthlyEur)}</b> na mesec{config.plans.paid.billingEnabled ? "" : " (načrtovana cena)"}
                    </li>
                    <li>Popravke naredite sami, takoj</li>
                  </ul>
                  <a className="btn primary" href="#zacni">
                    Preizkusite brezplačno
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
                  <p>Nekaj stavkov o podjetju, logotip in fotografije, ki jih imate. Če jih nimate dovolj, dodamo največ dve splošni sliki, ustvarjeni z umetno inteligenco, in ju na strani označimo.</p>
                </div>
                <div>
                  <h3>Preberemo</h3>
                  <p>Iz opisa izluščimo vrsto dejavnosti, ponudbo, kontakt in delovni čas. Kar ni v opisu, ostane označeno.</p>
                </div>
                <div>
                  <h3>Oblikujemo</h3>
                  <p>Barve iz vašega logotipa in fotografij, ena od desetih oblikovnih smeri, kontrast preverjen v kodi.</p>
                </div>
                <div>
                  <h3>Preverimo</h3>
                  <p>Stran preverimo pri 360 px in na namizju: dostopnost, hitrost, dotik, berljivost. Kar ne prestane, popravimo, preden jo vidite.</p>
                </div>
                <div>
                  <h3>Uredite in objavite</h3>
                  <p>Popravite besedilo s klikom ali s stavkom v pogovoru. Objavite, ko ste zadovoljni.</p>
                </div>
                {/* eval/report-home.md, 2026-09-29: 10 fixtures, median 109.8 s, Lighthouse accessibility 100 on every page. */}
                <p className="note">
                  V zadnjem preizkusu na desetih podjetjih (30. 9. 2026) je bil predogled domače strani viden v srednjem času 23 sekund, preverjena stran pa v 73 sekundah. Vsaka stran je dosegla oceno dostopnosti 100 v Googlovem Lighthouse.
                </p>
              </div>
            </div>
          </section>

          <section id="primer" aria-labelledby="h-primer">
            <div className="wrap">
              <h2 id="h-primer">Primer</h2>
              <p className="lead">
                Pekarna Kvas iz Kamnika (izmišljen primer). Vse na strani je iz opisa pekarne. Cena cimetovega polža manjka, zato je označena in stran brez nje ni objavljiva.
              </p>
              <div className="ex">
                <div className="deskwrap" inert>
                  <iframe src={example} title="Primer strani na namizju" loading="lazy" />
                </div>
                <div className="chat" aria-label="Primer urejanja s pogovorom">
                  <h3>Uredite s stavkom</h3>
                  <div className="msg user">Spremeni telefonsko na 041 555 731</div>
                  <div className="msg">
                    Spremenjeno. Nova številka je v glavi, nogi in klicni vrstici.<small>različica 13</small>
                  </div>
                  <div className="msg user">Dodaj pogosta vprašanja o naročanju potice</div>
                  <div className="msg">
                    Dodali smo tri vprašanja pod Ponudbo. Preverite odgovore, preden objavite.<small>različica 14</small>
                  </div>
                  <p className="muted">Vsaka sprememba je nova različica. Prejšnjo lahko vedno obnovite.</p>
                </div>
              </div>
            </div>
          </section>

          <section id="cena" aria-labelledby="h-cena">
            <div className="wrap">
              <h2 id="h-cena">Ena cena, brez kreditov</h2>
              <div className="price">
                <div className="plan">
                  <h3>Predogled</h3>
                  <div className="amt">{wholeEur.format(0)}</div>
                  <p className="muted">Domača stran z vodnim žigom, da vidite, kaj dobite.</p>
                  <ul>
                    <li>Domača stran iz vašega opisa</li>
                    <li>Pogled na telefonu in namizju</li>
                    <li>Potrebujete le e-poštni naslov</li>
                  </ul>
                  <a className="btn" href="#zacni">
                    Naredite predogled
                  </a>
                </div>
                <div className="plan">
                  <h3>Naročnina</h3>
                  <div className="amt">
                    {`${wholeEur.format(paid.monthlyEur)} `}
                    <small>na mesec</small>
                  </div>
                  <p className="yearly">{`ali ${wholeEur.format(paid.yearlyEur)} na leto${paid.yearlyIncludesDomain ? ", domena vključena" : ""}`}</p>
                  <p className="muted">Celotna stran in vse, kar potrebujete, da jo vodite sami.</p>
                  <ul>
                    <li>Vse strani: ponudba, cenik, o nas, kontakt</li>
                    <li>Urejanje s klikom ali s pogovorom, brez kreditov</li>
                    <li>Objava in gostovanje</li>
                    <li>Prenos strani kot datoteke, kadarkoli</li>
                  </ul>
                  <dl className="extra">
                    <div>
                      <dt>{`Prvo leto za prvih ${paid.foundingOffer.customers} strank`}</dt>
                      <dd>{wholeEur.format(paid.foundingOffer.firstYearEur)}</dd>
                    </div>
                    <div>
                      <dt>Postavitev skupaj z vami, po želji</dt>
                      <dd>{`${wholeEur.format(paid.setupService.eur)} enkratno`}</dd>
                    </div>
                  </dl>
                  <a className="btn primary" href="#zacni">
                    Začnite s predogledom
                  </a>
                  {/* No billing until the legal entity exists (config plans.paid.billingEnabled, TASKS: billing phase). */}
                  <p className="muted fine">
                    {paid.billingEnabled
                      ? "Cene so z DDV. Letno naročnino plačate po računu z bančnim nakazilom."
                      : "Načrtovane cene, z DDV. Plačevanja še ni, zato zaenkrat ničesar ne zaračunamo. Letno naročnino boste plačali po računu z bančnim nakazilom."}
                  </p>
                </div>
              </div>
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
                <p className="about">Spletne strani za slovenska mala podjetja in s.p., narejene iz vašega opisa.</p>
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
              {/* Written once the legal entity exists (TASKS: billing phase). */}
              <span>Zasebnost</span>
              <span>Pogoji uporabe</span>
              <span>Izjava o dostopnosti</span>
            </div>
          </div>
        </footer>
        <script type="module" src="/assets/home.js" />
      </body>
    </html>,
  );
}

const faq = (config: AppConfig): [string, string][] => [
  ["Nimam dobrih fotografij. Ali je to težava?", "Ne. Če nam pošljete manj kot dve fotografiji, stran dopolnimo z največ dvema splošnima slikama, ustvarjenima z umetno inteligenco: material, orodje, sestavine ali pokrajina vašega kraja. Na strani sta označeni in nikoli ne prikazujeta vas, vaših prostorov ali vašega dela. Kupljenih slik ne uporabljamo."],
  [
    "Ali si bo stran izmislila podatke?",
    "Ne. Cene, delovni čas, naslov, imena in telefonske številke pridejo samo iz vašega opisa. Kar manjka, je na strani rumeno označeno in stran z manjkajočimi podatki ni objavljiva.",
  ],
  [
    "Ali lahko stran urejam sam, s telefona?",
    "Da. Urejevalnik deluje na telefonu. Besedilo popravite s klikom, večje spremembe opišete v pogovoru. Vsaka sprememba je shranjena kot različica, ki jo lahko obnovite.",
  ],
  ["Kaj če želim oditi?", "Stran prenesete kot datoteke, ki delujejo na katerem koli gostovanju, tudi brez povezave. Nič ni zaklenjeno."],
  [
    "Kaj je s piškotki in GDPR?",
    "Stran pred vašo privolitvijo ne nalaga nobenih sledilnih skript. Pisave so na našem strežniku, zemljevidi in videi se naložijo šele po kliku. Politika zasebnosti in izjava o dostopnosti sta pripravljeni kot predlogi, ki jih pregledate sami.",
  ],
  [
    "Ali dobim svojo domeno?",
    `Stran dobi svoj naslov takoj. Povezava lastne domene in registracija nove domene sta v pripravi.${config.plans.paid.yearlyIncludesDomain ? " Pri letni naročnini bo domena vključena v ceno." : ""}`,
  ],
];
