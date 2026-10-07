import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@sb/config";
import { Repo, createDb, migrate } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import {
  ModelClient,
  allowancePeriod,
  applyChatEdit,
  defaultSection,
  generatedImageCount,
  limitBreach,
  limitMessage,
  limitsInfo,
  pageCount,
  pictureBudget,
  picturesInfo,
  picturesNotice,
  siteLimits,
  type ModelTransport,
} from "../src/index.ts";

/**
 * Per-plan site limits (it-plan-limits) and the upsell texts that name the next plan (it-upsells): pages, languages
 * and collections at their boundaries, growth only, the per-tier picture count, and a chat edit the plan refuses.
 * No model calls: the chat edit's model is a stand-in returning a fixed patch.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
const std = config.plans.standard;
const plus = config.plans.premium;
let golden: SiteSpec;

beforeAll(async () => {
  golden = JSON.parse(await readFile(path.join(here, "../../../tools/eval/golden/pekarna-kvas.json"), "utf8")) as SiteSpec;
});

/** The bakery with `n` home and standard pages (the golden has the homepage only). */
function withPages(n: number): SiteSpec {
  const spec = structuredClone(golden);
  const home = spec.pages.filter((p) => p.kind === "home");
  const system = spec.pages.filter((p) => p.kind !== "home" && p.kind !== "standard");
  const extra = Array.from({ length: n - 1 }, (_, i) => {
    const header = defaultSection(spec, "page-header", `s_extra_${i + 1}_head`) as unknown as SiteSpec["pages"][number]["sections"][number];
    return { id: `p_extra_${i + 1}`, kind: "standard" as const, slug: `stran-${i + 1}`, nav: { label: `Stran ${i + 1}`, show: true }, seo: { title: `Stran ${i + 1}`, description: "Stran" }, sections: [header] };
  });
  spec.pages = [...home, ...extra, ...system];
  return spec;
}
const withEnglish = (spec: SiteSpec): SiteSpec => ({ ...spec, locales: { default: "sl", enabled: ["sl", "en"] } });
const withBlog = (spec: SiteSpec): SiteSpec => ({ ...spec, collections: { blog: { page: spec.pages[0]!.id, items: [] } } as unknown as SiteSpec["collections"] });

describe("config (it-plan-limits)", () => {
  it("has the plans' limits: pages 8 / 20, languages 1 / 2, pictures 3 / 10; collections only in Plus", () => {
    expect([std.site.maxPages, plus.site.maxPages]).toEqual([8, 20]);
    expect([std.site.locales, plus.site.locales]).toEqual([1, 2]);
    expect([std.site.generatedPicturesPerMonth, plus.site.generatedPicturesPerMonth]).toEqual([3, 10]);
    expect(std.site.collections).toEqual([]);
    expect(plus.site.collections).toEqual(["blog", "events", "services", "team"]);
    // A free preview is the homepage in one language, and makes fewer generated pictures than a paid homepage.
    expect(config.plans.freePreview.pages).toEqual(["home"]);
    expect(config.plans.freePreview.locales).toBe(1);
    expect(config.imageGen.pipeline.fillUpToFree).toBeLessThan(config.imageGen.pipeline.fillUpTo.home);
  });

  it("fits Plus's pages in the spec (v13 holds 24 pages: its 20 plus privacy, accessibility and 404)", () => {
    expect(pageCount(withPages(plus.site.maxPages))).toBe(20);
    expect(withPages(plus.site.maxPages).pages.length).toBeLessThanOrEqual(24);
  });
});

