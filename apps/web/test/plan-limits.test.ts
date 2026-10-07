import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@sb/config";
import { applyDirectEdit, startCollection } from "@sb/engine";
import { Repo, createDb, createFsStorage, memoryMailer, migrate, type JobData, type Platform, type Queue } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { createApp } from "../src/app.ts";
import { monthlyReportMail, plusNote } from "../src/stats.ts";
import { adminBrowser, newBrowser, ownerSignIn, type Browser, type Req } from "./session-helpers.ts";

/**
 * Per-plan limits at the API (it-plan-limits) and the upsells that name the next plan (it-upsells): pages (Osnovni 8,
 * Plus 20), languages (1 / 2), collections (Plus), a free preview's single page, generated pictures per month (the
 * generate endpoint's notice), the free preview's locked pages and the first plan's price, the founding offer's places
 * left on the landing page, and the monthly report's line about Plus. No model calls; the queue only records.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const PASSWORD = "test-password-1234";
const config = structuredClone(loadConfig());
config.limits.dailyModelSpendCapEur = 100;
const mail = memoryMailer();
const sent: { name: keyof JobData; data: JobData[keyof JobData] }[] = [];
let platform: Platform;
let dir: string;
let req: Req;
let golden: SiteSpec;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-plan-limits-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = {
    send: async (name, data) => {
      sent.push({ name, data });
      return `job_${sent.length}`;
    },
    work: async () => undefined,
    ping: async () => undefined,
    stop: async () => undefined,
  };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  const app = createApp({ platform, config, auth: { password: PASSWORD, secret: "s".repeat(32), secureCookies: false }, mailer: mail, appUrl: "https://stranko.example" });
  req = (p, init) => app.request(p, init);
  golden = JSON.parse(await readFile(path.join(here, "../../../tools/eval/golden/pekarna-kvas.json"), "utf8")) as SiteSpec;
});
afterAll(async () => {
  await platform.close();
  await rm(dir, { recursive: true, force: true });
});

/** The brief's plan of the site (what the pipeline stores before the content step): home and three more pages. */
const BRIEF = {
  name: "Pekarna Kvas",
  pages: [
    { kind: "home", slug: "", navLabel: "Domov", purpose: "" },
    { kind: "standard", slug: "ponudba", navLabel: "Ponudba", purpose: "" },
    { kind: "standard", slug: "o-nas", navLabel: "O nas", purpose: "" },
    { kind: "standard", slug: "kontakt", navLabel: "Kontakt", purpose: "" },
  ],
};

let seq = 0;
/** An account with this plan (null: free), signed in, and its site: the bakery's homepage. */
async function owner(plan: "standard" | "premium" | null): Promise<{ b: Browser; siteId: string; accountId: string }> {
  const email = `pekarna${++seq}@siol.net`;
  if (plan) await platform.repo.accounts.allow(email, email, null, plan);
  const b = await ownerSignIn(req, mail.sent, email);
  const accountId = (await platform.repo.accounts.byKey(email))!.id;
  const s = await platform.repo.createSite({ name: `p${seq}`, slug: `plan-limits-${seq}`, intake: { description: "Pekarna Kvas, Šutna 30, Kamnik.", photoAssetIds: [], scope: "home" }, accountId });
  await platform.repo.setBrief(s.id, BRIEF);
  await platform.repo.saveSpec(s.id, { ...golden, slug: s.slug }, "generate");
  await platform.repo.setStatus(s.id, "ready");
  return { b, siteId: s.id, accountId };
}

const json = (b: Browser) => ({ cookie: b.cookie, "content-type": "application/json" });
const version = async (siteId: string) => (await platform.repo.getSpec(siteId))!.version;
const addPage = async (b: Browser, siteId: string, i: number) =>
  req(`/api/sites/${siteId}/pages`, { method: "POST", headers: json(b), body: JSON.stringify({ baseVersion: await version(siteId), slug: `stran-${i}`, label: `Stran ${i}` }) });
