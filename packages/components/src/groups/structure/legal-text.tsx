import type { ReactNode } from "react";

/**
 * Legal page templates (privacy policy, accessibility statement), built from the business facts.
 * Long template bodies live here rather than in i18n.ts, which holds short UI labels only.
 * Plain wording for the client's review; not legal advice.
 */
export interface LegalFacts {
  /** Business (site) name. */
  name: string;
  /** Provider legal name, or a placeholder. */
  legal: ReactNode;
  /** One-line address, or a placeholder. */
  address: ReactNode;
  /** Registration number (matična številka), or a placeholder. */
  reg: ReactNode;
  email: ReactNode;
  phone: ReactNode;
  /** Formatted date of this version of the statement. */
  date: string;
  /** Placeholder for the client's list of known accessibility limitations. */
  limitations: ReactNode;
}

export const IP_URL = "https://www.ip-rs.si/";
export const IRSID_URL = "https://www.gov.si/drzavni-organi/organi-v-sestavi/inspektorat-za-informacijsko-druzbo/";
export const GOOGLE_PRIVACY_URL = "https://policies.google.com/privacy";

type Lang = "sl" | "en";

export function privacyBody(lang: Lang, f: LegalFacts): ReactNode {
  return lang === "sl" ? privacySl(f) : privacyEn(f);
}

export function accessibilityBody(lang: Lang, f: LegalFacts): ReactNode {
  return lang === "sl" ? accessibilitySl(f) : accessibilityEn(f);
}

function privacySl(f: LegalFacts) {
  return (
    <>
      <p>
        V tem obvestilu pojasnjujemo, katere osebne podatke obdelujemo, ko obiščete spletno stran {f.name} ali nas kontaktirate, zakaj
        jih obdelujemo in kakšne pravice imate.
      </p>

      <h2>Upravljavec</h2>
      <p>
        Upravljavec osebnih podatkov je {f.legal}, {f.address}, matična številka {f.reg}. Z nami se lahko povežete po e-pošti {f.email}{" "}
        ali po telefonu {f.phone}.
      </p>

      <h2>Katere podatke obdelujemo in zakaj</h2>
      <h3>Obisk spletne strani</h3>
      <p>
        Spletna stran je statična. Ne uporablja orodij za analitiko, oglaševanje ali sledenje in ne nastavlja piškotkov.
      </p>
      <p>
        Strežnik ponudnika gostovanja ob vsakem obisku samodejno zabeleži tehnične podatke, ki jih pošlje vaš brskalnik: naslov IP,
        datum in čas obiska, zahtevano stran ter vrsto brskalnika in naprave. Te podatke potrebujemo, da stran deluje varno in
        zanesljivo.
      </p>
      <ul>
        <li>Pravna podlaga: zakoniti interes (točka (f) prvega odstavka 6. člena Splošne uredbe o varstvu podatkov, GDPR).</li>
        <li>Hramba: dnevniki se hranijo le toliko časa, kot je potrebno za zagotavljanje varnosti, nato se samodejno izbrišejo.</li>
      </ul>

      <h3>Ko nas pokličete ali nam pišete</h3>
      <p>
        Če nas pokličete ali nam pošljete e-pošto, obdelujemo podatke, ki nam jih sami posredujete (na primer ime, telefonsko
        številko, e-poštni naslov in vsebino sporočila), da vam lahko odgovorimo.
      </p>
      <ul>
        <li>
          Pravna podlaga: ukrepi na vašo zahtevo pred sklenitvijo pogodbe ali izvajanje pogodbe (točka (b)) oziroma naš zakoniti
          interes, da odgovorimo na vaše vprašanje (točka (f)).
        </li>
        <li>Hramba: dokler je to potrebno za obravnavo vaše zadeve oziroma toliko časa, kot zahtevajo predpisi (na primer za račune).</li>
      </ul>

      <h3>Zemljevid in druge zunanje vsebine</h3>
      <p>
        Če stran vsebuje vdelan zemljevid Google Maps (ponudnik Google Ireland Limited), se ta naloži šele, ko to dovolite s klikom.
        Takrat vaš brskalnik vzpostavi povezavo z Googlovimi strežniki, ki prejmejo najmanj vaš naslov IP in lahko nastavijo
        piškotke. Pri tem lahko pride do prenosa podatkov v tretje države, na primer v ZDA. Več o tem v{" "}
        <a href={GOOGLE_PRIVACY_URL}>Googlovem pravilniku o zasebnosti</a>.
      </p>
      <ul>
        <li>
          Pravna podlaga: vaša privolitev (točka (a)), ki jo lahko kadar koli prekličete z gumbom »Nastavitve piškotkov« v nogi
          strani.
        </li>
      </ul>
      <p>
        Vašo izbiro shranimo v lokalno shrambo vašega brskalnika (localStorage, ključ »sb-consent«). To ni piškotek in se ne pošilja
        na strežnik. Izbrišete jo lahko v nastavitvah brskalnika.
      </p>

      <h2>Komu posredujemo podatke</h2>
      <p>
        Podatkov ne prodajamo in jih ne posredujemo tretjim osebam za oglaševanje. Dostop do njih ima ponudnik gostovanja, ki jih
        obdeluje v našem imenu, ter državni organi, kadar to zahteva zakon.
      </p>

      <h2>Vaše pravice</h2>
      <p>Glede svojih osebnih podatkov imate pravico do:</p>
      <ul>
        <li>dostopa do podatkov in njihove kopije,</li>
        <li>popravka netočnih podatkov,</li>
        <li>izbrisa podatkov,</li>
        <li>omejitve obdelave,</li>
        <li>ugovora obdelavi, ki temelji na zakonitem interesu,</li>
        <li>prenosljivosti podatkov,</li>
        <li>preklica privolitve kadar koli, kar ne vpliva na zakonitost obdelave pred preklicem.</li>
      </ul>
      <p>Zahtevo nam pošljite na {f.email}. Odgovorili vam bomo brez nepotrebnega odlašanja, najpozneje v enem mesecu.</p>

      <h2>Pritožba pri nadzornem organu</h2>
      <p>
        Če menite, da obdelava vaših osebnih podatkov krši predpise, lahko vložite pritožbo pri Informacijskem pooblaščencu
        Republike Slovenije: <a href={IP_URL}>www.ip-rs.si</a>.
      </p>
    </>
  );
}

