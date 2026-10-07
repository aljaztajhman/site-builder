import type { Hono } from "hono";
import type { ReactNode } from "react";
import type { AppConfig } from "@sb/config";
import type { AppEnv } from "./access.ts";
import { Brand, Doc, html } from "./pages.tsx";
import { PRODUCT_NAME, formatEur } from "./ui/labels.ts";
import { chatEdits, moreHomepages } from "./limits.ts";

/**
 * The provider's facts (config `legal.provider`, it-landing-claims) and the legal pages that show them: the terms
 * (/pogoji) and the accessibility statement (/dostopnost) here, the privacy policy in privacy.tsx, the landing
 * footer in home.tsx. A fact that isn't in config yet is a marked placeholder on every page, never invented, and
 * the launch check lists it.
 */
export type ProviderField = keyof AppConfig["legal"]["provider"];

export const PROVIDER_LABEL: Record<ProviderField, string> = {
  companyName: "polno ime podjetja",
  address: "naslov",
  registrationNumber: "matična številka",
  taxNumber: "davčna številka",
  email: "e-pošta",
};

export type TermsPoint = keyof AppConfig["legal"]["terms"];

/** The terms' points decided with the lawyer (config legal.terms), as their placeholders read. */
export const TERMS_LABEL: Record<TermsPoint, string> = {
  cancellation: "odpoved, vračilo plačila in odstop od pogodbe",
  liability: "odgovornost ponudnika",
  changes: "kako obveščamo o spremembah pogojev",
  law: "pravo in pristojno sodišče",
};

/** One provider fact as it shows on a page: its value, or the marked placeholder. */
export function Provider({ config, field }: { config: AppConfig; field: ProviderField }): ReactNode {
  const v = config.legal.provider[field];
  if (v === null) return <mark className="ph">{`[${PROVIDER_LABEL[field]}]`}</mark>;
  return field === "email" ? <a href={`mailto:${v}`}>{v}</a> : v;
}

/**
 * What still stands between the product and a public launch, as config paths with what they are: every unfilled
 * provider fact, every point of the terms not written yet, and every legal page no lawyer has read. Logged at startup; `apps/web/test/legal.test.ts` keeps it
 * honest. Empty means the legal side is ready.
 */
export function launchProblems(config: AppConfig): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(config.legal.provider) as [ProviderField, string | null][]) {
    if (v === null) out.push(`legal.provider.${k} (${PROVIDER_LABEL[k]}) is not filled in`);
  }
  for (const [k, v] of Object.entries(config.legal.terms) as [TermsPoint, string | null][]) {
    if (v === null) out.push(`legal.terms.${k} (${TERMS_LABEL[k]}) is not written yet`);
  }
  if (!config.legal.lawyerReviewed.privacy) out.push("legal.lawyerReviewed.privacy: /zasebnost is a draft no lawyer has read");
  if (!config.legal.lawyerReviewed.terms) out.push("legal.lawyerReviewed.terms: /pogoji is a draft no lawyer has read");
  return out;
}

/** The startup line, or null when nothing is missing. */
export function launchLine(problems: string[]): string | null {
  return problems.length ? `[web] not ready for a public launch: ${problems.join("; ")}` : null;
}

export function registerLegalRoutes(app: Hono<AppEnv>, config: AppConfig): void {
  app.get("/pogoji", (c) => c.html(termsPage(config)));
  app.get("/dostopnost", (c) => c.html(accessibilityPage(config)));
}

const euros = (n: number): string => (Number.isInteger(n) ? `${n} €` : formatEur(n));

function Page({ title, draft, children }: { title: string; draft: string | null; children: ReactNode }) {
  return (
    <Doc title={title}>
      <header className="top">
        <Brand href="/" />
      </header>
      <main className="messages legal-page">
        <h1>{title}</h1>
        {draft && <p className="note">{draft}</p>}
        {children}
        <p className="legal-links">
          <a href="/">Naslovna stran</a> · <a href="/zasebnost">Zasebnost</a> · <a href="/pogoji">Pogoji uporabe</a> · <a href="/dostopnost">Izjava o dostopnosti</a>
        </p>
      </main>
    </Doc>
  );
}

/** A point decided with the lawyer (config legal.terms), or its marked placeholder, so the draft can't be mistaken for finished terms. */
function Point({ config, point }: { config: AppConfig; point: TermsPoint }): ReactNode {
  const v = config.legal.terms[point];
  return v === null ? <mark className="ph">{`[${TERMS_LABEL[point]}: določi ponudnik s pravnikom]`}</mark> : v;
}

/**
 * "Pogoji uporabe": written only from what config, docs/PRODUCT.md and docs/GO-TO-MARKET.md already decide (plans,
 * prices, limits, data handling). What nobody has decided yet (cancellation, refunds, liability, changes, governing law)
 * comes from config `legal.terms` once written with the lawyer, a marked placeholder until then, never a guess. A draft
 * until `legal.lawyerReviewed.terms`.
 */
