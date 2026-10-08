/**
 * Slovene names for everything the editor shows the owner: section types and variants, form fields,
 * enum values, directions, design tokens, colours, and where a spec path points. No zod import, so the
 * dashboard's browser bundle can use it (`@sb/spec/labels`; format.ts has no zod import either). test/labels.test.ts checks that every
 * type, variant, field key, enum value and direction in the spec has a name here.
 */
import { plural } from "./format.ts";

export const SECTION_LABEL: Record<string, string> = {
  "hero-split": "Uvod s fotografijo",
  "hero-image": "Uvod čez fotografijo",
  "hero-type": "Uvod (besedilo)",
  "hero-signature": "Uvod z glavnim podatkom",
  "page-header": "Glava strani",
  text: "Besedilo",
  "image-text": "Slika in besedilo",
  highlights: "Poudarki",
  steps: "Koraki",
  cta: "Poziv k dejanju",
  booking: "Rezervacija",
  about: "O nas",
  announcement: "Obvestilo",
  "services-list": "Storitve (seznam)",
  "services-cards": "Storitve (kartice)",
  "price-list": "Cenik",
  menu: "Jedilnik",
  "opening-hours": "Delovni čas",
  contact: "Kontakt",
  "contact-form": "Obrazec za sporočila",
  faq: "Pogosta vprašanja",
  team: "Ekipa",
  gallery: "Galerija",
  products: "Izdelki",
  rooms: "Sobe in ponudba",
  "service-area": "Območje dela",
  "contact-strip": "Hitri kontakt",
  collection: "Zbirka (novice, dogodki, storitve, ekipa)",
  legal: "Pravno besedilo",
  "not-found": "Stran ne obstaja",
};

export const VARIANT_LABEL: Record<string, Record<string, string>> = {
  "hero-split": { "image-right": "Fotografija desno", "image-left": "Fotografija levo" },
  "hero-image": { "overlay-bottom": "Besedilo spodaj", "overlay-left": "Besedilo levo" },
  "hero-type": { large: "Velik naslov", "with-facts": "Z glavnimi podatki" },
  "hero-signature": { photo: "Čez fotografijo", drawing: "Z risbo", arch: "S fotografijo v loku", receipt: "Z računom", label: "Z etiketo", card: "Kartica čez fotografijo", mirrors: "Fotografije v ogledalih", disc: "Okrogla fotografija z nasmehom", view: "Razgled s kažipoti", bend: "S pregibom in prirezanim vogalom" },
  "page-header": { plain: "Samo naslov", "with-image": "S fotografijo" },
  text: { narrow: "Ozek stolpec", "two-column": "Dva stolpca" },
  "image-text": { "image-left": "Slika levo", "image-right": "Slika desno", round: "Okrogla slika na barvnem pasu", pair: "Dve fotografiji z veliko številko" },
  highlights: { list: "Seznam", columns: "Stolpci", figures: "Velike besede in številke" },
  steps: { vertical: "Navpično", horizontal: "Vodoravno" },
  cta: { band: "Pas čez celo širino", split: "Besedilo in gumb ob strani" },
  booking: { simple: "Preprosto", "with-hours": "Z delovnim časom" },
  about: { "image-side": "S fotografijo ob strani", "text-only": "Samo besedilo", figure: "Z veliko številko" },
  announcement: { bar: "Vrstica", card: "Kartica" },
  "services-list": { rows: "Vrstice", "two-column": "Dva stolpca", aside: "Seznam z opombo ob strani" },
  "services-cards": { grid: "Mreža", compact: "Strnjeno" },
  "price-list": { table: "Tabela", grouped: "Po skupinah", tags: "Cene kot znaki", offers: "Ponudbe z velikimi cenami", rates: "Velike cene ob fotografiji" },
  menu: { classic: "Klasično", "two-column": "Dva stolpca" },
  "opening-hours": { table: "Tabela", compact: "Strnjeno", photo: "S fotografijo v loku", week: "Tedenski graf", poster: "Velik čas na barvnem pasu" },
  contact: { "split-map": "Z zemljevidom ob strani", stacked: "Eno pod drugim", "call-out": "Velika telefonska številka" },
  "contact-form": { stacked: "Eno pod drugim", split: "Obrazec ob strani" },
  faq: { accordion: "Odgovori se odprejo ob kliku", list: "Vsi odgovori vidni" },
  team: { grid: "Mreža", list: "Seznam", photo: "S fotografijo ob strani" },
  gallery: { grid: "Mreža", mosaic: "Mozaik", wall: "Stena fotografij od roba do roba" },
  products: { grid: "Mreža", list: "Seznam", plates: "Jedi na okroglih krožnikih" },
  rooms: { cards: "Kartice", rows: "Vrstice" },
  "service-area": { list: "Seznam", inline: "V vrstici" },
  "contact-strip": { bar: "Vrstica", cards: "Kartice" },
  collection: { list: "Seznam", cards: "Kartice" },
  legal: { default: "Osnovno" },
  "not-found": { default: "Osnovno" },
};