function privacyEn(f: LegalFacts) {
  return (
    <>
      <p>
        This notice explains which personal data we process when you visit the {f.name} website or contact us, why we process it
        and what rights you have.
      </p>

      <h2>Controller</h2>
      <p>
        The controller of your personal data is {f.legal}, {f.address}, registration number {f.reg}. You can reach us by email at{" "}
        {f.email} or by phone at {f.phone}.
      </p>

      <h2>What data we process and why</h2>
      <h3>Visiting the website</h3>
      <p>This is a static website. It uses no analytics, advertising or tracking tools and sets no cookies.</p>
      <p>
        On every visit, the hosting provider&apos;s server automatically logs technical data sent by your browser: IP address, date
        and time, the requested page, and browser and device type. We need this data to keep the site secure and reliable.
      </p>
      <ul>
        <li>Legal basis: legitimate interest (Article 6(1)(f) of the General Data Protection Regulation, GDPR).</li>
        <li>Retention: logs are kept only as long as needed for security and are then deleted automatically.</li>
      </ul>

      <h3>When you call or email us</h3>
      <p>
        If you call or email us, we process the data you give us (for example your name, phone number, email address and the
        content of your message) so that we can reply.
      </p>
      <ul>
        <li>
          Legal basis: steps taken at your request before entering into a contract, or performing a contract (Article 6(1)(b)), or
          our legitimate interest in answering your question (Article 6(1)(f)).
        </li>
        <li>Retention: as long as needed to handle your request, or as long as the law requires (for example for invoices).</li>
      </ul>

      <h3>Maps and other external content</h3>
      <p>
        If a page contains an embedded Google Maps map (provided by Google Ireland Limited), it loads only after you allow it with a
        click. Your browser then connects to Google&apos;s servers, which receive at least your IP address and may set cookies. Data
        may be transferred to third countries such as the USA. See <a href={GOOGLE_PRIVACY_URL}>Google&apos;s privacy policy</a>.
      </p>
      <ul>
        <li>Legal basis: your consent (Article 6(1)(a)), which you can withdraw at any time with the “Cookie settings” button in the footer.</li>
      </ul>
      <p>
        We store your choice in your browser&apos;s local storage (localStorage, key “sb-consent”). It is not a cookie and is not
        sent to any server. You can delete it in your browser settings.
      </p>

      <h2>Who receives the data</h2>
      <p>
        We do not sell data or pass it to third parties for advertising. The hosting provider, which processes it on our behalf,
        has access to it, as do public authorities where the law requires it.
      </p>

      <h2>Your rights</h2>
      <p>You have the right to:</p>
      <ul>
        <li>access your data and get a copy,</li>
        <li>have inaccurate data corrected,</li>
        <li>have your data erased,</li>
        <li>restrict processing,</li>
        <li>object to processing based on legitimate interest,</li>
        <li>data portability,</li>
        <li>withdraw consent at any time, without affecting processing before the withdrawal.</li>
      </ul>
      <p>Send your request to {f.email}. We will reply without undue delay and within one month at the latest.</p>

      <h2>Complaints</h2>
      <p>
        If you believe that the processing of your personal data breaks the law, you can lodge a complaint with the Information
        Commissioner of the Republic of Slovenia: <a href={IP_URL}>www.ip-rs.si</a>.
      </p>
    </>
  );
}