const patch = async (b: Browser, siteId: string, ops: unknown[]) => req(`/api/sites/${siteId}/patch`, { method: "POST", headers: json(b), body: JSON.stringify({ baseVersion: await version(siteId), ops }) });
type Refused = { code: string; message: string; upgrade: { plan: string; name: string; monthlyEur: number } | null };
const state = async (b: Browser, siteId: string) => (await (await req(`/api/sites/${siteId}`, { headers: { cookie: b.cookie } })).json()) as { access: Record<string, unknown> & { limits: Record<string, unknown> | null; lockedPages: string[]; offer: { text: string } | null; pictures: { used: number; total: number; left: number; short: boolean; notice: string | null } | null } };
const navPages = async (siteId: string) => (await platform.repo.getSpec(siteId))!.spec.pages.filter((p) => p.kind === "home" || p.kind === "standard").length;

describe("pages", () => {
  it("Osnovni adds pages up to 8; the 9th is refused, by any path, naming Plus", async () => {
    const { b, siteId } = await owner("standard");
    for (let i = 2; i <= 8; i++) expect((await addPage(b, siteId, i)).status, `page ${i}`).toBe(200);
    expect(await navPages(siteId)).toBe(8);
    const ninth = await addPage(b, siteId, 9);
    expect(ninth.status).toBe(403);
    const body = (await ninth.json()) as Refused;
    expect(body.code).toBe("plan_pages");
    expect(body.message).toBe("Paket Osnovni ima največ 8 strani. Paket Plus (29 € na mesec) jih ima do 20.");
    expect(body.upgrade).toEqual({ plan: "premium", name: "Plus", monthlyEur: 29 });
    // The generic patch path is held to the same limit (a copied page).
    const spec = (await platform.repo.getSpec(siteId))!.spec;
    const copy = { ...spec.pages[1]!, id: "p_kopija", slug: "kopija", nav: { label: "Kopija", show: true }, sections: spec.pages[1]!.sections.map((s) => ({ ...s, id: `${s.id}_kopija` })) };
    expect((await patch(b, siteId, [{ op: "add", path: "/pages/1", value: copy }])).status).toBe(403);
    expect(await navPages(siteId)).toBe(8);
    // Removing a page is never refused, and makes room again.
    expect((await patch(b, siteId, [{ op: "remove", path: "/pages/1" }])).status).toBe(200);
    expect((await addPage(b, siteId, 10)).status).toBe(200);
  });

  it("Plus adds pages up to 20; the 21st is refused with nothing more to sell", async () => {
    const { b, siteId } = await owner("premium");
    for (let i = 2; i <= 20; i++) expect((await addPage(b, siteId, i)).status, `page ${i}`).toBe(200);
    expect(await navPages(siteId)).toBe(20);
    const over = await addPage(b, siteId, 21);
    expect(over.status).toBe(403);
    const body = (await over.json()) as Refused;
    expect(body.upgrade).toBeNull();
    expect(body.message).toBe("Paket Plus ima največ 20 strani. Izbrišite stran, ki je ne potrebujete, in dodajte novo.");
  }, 60_000);

  it("a free account's preview is its homepage: a second page names Osnovni", async () => {
    const { b, siteId } = await owner(null);
    const r = await addPage(b, siteId, 2);
    expect(r.status).toBe(403);
    const body = (await r.json()) as Refused;
    expect(body.message).toMatch(/^Brezplačni predogled je domača stran\. Z naročnino Osnovni \(15 € na mesec\) dobite do 8 strani/);
    expect(body.upgrade?.plan).toBe("standard");
    // Text edits are never limited.
    expect((await patch(b, siteId, [{ op: "replace", path: "/pages/0/nav/label", value: "Domov" }])).status).toBe(200);
  });
});

describe("languages", () => {
  const english = [{ op: "replace", path: "/locales/enabled", value: ["sl", "en"] }];
  it("Osnovni has one language: a second is refused naming Plus; Plus has two", async () => {
    const osnovni = await owner("standard");
    const r = await patch(osnovni.b, osnovni.siteId, english);
    expect(r.status).toBe(403);
    expect(((await r.json()) as Refused).message).toBe("Paket Osnovni ima stran v enem jeziku. Paket Plus (29 € na mesec) ima stran v dveh jezikih, na primer v slovenščini in angleščini.");
    const plus = await owner("premium");
    expect((await patch(plus.b, plus.siteId, english)).status).toBe(200);
    expect((await platform.repo.getSpec(plus.siteId))!.spec.locales.enabled).toEqual(["sl", "en"]);
  });
});