/** Form field names by key. Keys whose meaning depends on the parent are in FIELD_LABEL_IN. */
export const FIELD_LABEL: Record<string, string> = {
  props: "Vsebina razdelka",
  action: "Dejanje",
  address: "Naslov",
  amount: "Znesek (€)",
  answer: "Odgovor",
  askPhone: "Vprašaj tudi za telefonsko številko",
  bio: "Kratek opis",
  body: "Besedilo",
  bookingUrl: "Povezava za rezervacije",
  capacity: "Število gostov",
  caption: "Opis pod sliko",
  categories: "Skupine jedi",
  city: "Kraj",
  close: "Odprto do (HH:MM)",
  closed: "Zaprto",
  country: "Država",
  description: "Opis",
  dishes: "Jedi",
  email: "E-pošta",
  entries: "Obdobja",
  eyebrow: "Nadnaslov",
  fact: "Glavni podatek",
  factLabel: "Besedilo nad podatkom",
  factNote: "Opomba pod podatkom",
  inset: "Druga fotografija",
  images: "Fotografije",
  wordmark: "Ime v ozadju",
  year: "Leto v nogi strani",
  date: "Datum",
  signs: "Kažipoti",
  receipt: "Račun v uvodu",
  lines: "Vrstice na računu",
  limit: "Prikaži največ (prazno: vse)",
  blog: "Novice",
  events: "Dogodki",
  services: "Storitve",
  team: "Ekipa",
  summary: "Povzetek",
  endDate: "Zadnji dan (več dni)",
  start: "Začetek (HH:MM)",
  end: "Konec (HH:MM)",
  place: "Kraj",
  slug: "Ime strani v naslovu (neobvezno)",
  total: "Zadnja vrstica (dvojna črta)",
  figure: "Velika številka",
  value: "Številka",
  features: "Posebnosti",
  footnote: "Opomba pod seznamom",
  from: "Od",
  groups: "Skupine",
  heading: "Naslov",
  headline: "Naslov",
  hours: "Delovni čas",
  image: "Fotografija",
  intro: "Uvod",
  items: "Postavke",
  kind: "Vrsta",
  label: "Besedilo povezave",
  legalName: "Polno ime podjetja",
  link: "Povezava",
  members: "Člani ekipe",
  messageHint: "Namig pod poljem za sporočilo",
  name: "Ime",
  network: "Omrežje",
  note: "Opomba",
  open: "Odprto od (HH:MM)",
  ownerName: "Ime lastnika",
  ownerRole: "Vloga lastnika",
  page: "Stran",
  paragraphs: "Odstavki",
  phone: "Telefon",
  postalCode: "Poštna številka",
  price: "Cena",
  primary: "Glavni gumb",
  provider: "Podatki o ponudniku (ZEPT)",
  question: "Vprašanje",
  registrationNumber: "Matična številka",
  registry: "Register",
  role: "Vloga",
  secondary: "Drugi gumb",
  section: "Razdelek",
  serviceArea: "Območje dela",
  social: "Družbena omrežja",
  steps: "Koraki",
  street: "Ulica in hišna številka",
  subtype: "Ožja dejavnost",
  tags: "Oznake",
  target: "Cilj",
  taxNumber: "Davčna številka",
  text: "Besedilo",
  title: "Naslov",
  to: "Do",
  type: "Vrsta dejavnosti",
  unavailable: "Trenutno ni na voljo",
  unit: "Enota",
  url: "Spletni naslov",
  vatPayer: "Zavezanec za DDV",
};

