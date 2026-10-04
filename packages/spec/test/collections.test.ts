import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type {
  Collections} from "../src/index.ts";
import {
  SPEC_VERSION,
  SiteSpec,
  collectionEntries,
  dateBadge,
  entryPages,
  entrySlugs,
  formatDateRange,
  formatLongDate,
  formatTimeRange,
  migrateSpec,
  plural,
  readingMinutes,
  slugifyTitle,
  validateSite,
  type Post,
} from "../src/index.ts";

const NBSP = " ";
const golden = () => migrateSpec(JSON.parse(readFileSync(new URL("../../../tools/eval/golden/pekarna-kvas.json", import.meta.url), "utf8")));

describe("Slovene dates in collections", () => {
  it("writes days in words with the month in the genitive", () => {
    expect(formatLongDate("2026-10-03")).toBe(`3.${NBSP}oktobra 2026`);
    expect(formatLongDate("2026-03-01")).toBe(`1.${NBSP}marca 2026`);
    expect(formatLongDate("2026-10-03", "en")).toBe(`3${NBSP}October 2026`);
  });

  it("writes a run of days with the shared month and year once", () => {
    expect(formatDateRange("2026-10-03", "2026-10-05")).toBe(`3.–5.${NBSP}oktobra 2026`);
    expect(formatDateRange("2026-09-30", "2026-10-02")).toBe(`30.${NBSP}septembra – 2.${NBSP}oktobra 2026`);
    expect(formatDateRange("2026-12-30", "2027-01-02")).toBe(`30.${NBSP}decembra 2026 – 2.${NBSP}januarja 2027`);
    expect(formatDateRange("2026-10-03", undefined)).toBe(`3.${NBSP}oktobra 2026`);
    expect(formatDateRange("2026-10-03", "2026-10-01")).toBe(`3.${NBSP}oktobra 2026`);
  });

  it("gives a calendar badge, times with a dot and reading time in minutes", () => {
    expect(dateBadge("2026-08-09")).toEqual({ day: "9", month: "avg." });
    expect(formatTimeRange("19:00", "21:30")).toBe("19.00–21.30");
    expect(formatTimeRange("09:00")).toBe("9.00");
    expect(readingMinutes(["beseda ".repeat(450)])).toBe(2);
    expect(readingMinutes(["kratko"])).toBe(1);
  });

  it("uses the dual and the plural forms (1 minuta, 2 minuti, 3 minute, 5 minut)", () => {
    const forms = { one: "minuta", two: "minuti", few: "minute", other: "minut" };
    expect([1, 2, 3, 4, 5, 101, 102, 103].map((n) => `${n} ${plural(n, forms)}`)).toEqual([
      "1 minuta",
      "2 minuti",
      "3 minute",
      "4 minute",
      "5 minut",
      "101 minuta",
      "102 minuti",
      "103 minute",
    ]);
  });
});

describe("entry page names", () => {
  it("are made from the title without č, š, ž and kept unique", () => {
    expect(slugifyTitle("Poletni tečaj plavanja 2026!")).toBe("poletni-tecaj-plavanja-2026");
    expect(slugifyTitle("Žganci & čaj")).toBe("zganci-caj");
    expect(slugifyTitle("???")).toBe("vnos");
    const post = (title: string, slug?: string): Post => ({ title, date: "2026-10-01", summary: "x", body: ["y"], ...(slug ? { slug } : {}) });
    expect(entrySlugs([post("Odprtje"), post("Odprtje"), post("Drugo", "odprtje-2"), post("Novo", "odprtje")])).toEqual(["odprtje-3", "odprtje-4", "odprtje-2", "odprtje"]);
  });
});

describe("collections in the spec (v12)", () => {
  const collections: Collections = {
    blog: {
      page: "p_novice",
      items: [
        { title: "Starejša novica", date: "2026-09-01", summary: "Povzetek.", body: ["Besedilo."] },
        { title: "Nova novica", date: "2026-10-01", summary: "Povzetek.", body: ["Besedilo."] },
      ],
    },
    events: {
      page: "p_novice",
      items: [
        { title: "Kasneje", date: "2026-12-01", summary: "x" },
        { title: "Prej", date: "2026-11-01", start: "18:00", summary: "x", body: ["Opis."] },
      ],
    },
    services: { page: "p_novice", items: [{ name: "Brez strani", summary: "x" }, { name: "S stranjo", summary: "x", body: ["Opis."] }] },
  };

  it("orders posts newest first and events soonest first; only entries with a body get a page", () => {
    expect(collectionEntries(collections, "blog").map((e) => e.entry.title)).toEqual(["Nova novica", "Starejša novica"]);
    expect(collectionEntries(collections, "events").map((e) => [e.entry.title, e.path])).toEqual([
      ["Prej", "dogodki/prej.html"],
      ["Kasneje", null],
    ]);
    expect(entryPages(collections).map((e) => e.path)).toEqual(["novice/nova-novica.html", "novice/starejsa-novica.html", "dogodki/prej.html", "storitve/s-stranjo.html"]);
  });

  it("validates a site that shows its collections, and refuses dangling references", () => {
    const spec = golden() as SiteSpec;
    const home = spec.pages[0]!;
    spec.pages.splice(1, 0, { id: "p_novice", kind: "standard", slug: "novice", nav: { label: "Novice", show: true }, seo: { title: "Novice", description: "Novice pekarne." }, sections: [{ id: "s_blog", type: "collection", variant: "list", props: { kind: "blog", title: "Novice" } }] });
    spec.collections = collections;
    expect(validateSite(spec).issues).toEqual([]);

    const broken = structuredClone(spec);
    broken.collections!.blog!.page = "p_missing";
    broken.collections!.blog!.items[0]!.image = "img_missing";
    home.sections.push({ id: "s_team", type: "collection", variant: "cards", props: { kind: "team", title: "Ekipa" } });
    broken.pages[0] = home;
    const messages = validateSite(broken).issues.map((i) => `${i.path} ${i.message}`);
    expect(messages).toContain("/collections/blog/page unknown page p_missing");
    expect(messages).toContain("/collections/blog/items/0/image unknown image img_missing");
    expect(messages.some((m) => m.includes("team collection is not set up"))).toBe(true);
  });

  it("migrates a v11 site unchanged", () => {
    const v11 = { ...JSON.parse(readFileSync(new URL("../../../tools/eval/golden/pekarna-kvas.json", import.meta.url), "utf8")), specVersion: 11 };
    const out = migrateSpec(v11);
    expect(out.specVersion).toBe(SPEC_VERSION);
    expect(out.collections).toBeUndefined();
    expect(SiteSpec.safeParse(out).success).toBe(true);
  });
});
