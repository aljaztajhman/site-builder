import type { Hono } from "hono";
import type { AppConfig } from "@sb/config";
import type { AppEnv } from "./access.ts";
import { Brand, Doc, html } from "./pages.tsx";
import { PRODUCT_NAME } from "./ui/labels.ts";

/**
 * The product's own privacy policy (/zasebnost): what we store about owners and visitors of the product
 * itself (not the privacy policies of the sites it makes). A draft until the legal entity exists and a
 * lawyer has read it; the provider's details are marked placeholders like the landing page's footer.
 */
export function registerPrivacyRoute(app: Hono<AppEnv>, config: AppConfig): void {
  app.get("/zasebnost", (c) => c.html(privacyPage(config)));
}

export function privacyPage(config: AppConfig): string {
  const t = config.tiers;
  const deviceDays = config.accounts.deviceCookieDays;
  return html(
    <Doc title="Zasebnost">
      <header className="top">
        <Brand href="/" />
      </header>
      <main className="messages">
        <h1>Zasebnost</h1>
        <p className="note">Osnutek. Pred javnim zagonom ga pregleda pravnik; podatki o ponudniku bodo dopolnjeni, ko bo podjetje registrirano.</p>
        <section className="message">
          <h2>Kdo obdeluje podatke</h2>
          <p>
            {`${PRODUCT_NAME}, `}
            <mark className="ph">[polno ime podjetja, naslov]</mark>. Za vprašanja in zahteve glede vaših podatkov pišite na <mark className="ph">[e-pošta]</mark>.
          </p>
        </section>
        <section className="message">
          <h2>Kaj hranimo</h2>
          <ul>
            <li>Vaš e-poštni naslov, ko se prijavite, in čas prijave. Prijava poteka s povezavo po e-pošti; gesla ne hranimo.</li>
            <li>Opis podjetja, fotografije, logotip in stran, ki jo naredimo, z vsemi različicami in spremembami, ki jih naredite.</li>
            <li>Sporočila, ki jih obiskovalci vaše objavljene strani pošljejo prek kontaktnega obrazca. Vsako vam pošljemo tudi na e-poštni naslov vašega računa.</li>
            <li>Vaša sporočila pomočniku in njegove odgovore, pri strani, na katero se nanašajo.</li>
            <li>Za vsako ustvarjanje in spremembo s pomočnikom čas in stroške, da lahko omejimo brezplačno uporabo.</li>
            <li>{`Predogled brez prijave in njegove datoteke izbrišemo po ${t.anonymous.keepDays} dneh, razen če se v tem času prijavite; potem je vaš.`}</li>
            <li>{`Če pri predogledu brez prijave pustite e-poštni naslov za opomnik, vam nanj pošljemo eno sporočilo ${t.anonymous.reminder.daysBefore === 1 ? "dan" : `${t.anonymous.reminder.daysBefore} dni`} pred izbrisom. Za nič drugega ga ne uporabimo in ga izbrišemo skupaj s predogledom.`}</li>
            <li>{`Pri brezplačnem pregledu spletne strani naslov strani in rezultat pregleda, ${config.checker.keepDays} dni, da lahko povezavo do rezultata delite. Vsebine pregledane strani ne shranimo.`}</li>
          </ul>
        </section>
        <section className="message">
          <h2>Piškotki</h2>
          <p>Uporabljamo samo nujne piškotke prvega reda, brez sledenja in oglaševanja:</p>
          <ul>
            <li>
              <strong>sb_device</strong>
              {`: naključna oznaka brskalnika, s katero preštejemo brezplačni predogled brez prijave in zaščitimo obrazce pred zlorabo (velja ${deviceDays} dni).`}
            </li>
            <li>
              <strong>sb_account</strong>
              {`: vaša prijava (velja ${config.accounts.sessionDays} dni ali do odjave).`}
            </li>
          </ul>
          <p>
            Objavljene strani, ki jih naredimo, ne nastavljajo nobenih piškotkov. Za vaš mesečni pregled brez piškotkov štejemo oglede strani, tape na klic in pot ter
            sporočila; hranimo samo skupna števila na dan, nobenih podatkov o obiskovalcih.
          </p>
        </section>
        <section className="message">
          <h2>Naslov IP</h2>
          <p>
            Vašega naslova IP ne shranjujemo. Za omejitve števila zahtev (prijavne povezave, brezplačni predogledi, pregledi spletnih strani) hranimo samo njegov ključni zgoščeni zapis (hash), iz katerega
            naslova ni mogoče razbrati, in ga po enem dnevu izbrišemo.
          </p>
        </section>
        <section className="message">
          <h2>Zunanji ponudniki</h2>
          <ul>
            <li>
              <strong>Cloudflare Turnstile</strong> preveri, da obrazca za predogled brez prijave in pregled spletne strani ne izpolnjuje robot. Naloži se šele, ko začnete pisati opis; pri tem Cloudflare
              obdela vaš naslov IP in podatke o brskalniku.
            </li>
            <li>
              <strong>Resend</strong> pošlje e-pošto s povezavo za prijavo in sporočila iz kontaktnih obrazcev lastnikom strani.
            </li>
            <li>
              <strong>Anthropic</strong> (jezikovni model) in <strong>fal.ai</strong> (ustvarjanje slik) obdelata opis in fotografije, da naredimo stran.
            </li>
            <li>
              <strong>Railway</strong> gosti aplikacijo, podatkovno bazo in datoteke v EU (Amsterdam).
            </li>
          </ul>
        </section>
        <section className="message">
          <h2>Vaše pravice</h2>
          <p>Kadarkoli lahko zahtevate vpogled v svoje podatke, popravek ali izbris računa in strani. Pritožbo lahko vložite pri Informacijskem pooblaščencu.</p>
        </section>
      </main>
    </Doc>,
  );
}