/** Field names that depend on the parent field ("parent/key"). */
export const FIELD_LABEL_IN: Record<string, string> = {
  "entries/from": "Od dneva",
  "entries/to": "Do dneva",
  "price/from": "Prikaži kot »od«",
  "price/amount": "Znesek (€)",
  "receipt/title": "Naslov računa",
  "total/label": "Besedilo",
  "total/value": "Vrednost",
  "figure/label": "Kaj številka pomeni",
  "signs/label": "Kraj na kažipotu",
  "signs/note": "Čas ali razdalja",
  // The accessibility statement's date (legal section props); a post's or event's date is just "Datum".
  "props/date": "Datum izjave (LLLL-MM-DD)",
};

export function fieldLabel(key: string, parent?: string): string {
  return (parent !== undefined ? FIELD_LABEL_IN[`${parent}/${key}`] : undefined) ?? FIELD_LABEL[key] ?? key;
}

/** Values of enums the forms show as choices. */
export const ENUM_LABEL: Record<string, string> = {
  // Actions (buttons and links).
  call: "Klic",
  directions: "Navodila za pot",
  email: "E-pošta",
  booking: "Rezervacija",
  // Hero objects (hero-signature fact).
  phone: "Telefonska številka",
  opening: "Ura odprtja",
  address: "Naslov",
  // Menu tags.
  vegetarian: "Vegetarijansko",
  vegan: "Vegansko",
  "gluten-free": "Brez glutena",
  "lactose-free": "Brez laktoze",
  spicy: "Pekoče",
  local: "Domače, lokalno",
  // Legal pages.
  privacy: "Zasebnost",
  accessibility: "Dostopnost",
  // Business types.
  hairdresser: "Frizerstvo",
  restaurant: "Restavracija ali gostilna",
  "tourist-farm": "Turistična kmetija",
  "car-repair": "Avtoservis",
  dental: "Zobozdravstvo",
  physio: "Fizioterapija",
  accountant: "Računovodstvo",
  builder: "Gradnja in obrt",
  shop: "Trgovina",
  bakery: "Pekarna",
  // Business subtypes (spec v16, business.subtype).
  repair: "Popravila",
  tyres: "Pnevmatike",
  bodywork: "Kleparstvo",
  plumbing: "Vodovodne inštalacije",
  electrical: "Električne inštalacije",
  carpentry: "Mizarstvo",
  roofing: "Krovstvo",
  painting: "Slikopleskarstvo",
  deli: "Delikatese",
  florist: "Cvetličarna",
  boutique: "Butik",
  // Days.
  mon: "Ponedeljek",
  tue: "Torek",
  wed: "Sreda",
  thu: "Četrtek",
  fri: "Petek",
  sat: "Sobota",
  sun: "Nedelja",
  // Collections.
  blog: "Novice",
  events: "Dogodki",
  services: "Storitve",
  team: "Ekipa",
  // Social networks (brand names).
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  linkedin: "LinkedIn",
};

/** What a placeholder stands for, lower case, for "Manjka …". */
export const PLACEHOLDER_LABEL: Record<string, string> = {
  phone: "telefonska številka",
  email: "e-poštni naslov",
  address: "naslov",
  price: "cena",
  hours: "delovni čas",
  name: "ime",
  legalName: "polno ime podjetja",
  registrationNumber: "matična številka",
  taxNumber: "davčna številka",
  text: "besedilo",
  // Not a placeholder kind: a service-area section with no business.serviceArea (publishChecklist).
  serviceArea: "območje dela",
};

