import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@sb/config";
import { publishedBase } from "@sb/engine";
import { Repo, createDb, createFsStorage, memoryMailer, migrate, type Platform, type Queue } from "@sb/platform";
import { translatableTexts, untranslated, type SiteSpec } from "@sb/spec";
import { createApp } from "../src/app.ts";
import { ownerSignIn, type Browser, type Req } from "./session-helpers.ts";
import { fillPlaceholderOps } from "../../../tools/eval/src/placeholder-fill.ts";

/**
 * The site's second language over the editor's API (it-editor-languages): "Dodaj jezik" switches English on through
 * the direct editor (validated, held to the plan's languages, saved as a version, undone like any edit), the owner
 * types each translation, publishing waits until every text of the pages has one, and removing the language takes its
 * translations along (a version keeps them). Osnovni is refused, naming Plus. No model calls; the queue only records.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const config = structuredClone(loadConfig());
const mail = memoryMailer();
let platform: Platform;
let dir: string;
let req: Req;
let golden: SiteSpec;
let brief: { description: string };

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-languages-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = { send: async () => "job", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  const app = createApp({ platform, config, platformDomain: "stranko.example", auth: { password: "test-password-1234", secret: "s".repeat(32), secureCookies: false }, mailer: mail, appUrl: "https://stranko.example" });
  req = (p, init) => app.request(p, init);
  golden = JSON.parse(await readFile(path.join(here, "../../../tools/eval/golden/avtoservis-mrak.json"), "utf8")) as SiteSpec;
  brief = JSON.parse(await readFile(path.join(here, "../../../tools/eval/fixtures/avtoservis-mrak/brief.json"), "utf8")) as { description: string };
});
afterAll(async () => {
  await platform.close();
  await rm(dir, { recursive: true, force: true });
});

let seq = 0;
/** An account on this plan, signed in, and its site: the car service's whole site, its facts filled. */
async function owner(plan: "standard" | "premium"): Promise<{ b: Browser; siteId: string; slug: string }> {
  const email = `servis${++seq}@siol.net`;
  await platform.repo.accounts.allow(email, email, null, plan);
  const b = await ownerSignIn(req, mail.sent, email);
  const accountId = (await platform.repo.accounts.byKey(email))!.id;
  const slug = `jeziki-${seq}`;
  const s = await platform.repo.createSite({ name: "Avtoservis Mrak", slug, intake: { description: brief.description, photoAssetIds: [], scope: "full" }, accountId });
  await platform.repo.saveSpec(s.id, { ...structuredClone(golden), slug }, "generate");
  await platform.repo.setStatus(s.id, "ready");
  // The facts the generator left as placeholders, typed by the owner (as the editor sends them).
  const fill = fillPlaceholderOps((await current(s.id)).spec);
  if (fill.length) expect((await post(b, s.id, "/patch", { ops: fill })).status).toBe(200);
  return { b, siteId: s.id, slug };
}

const json = (b: Browser) => ({ cookie: b.cookie, "content-type": "application/json" });
const current = async (siteId: string) => (await platform.repo.getSpec(siteId))!;
const post = async (b: Browser, siteId: string, p: string, body: Record<string, unknown>) =>
  req(`/api/sites/${siteId}${p}`, { method: "POST", headers: json(b), body: JSON.stringify({ baseVersion: (await current(siteId)).version, ...body }) });
type Checklist = { kind: string; path: string; detail: string; value?: string }[];
const checklistOf = async (b: Browser, siteId: string) => ((await (await req(`/api/sites/${siteId}`, { headers: { cookie: b.cookie } })).json()) as { checklist: Checklist }).checklist;