describe("pages", () => {
  it("Osnovni: the 8th page is fine, the 9th is refused and names Plus", () => {
    expect(limitBreach(config, "paid", "standard", withPages(7), withPages(8))).toBeNull();
    const b = limitBreach(config, "paid", "standard", withPages(8), withPages(9))!;
    expect(b.code).toBe("plan_pages");
    expect(b.upgrade).toEqual({ plan: "premium", name: "Plus", monthlyEur: 29 });
    expect(b.message).toBe("Paket Osnovni ima največ 8 strani. Paket Plus (29 € na mesec) jih ima do 20.");
  });

  it("Plus: the 20th page is fine, the 21st is refused with nothing more to sell", () => {
    expect(limitBreach(config, "paid", "premium", withPages(8), withPages(9))).toBeNull();
    expect(limitBreach(config, "paid", "premium", withPages(19), withPages(20))).toBeNull();
    const b = limitBreach(config, "paid", "premium", withPages(20), withPages(21))!;
    expect(b.upgrade).toBeNull();
    expect(b.message).toBe("Paket Plus ima največ 20 strani. Izbrišite stran, ki je ne potrebujete, in dodajte novo.");
  });

  it("a free preview is its homepage: a second page names Osnovni and what it adds", () => {
    for (const tier of ["anonymous", "free"] as const) {
      const b = limitBreach(config, tier, null, withPages(1), withPages(2))!;
      expect(b.upgrade?.plan).toBe("standard");
      expect(b.message).toBe("Brezplačni predogled je domača stran. Z naročnino Osnovni (15 € na mesec) dobite do 8 strani, objavo na svoji domeni in pomočnika vsak mesec.");
    }
  });

  it("refuses only growth: a site already over its plan's pages can be edited and trimmed", () => {
    expect(limitBreach(config, "paid", "standard", withPages(10), withPages(10))).toBeNull();
    expect(limitBreach(config, "paid", "standard", withPages(10), withPages(9))).toBeNull();
    expect(limitBreach(config, "paid", "standard", withPages(10), withPages(11))?.code).toBe("plan_pages");
  });

  it("the admin has no limits", () => {
    expect(siteLimits(config, "admin", null)).toBeNull();
    expect(limitBreach(config, "admin", null, withPages(8), withEnglish(withBlog(withPages(9))))).toBeNull();
    expect(limitsInfo(config, "admin", null)).toBeNull();
  });
});

describe("languages", () => {
  it("Osnovni: one language; a second one is refused and names Plus; Plus takes it", () => {
    const b = limitBreach(config, "paid", "standard", golden, withEnglish(golden))!;
    expect(b.code).toBe("plan_locales");
    expect(b.message).toBe("Paket Osnovni ima stran v enem jeziku. Paket Plus (29 € na mesec) ima stran v dveh jezikih, na primer v slovenščini in angleščini.");
    expect(limitBreach(config, "paid", "premium", golden, withEnglish(golden))).toBeNull();
  });

  it("a free preview in a second language names Plus, the first plan with two", () => {
    const b = limitBreach(config, "free", null, golden, withEnglish(golden))!;
    expect(b.upgrade?.plan).toBe("premium");
    expect(b.message).toBe("Brezplačni predogled je v enem jeziku. Paket Plus (29 € na mesec) ima stran v dveh jezikih, na primer v slovenščini in angleščini.");
  });
});

describe("collections (the blog and the rest are Plus)", () => {
  it("Osnovni switching the blog on is refused and names Plus; Plus may", () => {
    const b = limitBreach(config, "paid", "standard", golden, withBlog(golden))!;
    expect(b.code).toBe("plan_collections");
    expect(b.message).toBe("Novice so v paketu Plus (29 € na mesec).");
    expect(limitBreach(config, "paid", "premium", golden, withBlog(golden))).toBeNull();
    // A blog that is already there (switched on before) and left as it is doesn't stop other edits.
    expect(limitBreach(config, "paid", "standard", withBlog(golden), withBlog(golden))).toBeNull();
  });

  it("names each collection in Slovene, for a free preview too", () => {
    expect(limitMessage(config, "paid", "standard", "collections", "team").message).toBe("Ekipa kot seznam je v paketu Plus (29 € na mesec).");
    expect(limitMessage(config, "free", null, "collections", "events").message).toBe("Brezplačni predogled je domača stran. Dogodki so v paketu Plus (29 € na mesec).");
  });

  it("the editor's notes: what each button reads at its limit", () => {
    const info = limitsInfo(config, "paid", "standard")!;
    expect(info.planName).toBe("Osnovni");
    expect(info.pagesNote.upgrade?.name).toBe("Plus");
    expect(info.localesNote.upgrade?.name).toBe("Plus");
    expect(Object.keys(info.collectionNotes).sort()).toEqual(["blog", "events", "services", "team"]);
    expect(Object.keys(info.readOnlyNotes).sort()).toEqual(["blog", "events", "services", "team"]);
    expect(info.readOnlyNotes.team).toEqual({
      message: "Vnosi zbirke Ekipa ostanejo na strani, kot so. Dodajate, urejate, brišete in razvrščate jih lahko na paketu Plus (29 € na mesec).",
      upgrade: { plan: "premium", name: "Plus", monthlyEur: 29 },
    });
    const top = limitsInfo(config, "paid", "premium")!;
    expect(top.collectionNotes).toEqual({});
    expect(top.readOnlyNotes).toEqual({});
    expect(top.pagesNote.upgrade).toBeNull();
  });
});