/** Owner-facing names and summaries of the design directions (the English ones are for the model). */
export const DIRECTION_LABEL: Record<string, { name: string; summary: string }> = {
  "clean-swiss": { name: "Čisto in natančno", summary: "Bela stran, ostri naslovi, stroga mreža in oglati robovi, ena živa barva. Urejeno in mirno. Za računovodje, ambulante in inštalaterje." },
  "warm-craft": { name: "Toplo in domače", summary: "Bela stran, mehki naslovi z značajem, topla barva gumbov in fotografije na barvni podlagi. Za pekarne, gostilne, družinske restavracije in male trgovine z dobrimi fotografijami izdelkov." },
  "dark-elegant": { name: "Temno in elegantno", summary: "Skoraj črna stran, svetli tanki naslovi, medeninasti poudarki in veliko zraka. Večerno vzdušje. Za restavracije, vinske bare in salone z lepimi fotografijami prostora; ni za temne ali redke fotografije." },
  "bold-local": { name: "Krepko in neposredno", summary: "Bela stran, močni strnjeni naslovi, oglati robovi, glasna barva gumbov in temni pasovi s ključnimi podatki. Telefonska številka v ospredju. Za avtoservise, vulkanizerje, gradbince in obrtnike." },
  "clinical-calm": { name: "Mirno in strokovno", summary: "Bledo modra stran z belimi karticami, prijazni naslovi, mehko zaobljeni robovi in veliko zraka. Pomirjujoče, a ne sterilno. Za zobozdravnike, fizioterapevte in druge zdravstvene storitve." },
  "alpine-nature": { name: "Alpsko in naravno", summary: "Bledo zelena stran, trdni naslovi, gozdno zeleni gumbi in fotografije čez celo širino telefona. Pristno, na prostem. Za turistične kmetije, koče in podeželske gostilne." },
  editorial: { name: "Časopisno", summary: "Bela stran z velikimi tankimi naslovi kot v kakovostnem časopisu, veliko belega prostora in ena temno rdeča barva. Za svetovalce in pisarne z malo fotografijami ali z močnim besedilom." },
  "playful-modern": { name: "Igrivo in sodobno", summary: "Bela stran, debeli igrivi naslovi, živa jagodna barva, bledo vijolični pasovi in močno zaobljeni robovi. Prijazno in sveže. Za pekarne, frizerje in trgovine za mlajše stranke." },
  industrial: { name: "Industrijsko", summary: "Temno siva stran, tehnični naslovi, varnostno rumeni gumbi, oglati robovi in gosta postavitev. Robustno in brez olepšav. Za gradbince, inštalaterje, električarje in delavnice." },
  tablica: { name: "Tablica", summary: "Asfalt in signalno rumena, debeli naslovi z velikimi črkami, fotografija delavnice čez celo širino in telefonska številka kot registrska tablica. Cene so tablice, med razdelki tekalna plast gume. Za avtoservise, vulkanizerje in vleko." },
  cevi: { name: "Cevi", summary: "Bela stran brez fotografij, narisan radiator z rdečo in modro cevjo, telefonska številka v rdečem polju; cevi tečejo naprej kot ločnice, koraki in območje dela. Za inštalaterje, vodovodarje in ogrevanje." },
  racun: { name: "Račun", summary: "Bela stran brez fotografij, ena preprosta pisava in zelena barva knjigovodstva. V uvodu nagnjen račun s seznamom storitev, kljukicami in dvojno črto; stranke in leto ustanovitve so napisani čez celo steno. Za računovodstva, odvetnike, notarje, zavarovalnice in prevajalce." },
  nasmeh: { name: "Nasmeh", summary: "Mirno in prijazno: bela in metina z globoko zeleno-modro, ena prijazna pisava, pomirjujoča obljuba ambulante kot naslov, okrogla fotografija z oranžnim nasmehom pod njo, ordinacijski čas kot tedenski graf, storitve z lokci namesto alinej. Za zobozdravnike, zdravnike, veterinarje, optike in lekarne." },
  markacija: { name: "Markacija", summary: "Za kraje z razgledom: pokrajina čez ves prvi zaslon, kraji, do katerih vodijo poti, na rdečih kažipotih, gorski greben kot rob temnih razdelkov, markacija kot znak in alineja. Krepka serifna pisava, bela, travniško in gozdno zelena, rdeči gumbi. Za turistične kmetije, planinske koče, gostišča in kampe z veliko fotografijami." },
  pregib: { name: "Pregib", summary: "Za ambulante, ki prodajajo termine: zalomljena črta iz logotipa kot širok udo za naslovom z oranžnim sklepom, fotografija s prirezanim vogalom, velike oranžne številke na temnem pasu, ploščice in cenik s prirezanimi vogali, pas za rezervacijo. Za fizioterapevte, maserje, trenerje in druge, ki se naročajo na spletu." },
  jedilnik: { name: "Jedilnik", summary: "Steklenično zelena in medenina, klasična pisava s serifi: fotografija hiše čez celo širino z belo kartico jedilnika, ki visi v naslednji razdelek, dnevna ponudba na zelenem pasu s cenami v velikosti naslova, jedi na okroglih krožnikih, število sedežev kot velika medeninasta številka in medeninasta žlica iz imena. Za gostilne, restavracije, vinske kleti in penzione." },
  ogledalo: { name: "Ogledalo", summary: "Vinsko rdeča in nežno rožnata iz salonove palete, tesna pisava v zelo velikih naslovih, ime salona čez celo steno v ozadju uvoda, tri fotografije v ogledalih različnih višin, vinski pas s stavkom o naročanju in cenik kot časopisna glava ob velikem naslovu. Za frizerje, kozmetične in nohtne salone, brivce in krojače s vsaj tremi fotografijami." },
  etiketa: { name: "Etiketa", summary: "Olivno zelena in terakota, knjižna pisava s serifi, vse postavljeno kot etiketa na steklenici: naslov na beli etiketi z dvojnim okvirjem in narisano oljčno vejico, fotografija trgovine v visokem kamnitem loku, vsak izdelek s ceno na svoji etiketi, terakota pas za darilne pakete. Za delikatese, vinoteke, medarje, kmetijske in darilne trgovine." },
  skorja: { name: "Skorja", summary: "Temno pražen uvod, izdelek na fotografiji v loku krušne peči in ura odprtja na okroglem žigu, debela pisava s serifi, cene na deski s pikicami in tri zareze hlebca kot znak razdelkov. Za pekarne, slaščičarne, mesnice in pražarne." },
  "soft-studio": { name: "Mehko in osebno", summary: "Bela stran, nežni knjižni naslovi, umirjena rožnata barva in rahlo rožnati pasovi. Mirno in osebno. Za frizerske, kozmetične in masažne salone ter male butike." },
};