describe("collections (Plus)", () => {
  it("Osnovni switching the blog on is refused naming Plus; Plus switches it on", async () => {
    const osnovni = await owner("standard");
    const r = await req(`/api/sites/${osnovni.siteId}/collections`, { method: "POST", headers: json(osnovni.b), body: JSON.stringify({ baseVersion: await version(osnovni.siteId), kind: "blog" }) });
    expect(r.status).toBe(403);
    expect(((await r.json()) as Refused).message).toBe("Novice so v paketu Plus (29 € na mesec).");
    const plus = await owner("premium");
    const ok = await req(`/api/sites/${plus.siteId}/collections`, { method: "POST", headers: json(plus.b), body: JSON.stringify({ baseVersion: await version(plus.siteId), kind: "blog" }) });
    expect(ok.status).toBe(200);
  });

  /** The bakery with its news switched on and one post, saved as the site's next version (as Plus left it). */
  const withNews = async (siteId: string) => {
    const spec = structuredClone((await platform.repo.getSpec(siteId))!.spec);
    const ops = startCollection(spec, "blog");
    if ("error" in ops) throw new Error(ops.error);
    const r = applyDirectEdit(spec, ops);
    r.spec.collections!.blog!.items.push({ title: "Rženi kruh ob petkih", date: "2026-10-02", summary: "Nov kruh v ponudbi.", body: ["Pečemo ga ob petkih zjutraj."] });
    await platform.repo.saveSpec(siteId, r.spec, "manual", "novice");
    return r.spec;
  };

  describe("a blog kept from Plus is read-only on Osnovni (sb-collection-downgrade)", () => {
    const READ_ONLY = "Vnosi zbirke Novice ostanejo na strani, kot so. Dodajate, urejate, brišete in razvrščate jih lahko na paketu Plus (29 € na mesec).";
    const open = { title: "Dan odprtih vrat", date: "2026-11-07", summary: "Ogled peči.", body: ["Pridite v soboto."] };
    /** Osnovni with the news as Plus left them: two posts. */
    const kept = async (plan: "standard" | "premium" = "standard") => {
      const o = await owner(plan);
      const spec = structuredClone(await withNews(o.siteId));
      spec.collections!.blog!.items.push(open);
      await platform.repo.saveSpec(o.siteId, spec, "manual", "novice");
      return o;
    };
    const titles = async (siteId: string) => (await platform.repo.getSpec(siteId))!.spec.collections!.blog!.items.map((i) => i.title);
    const refusedAs = async (r: Response) => {
      expect(r.status).toBe(403);
      expect((await r.json()) as Refused).toEqual({ error: "plan_collections", code: "plan_collections", message: READ_ONLY, upgrade: { plan: "premium", name: "Plus", monthlyEur: 29 } });
    };

    it("refuses adding, editing, deleting and reordering posts, naming Plus; nothing changes", async () => {
      const { b, siteId } = await kept();
      const v = await version(siteId);
      const edits: Record<string, unknown[]> = {
        add: [{ op: "add", path: "/collections/blog/items/2", value: { ...open, title: "Božični kruh" } }],
        edit: [{ op: "replace", path: "/collections/blog/items/0/title", value: "Rženi kruh" }],
        delete: [{ op: "remove", path: "/collections/blog/items/1" }],
        reorder: [{ op: "move", from: "/collections/blog/items/1", path: "/collections/blog/items/0" }],
        // The editor's form saves the whole list at once.
        "whole list": [{ op: "replace", path: "/collections/blog/items", value: [open] }],
      };
      for (const [what, ops] of Object.entries(edits)) {
        const r = await patch(b, siteId, ops);
        expect(r.status, what).toBe(403);
        await refusedAs(r);
      }
      expect(await titles(siteId)).toEqual(["Rženi kruh ob petkih", "Dan odprtih vrat"]);
      expect(await version(siteId)).toBe(v);
      // Plus edits the same posts.
      const plus = await kept("premium");
      expect((await patch(plus.b, plus.siteId, edits.reorder!)).status).toBe(200);
      expect(await titles(plus.siteId)).toEqual(["Dan odprtih vrat", "Rženi kruh ob petkih"]);
    });

    it("refuses a post's English while the site keeps two languages from Plus", async () => {
      const { b, siteId } = await kept();
      const spec = structuredClone((await platform.repo.getSpec(siteId))!.spec);
      spec.locales = { default: "sl", enabled: ["sl", "en"] };
      spec.translations = { en: { "/collections/blog/items/0/title": "Rye bread on Fridays" } };
      await platform.repo.saveSpec(siteId, spec, "manual", "angleščina");
      await refusedAs(await patch(b, siteId, [{ op: "add", path: "/translations/en/~1collections~1blog~1items~10~1title", value: "Rye bread" }]));
      await refusedAs(await patch(b, siteId, [{ op: "remove", path: "/translations/en/~1collections~1blog~1items~10~1title" }]));
      // English elsewhere on the site is not the collection's.
      expect((await patch(b, siteId, [{ op: "add", path: "/translations/en/~1pages~10~1nav~1label", value: "Home" }])).status).toBe(200);
    });

    it("refuses an undo or a restored version that would change the posts; one that leaves them as they are is fine", async () => {
      const { b, siteId } = await kept();
      const both = await version(siteId);
      // An older version with only the first post, and a later text edit that leaves the news alone.
      const onePost = both - 1;
      expect((await patch(b, siteId, [{ op: "replace", path: "/pages/0/nav/label", value: "Začetek" }])).status).toBe(200);
      await refusedAs(await req(`/api/sites/${siteId}/revert`, { method: "POST", headers: json(b), body: JSON.stringify({ version: onePost }) }));
      expect(await titles(siteId)).toEqual(["Rženi kruh ob petkih", "Dan odprtih vrat"]);
      // Undo of the text edit: the news are the same in that version.
      expect((await req(`/api/sites/${siteId}/revert`, { method: "POST", headers: json(b), body: JSON.stringify({ version: both }) })).status).toBe(200);
      expect((await platform.repo.getSpec(siteId))!.spec.pages[0]!.nav.label).toBe("Domov");
    });

    it("other edits go through; removing the news whole (the collection and its page) is allowed", async () => {
      const { b, siteId } = await kept();
      expect((await patch(b, siteId, [{ op: "replace", path: "/pages/0/nav/label", value: "Začetek" }])).status).toBe(200);
      const spec = (await platform.repo.getSpec(siteId))!.spec;
      const pageIndex = spec.pages.findIndex((p) => p.id === spec.collections!.blog!.page);
      const r = await patch(b, siteId, [{ op: "remove", path: `/pages/${pageIndex}` }, { op: "remove", path: "/collections/blog" }]);
      expect(r.status, await r.clone().text()).toBe(200);
      expect((await platform.repo.getSpec(siteId))!.spec.collections?.blog).toBeUndefined();
    });

    it("still renders on the preview (list and post pages); the editor gets the read-only note", async () => {
      const { b, siteId } = await kept();
      const list = await req(`/preview/${siteId}/novice.html`, { headers: { cookie: b.cookie } });
      expect(list.status).toBe(200);
      const html = await list.text();
      expect(html).toContain("Rženi kruh ob petkih");
      expect(html).toContain("Dan odprtih vrat");
      const post = await req(`/preview/${siteId}/novice/rzeni-kruh-ob-petkih.html`, { headers: { cookie: b.cookie } });
      expect(post.status).toBe(200);
      expect(await post.text()).toContain(">Rženi kruh ob petkih</h1>");
      const limits = (await state(b, siteId)).access.limits!;
      expect(limits.readOnlyNotes).toMatchObject({ blog: { message: READ_ONLY, upgrade: { name: "Plus" } } });
      // The switch-on button's note for a collection the site doesn't have is unchanged.
      expect(limits.collectionNotes).toMatchObject({ events: { message: "Dogodki so v paketu Plus (29 € na mesec)." } });
    });
  });

  it("restoring an old version is held to the plan: Osnovni can't bring a blog back, Plus can", async () => {
    for (const [plan, status] of [["standard", 403], ["premium", 200]] as const) {
      const { b, siteId } = await owner(plan);
      const before = await version(siteId);
      await withNews(siteId);
      // The blog's version, then one without it (the generated site again).
      const withBlog = await version(siteId);
      await platform.repo.saveSpec(siteId, { ...golden, slug: (await platform.repo.getSpec(siteId, before))!.spec.slug }, "generate");
      const r = await req(`/api/sites/${siteId}/revert`, { method: "POST", headers: json(b), body: JSON.stringify({ version: withBlog }) });
      expect(r.status, plan).toBe(status);
      if (status === 403) {
        const body = (await r.json()) as Refused;
        expect(body).toMatchObject({ code: "plan_collections", message: "Novice so v paketu Plus (29 € na mesec).", upgrade: { plan: "premium" } });
        expect((await platform.repo.getSpec(siteId))!.spec.collections).toBeUndefined();
      } else expect((await platform.repo.getSpec(siteId))!.spec.collections?.blog).toBeDefined();
    }
  });
});