describe("a collection kept from Plus is read-only below Plus (sb-collection-downgrade)", () => {
  const post = (title: string) => ({ title, date: "2026-10-02", summary: "Nov kruh v ponudbi.", body: ["Pečemo ga ob petkih."] });
  /** The bakery with news of these posts, and optionally English for the first post's title. */
  const news = (titles: string[], english?: string): SiteSpec => ({
    ...withEnglish(golden),
    collections: { blog: { page: golden.pages[0]!.id, items: titles.map(post) } } as unknown as SiteSpec["collections"],
    ...(english ? { translations: { en: { "/collections/blog/items/0/title": english } } } : {}),
  });
  const READ_ONLY = "Vnosi zbirke Novice ostanejo na strani, kot so. Dodajate, urejate, brišete in razvrščate jih lahko na paketu Plus (29 € na mesec).";
  const refused = (before: SiteSpec, after: SiteSpec) => limitBreach(config, "paid", "standard", before, after);

  it("refuses adding, editing, deleting and reordering entries on Osnovni, naming Plus; Plus and the admin may", () => {
    const base = news(["Rženi kruh", "Dan odprtih vrat"]);
    const cases: Record<string, SiteSpec> = {
      add: news(["Rženi kruh", "Dan odprtih vrat", "Božični kruh"]),
      edit: news(["Rženi kruh ob petkih", "Dan odprtih vrat"]),
      delete: news(["Rženi kruh"]),
      reorder: news(["Dan odprtih vrat", "Rženi kruh"]),
    };
    for (const [what, after] of Object.entries(cases)) {
      const b = refused(base, after);
      expect(b, what).toMatchObject({ what: "collections", code: "plan_collections", message: READ_ONLY, upgrade: { plan: "premium", name: "Plus", monthlyEur: 29 } });
      expect(limitBreach(config, "paid", "premium", base, after), what).toBeNull();
      expect(limitBreach(config, "admin", null, base, after), what).toBeNull();
    }
  });

  it("refuses changing an entry's English; keeps other edits, removing the collection or the language allowed", () => {
    const base = news(["Rženi kruh"], "Rye bread");
    expect(refused(base, news(["Rženi kruh"], "Rye bread on Fridays"))?.message).toBe(READ_ONLY);
    expect(refused(base, news(["Rženi kruh"]))?.message).toBe(READ_ONLY);
    // The same data in another key order (as the database returns it) is no change.
    const reordered = structuredClone(base);
    reordered.collections!.blog = { items: base.collections!.blog!.items.map((p) => ({ body: p.body, summary: p.summary, date: p.date, title: p.title })), page: base.collections!.blog!.page };
    expect(refused(base, reordered)).toBeNull();
    // Another edit leaves the collection as it was.
    const renamed = structuredClone(base);
    renamed.business.name = "Pekarna Kvas d.o.o.";
    expect(refused(base, renamed)).toBeNull();
    // Removing the collection whole is not growth; neither is dropping the second language with its translations.
    const { collections: _gone, ...without } = base;
    expect(refused(base, without as SiteSpec)).toBeNull();
    const { translations: _t, ...sl } = base;
    expect(refused(base, { ...sl, locales: { default: "sl", enabled: ["sl"] } } as SiteSpec)).toBeNull();
  });

  it("words each collection, and a plan that has none above it", () => {
    for (const [kind, name] of [["events", "Dogodki"], ["services", "Storitve"]] as const)
      expect(limitsInfo(config, "paid", "standard")!.readOnlyNotes[kind]?.message).toBe(`Vnosi zbirke ${name} ostanejo na strani, kot so. Dodajate, urejate, brišete in razvrščate jih lahko na paketu Plus (29 € na mesec).`);
    // A config where no plan has the blog: nothing to sell.
    const none = structuredClone(config);
    none.plans.premium.site.collections = none.plans.premium.site.collections.filter((k) => k !== "blog");
    expect(limitsInfo(none, "paid", "standard")!.readOnlyNotes.blog).toEqual({ message: "Vnosi zbirke Novice ostanejo na strani, kot so. V tem paketu jih ne morete urejati.", upgrade: null });
  });
});

