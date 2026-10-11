/**
 * Studio 0.5b edge fixtures as the studio reads them (tools/eval/fixtures-edge, invented fixture data): a base spec
 * standing in for today's pipeline output, the brief and the client's own text. There is no golden for these businesses
 * (a real pipeline run would cost a homepage generation each), so the base is a golden of the stand-in type (the shop
 * golden for the florist, the hairdresser golden for the tattoo studio, as the classifier would guess) with the business,
 * hours and contacts swapped in, its photos, logo and other pages taken out, every section that showed a photo or a fact
 * this business doesn't have removed, and a hero, a services list and a short text written by hand from the client's
 * own words. It is a stand-in for "today", not today's pipeline: the poc labels its shots so.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { repoRoot } from "@sb/config";
import { migrateSpec, validateSite, type Hours, type PresetBrief, type SiteSpec } from "@sb/spec";

export const EDGE_FIXTURES = ["cvetlicarna-zvoncek", "tattoo-crnilo"] as const;
export type EdgeFixture = (typeof EDGE_FIXTURES)[number];

interface EdgeBrief {
  description: string;
  facts: {
    name: string;
    phone: string;
    email: string;
    address: { street: string; postalCode: string; city: string };
    hours: { from: string; to: string; open?: string; close?: string; closed?: boolean }[];
  };
}

const HAND: Record<EdgeFixture, { golden: string; subtype?: string; sections: unknown[]; brief: PresetBrief; keepHours: boolean }> = {
  "cvetlicarna-zvoncek": {
    golden: "trgovina-oljka-in-sol",
    subtype: "florist",
    keepHours: true,
    sections: [
      { id: "s_hero_e", type: "hero-type", variant: "large", props: { headline: "Šopki iz sezonskega cvetja", intro: "Mala cvetličarna na Mestnem trgu v Škofji Loki, tik ob vodnjaku. Cvetje kupujem pri vrtnarjih iz Sorškega polja." } },
      {
        id: "s_services_e",
        type: "services-list",
        variant: "two-column",
        props: {
          title: "Kaj delam",
          items: [
            { name: "Šopki iz sezonskega cvetja", description: "Šopki, ki izgledajo kot da so nabrani na travniku." },
            { name: "Poročno cvetje", description: "Šopek za nevesto, gumbnice, okrasitev cerkve in mize." },
            { name: "Žalni aranžmaji in venci", description: "Po naročilu." },
            { name: "Lončnice za stanovanje", description: "Za dom in za darilo." },
          ],
        },
      },
      { id: "s_story_e", type: "text", variant: "two-column", props: { heading: "Cvetje iz Sorškega polja", paragraphs: ["Spomladi tulipane in narcise, poleti potonike in sončnice, jeseni dalije. Dostavljam po Škofji Loki in okolici."] } },
    ],
    brief: {
      summary: "Mala cvetličarna v Škofji Loki s šopki iz sezonskega cvetja z vrtnarij iz Sorškega polja.",
      highlights: ["pri vrtnarjih iz Sorškega polja", "Poročno cvetje naročite vsaj mesec dni prej", "Dostavljam po Škofji Loki in okolici"],
      offerings: [
        { name: "Sezonski šopek", price: { amount: 25, from: true } },
        { name: "Poročni šopek", price: { amount: 90, from: true } },
        { name: "Žalni venec", price: { amount: 70, from: true } },
        { name: "Lončnice za stanovanje" },
      ],
      facts: { people: [{ name: "Maja Kranjc", role: "cvetličarka" }] },
    },
  },
  "tattoo-crnilo": {
    golden: "frizerstvo-lana",
    keepHours: true,
    sections: [
      { id: "s_hero_e", type: "hero-type", variant: "large", props: { headline: "Tetovaže, narisane na novo za vas", intro: "Tattoo studio v Celju. Vsak motiv narišemo na novo za stranko." } },
      {
        id: "s_services_e",
        type: "services-list",
        variant: "two-column",
        props: { title: "Kaj delamo", items: [{ name: "Črno-sive tetovaže in fine line", description: "Luka Vidmar." }, { name: "Barvne tetovaže in ilustracije", description: "Rastline in živali, Tjaša Golob." }] },
      },
      { id: "s_story_e", type: "text", variant: "two-column", props: { heading: "Vsak motiv na novo", paragraphs: ["Ne delamo motivov iz kataloga in ne kopiramo tujih tetovaž. Posvet je brezplačen."] } },
    ],
    brief: {
      summary: "Tattoo studio v Celju, kjer vsak motiv narišejo na novo za stranko.",
      highlights: ["vsak motiv narišemo na novo za stranko", "posvet, ki je brezplačen", "igle za enkratno uporabo"],
      offerings: [{ name: "Črno-sive tetovaže in fine line" }, { name: "Barvne tetovaže in ilustracije" }, { name: "Mala tetovaža", price: { amount: 80, from: true } }],
      facts: { people: [{ name: "Luka Vidmar" }, { name: "Tjaša Golob" }] },
    },
  },
};

export function isEdgeFixture(id: string): id is EdgeFixture {
  return (EDGE_FIXTURES as readonly string[]).includes(id);
}

/** The edge fixture's stand-in base, brief and client text. Throws when the base doesn't validate. */
export function edgeFixture(id: EdgeFixture): { base: SiteSpec; brief: PresetBrief; description: string } {
  const h = HAND[id];
  const fx = JSON.parse(readFileSync(path.join(repoRoot, "tools/eval/fixtures-edge", id, "brief.json"), "utf8")) as EdgeBrief;
  const spec = migrateSpec(JSON.parse(readFileSync(path.join(repoRoot, "tools/eval/golden", `${h.golden}.json`), "utf8"))) as SiteSpec;
  const { name, phone, email, address, hours } = fx.facts;
  spec.slug = id;
  spec.business = { ...spec.business, name, phone, email, address: { ...address, country: "SI" } as never, hours: { entries: hours } as Hours };
  if (h.subtype) spec.business.subtype = h.subtype as never;
  else delete spec.business.subtype;
  delete spec.business.bookingUrl;
  delete spec.business.amenities;
  spec.assets.images = [];
  delete spec.assets.logo;
  spec.pages = spec.pages.filter((p) => p.kind !== "standard");
  const home = spec.pages.find((p) => p.kind === "home")!;
  home.sections = home.sections.filter((s) => !/"img_/.test(JSON.stringify(s)) && ["contact", "opening-hours"].includes(s.type) && (h.keepHours || s.type !== "opening-hours"));
  home.sections.unshift(...(h.sections as never[]));
  const v = validateSite(spec);
  if (!v.ok) throw new Error(`${id}: the stand-in base does not validate: ${v.issues.slice(0, 4).map((i) => `${i.path} ${i.message}`).join("; ")}`);
  return { base: v.spec, brief: h.brief, description: fx.description };
}