describe("the second language in the editor", () => {
  it("Osnovni: refused by the plan's one language, naming Plus; nothing changes", async () => {
    const { b, siteId } = await owner("standard");
    const before = await current(siteId);
    const r = await post(b, siteId, "/locales", { locale: "en", on: true });
    expect(r.status).toBe(403);
    const body = (await r.json()) as { code: string; message: string; upgrade: { plan: string; name: string } | null };
    expect(body.code).toBe("plan_locales");
    expect(body.message).toBe("Paket Osnovni ima stran v enem jeziku. Paket Plus (29 € na mesec) ima stran v dveh jezikih, na primer v slovenščini in angleščini.");
    expect(body.upgrade).toMatchObject({ plan: "premium", name: "Plus" });
    const after = await current(siteId);
    expect(after.version).toBe(before.version);
    expect(after.spec.locales.enabled).toEqual(["sl"]);
  });

  it("Plus: switches English on as a version; publishing waits for every translation; then publishes both languages", async () => {
    const { b, siteId, slug } = await owner("premium");
    // Facts filled: nothing stands in the way of publishing yet.
    expect(await checklistOf(b, siteId)).toEqual([]);
    const v0 = (await current(siteId)).version;

    expect((await post(b, siteId, "/locales", { locale: "de", on: true })).status).toBe(400);
    expect((await post(b, siteId, "/locales", { locale: "sl", on: true })).status).toBe(400);
    expect((await post(b, siteId, "/locales", { locale: "en" })).status).toBe(400);
    const on = await post(b, siteId, "/locales", { locale: "en", on: true });
    expect(on.status, await on.clone().text()).toBe(200);
    const v1 = await current(siteId);
    expect(v1.version).toBe(v0 + 1);
    expect(v1.spec.locales).toEqual({ default: "sl", enabled: ["sl", "en"] });
    // Nothing is written for the owner: no translation, and not counted as text the owner typed.
    expect(v1.spec.translations ?? {}).toEqual({});
    expect((await platform.repo.listVersions(siteId)).find((v) => v.version === v1.version)?.message).toBe("dodan jezik en");
    // Twice is an error, not a second "en".
    expect((await post(b, siteId, "/locales", { locale: "en", on: true })).status).toBe(400);

    // Every text of the pages is on the checklist (grouped per section), and publishing is refused.
    const texts = translatableTexts(v1.spec);
    const listed = (await checklistOf(b, siteId)).filter((x) => x.kind === "translation");
    expect(listed.length).toBeGreaterThan(5);
    expect(listed.reduce((n, x) => n + Number(x.value), 0)).toBe(texts.length);
    const refused = await req(`/api/sites/${siteId}/publish`, { method: "POST", headers: { cookie: b.cookie } });
    expect(refused.status).toBe(422);
    const blocked = (await refused.json()) as { checklist: Checklist; blockers: string[] };
    expect(blocked.checklist.every((x) => x.kind === "translation")).toBe(true);
    expect(blocked.blockers[0]).toMatch(/text\(s\) here without a translation \(en\)$/);

    // The owner types the translations, as the editor sends them: the first creates the overlay, each later one adds to it.
    const [first, ...rest] = texts;
    const english = (t: string) => `EN: ${t}`;
    const typed = await post(b, siteId, "/patch", { ops: [{ op: "test", path: first!.path, value: first!.text }, { op: "add", path: "/translations", value: { en: { [first!.path]: english(first!.text) } } }], message: "prevod" });
    expect(typed.status, await typed.clone().text()).toBe(200);
    const esc = (p: string) => p.replace(/~/g, "~0").replace(/\//g, "~1");
    const ops = rest.slice(0, -1).flatMap((t) => [{ op: "test", path: t.path, value: t.text }, { op: "add", path: `/translations/en/${esc(t.path)}`, value: english(t.text) }]);
    expect((await post(b, siteId, "/patch", { ops, message: "prevod" })).status).toBe(200);
    // One text left: still refused, and the checklist names exactly that one.
    const last = rest.at(-1)!;
    expect((await checklistOf(b, siteId)).map((x) => [x.kind, x.path, x.value])).toEqual([["translation", last.path, "1"]]);
    expect((await req(`/api/sites/${siteId}/publish`, { method: "POST", headers: { cookie: b.cookie } })).status).toBe(422);
    expect((await post(b, siteId, "/patch", { ops: [{ op: "test", path: last.path, value: last.text }, { op: "add", path: `/translations/en/${esc(last.path)}`, value: english(last.text) }], message: "prevod" })).status).toBe(200);
    expect(untranslated((await current(siteId)).spec, "en")).toEqual([]);
    expect(await checklistOf(b, siteId)).toEqual([]);

    // Published: the Slovene site and the English one under en/, with the owner's English.
    const published = await req(`/api/sites/${siteId}/publish`, { method: "POST", headers: { cookie: b.cookie } });
    expect(published.status, await published.clone().text()).toBe(200);
    const base = await publishedBase(platform.storage, slug);
    const page = async (p: string) => new TextDecoder().decode((await platform.storage.get(`${base}${p}`))!);
    const headline = String((golden.pages[0]!.sections[0]!.props as Record<string, unknown>).headline);
    expect(await page("index.html")).toContain(headline);
    const en = await page("en/index.html");
    expect(en).toContain('lang="en"');
    expect(en).toContain(english(headline));
    expect(en).not.toContain(`>${headline}<`);
  }, 60_000);

  it("removing English takes its translations along as a version; undo brings both back; switching on again starts empty", async () => {
    const { b, siteId } = await owner("premium");
    expect((await post(b, siteId, "/locales", { locale: "en", on: true })).status).toBe(200);
    const label = "/pages/0/nav/label";
    expect((await post(b, siteId, "/patch", { ops: [{ op: "add", path: "/translations", value: { en: { [label]: "Home" } } }] })).status).toBe(200);
    const withEnglish = await current(siteId);
    expect(withEnglish.spec.translations).toEqual({ en: { [label]: "Home" } });

    expect((await post(b, siteId, "/locales", { locale: "sl", on: false })).status).toBe(400);
    const off = await post(b, siteId, "/locales", { locale: "en", on: false });
    expect(off.status, await off.clone().text()).toBe(200);
    const removed = await current(siteId);
    expect(removed.version).toBe(withEnglish.version + 1);
    expect(removed.spec.locales.enabled).toEqual(["sl"]);
    expect(removed.spec.translations).toBeUndefined();
    expect((await checklistOf(b, siteId)).filter((x) => x.kind === "translation")).toEqual([]);
    expect((await post(b, siteId, "/locales", { locale: "en", on: false })).status).toBe(400);

    // Undo (the version list): the language and its English come back.
    const undo = await req(`/api/sites/${siteId}/revert`, { method: "POST", headers: json(b), body: JSON.stringify({ version: withEnglish.version }) });
    expect(undo.status, await undo.clone().text()).toBe(200);
    const back = await current(siteId);
    expect(back.spec.locales.enabled).toEqual(["sl", "en"]);
    expect(back.spec.translations).toEqual({ en: { [label]: "Home" } });

    // Off and on again: English is back without the old translations (they stay in the versions).
    expect((await post(b, siteId, "/locales", { locale: "en", on: false })).status).toBe(200);
    expect((await post(b, siteId, "/locales", { locale: "en", on: true })).status).toBe(200);
    expect((await current(siteId)).spec.translations ?? {}).toEqual({});
  }, 60_000);

  it("Osnovni may still remove a second language it kept from Plus", async () => {
    const { b, siteId } = await owner("standard");
    const spec = await current(siteId);
    await platform.repo.saveSpec(siteId, { ...spec.spec, locales: { default: "sl", enabled: ["sl", "en"] }, translations: { en: { "/pages/0/nav/label": "Home" } } }, "manual", "z Plusa", [], spec.version);
    const off = await post(b, siteId, "/locales", { locale: "en", on: false });
    expect(off.status, await off.clone().text()).toBe(200);
    expect((await current(siteId)).spec.locales.enabled).toEqual(["sl"]);
  });
});