function accessibilitySl(f: LegalFacts) {
  return (
    <>
      <p>
        Prizadevamo si, da bi bila spletna stran {f.name} dostopna vsem, tudi osebam z oviranostmi. Stran upravlja {f.legal}. Pri
        tem upoštevamo Zakon o dostopnosti spletišč in mobilnih aplikacij (ZDSMA).
      </p>

      <h2>Stopnja skladnosti</h2>
      <p>
        Stran je izdelana s ciljem skladnosti s smernicami za dostopnost spletnih vsebin WCAG 2.2 na ravni AA. Ob izdelavi smo jo
        preverili z avtomatskimi orodji za preverjanje dostopnosti. Ta orodja ne odkrijejo vseh ovir, zato stran izboljšujemo tudi
        na podlagi vaših povratnih informacij.
      </p>
      <p>Na strani je med drugim urejeno:</p>
      <ul>
        <li>vso vsebino in navigacijo lahko uporabljate s tipkovnico,</li>
        <li>slike, ki nosijo vsebino, imajo besedilne opise,</li>
        <li>besedilo ima zadosten barvni kontrast z ozadjem,</li>
        <li>besedilo lahko povečate do 200 % brez izgube vsebine,</li>
        <li>stran deluje tudi na mobilnih napravah.</li>
      </ul>

      <h2>Znane omejitve</h2>
      <p>
        Vsebine tretjih oseb, na primer vdelani zemljevidi, morda niso v celoti dostopne. Naslov in povezava do navodil za pot sta
        zato vedno na voljo tudi kot besedilo.
      </p>
      <p>{f.limitations}</p>

      <h2>Povratne informacije in kontakt</h2>
      <p>
        Če naletite na vsebino, ki za vas ni dostopna, ali želite informacije v drugi obliki, nam pišite na {f.email} ali nas
        pokličite na {f.phone}.
      </p>

      <h2>Izvršilni postopek</h2>
      <p>
        Če na svoje sporočilo ne prejmete odgovora ali z njim niste zadovoljni, se lahko obrnete na Inšpektorat Republike Slovenije
        za informacijsko družbo: <a href={IRSID_URL}>spletna stran inšpektorata na gov.si</a>.
      </p>

      <h2>Datum izjave</h2>
      <p>Izjava je bila pripravljena {f.date}.</p>
    </>
  );
}

function accessibilityEn(f: LegalFacts) {
  return (
    <>
      <p>
        We want the {f.name} website to be accessible to everyone, including people with disabilities. The site is operated by{" "}
        {f.legal}. We follow the Slovenian Accessibility of Websites and Mobile Applications Act (ZDSMA).
      </p>

      <h2>Compliance status</h2>
      <p>
        The site is built to conform to the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA. We checked it with
        automated accessibility testing tools when it was built. These tools do not find every barrier, so we also improve the
        site based on your feedback.
      </p>
      <p>Among other things:</p>
      <ul>
        <li>all content and navigation can be used with a keyboard,</li>
        <li>images that carry content have text descriptions,</li>
        <li>text has sufficient colour contrast with its background,</li>
        <li>text can be zoomed to 200% without loss of content,</li>
        <li>the site works on mobile devices.</li>
      </ul>

      <h2>Known limitations</h2>
      <p>
        Third-party content such as embedded maps may not be fully accessible. The address and a directions link are therefore
        always available as text.
      </p>
      <p>{f.limitations}</p>

      <h2>Feedback and contact</h2>
      <p>
        If you come across content that is not accessible to you, or you need information in another format, email us at {f.email}{" "}
        or call us at {f.phone}.
      </p>

      <h2>Enforcement procedure</h2>
      <p>
        If you get no reply or are not satisfied with it, you can contact the Information Society Inspectorate of the Republic of
        Slovenia: <a href={IRSID_URL}>the inspectorate&apos;s page on gov.si</a>.
      </p>

      <h2>Date of this statement</h2>
      <p>This statement was prepared on {f.date}.</p>
    </>
  );
}
