import { readFileSync } from "node:fs";
import { migrateSpec, type SiteSpec } from "@sb/spec";

/** Pekarna Kvas with a news page, a blog, events and services kept as collections. */
export function withCollections(): SiteSpec {
  const spec = migrateSpec(JSON.parse(readFileSync(new URL("../../../tools/eval/golden/pekarna-kvas.json", import.meta.url), "utf8"))) as SiteSpec;
  spec.pages.splice(1, 0, {
    id: "p_novice",
    kind: "standard",
    slug: "novice",
    nav: { label: "Novice", show: true },
    seo: { title: "Novice | Pekarna Kvas", description: "Novice in dogodki pekarne." },
    sections: [
      { id: "s_novice", type: "collection", variant: "list", props: { kind: "blog", title: "Novice" } },
      { id: "s_dogodki", type: "collection", variant: "cards", props: { kind: "events", title: "Dogodki" } },
    ],
  });
  spec.pages[0]!.sections.push({ id: "s_home_news", type: "collection", variant: "list", props: { kind: "blog", title: "Iz pekarne", limit: 1 } });
  spec.collections = {
    blog: {
      page: "p_novice",
      items: [
        { title: "Kvasni tečaj za začetnike", date: "2026-09-12", summary: "Prvi tečaj peke kruha.", body: ["Prvi odstavek.", "Drugi odstavek."], image: "img_02" },
        { title: "Nov rženi kruh", date: "2026-10-01", summary: "V ponudbi je rženi kruh.", body: ["Rženi kruh pečemo ob petkih."] },
      ],
    },
    events: {
      page: "p_novice",
      items: [
        { title: "Dan odprtih vrat", date: "2026-11-07", start: "10:00", end: "14:00", place: "Pekarna", summary: "Pridite pogledat peč.", body: ["Pokazali bomo peč."], price: { amount: 0 } },
        { title: "Pekovski sejem", date: "2026-10-20", endDate: "2026-10-22", summary: "Sejem v mestu." },
      ],
    },
  };
  return spec;
}