export const DESIGN_LABEL: Record<string, string> = {
  direction: "Smer oblikovanja",
  fontPair: "Pisave",
  colors: "Barve",
  radius: "Zaobljenost",
  baseFontSize: "Velikost pisave",
  scale: "Razmerje naslovov",
  headingWeight: "Debelina naslovov",
  headingTracking: "Razmik črk v naslovih",
  headingCase: "Velike črke v naslovih",
  density: "Gostota",
  shadow: "Senca",
  imagery: "Obdelava fotografij",
};

/** Values of the design tokens that are choices. */
export const TOKEN_LABEL: Record<string, Record<string, string>> = {
  density: { compact: "Strnjeno", regular: "Običajno", airy: "Zračno" },
  shadow: { none: "Brez", subtle: "Rahla" },
  headingCase: { normal: "Običajne črke", uppercase: "Vse velike črke" },
  imagery: { natural: "Naravno", rounded: "Zaobljeno", framed: "V okvirju", "full-bleed": "Čez celo širino", monochrome: "Enobarvno", arched: "Z obokom", "offset-block": "Na barvni podlagi", duotone: "Dvobarvno" },
};

export const COLOR_LABEL: Record<string, string> = {
  background: "Ozadje strani",
  surface: "Izmenično ozadje",
  text: "Besedilo",
  muted: "Drugotno besedilo",
  primary: "Glavna barva (gumbi)",
  onPrimary: "Besedilo na gumbih",
  accent: "Poudarek",
  border: "Obrobe",
  inverse: "Temni razdelki",
  onInverse: "Besedilo na temnem",
  band: "Barvni pasovi",
  onBand: "Besedilo na barvnem pasu",
};

export const PAGE_FIELD_LABEL: Record<string, string> = {
  "nav/label": "Ime v meniju",
  "nav/show": "Prikaži v meniju",
  "seo/title": "Naslov za iskalnike",
  "seo/description": "Opis za iskalnike",
  slug: "Naslov datoteke",
};

// ---------- Where a spec path points ----------

type Obj = Record<string, unknown>;
const unescape = (s: string) => s.replace(/~1/g, "/").replace(/~0/g, "~");
const obj = (v: unknown): Obj | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : undefined);

/** "Postavke (2.) › Cena" for the segments after a form's root; numbers are list positions. */
function fieldChain(segs: string[]): string[] {
  const out: string[] = [];
  let parent: string | undefined;
  for (const s of segs) {
    if (/^\d+$/.test(s)) {
      if (out.length) out[out.length - 1] = `${out[out.length - 1]} (${Number(s) + 1}.)`;
      else out.push(`${Number(s) + 1}.`);
      continue;
    }
    out.push(fieldLabel(s, parent));
    parent = s;
  }
  return out;
}

