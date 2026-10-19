import type { Hono } from "hono";
import type { AppConfig } from "@sb/config";
import { billingEnabled, type Repo } from "@sb/platform";
import type { AppEnv } from "./access.ts";
import { chatEdits, count, moreHomepages } from "./limits.ts";
import { faq } from "./home.tsx";

/**
 * The plans and the questions for the postavi.si homepage (infra/coming-soon), which is static: it reads them
 * here, so prices live in config only (ROADMAP M7: "Landing page and pricing page match config"). Every text
 * is ready to show, in Slovene; the homepage only lays it out. Read by https://postavi.si (and www) only.
 */
const wholeEur = new Intl.NumberFormat("sl-SI", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const pictures = (n: number) => count(n, { one: "ustvarjena slika", two: "ustvarjeni sliki", few: "ustvarjene slike", other: "ustvarjenih slik" });
const placesLeft = (n: number) => `še ${count(n, { one: "prosto mesto", two: "prosti mesti", few: "prosta mesta", other: "prostih mest" })}`;

export interface PricePlan {
  key: "preview" | "standard" | "premium";
  name: string;
  /** The big number (whole euros, VAT included) and what it is per. */
  price: string;
  per: string;
  /** The line under the price: domain and the monthly alternative. */
  alt: string | null;
  lead: string;
  lines: string[];
  /** Small extras under the list (the founding offer, the setup service). */
  extras: { label: string; value: string }[];
  featured: boolean;
}
export interface Pricing {
  billingEnabled: boolean;
  plans: PricePlan[];
  note: string;
  faq: { q: string; a: string }[];
}

export function pricing(config: AppConfig, foundingLeft: number | null): Pricing {
  const plans = config.plans;
  const std = plans.standard;
  const plus = plans.premium;
  const extras: PricePlan["extras"] = [];
  if (std.foundingOffer && foundingLeft !== 0) {
    const f = std.foundingOffer;
    extras.push({
      label: `${f.renewalDiscountPercent ? "Za" : "Prvo leto za"} prvih ${f.customers} strank${foundingLeft !== null ? ` · ${placesLeft(foundingLeft)}` : ""}`,
      value: f.renewalDiscountPercent ? `Prvo leto ${wholeEur.format(f.firstYearEur)}, nato ${f.renewalDiscountPercent} % popusta za vedno` : wholeEur.format(f.firstYearEur),
    });
  }
  extras.push({ label: "Postavitev skupaj z vami, po želji", value: `${wholeEur.format(std.setupService.eur)} enkratno` });
  return {
    billingEnabled: billingEnabled(config),
    plans: [
      {
        key: "preview",
        name: "Predogled",
        price: wholeEur.format(0),
        per: "",
        alt: null,
        lead: "Da vidite, kaj dobite. Za objavo izberite paket.",
        lines: [
          "Prva domača stran brez prijave",
          `Z e-pošto še ${moreHomepages(config.tiers.free.homepages)} in ${chatEdits(config.tiers.free.chatEdits)}`,
          "Ogled na telefonu in računalniku",
          "Kartice ne potrebujete",
        ],
        extras: [],
        featured: false,
      },
      {
        key: "standard",
        name: std.name,
        price: wholeEur.format(std.yearlyEur),
        per: "na leto",
        alt: `${std.yearlyIncludesDomain ? "Domena vključena · " : ""}ali ${wholeEur.format(std.monthlyEur)} na mesec`,
        lead: "Celotna stran, ki jo vodite sami.",
        lines: [
          `Do ${std.site.maxPages} strani: ponudba, cenik, o nas, kontakt`,
          "Neomejeno urejanje, pomočnik vsak mesec",
          "Objava in gostovanje",
          "Stran lahko kadarkoli prenesete",
          `${pictures(std.site.generatedPicturesPerMonth)} na mesec, kjer fotografij manjka`,
        ],
        extras,
        featured: true,
      },
      {
        key: "premium",
        name: plus.name,
        price: wholeEur.format(plus.yearlyEur),
        per: "na leto",
        alt: `${plus.yearlyIncludesDomain ? "Domena vključena · " : ""}ali ${wholeEur.format(plus.monthlyEur)} na mesec`,
        lead: `Vse iz paketa ${std.name} in še:`,
        lines: [
          `Do ${plus.site.maxPages} strani`,
          `${pictures(plus.site.generatedPicturesPerMonth)} na mesec`,
          "Več sprememb s pomočnikom vsak mesec",
          ...(plus.setupService.includedYearly ? ["Letni paket: postavitev skupaj z vami vključena"] : []),
          "Odgovor na vprašanja isti dan",
          `Stran v ${plus.site.locales} jezikih`,
          "Novice, dogodki, storitve in ekipa",
        ],
        extras: [],
        featured: false,
      },
    ],
    // No billing until the legal entity exists (config plans.billingEnabled; env BILLING_ENABLED=true on staging).
    note: billingEnabled(config)
      ? "Cene so z DDV. Plačate s kartico, mesečno ali letno, in stran objavite takoj po plačilu. Naročnino lahko kadarkoli prekličete, velja do konca plačanega obdobja."
      : "Načrtovane cene z DDV. Zaenkrat ničesar ne zaračunamo. Plačevali boste s kartico, mesečno ali letno; naročnino boste lahko kadarkoli preklicali do konca plačanega obdobja.",
    faq: faq(config).map(([q, a]) => ({ q, a })),
  };
}

/** The founding offer's places left: its size (config) minus the places the admin gave (allow_list.founding_at). */
export async function foundingLeftNow(config: AppConfig, repo: Repo): Promise<number | null> {
  const f = config.plans.standard.foundingOffer;
  return f ? Math.max(0, f.customers - (await repo.accounts.foundingTaken())) : null;
}

/** The homepage's origins: https://<PLATFORM_DOMAIN> and its www. */
export const homeOrigins = (platformDomain: string | null) => new Set(platformDomain ? [`https://${platformDomain}`, `https://www.${platformDomain}`] : []);

export function registerPricingRoutes(app: Hono<AppEnv>, deps: { repo: Repo; config: AppConfig; platformDomain: string | null }): void {
  const origins = homeOrigins(deps.platformDomain);
  // A GET without credentials: the homepage may read it, other sites can't (no CORS header for them).
  app.get("/api/cenik", async (c) => {
    const origin = c.req.header("origin");
    if (origin && origins.has(origin)) c.header("Access-Control-Allow-Origin", origin);
    c.header("Vary", "Origin");
    c.header("Cache-Control", "public, max-age=300");
    return c.json(pricing(deps.config, await foundingLeftNow(deps.config, deps.repo)));
  });
}