describe("generated pictures", () => {
  it("a free preview fills fewer (the per-tier count); a paid homepage fills up to config", () => {
    const free = pictureBudget(config, "anonymous", "home");
    expect(free.fillTo).toBe(config.imageGen.pipeline.fillUpToFree);
    expect(generatedImageCount(config, 0, true, "home", free)).toEqual({ wanted: config.imageGen.pipeline.fillUpToFree, skipped: null });
    expect(generatedImageCount(config, 1, true, "home", pictureBudget(config, "free", "home")).wanted).toBe(0);
    expect(generatedImageCount(config, 0, true, "home", pictureBudget(config, "admin", "home")).wanted).toBe(config.imageGen.pipeline.fillUpTo.home);
  });

  it("a paid plan makes at most what is left of its month: 3 left → 3, 1 left → 1 (limited), 0 left → none", () => {
    const full = config.imageGen.pipeline.fillUpTo.full;
    expect(generatedImageCount(config, 0, true, "full", pictureBudget(config, "paid", "full", { plan: "standard", used: 0 }))).toEqual({ wanted: full, skipped: null });
    expect(generatedImageCount(config, 0, true, "full", pictureBudget(config, "paid", "full", { plan: "standard", used: 2 }))).toEqual({ wanted: 1, skipped: null, limited: { wanted: full } });
    expect(generatedImageCount(config, 0, true, "full", pictureBudget(config, "paid", "full", { plan: "standard", used: 3 }))).toEqual({ wanted: 0, skipped: null, limited: { wanted: full } });
    expect(pictureBudget(config, "paid", "full", { plan: "premium", used: 9 }).max).toBe(1);
  });

  it("words the owner's note and names Plus while Osnovni's month is used up", () => {
    expect(picturesNotice(config, "standard", 0, "4. 11. 2026")).toBe(
      "Ta mesec ste porabili vse ustvarjene slike paketa Osnovni (3), zato jih nova različica strani ne dobi. Nove so na voljo 4. 11. 2026. Paket Plus (29 € na mesec) vključuje 10 ustvarjenih slik na mesec.",
    );
    expect(picturesNotice(config, "standard", 1, "4. 11. 2026")).toContain("zato ima nova različica strani le 1 ustvarjeno sliko.");
    expect(picturesNotice(config, "premium", 0, "4. 11. 2026")).not.toContain("Paket Plus");
    const left = picturesInfo(config, "standard", 2, new Date("2026-11-04T10:00:00Z"), "4. 11. 2026");
    expect(left).toMatchObject({ used: 2, total: 3, left: 1, notice: null });
    expect(picturesInfo(config, "standard", 3, new Date("2026-11-04T10:00:00Z"), "4. 11. 2026").upgrade?.name).toBe("Plus");
  });

  it("counts months from the day paid rights started", () => {
    const since = new Date("2026-01-31T10:00:00Z");
    expect(allowancePeriod(since, new Date("2026-03-01T00:00:00Z"))).toMatchObject({ first: false, start: new Date("2026-02-28T10:00:00Z") });
  });
});