/**
 * Inside a price list or menu, groups and items by their names ("Barvanje in pričeske › Pramene › Cena"),
 * the way the owner sees them in the editor; null elsewhere.
 */
function listChain(section: Record<string, unknown>, after: string[]): string[] | null {
  const keys: [string, string] | null = section.type === "price-list" ? ["groups", "items"] : section.type === "menu" ? ["categories", "dishes"] : null;
  if (!keys || after[0] !== keys[0] || !/^\d+$/.test(after[1] ?? "")) return null;
  const g = Number(after[1]);
  const group = obj((obj(section.props)?.[keys[0]] as unknown[] | undefined)?.[g]);
  const out = [typeof group?.name === "string" ? group.name : `Skupina ${g + 1}`];
  if (after[2] !== keys[1] || !/^\d+$/.test(after[3] ?? "")) return [...out, ...fieldChain(after.slice(2))];
  const i = Number(after[3]);
  const item = obj((group?.[keys[1]] as unknown[] | undefined)?.[i]);
  return [...out, typeof item?.name === "string" ? item.name : `${i + 1}.`, ...fieldChain(after.slice(4))];
}

/**
 * Where a JSON pointer into the spec points, in words the owner knows: "Domov › Cenik › Postavke (2.) ›
 * Cena", "Podatki o podjetju › Telefon", "Fotografije › Hlebci na polici".
 */
export function describePath(spec: unknown, path: string): string {
  const segs = path.split("/").slice(1).map(unescape);
  const root = obj(spec) ?? {};
  const [head, a, b, c, ...rest] = segs;
  if (head === "pages") {
    const page = obj((root.pages as unknown[] | undefined)?.[Number(a)]);
    if (!page) return "Strani";
    const pageName = String(obj(page.nav)?.label ?? page.slug ?? "Stran");
    if (b === "sections") {
      const section = obj((page.sections as unknown[] | undefined)?.[Number(c)]);
      if (!section) return pageName;
      const name = SECTION_LABEL[String(section.type)] ?? String(section.type);
      const after = rest[0] === "props" ? rest.slice(1) : rest;
      const listed = listChain(section, after);
      if (listed) return [pageName, name, ...listed].join(" › ");
      return [pageName, name, ...fieldChain(after)].join(" › ");
    }
    const key = [b, c].filter(Boolean).join("/");
    return [pageName, PAGE_FIELD_LABEL[key] ?? PAGE_FIELD_LABEL[b ?? ""] ?? "Nastavitve strani"].join(" › ");
  }
  if (head === "business") return ["Podatki o podjetju", ...fieldChain(segs.slice(1))].join(" › ");
  if (head === "assets") {
    const img = obj((obj(root.assets)?.images as unknown[] | undefined)?.[Number(b)]);
    const alt = typeof img?.alt === "string" && img.alt.trim() ? `»${img.alt.trim().slice(0, 40)}«` : `${Number(b) + 1}.`;
    return a === "images" ? `Fotografija ${alt}` : "Fotografije";
  }
  if (head === "design") {
    if (a === "colors") return ["Oblika", COLOR_LABEL[b ?? ""] ?? "Barve"].join(" › ");
    return ["Oblika", ...(a ? [DESIGN_LABEL[a] ?? a] : [])].join(" › ");
  }
  if (head === "chrome") return a === "footer" ? "Noga" : a === "header" ? "Glava" : "Glava in noga";
  return "Stran";
}

// ---------- What is wrong, in Slovene ----------

export interface IssueLike {
  path: string;
  code: string;
  message: string;
}

