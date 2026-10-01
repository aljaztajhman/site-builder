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
  const [low, high] = config.plans.paid.monthlyEurRange;
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
              <p className="lead">Stran, ki jo lahko pokažete strankam, ne osnutka, ki ga je treba še popraviti.</p>
              <div className="get">
                <div>
                  <div className="vig v-sl" aria-hidden="true">
                    <div className="glyphs">
                      <span>č</span>
                      <span>š</span>
                      <span>ž</span>
                      <span>ć</span>
                      <span>đ</span>
                    </div>
                    <div className="fmt">
                      <span>29. 9. 2026</span>
                      <span>12,50 €</span>
                      <span>+386 41 555 906</span>
                    </div>
                  </div>
                  <h3>Naravna slovenščina</h3>
                  <p>Besedila v slovenščini, ne prevodi. Datumi, cene in telefonske številke v slovenski obliki. Pisave, ki pravilno izpišejo č, š, ž, ć in đ.</p>
                </div>
                <div>
                  <div className="vig v-tel" aria-hidden="true">
                    <svg viewBox="0 0 220 150" width="100%" height="100%">
                      <rect className="ph-body" x="66" y="-34" width="88" height="180" rx="12" />
                      <rect className="ln" x="76" y="12" width="52" height="6" rx="2" />
                      <rect className="ln" x="76" y="24" width="66" height="4" rx="2" />
                      <rect className="ln" x="76" y="32" width="58" height="4" rx="2" />
                      <rect className="img" x="76" y="44" width="68" height="46" rx="3" />
                      <rect className="ln" x="76" y="98" width="40" height="4" rx="2" />
                      <line className="sep" x1="66" y1="112" x2="154" y2="112" />
                      <rect className="b1" x="74" y="120" width="34" height="16" rx="3" />
                      <rect className="b2" x="112" y="120" width="34" height="16" rx="3" />
                      <circle className="tap" cx="91" cy="128" r="6" />
                      <circle className="ring" cx="91" cy="128" r="6" />
                    </svg>
                  </div>
                  <h3>Na telefonu in računalniku</h3>
                  <p>Stran je enako dobra na velikem zaslonu in na telefonu. Na telefonu sta klic in navodila za pot na vsaki strani na en dotik, meni deluje z eno roko.</p>
                </div>
                <div>
                  <div className="vig v-fact" aria-hidden="true">
                    <div className="fake">
                      <span className="stars">★★★★★</span>
                      <span className="q">„Najboljša pekarna daleč naokoli“</span>
                      <i className="strike" />
                      <b className="stamp">ni v vašem opisu</b>
                    </div>
                    <div className="real">
                      <span>Cimetov polž</span>
                      <mark className="ph">[cena]</mark>
                    </div>
                  </div>
                  <h3>Vaši podatki, nič izmišljenega</h3>
                  <p>
                    Cene, delovni čas, naslov in imena so samo tisti, ki ste jih napisali. Kar manjka, je označeno, dokler tega ne vpišete. Brez izmišljenih mnenj strank in nagrad.
                  </p>
                </div>
                <div>
                  <div className="vig v-a11y" aria-hidden="true">
                    <ul>
                      {["Kontrast besedila 4,5 : 1", "Brez sledenja pred privolitvijo", "Tipkovnica in bralnik zaslona", "Izjava o dostopnosti"].map((t) => (
                        <li key={t}>
                          <svg viewBox="0 0 16 16">
                            <path d="M3 8.5l3 3 7-7" />
                          </svg>
                          {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <h3>Dostopna in skladna</h3>
                  <p>Dostopnost po WCAG 2.2 AA. Pisave na našem strežniku, zemljevidi se naložijo šele po kliku. Podatki o ponudniku so vgrajeni.</p>
                </div>
                <div>
                  <div className="vig v-fast" aria-hidden="true">
                    <div className="ld">
                      <i />
                    </div>
                    <div className="lh">
                      <span>
                        <b>98–100</b> hitrost
                      </span>
                      <span>
                        <b>100</b> dostopnost
                      </span>
                    </div>
                    <div className="chips">
                      <span>HTML</span>
                      <span>CSS</span>
                      <span>JavaScript samo za meni</span>
                    </div>
                  </div>
                  <h3>Hitra</h3>
                  <p>Statične strani skoraj brez JavaScripta, slike v sodobnih formatih. Ocene so iz Googlovega Lighthouse na telefonu, izmerjene na devetih testnih straneh.</p>
                </div>
                <div>
                  <div className="vig v-zip" aria-hidden="true">
                    <div className="zip">
                      <span className="fn">pekarna-kvas.zip</span>
                      <ul>
                        <li>index.html</li>
                        <li>ponudba/index.html</li>
                        <li>site.css</li>
                        <li>fonts/</li>
                        <li>js/nav.js</li>
                      </ul>
                    </div>
                    <svg className="arrow" viewBox="0 0 24 24">
                      <path d="M12 3v15M5 12l7 7 7-7" />
                    </svg>
                  </div>
                  <h3>Vaša, tudi ko odidete</h3>
                  <p>Stran kadarkoli prenesete kot datoteke in jo gostite drugje, tudi brez povezave. Nobenih kreditov, ena cena na mesec.</p>
                </div>
              </div>
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
                    {`od ${wholeEur.format(low)} `}
                    <small>na mesec</small>
                  </div>
                  <p className="muted">Celotna stran in vse, kar potrebujete, da jo vodite sami.</p>
                  <ul>
                    <li>Vse strani: ponudba, cenik, o nas, kontakt</li>
                    <li>Urejanje s klikom ali s pogovorom, brez kreditov</li>
                    <li>Objava in gostovanje</li>
                    <li>Prenos strani kot datoteke, kadarkoli</li>
                  </ul>
                  <a className="btn primary" href="#zacni">
                    Začnite s predogledom
                  </a>
                  <p className="muted fine">{`Končna cena je še odprta; ${wholeEur.format(low)} je spodnja meja razpona v nastavitvah (${low}–${wholeEur.format(high)}).`}</p>
                </div>
              </div>
            </div>
          </section>

          <section id="vprasanja" aria-labelledby="h-faq">
            <div className="wrap">
              <h2 id="h-faq">Pogosta vprašanja</h2>
              <div className="faq">
                {FAQ.map(([q, a]) => (
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
              {/* Written once the legal entity exists (TASKS: phase 4). */}
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

const FAQ: [string, string][] = [
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
  ["Ali dobim svojo domeno?", "Stran dobi svoj naslov takoj. Povezava lastne domene in registracija nove domene sta v pripravi."],
];