describe("a chat edit past the plan's limit", () => {
  let repo: Repo;
  beforeAll(async () => {
    const db = await createDb("pglite://memory");
    await migrate(db);
    repo = new Repo(db);
  });
  afterAll(async () => {
    await repo.db.close();
  });

  /** The edit model's stand-in: always answers with this patch. */
  const answering = (reply: string, patches: unknown[]): ModelTransport => ({
    send: async (_req, stage) => ({ text: JSON.stringify({ reply, patches }), stopReason: "end_turn", model: stage.model, usage: { input_tokens: 10, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } }),
  });

  it("is not saved: the plan's reason is the reply; within the plan it is saved", async () => {
    const site = await repo.createSite({ name: "Pekarna", slug: "pekarna-jezik", intake: { description: "Pekarna Kvas", photoAssetIds: [], scope: "home" } });
    await repo.saveSpec(site.id, { ...golden, slug: site.slug }, "generate");
    const client = new ModelClient({ config, transport: answering("Dodal sem angleščino.", [{ op: "replace", path: "/locales/enabled", value: ["sl", "en"] }]), spentToday: async () => 0, onCall: async () => undefined });
    const guard = (plan: "standard" | "premium") => (before: SiteSpec, after: SiteSpec) => limitBreach(config, "paid", plan, before, after)?.message ?? null;
    const msg = await repo.addChat(site.id, "user", "Dodaj angleščino");
    const refused = await applyChatEdit({ repo, client }, site.id, Number(msg.id), guard("standard"));
    expect(refused.version).toBeNull();
    expect(refused.reply).toMatch(/^Paket Osnovni ima stran v enem jeziku\. Paket Plus \(29 € na mesec\)/);
    expect((await repo.getSpec(site.id))!.spec.locales.enabled).toEqual(["sl"]);
    const again = await repo.addChat(site.id, "user", "Dodaj angleščino");
    const saved = await applyChatEdit({ repo, client }, site.id, Number(again.id), guard("premium"));
    expect(saved.version).not.toBeNull();
    expect((await repo.getSpec(site.id))!.spec.locales.enabled).toEqual(["sl", "en"]);
  });

  it("can't change a read-only collection's entries or their English on Osnovni; other chat edits are saved", async () => {
    const site = await repo.createSite({ name: "Pekarna", slug: "pekarna-novice", intake: { description: "Pekarna Kvas", photoAssetIds: [], scope: "home" } });
    // As Plus left it: two languages and news with one post and its English title.
    const kept: SiteSpec = {
      ...withEnglish(golden),
      slug: site.slug,
      collections: { blog: { page: golden.pages[0]!.id, items: [{ title: "Rženi kruh", date: "2026-10-02", summary: "Nov kruh v ponudbi.", body: ["Pečemo ga ob petkih."] }] } } as unknown as SiteSpec["collections"],
      translations: { en: { "/collections/blog/items/0/title": "Rye bread" } },
    };
    await repo.saveSpec(site.id, kept, "generate");
    const guard = (before: SiteSpec, after: SiteSpec) => limitBreach(config, "paid", "standard", before, after)?.message ?? null;
    const chat = async (text: string, patches: unknown[]) => {
      const client = new ModelClient({ config, transport: answering("Urejeno.", patches), spentToday: async () => 0, onCall: async () => undefined });
      const msg = await repo.addChat(site.id, "user", text);
      return applyChatEdit({ repo, client }, site.id, Number(msg.id), guard);
    };
    const enTitle = "/translations/en/~1collections~1blog~1items~10~1title";
    // The post's English: refused by the plan, the reply names Plus.
    const english = await chat("Prevedi naslov novice", [{ op: "replace", path: enTitle, value: "Rye bread on Fridays" }]);
    expect(english.version).toBeNull();
    expect(english.reply).toBe("Vnosi zbirke Novice ostanejo na strani, kot so. Dodajate, urejate, brišete in razvrščate jih lahko na paketu Plus (29 € na mesec).");
    // The post itself: chat never edits collections (any plan); not saved either.
    const entry = await chat("Spremeni naslov novice", [{ op: "replace", path: "/collections/blog/items/0/title", value: "Rženi kruh ob petkih" }]);
    expect(entry.version).toBeNull();
    let spec = (await repo.getSpec(site.id))!.spec;
    expect(spec.collections!.blog!.items[0]!.title).toBe("Rženi kruh");
    expect(spec.translations!.en!["/collections/blog/items/0/title"]).toBe("Rye bread");
    // Something else on the same site is saved, the news untouched.
    const other = await chat("Temnejši razdelek", [{ op: "replace", path: "/pages/0/sections/2/tone", value: "inverse" }]);
    expect(other, JSON.stringify(other)).toMatchObject({ issues: [] });
    expect(other.version).not.toBeNull();
    spec = (await repo.getSpec(site.id))!.spec;
    expect(spec.pages[0]!.sections[2]!.tone).toBe("inverse");
    expect(spec.collections).toEqual(kept.collections);
  });
});