export function termsPage(config: AppConfig): string {
  const { standard, premium } = config.plans;
  const t = config.tiers;
  const billing = config.plans.billingEnabled;
  const plan = (p: typeof standard) => (
    <li>
      <strong>{p.name}</strong>
      {`: ${euros(p.monthlyEur)} na mesec ali ${euros(p.yearlyEur)} na leto${p.yearlyIncludesDomain ? " (letna naročnina vključuje domeno)" : ""}. Do ${p.site.maxPages} strani, ${
        p.site.locales === 1 ? "en jezik" : `${p.site.locales} jezika`
      }, do ${p.site.generatedPicturesPerMonth} ustvarjenih slik na mesec. Za pomočnika z umetno inteligenco ${euros(p.ai.allowanceEurPerMonth)} na mesec, v prvem mesecu še ${euros(p.ai.firstMonthExtraEur)}.`}
    </li>
  );
  return html(
    <Page
      title="Pogoji uporabe"
      draft={config.legal.lawyerReviewed.terms ? null : "Osnutek za pravni pregled. Pogoji še ne veljajo in niso pravni nasvet. Rumeno označene točke določi pravnik ali ponudnik."}
    >
      <section className="message">
        <h2>Kdo smo</h2>
        <p>
          {`${PRODUCT_NAME} je storitev za izdelavo in gostovanje spletnih strani za mala podjetja in samostojne podjetnike. Ponudnik je `}
          <Provider config={config} field="companyName" />, <Provider config={config} field="address" />, matična številka <Provider config={config} field="registrationNumber" />, davčna
          številka <Provider config={config} field="taxNumber" />. Pišete nam lahko na <Provider config={config} field="email" />.
        </p>
      </section>
      <section className="message">
        <h2>Kaj ponujamo</h2>
        <p>
          Iz vašega opisa, fotografij in logotipa z umetno inteligenco naredimo spletno stran. Stran nato urejate sami v urejevalniku ali s pomočnikom, jo objavite in jo gostimo. Kar objavite, se
          prikaže na vaši strani.
        </p>
      </section>
      <section className="message">
        <h2>Podatki na strani so vaši in morajo biti resnični</h2>
        <ul>
          <li>Ničesar si ne izmišljujemo: telefona, naslova, delovnega časa, cen, imen, mnenj strank ali nagrad, ki jih ni v vašem opisu, ne napišemo. Takšno mesto označimo, stran pa ni objavljiva, dokler ga ne izpolnite.</li>
          <li>Za resničnost podatkov, ki jih vpišete, in za pravice do fotografij in logotipa, ki jih naložite, odgovarjate vi.</li>
          <li>Slike, ki jih ustvari umetna inteligenca, so na strani označene z »Ustvarjeno z UI«. Zamenjate jih lahko s svojimi fotografijami.</li>
          <li>Besedila, ki jih napiše umetna inteligenca, pred objavo preberite. Objavite jih vi.</li>
        </ul>
      </section>
      <section className="message">
        <h2>Brezplačni predogled</h2>
        <ul>
          <li>{`Brez prijave lahko na napravo naredite ${moreHomepages(t.anonymous.homepages)}. Če se v ${t.anonymous.keepDays} dneh ne prijavite, jo izbrišemo.`}</li>
          <li>{`Z brezplačnim računom dobite še ${moreHomepages(t.free.homepages)} in ${chatEdits(t.free.chatEdits)}, skupaj in ne na mesec.`}</li>
          <li>Predogleda ni mogoče objaviti. Objava je del naročnine.</li>
        </ul>
      </section>
      <section className="message">
        <h2>Naročnine in cene</h2>
        {!billing && <p>Naročnin še ne zaračunavamo. Spodnje cene so načrtovane in bodo veljale, ko bo plačevanje na voljo.</p>}
        <ul>
          {plan(standard)}
          {plan(premium)}
        </ul>
        <ul>
          <li>Cene vključujejo DDV.</li>
          <li>Letno naročnino plačate po računu z bančnim nakazilom.</li>
          {standard.foundingOffer && <li>{`Prvih ${standard.foundingOffer.customers} strank plača za prvo leto naročnine ${standard.name} ${euros(standard.foundingOffer.firstYearEur)}.`}</li>}
          <li>{`Postavitev skupaj z vami (»Uredimo namesto vas«) stane enkratno ${euros(standard.setupService.eur)}${premium.setupService.includedYearly ? `, pri letni naročnini ${premium.name} je vključena` : ""}.`}</li>
          <li>Ko preidete na dražjo naročnino, vam neporabljene cele mesece dosedanje naročnine odštejemo od cene nove.</li>
          <li>Ko porabite mesečni znesek za pomočnika, pomočnik do naslednjega meseca počiva. Neposredno urejanje v urejevalniku je vedno brezplačno in neomejeno.</li>
          <li>
            <Point config={config} point="cancellation" />
          </li>
        </ul>
      </section>
      <section className="message">
        <h2>Vaša stran in domena</h2>
        <ul>
          <li>Besedila, fotografije in podatki na vaši strani so vaši.</li>
          <li>S plačljivo naročnino lahko celo stran kadarkoli prenesete kot datoteke (.zip), ki delujejo tudi brez nas.</li>
          <li>Domeno, ki jo registriramo za vas, registriramo na vaše ime.</li>
        </ul>
      </section>
      <section className="message">
        <h2>Vaši podatki</h2>
        <p>
          Kako obdelujemo vaše podatke in podatke obiskovalcev vaše strani, piše na strani <a href="/zasebnost">Zasebnost</a>. Aplikacija, podatkovna baza in datoteke so v EU.
        </p>
      </section>
      <section className="message">
        <h2>Razpoložljivost in omejitve</h2>
        <p>
          Ustvarjanje in pomočnik imata dnevno omejitev porabe. Ko je dosežena, počakata do naslednjega dne; objavljene strani in urejanje delujejo naprej.
        </p>
        <p>
          <Point config={config} point="liability" />
        </p>
      </section>
      <section className="message">
        <h2>Spremembe pogojev in spori</h2>
        <p>
          <Point config={config} point="changes" />
        </p>
        <p>
          <Point config={config} point="law" />
        </p>
      </section>
    </Page>,
  );
}