describe("collection entries in English (Plus, it-collection-translations)", () => {
  const ptr = "/collections/blog/items/0/title";
  const at = (p: string) => p.replace(/~/g, "~0").replace(/\//g, "~1");

  it("the editor's operations write, change and remove an entry's English; the preview shows it under en/", async () => {
    const { b, siteId } = await owner("premium");
    expect((await patch(b, siteId, [{ op: "replace", path: "/locales/enabled", value: ["sl", "en"] }])).status).toBe(200);
    await withNewsAt(siteId);
    const guard = { op: "test", path: ptr, value: "Rženi kruh ob petkih" };
    // The first translation creates the overlay; the next ones add to it.
    expect((await patch(b, siteId, [guard, { op: "add", path: "/translations", value: { en: { [ptr]: "Rye bread on Fridays" } } }])).status).toBe(200);
    expect((await patch(b, siteId, [{ op: "test", path: "/collections/blog/items/0/body/0", value: "Pečemo ga ob petkih zjutraj." }, { op: "add", path: `/translations/en/${at("/collections/blog/items/0/body/0")}`, value: "We bake it on Friday mornings — early." }])).status).toBe(200);
    const spec = (await platform.repo.getSpec(siteId))!.spec;
    // Em dashes are repaired as in Slovene text.
    expect(spec.translations!.en).toEqual({ [ptr]: "Rye bread on Fridays", "/collections/blog/items/0/body/0": "We bake it on Friday mornings – early." });
    const page = await req(`/preview/${siteId}/en/novice/rzeni-kruh-ob-petkih.html`, { headers: { cookie: b.cookie } });
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain(">Rye bread on Fridays</h1>");
    expect(html).toContain('<html lang="en">');
    // The Slovene page keeps its own title and file name.
    expect(await (await req(`/preview/${siteId}/novice/rzeni-kruh-ob-petkih.html`, { headers: { cookie: b.cookie } })).text()).toContain(">Rženi kruh ob petkih</h1>");
    // A translation aimed at text that changed meanwhile is refused, not written onto another entry.
    expect((await patch(b, siteId, [{ op: "test", path: ptr, value: "Drug naslov" }, { op: "add", path: `/translations/en/${at(ptr)}`, value: "Other" }])).status).toBe(422);
    // Emptied: the overlay goes and the English page shows the Slovene title.
    expect((await patch(b, siteId, [guard, { op: "remove", path: `/translations/en/${at(ptr)}` }])).status).toBe(200);
    expect((await platform.repo.getSpec(siteId))!.spec.translations!.en![ptr]).toBeUndefined();
  });

  it("Osnovni has one language: no English to write (refused by the plan's languages, not by the entry)", async () => {
    const { b, siteId } = await owner("standard");
    await withNewsAt(siteId);
    const r = await patch(b, siteId, [{ op: "replace", path: "/locales/enabled", value: ["sl", "en"] }, { op: "add", path: "/translations", value: { en: { [ptr]: "Rye bread" } } }]);
    expect(r.status).toBe(403);
    expect(((await r.json()) as Refused).code).toBe("plan_locales");
  });

  /** The news with one post on the site's current spec (keeps its languages). */
  async function withNewsAt(siteId: string) {
    const spec = structuredClone((await platform.repo.getSpec(siteId))!.spec);
    const ops = startCollection(spec, "blog");
    if ("error" in ops) throw new Error(ops.error);
    const r = applyDirectEdit(spec, ops);
    r.spec.collections!.blog!.items.push({ title: "Rženi kruh ob petkih", date: "2026-10-02", summary: "Nov kruh v ponudbi.", body: ["Pečemo ga ob petkih zjutraj."] });
    await platform.repo.saveSpec(siteId, r.spec, "manual", "novice");
  }
});

describe("generated pictures per month", () => {
  const picture = (accountId: string) =>
    platform.repo.logModelCall({ siteId: null, jobId: null, stage: "imageGen", model: "gpt-image-2.5", inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, costEur: 0.068, durationMs: 1, ok: true, tier: "paid", accountId });
  const regenerate = (b: Browser, siteId: string) => req(`/api/sites/${siteId}/generate`, { method: "POST", headers: json(b), body: JSON.stringify({ scope: "full" }) });

  it("Osnovni sees what is left; with the month's 3 used, a regeneration still runs and says it gets none, naming Plus", async () => {
    const { b, siteId, accountId } = await owner("standard");
    await picture(accountId);
    await picture(accountId);
    // This photo-less site would get 3 in a full regeneration: with 1 left the editor says so before the tap.
    const two = (await state(b, siteId)).access.pictures!;
    expect(two).toMatchObject({ used: 2, total: 3, left: 1, short: true });
    expect(two.notice).toContain("zato ima nova različica strani le 1 ustvarjeno sliko.");
    const one = await regenerate(b, siteId);
    expect(one.status).toBe(200);
    // 1 left of the 3 a photo-less full site would get: it says so.
    expect(((await one.json()) as { notice?: string }).notice).toMatch(/zato ima nova različica strani le 1 ustvarjeno sliko\./);
    await platform.repo.setStatus(siteId, "ready");
    await picture(accountId);
    const s = await state(b, siteId);
    expect(s.access.pictures).toMatchObject({ used: 3, left: 0 });
    expect(s.access.pictures!.notice).toMatch(/Paket Plus \(29 € na mesec\) vključuje 10 ustvarjenih slik na mesec\.$/);
    const none = await regenerate(b, siteId);
    expect(none.status).toBe(200);
    expect(((await none.json()) as { notice?: string }).notice).toMatch(/^Ta mesec ste porabili vse ustvarjene slike paketa Osnovni \(3\), zato jih nova različica strani ne dobi\./);
    expect(sent.at(-1)).toMatchObject({ name: "generate", data: { siteId, scope: "full" } });
  });

  it("Plus with pictures left gets no notice", async () => {
    const { b, siteId, accountId } = await owner("premium");
    await picture(accountId);
    const r = await regenerate(b, siteId);
    expect(r.status).toBe(200);
    expect(((await r.json()) as { notice?: string }).notice).toBeUndefined();
    expect((await state(b, siteId)).access.pictures).toMatchObject({ used: 1, total: 10, left: 9 });
  });

  it("a site with enough photos of its own wants none: no notice and no Plus, whatever is left", async () => {
    const { b, siteId, accountId } = await owner("standard");
    for (let i = 0; i < 3; i++) await picture(accountId);
    await platform.db.query(`update sites set intake = jsonb_set(intake, '{photoAssetIds}', '["a1","a2","a3"]'::jsonb) where id = $1`, [siteId]);
    expect((await state(b, siteId)).access.pictures).toMatchObject({ left: 0, short: false, notice: null });
    expect(((await (await regenerate(b, siteId)).json()) as { notice?: string }).notice).toBeUndefined();
  });
});

describe("free → Osnovni", () => {
  it("a free preview lists the brief's other pages, locked, with Osnovni's price; a paid viewer gets its limits instead", async () => {
    const free = await owner(null);
    const s = await state(free.b, free.siteId);
    expect(s.access.lockedPages).toEqual(["Ponudba", "O nas", "Kontakt"]);
    expect(s.access.offer?.text).toBe("Osnovni: 15 € na mesec ali 150 € na leto, domena je vključena v letno ceno.");
    expect(s.access.limits).toMatchObject({ maxPages: 1, locales: 1, collections: [], planName: null });
    const paid = await owner("standard");
    const p = await state(paid.b, paid.siteId);
    expect(p.access.lockedPages).toEqual([]);
    expect(p.access.offer).toBeNull();
    expect(p.access.limits).toMatchObject({ maxPages: 8, locales: 1, planName: "Osnovni" });
  });

  it("publishing and export name Osnovni and its price", async () => {
    const { b, siteId } = await owner(null);
    const r = await req(`/api/sites/${siteId}/publish`, { method: "POST", headers: json(b), body: "{}" });
    expect(r.status).toBe(403);
    expect(((await r.json()) as Refused).message).toBe("Objava in prenos strani sta del naročnine Osnovni (15 € na mesec). Predogled lahko še naprej urejate.");
  });

  it("the landing page shows the founding offer's places left, from the places the admin gave", async () => {
    const offer = config.plans.standard.foundingOffer!;
    // The page's text, tags dropped.
    const landing = async () => (await (await req("/", { headers: { cookie: (await newBrowser(req)).cookie } })).text()).replace(/<[^>]+>/g, "");
    expect(await landing()).toContain(`Prvo leto za prvih ${offer.customers} strank · še ${offer.customers} prostih mest`);
    const admin = await adminBrowser(req, PASSWORD);
    const give = await req("/admin/allow-list", { method: "POST", headers: { cookie: admin.cookie }, body: new URLSearchParams({ _csrf: admin.csrf, email: "ustanovni@siol.net", plan: "standard", founding: "on" }) });
    expect(await give.text()).toContain("ima zdaj paket Osnovni z ustanovno ceno");
    expect(await landing()).toContain(`še ${offer.customers - 1} prostih mest`);
    // Listing the address again (a plan change) keeps its place; a Plus entry never takes one.
    await req("/admin/allow-list", { method: "POST", headers: { cookie: admin.cookie }, body: new URLSearchParams({ _csrf: admin.csrf, email: "ustanovni@siol.net", plan: "standard" }) });
    await req("/admin/allow-list", { method: "POST", headers: { cookie: admin.cookie }, body: new URLSearchParams({ _csrf: admin.csrf, email: "plus@siol.net", plan: "premium", founding: "on" }) });
    expect(await platform.repo.accounts.foundingTaken()).toBe(1);
    // All places taken: the founding line goes.
    await platform.db.query("insert into allow_list (email_key, email, plan, founding_at) select 'f' || g || '@x.si', 'f' || g || '@x.si', 'standard', now() from generate_series(1, $1::int) g", [offer.customers]);
    const full = await landing();
    expect(full).not.toContain(`Prvo leto za prvih ${offer.customers} strank`);
    expect(full).toContain("Postavitev skupaj z vami");
  });
});

describe("the monthly report about Plus (it-upsells)", () => {
  const spec = (pages: number, type: SiteSpec["business"]["type"] = "bakery") => ({
    pages: Array.from({ length: pages }, (_, i) => ({ kind: i ? "standard" : "home" })) as SiteSpec["pages"],
    locales: { default: "sl" as const, enabled: ["sl" as const] },
    business: { type } as SiteSpec["business"],
  });

  it("speaks only where it fits: near Osnovni's page limit, or a one-language tourist farm; never on Plus or free", () => {
    expect(plusNote(config, "standard", spec(7))).toBe("Stran ima 7 od 8 strani, kolikor jih vključuje paket Osnovni. Paket Plus (29 € na mesec) jih ima do 20.");
    expect(plusNote(config, "standard", spec(3))).toBeNull();
    expect(plusNote(config, "standard", spec(3, "tourist-farm"))).toBe("Če vas obiskujejo tudi gostje iz tujine: paket Plus (29 € na mesec) ima stran v dveh jezikih, na primer v slovenščini in angleščini.");
    expect(plusNote(config, "premium", spec(19, "tourist-farm"))).toBeNull();
    expect(plusNote(config, null, spec(7))).toBeNull();
  });

  it("puts the line after the numbers, in text and HTML", () => {
    const totals = { visits: 120, calls: 4, directions: 3, forms: 1 };
    const m = monthlyReportMail({ to: "a@b.si", siteId: "site_1", siteName: "Kmetija Grabnar", month: "2026-09", totals, before: null, siteUrl: null, dashboardUrl: null, plusNote: "Če vas obiskujejo tudi gostje iz tujine: paket Plus." });
    expect(m.text.split("\n").at(-1)).toBe("Če vas obiskujejo tudi gostje iz tujine: paket Plus.");
    expect(m.html).toContain("<p>Če vas obiskujejo tudi gostje iz tujine: paket Plus.</p>");
    expect(monthlyReportMail({ to: "a@b.si", siteId: "site_1", siteName: "X", month: "2026-09", totals, before: null, siteUrl: null, dashboardUrl: null }).text).not.toContain("Plus");
  });
});
