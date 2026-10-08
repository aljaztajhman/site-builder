import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, type AppConfig } from "@sb/config";
import { NO_FAMILY_MESSAGE, lookKey, sameLook } from "@sb/engine";
import { Repo, createDb, createFsStorage, memoryMailer, migrate, type Platform, type Queue } from "@sb/platform";
import { migrateSpec, validateSite, type SiteSpec } from "@sb/spec";
import { createApp } from "../src/app.ts";
import { adminBrowser, ownerSignIn, type Browser, type Req } from "./session-helpers.ts";

/**
 * "Druga podoba" over the API (POST /api/sites/:id/look, config variety.families): the site's owner or the admin, from
 * the same origin; a new version with another look of the family, nothing else changed; no model call, nothing reserved
 * or spent; a clear refusal for a style without a family; not there at all with the switch off.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const PASSWORD = "test-password-1234";
const base = loadConfig();
const on: AppConfig = { ...base, variety: { ...base.variety, families: true } };
const mail = memoryMailer();
let platform: Platform;
let dir: string;
const apps: Record<"on" | "off" | "skeleton", ReturnType<typeof createApp>> = {} as never;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-look-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = { send: async () => "job", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  const make = (config: AppConfig) => createApp({ platform, config, auth: { password: PASSWORD, secret: "s".repeat(32), secureCookies: false }, mailer: mail, appUrl: "https://stranko.example" });
  apps.on = make(on);
  apps.off = make(base);
  apps.skeleton = make({ ...on, variety: { ...on.variety, skeleton: true } });
});
afterAll(async () => {
  await platform.close();
  await rm(dir, { recursive: true, force: true });
});

const req = (which: keyof typeof apps): Req => (p, init) => apps[which].request(p, init);
let n = 0;
async function site(golden: string, accountId: string | null = null, change?: (spec: SiteSpec) => void): Promise<string> {
  const spec = migrateSpec(JSON.parse(await readFile(path.join(here, `../../../tools/eval/golden/${golden}.json`), "utf8"))) as SiteSpec;
  spec.slug = `${golden}-${++n}`;
  change?.(spec);
  const home = spec.pages.find((p) => p.kind === "home")!;
  spec.ownerEdits = [{ section: home.sections[0]!.id, path: "/props/headline" }];
  const s = await platform.repo.createSite({ name: spec.slug, slug: spec.slug, intake: { description: golden, photoAssetIds: [], scope: "home" }, accountId });
  await platform.repo.saveSpec(s.id, spec, "generate");
  await platform.repo.setStatus(s.id, "ready");
  return s.id;
}
const look = (which: keyof typeof apps, id: string, b: { cookie: string }, extra: Record<string, string> = {}, body: unknown = {}) =>
  req(which)(`/api/sites/${id}/look`, { method: "POST", headers: { cookie: b.cookie, "content-type": "application/json", ...extra }, body: JSON.stringify(body) });
const spent = async () => {
  const calls = await platform.db.query<{ n: number }>("select count(*)::int as n from model_calls");
  const jobs = await platform.db.query<{ n: number }>("select count(*)::int as n from ai_jobs");
  return { calls: calls.rows[0]!.n, jobs: jobs.rows[0]!.n };
};
/** The spec without its look (design, hero type and variant). */
const content = (s: SiteSpec) => {
  const { design: _design, ...rest } = structuredClone(s);
  const hero = rest.pages.find((p) => p.kind === "home")!.sections[0] as unknown as Record<string, unknown>;
  delete hero.type;
  delete hero.variant;
  return JSON.stringify(rest);
};

let admin: Browser;
beforeAll(async () => {
  admin = await adminBrowser(req("on"), PASSWORD);
});