/**
 * "Izjava o dostopnosti" for the product's own pages (the landing page, sign-in, the legal pages and the editor;
 * the sites it makes get their own). It says only what is checked, by what, and what isn't checked yet.
 */
export function accessibilityPage(config: AppConfig): string {
  return html(
    <Page title="Izjava o dostopnosti" draft={null}>
      <section className="message">
        <p>
          {`Želimo, da ${PRODUCT_NAME} lahko uporablja vsak, tudi z bralnikom zaslona, samo s tipkovnico ali na majhnem telefonu. Ciljamo na smernice WCAG 2.2 na ravni AA. Zunanje presoje dostopnosti še ni bilo.`}
        </p>
      </section>
      <section className="message">
        <h2>Kaj preverjamo</h2>
        <p>Ob vsaki spremembi kode samodejno preverimo naslovno stran, prijavo ter strani Zasebnost, Pogoji uporabe in Izjava o dostopnosti, na širini telefona (360 točk) in računalnika (1280 točk):</p>
        <ul>
          <li>z orodjem axe po pravilih WCAG 2.2 A in AA (brez najdenih napak),</li>
          <li>da se stran ne pomika vstran,</li>
          <li>da so povezave v nogi naslovne strani visoke vsaj 24 točk, da jih s prstom zadenete.</li>
        </ul>
        <p>
          Urejevalnik preverimo ob vsaki spremembi kode prav tako na širini telefona (360 točk) in računalnika (1280 točk): ko ni izbrano nič, ko je izbran razdelek, na zaslonu »Še to
          potrebujemo«, na seznamu pred objavo, pri izbiri domene ter na zaslonih Podatki, Fotografije in Oblika:
        </p>
        <ul>
          <li>z orodjem axe po pravilih WCAG 2.2 A in AA (brez najdenih napak),</li>
          <li>
            da šest pogostih opravil opravite samo s tipkovnico: spremembo telefonske številke, sobotni delovni čas, zamenjavo fotografije, dodajanje pogostih vprašanj, novo glavno barvo in
            objavo,
          </li>
          <li>da je pri tem vsak element, na katerem je fokus, vidno označen in ga ne prekriva nič drugega.</li>
        </ul>
        <p>Spletne strani, ki jih naredimo za stranke, preverimo z istim orodjem, na obeh širinah, ob vsakem ustvarjanju.</p>
      </section>
      <section className="message">
        <h2>Česar še ne preverjamo</h2>
        <ul>
          <li>Ostalih zaslonov urejevalnika (na primer Strani, Dodaj razdelek, Zgodovina sprememb in pogovor s pomočnikom) ter seznama vaših strani z axe še ne preverjamo.</li>
          <li>Urejanja besedila neposredno v predogledu in orodne vrstice razdelka v predogledu s tipkovnico še nismo preverili. Besedilo lahko uredite v obrazcu razdelka.</li>
          <li>Izbirnika barv v brskalniku s tipkovnico nismo preverili. Glavno barvo lahko vpišete kot kodo, na primer #c2410c.</li>
          <li>Nekatera opravila s tipkovnico zahtevajo veliko pritiskov tipk, večinoma tipke Tab: dodajanje razdelka približno 40, sobotni delovni čas približno 35.</li>
          <li>Ročnega pregleda z bralnikom zaslona še ni bilo.</li>
        </ul>
      </section>
      <section className="message">
        <h2>Sporočite nam težavo</h2>
        <p>
          Če česa ne morete uporabiti, nam pišite na <Provider config={config} field="email" />. Povejte, na kateri strani in s čim (brskalnik, bralnik zaslona, telefon).
        </p>
      </section>
      <p className="when">Izjava je bila pripravljena 4. 10. 2026 in posodobljena 7. 10. 2026.</p>
    </Page>,
  );
}