/** A validation message in words the owner can act on; unknown messages get a generic sentence. */
export function issueMessage(issue: IssueLike): string {
  const m = issue.message;
  let r: RegExpExecArray | null;
  if ((r = /expected string to have <=(\d+) characters/.exec(m))) return `je predolgo (največ ${r[1]} znakov)`;
  if ((r = /expected string to have >=(\d+) characters/.exec(m))) return r[1] === "1" ? "ne sme biti prazno" : `je prekratko (vsaj ${r[1]} znakov)`;
  if ((r = /expected array to have <=(\d+) items/.exec(m))) return `ima preveč postavk (največ ${r[1]})`;
  if ((r = /expected array to have >=(\d+) items/.exec(m))) {
    const n = Number(r[1]);
    return `potrebuje vsaj ${n} ${plural(n, { one: "postavko", two: "postavki", few: "postavke", other: "postavk" })}`;
  }
  if (/expected number to be [<>]=?/.test(m) || /Too (big|small): expected (number|int)/.test(m)) return "je zunaj dovoljenega razpona";
  if (/Invalid (string: must match pattern|format)|Invalid (email|url|URL)/.test(m)) return "nima pravilne oblike";
  if (/expected .*, received undefined/.test(m)) return "manjka";
  if (/can't be edited/.test(m)) return "tega dela strani ni mogoče urejati";
  // The editor's guard ("test" op): the section or page moved before the save arrived.
  if (/Test operation failed/i.test(m)) return "razdelek ali stran se je medtem premaknila; sprememba ni shranjena, poskusite znova";
  if (/^unknown page/.test(m)) return "povezava kaže na stran, ki je ni več";
  if (/^unknown image/.test(m)) return "fotografije ni več";
  if (/is AI-generated and may only be used in/.test(m)) return "slike, ustvarjene z UI, so dovoljene le v uvodu, glavi strani in razdelku slika in besedilo";
  if (/booking (link|CTA) without business.bookingUrl/.test(m)) return "gumb za rezervacijo potrebuje povezavo za rezervacije (Podatki o podjetju)";
  if (/^link URL must start with http/.test(m)) return "spletni naslov se mora začeti s https:// (ali http://)";
  if (/centred sections on one page/.test(m)) return "na strani je lahko le en sredinsko poravnan razdelek";
  if (issue.code === "banned") {
    // findBannedCopy: `${rule}: "${text}"`.
    const cut = m.lastIndexOf(': "');
    const rule = cut >= 0 ? m.slice(0, cut) : m;
    if (rule.startsWith("filler: ")) return `vsebuje prazno frazo »${rule.slice(8)}«; napišite konkretno, kaj ponujate`;
    if (rule === "emoji") return "vsebuje emoji";
    if (rule === "numbered label") return "oznake ne smejo biti oštevilčene (01, 02 …)";
    if (rule === "em dash") return "vsebuje dolgi pomišljaj (—); uporabite pomišljaj s presledki ( – ) ali vejico";
    if (rule === "all-caps eyebrow") return "nadnaslov naj ne bo napisan z velikimi črkami; pišite ga kot navaden stavek";
    const greeting = /^"(.+)" headline$/.exec(rule);
    if (greeting) return `naslov ne sme biti pozdrav (»${greeting[1]}«); povejte, kaj ponujate`;
    return "vsebuje izraz, ki ga ne uporabljamo";
  }
  if (issue.code === "design" && / is pure (black|white);/.test(m)) return "barva ne sme biti čisto črna ali čisto bela; izberite malo mehkejši odtenek";
  if (issue.code === "design") return "barve ali mere niso v dovoljenem razponu";
  if (issue.code === "structure") return "te spremembe ni mogoče shraniti (zgradba strani)";
  return "ni veljavno";
}

/** "Domov › Uvod s fotografijo › Naslov: je predolgo (največ 80 znakov)". */
export function issueText(spec: unknown, issue: IssueLike): string {
  return `${describePath(spec, issue.path)}: ${issueMessage(issue)}`;
}

/** One entry of the pre-publish checklist (see publishChecklist in validate.ts). */
export interface BlockerLike {
  path: string;
  kind: "invalid" | "placeholder" | "starter" | "alt" | "fact";
  detail: string;
  code?: string;
  value?: string;
}

/** What to do about one checklist entry, in Slovene. */
export function blockerMessage(b: BlockerLike): string {
  switch (b.kind) {
    case "placeholder":
      return `Manjka ${PLACEHOLDER_LABEL[b.detail] ?? "podatek"}.`;
    case "starter":
      return "Začetno besedilo še ni zamenjano.";
    case "alt":
      return "Fotografija nima opisa (za bralnike zaslona in iskalnike).";
    case "fact":
      return `»${(b.value ?? "").slice(0, 60)}« ni iz vašega opisa. Popravite ga ali ga potrdite tako, da ga vpišete sami.`;
    default: {
      const msg = issueMessage({ path: b.path, code: b.code ?? "schema", message: b.detail });
      return `${msg.charAt(0).toUpperCase()}${msg.slice(1)}.`;
    }
  }
}