describe("POST /api/sites/:id/look", () => {
  it("saves another look as a new version, content untouched, nothing reserved or spent; undo goes back", async () => {
    const id = await site("zobozdravstvo-lebar");
    const before = (await platform.repo.getSpec(id))!;
    const money = await spent();
    const res = await look("on", id, admin, { "sec-fetch-site": "same-origin" }, { baseVersion: before.version });
    expect(res.status, await res.clone().text()).toBe(200);
    const body = (await res.json()) as { ok: boolean; version: number };
    expect(body).toMatchObject({ ok: true, version: before.version + 1 });
    const after = (await platform.repo.getSpec(id))!;
    expect(after.version).toBe(before.version + 1);
    expect(sameLook(lookKey(before.spec), lookKey(after.spec))).toBe(false);
    expect(content(after.spec)).toBe(content(before.spec));
    expect(after.spec.ownerEdits).toEqual(before.spec.ownerEdits);
    expect(validateSite(after.spec).ok).toBe(true);
    expect(after.spec.design.skeleton).toBeUndefined();
    expect(await spent()).toEqual(money);
    const versions = await platform.repo.listVersions(id);
    expect(versions[0]).toMatchObject({ version: after.version, source: "manual" });
    expect(versions[0]!.message).toMatch(/^druga podoba: /);
    // The editor's state offers the button here.
    const state = (await (await req("on")(`/api/sites/${id}`, { headers: { cookie: admin.cookie } })).json()) as { anotherLook: boolean };
    expect(state.anotherLook).toBe(true);
    // Undo (revert to the version before) brings the old look back.
    const back = await req("on")(`/api/sites/${id}/revert`, { method: "POST", headers: { cookie: admin.cookie, "content-type": "application/json" }, body: JSON.stringify({ version: before.version }) });
    expect(back.status).toBe(200);
    expect(JSON.stringify((await platform.repo.getSpec(id))!.spec)).toBe(JSON.stringify(before.spec));
    // A stale base version is a conflict, like every editor action.
    expect((await look("on", id, admin, {}, { baseVersion: before.version })).status).toBe(409);
  });

  it("taps again and again: a new look each time, every version valid", async () => {
    const id = await site("trgovina-oljka-in-sol");
    const keys = [lookKey((await platform.repo.getSpec(id))!.spec)];
    for (let i = 0; i < 4; i++) {
      expect((await look("on", id, admin)).status).toBe(200);
      const s = (await platform.repo.getSpec(id))!.spec;
      expect(validateSite(s).ok).toBe(true);
      expect(sameLook(keys.at(-1)!, lookKey(s))).toBe(false);
      keys.push(lookKey(s));
    }
  });

  it("a hero that can change (split ↔ image) changes with its texts, the owner's marks and its English as they were", async () => {
    const id = await site("trgovina-oljka-in-sol", null, (spec) => {
      const hero = spec.pages.find((p) => p.kind === "home")!.sections[0]! as unknown as { type: string; variant: string; props: Record<string, unknown> };
      const { eyebrow, headline, intro, primary, image } = hero.props;
      hero.type = "hero-split";
      hero.variant = "image-left";
      hero.props = { ...(eyebrow ? { eyebrow } : {}), headline, intro: String(intro).slice(0, 200), ...(primary ? { primary } : {}), image };
      spec.locales = { default: "sl", enabled: ["sl", "en"] };
      spec.translations = { en: { "/pages/0/sections/0/props/headline": "Olive oil and salt from our own trees", "/pages/0/sections/0/props/intro": "A small shop." } };
    });
    const start = (await platform.repo.getSpec(id))!.spec;
    expect(validateSite(start).ok).toBe(true);
    const heroes = new Set<string>();
    for (let i = 0; i < 18; i++) {
      expect((await look("on", id, admin)).status).toBe(200);
      const s = (await platform.repo.getSpec(id))!.spec;
      const hero = s.pages.find((p) => p.kind === "home")!.sections[0]!;
      heroes.add(`${hero.type}:${hero.variant}`);
      expect(content(s)).toBe(content(start));
      expect(s.translations).toEqual(start.translations);
      expect(s.ownerEdits).toEqual(start.ownerEdits);
      expect(validateSite(s).ok).toBe(true);
    }
    expect(heroes).toEqual(new Set(["hero-split:image-left", "hero-image:overlay-left"]));
  });

  it("with variety.skeleton on, the look brings a skeleton", async () => {
    const id = await site("kmetija-grabnar");
    expect((await look("skeleton", id, admin)).status).toBe(200);
    const s = (await platform.repo.getSpec(id))!.spec;
    expect(s.design.skeleton).toBeDefined();
    expect(validateSite(s).ok).toBe(true);
  });

  it("refuses a style without a family in Slovene, and the editor isn't offered the button", async () => {
    const id = await site("avtoservis-mrak");
    const v = (await platform.repo.getSpec(id))!.version;
    const res = await look("on", id, admin);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "no_family", code: "no_family", message: NO_FAMILY_MESSAGE });
    expect((await platform.repo.getSpec(id))!.version).toBe(v);
    const state = (await (await req("on")(`/api/sites/${id}`, { headers: { cookie: admin.cookie } })).json()) as { anotherLook: boolean };
    expect(state.anotherLook).toBe(false);
  });

  it("is not there with the switch off (404), and the editor isn't offered the button", async () => {
    const id = await site("zobozdravstvo-lebar");
    const v = (await platform.repo.getSpec(id))!.version;
    expect((await look("off", id, admin)).status).toBe(404);
    expect((await platform.repo.getSpec(id))!.version).toBe(v);
    const state = (await (await req("off")(`/api/sites/${id}`, { headers: { cookie: admin.cookie } })).json()) as { anotherLook: boolean };
    expect(state.anotherLook).toBe(false);
  });

  it("only the site's owner (any tier, free included) or the admin; never from another site", async () => {
    const owner = await ownerSignIn(req("on"), mail.sent, "lastnica@primer.si");
    const other = await ownerSignIn(req("on"), mail.sent, "drugi@primer.si");
    const ownerId = (await platform.repo.accounts.byKey("lastnica@primer.si"))!.id;
    const id = await site("zobozdravstvo-lebar", ownerId);
    const v = (await platform.repo.getSpec(id))!.version;
    // Signed out: sign in first.
    expect((await look("on", id, { cookie: "" })).status).toBe(401);
    // Another account: as if the site didn't exist.
    expect((await look("on", id, other)).status).toBe(404);
    // A request another site's page sends (the browser marks it cross-site): refused.
    expect((await look("on", id, owner, { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await look("on", id, owner, { origin: "https://evil.example" })).status).toBe(403);
    expect((await platform.repo.getSpec(id))!.version).toBe(v);
    // The owner on the free tier, from the editor: allowed (it costs nothing).
    const res = await look("on", id, owner, { "sec-fetch-site": "same-origin" });
    expect(res.status, await res.clone().text()).toBe(200);
    expect((await platform.repo.getSpec(id))!.version).toBe(v + 1);
  });
});
