import type { PRACTICAL_FACTS } from "@sb/spec";
import type { RenderCtx } from "../../../types.ts";

/**
 * Fixed interface words of the spec v20 kinds (never generated copy), per site locale (sl, en). Kept beside the kinds
 * rather than in i18n.ts's UiKey table so the v19 dictionaries stay as they are; they can move there in one step.
 */
const sl = {
  pause: "Ustavi",
  play: "Predvajaj",
  before: "Prej",
  after: "Potem",
  photos: "Fotografije",
  mapOf: "Shema poti",
};
type KindKey = keyof typeof sl;
const en: Record<KindKey, string> = {
  pause: "Pause",
  play: "Play",
  before: "Before",
  after: "After",
  photos: "Photos",
  mapOf: "Way to us",
};

export function kindText(ctx: RenderCtx, key: KindKey): string {
  return (ctx.locale === "en" ? en : sl)[key];
}

type Fact = (typeof PRACTICAL_FACTS)[number];

/** The practical facts (spec PRACTICAL_FACTS) as short labels: what an iconFacts item says next to its icon. */
const FACT_SL: Record<Fact, string> = {
  parking: "Parkirišče",
  "free-parking": "Brezplačno parkiranje",
  "bike-parking": "Parkirišče za kolesa",
  "ev-charging": "Polnilnica za e-vozila",
  "public-transport": "Javni prevoz v bližini",
  wheelchair: "Dostop z invalidskim vozičkom",
  "step-free": "Vhod brez stopnic",
  "accessible-toilet": "Prilagojeno stranišče",
  lift: "Dvigalo",
  card: "Plačilo s kartico",
  contactless: "Brezstično plačilo",
  "cash-only": "Samo gotovina",
  invoice: "Plačilo po računu",
  "gift-voucher": "Darilni boni",
  wifi: "Wi-Fi",
  toilets: "Stranišče",
  "baby-change": "Previjalna miza",
  "kids-welcome": "Otroci so dobrodošli",
  "play-corner": "Otroški kotiček",
  "pets-welcome": "Hišni ljubljenčki dovoljeni",
  "no-pets": "Brez hišnih ljubljenčkov",
  terrace: "Terasa",
  garden: "Vrt",
  "air-con": "Klimatizirani prostori",
  takeaway: "Za s seboj",
  delivery: "Dostava",
  "home-visits": "Obiski na domu",
  "pickup-service": "Prevzem na vašem naslovu",
  emergency: "Nujni primeri",
  "appointment-only": "Samo po dogovoru",
  "walk-ins": "Brez naročanja",
  "online-booking": "Spletno naročanje",
  "phone-booking": "Naročanje po telefonu",
  vegetarian: "Vegetarijanska ponudba",
  vegan: "Veganska ponudba",
  "gluten-free": "Brez glutena",
  "local-produce": "Lokalni pridelki",
  english: "Govorimo angleško",
  german: "Govorimo nemško",
  italian: "Govorimo italijansko",
};

const FACT_EN: Record<Fact, string> = {
  parking: "Parking",
  "free-parking": "Free parking",
  "bike-parking": "Bike parking",
  "ev-charging": "EV charging",
  "public-transport": "Public transport nearby",
  wheelchair: "Wheelchair access",
  "step-free": "Step-free entrance",
  "accessible-toilet": "Accessible toilet",
  lift: "Lift",
  card: "Cards accepted",
  contactless: "Contactless payment",
  "cash-only": "Cash only",
  invoice: "Pay by invoice",
  "gift-voucher": "Gift vouchers",
  wifi: "Wi-Fi",
  toilets: "Toilets",
  "baby-change": "Baby changing",
  "kids-welcome": "Children welcome",
  "play-corner": "Play corner",
  "pets-welcome": "Pets welcome",
  "no-pets": "No pets",
  terrace: "Terrace",
  garden: "Garden",
  "air-con": "Air conditioning",
  takeaway: "Takeaway",
  delivery: "Delivery",
  "home-visits": "Home visits",
  "pickup-service": "Pickup at your address",
  emergency: "Emergencies",
  "appointment-only": "By appointment only",
  "walk-ins": "Walk-ins welcome",
  "online-booking": "Online booking",
  "phone-booking": "Book by phone",
  vegetarian: "Vegetarian options",
  vegan: "Vegan options",
  "gluten-free": "Gluten-free",
  "local-produce": "Local produce",
  english: "We speak English",
  german: "We speak German",
  italian: "We speak Italian",
};

/** The label of a practical fact, or null for a name outside the list (the guard G8 drops those before rendering). */
export function factLabel(ctx: RenderCtx, fact: string): string | null {
  const table = ctx.locale === "en" ? FACT_EN : FACT_SL;
  return Object.hasOwn(table, fact) ? table[fact as Fact] : null;
}
