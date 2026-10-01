import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadConfig } from "@sb/config";
import { pruneSite } from "@sb/engine";
import { Repo, createDb, createFsStorage, migrate, type Platform, type Queue } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { createApp } from "../src/app.ts";
import { SESSION_COOKIE } from "../src/auth.ts";
import { groupVersions, undoTarget, type ListedVersion } from "../src/client/versions.ts";
import { adminCookie } from "./session-helpers.ts";

/**
 * Everything that points at a version number, after retention removed some: undo, "Obnovi", preview ?v=
 * and the published marker. Plus the measured shrink of a typical site.
 */
const PASSWORD = "test-password-1234";
const config = loadConfig();
/** The nightly run on 2026-10-01, 03:30 in Ljubljana (UTC+2). */
const NOW = new Date("2026-10-01T01:30:00Z");
let platform: Platform;
let dir: string;
let app: ReturnType<typeof createApp>;
let cookie: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-web-retention-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = { send: async () => "job", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  app = createApp({ platform, config, auth: { password: PASSWORD, secret: "s".repeat(32), secureCookies: false } });
  cookie = await adminCookie((p, init) => app.request(p, init), PASSWORD);
  expect(cookie).toContain(`${SESSION_COOKIE}=`);
}, 60_000);
afterAll(async () => {
  await platform?.close();
  await rm(dir, { recursive: true, force: true });
});

const golden = async (name: string): Promise<SiteSpec> => JSON.parse(await readFile(path.join(import.meta.dirname, `../../../tools/eval/golden/${name}.json`), "utf8")) as SiteSpec;
const withHeadline = (spec: SiteSpec, headline: string): SiteSpec => {
  const s = structuredClone(spec);
  (s.pages[0]!.sections[0]!.props as { headline: string }).headline = headline;
  return s;
};
const headlineOf = async (siteId: string) => ((await platform.repo.getSpec(siteId))!.spec.pages[0]!.sections[0]!.props as { headline: string }).headline;

interface Save {
  at: string;
  source: "generate" | "critique" | "edit" | "manual" | "revert";
  message?: string;
  headline: string;
}

/** A site whose versions were saved at the given instants, oldest first. */
async function siteWith(slug: string, base: SiteSpec, saves: Save[]): Promise<string> {
  const site = await platform.repo.createSite({ name: slug, slug, intake: { description: "x", photoAssetIds: [], scope: "home" } });
  const versions: number[] = [];
  for (const s of saves) versions.push(await platform.repo.saveSpec(site.id, withHeadline({ ...base, slug }, s.headline), s.source, s.message));
  await platform.db.query(
    "update spec_versions v set created_at = t.at from (select unnest($2::integer[]) as version, unnest($3::timestamptz[]) as at) t where v.site_id = $1 and v.version = t.version",
    [site.id, versions, saves.map((s) => s.at)],
  );
  await platform.repo.setStatus(site.id, "ready");
  return site.id;
}

const json = () => ({ cookie, "content-type": "application/json" });
const state = async (id: string) => (await (await app.request(`/api/sites/${id}`, { headers: { cookie } })).json()) as { version: number; versions: ListedVersion[] };
const revert = (id: string, version: number) => app.request(`/api/sites/${id}/revert`, { method: "POST", headers: json(), body: JSON.stringify({ version }) });

describe("version numbers after a prune", () => {
  it("undo, Obnovi, preview ?v= and the published marker still work", async () => {
    const base = await golden("pekarna-kvas");
    const id = await siteWith("ret-api", base, [
      { at: "2026-09-10T08:00:00Z", source: "generate", headline: "Naslov nič" }, //                          v1
      { at: "2026-09-10T08:01:00Z", source: "manual", message: "urejen razdelek hero", headline: "Naslov ena" }, // v2
      { at: "2026-09-10T08:02:00Z", source: "manual", message: "urejen razdelek hero", headline: "Naslov dve" }, // v3 last of 09-10
      { at: "2026-09-20T08:00:00Z", source: "manual", message: "urejen razdelek hero", headline: "Naslov tri" }, // v4 published
      { at: "2026-09-20T08:01:00Z", source: "manual", message: "urejen razdelek hero", headline: "Naslov štiri" }, // v5
      { at: "2026-09-20T08:02:00Z", source: "manual", message: "urejen razdelek hero", headline: "Naslov pet" }, // v6 last of 09-20
      { at: "2026-09-29T08:00:00Z", source: "revert", message: "povrnjeno na različico 5", headline: "Naslov štiri" }, // v7
      { at: "2026-09-30T08:00:00Z", source: "manual", message: "urejen razdelek hero", headline: "Naslov šest" }, // v8 current
    ]);
    await platform.repo.markPublished(id, 4, "v4-test");
    expect((await pruneSite({ repo: platform.repo, storage: platform.storage, config }, id, NOW)).removed).toEqual([1, 2, 5]);

    // The list the editor gets: kept versions only, the published one marked.
    let s = await state(id);
    expect(s.versions.map((v) => v.version)).toEqual([8, 7, 6, 4, 3]);
    expect(s.versions.filter((v) => v.published).map((v) => v.version)).toEqual([4]);
    // The sites list still says which version is live.
    expect(await (await app.request("/sites", { headers: { cookie } })).text()).toContain("objavljena v4");

    // Undo (Razveljavi = revert to undoTarget) from v8 goes to v7.
    expect(undoTarget(s.versions, s.version)).toBe(7);
    expect(await (await revert(id, 7)).json()).toMatchObject({ ok: true, version: 9 });
    expect(await headlineOf(id)).toBe("Naslov štiri");
    // Undo again: v9 copied v7, which copied v5 (pruned), so it goes to the nearest older kept version, v4.
    s = await state(id);
    expect(undoTarget(s.versions, s.version)).toBe(4);
    expect((await revert(id, 4)).status).toBe(200);
    expect(await headlineOf(id)).toBe("Naslov tri");

    // "Obnovi" of a version pruned since the list loaded: a Slovene message, nothing saved.
    const gone = await revert(id, 5);
    expect(gone.status).toBe(404);
    expect(((await gone.json()) as { message: string }).message).toMatch(/Različice 5 ni več med shranjenimi/);
    expect((await state(id)).version).toBe(10);

    // Preview ?v= of a pruned version shows the nearest older kept one; below the oldest kept, it says so.
    const preview = async (v: number) => app.request(`/preview/${id}/index.html?v=${v}`, { headers: { cookie } });
    expect(await (await preview(5)).text()).toContain("Naslov tri");
    expect(await (await preview(3)).text()).toContain("Naslov dve");
    const below = await preview(2);
    expect(below.status).toBe(404);
    expect(await below.text()).toBe("Te različice ni več med shranjenimi.");
  }, 60_000);
});

describe("how much a typical site shrinks", () => {
  /**
   * Ten days of an owner at work, 20 versions a day: a morning of 12 text autosaves, a chat edit, an
   * afternoon of 6 layout changes and an undo. The first day starts with the generation and its 2
   * critique passes; publishes on the second and the ninth day. The nightly job runs the morning after.
   */
  function tenDays(days: number): Save[] {
    const out: Save[] = [];
    const start = Date.parse("2026-10-01T00:00:00Z") - days * 86_400_000;
    const at = (day: number, minutes: number) => new Date(start + day * 86_400_000 + minutes * 60_000).toISOString();
    for (let d = 0; d < days; d++) {
      const morning: Save[] =
        d === 0
          ? [
              { at: at(d, 7 * 60), source: "generate", headline: `d${d} generate` },
              { at: at(d, 7 * 60 + 2), source: "critique", headline: `d${d} critique 1` },
              { at: at(d, 7 * 60 + 4), source: "critique", headline: `d${d} critique 2` },
            ]
          : [];
      const typing = Array.from({ length: d === 0 ? 9 : 12 }, (_, i): Save => ({ at: at(d, 7 * 60 + 10 + i), source: "manual", message: "urejen razdelek hero", headline: `d${d} text ${i}` }));
      const chat: Save = { at: at(d, 7 * 60 + 30), source: "edit", message: "Dodaj odpiralni čas za praznike", headline: `d${d} chat` };
      const layout = Array.from({ length: 6 }, (_, i): Save => ({ at: at(d, 12 * 60 + i), source: "manual", message: "premik", headline: `d${d} layout ${i}` }));
      const undo: Save = { at: at(d, 12 * 60 + 10), source: "revert", message: "povrnjeno na različico 1", headline: `d${d} undo` };
      out.push(...morning, ...typing, chat, ...layout, undo);
    }
    return out;
  }

  async function measure(slug: string, days: number) {
    const saves = tenDays(days);
    const id = await siteWith(slug, await golden("gostilna-zlata-zlica"), saves);
    // Published on the second day (mid-afternoon) and on the second-to-last day.
    await platform.repo.markPublished(id, 20 + 15, "r1");
    await platform.repo.markPublished(id, (days - 2) * 20 + 15, "r2");
    const before = { ...(await platform.repo.versionStats(id)), rows: groupVersions(await platform.repo.listVersions(id)).length };
    const r = await pruneSite({ repo: platform.repo, storage: platform.storage, config }, id, NOW);
    const after = { ...(await platform.repo.versionStats(id)), rows: groupVersions(await platform.repo.listVersions(id)).length };
    const mb = (n: number) => (n / 1e6).toFixed(2);
    console.log(
      `[retention] ${slug}: ${saves.length} versions over ${days} days → ${after.versions} kept (${r.removed.length} removed); ` +
        `JSON ${mb(before.jsonBytes)} → ${mb(after.jsonBytes)} MB, stored (compressed) ${mb(before.bytes)} → ${mb(after.bytes)} MB; ` +
        `editor list: ${before.versions} versions in ${before.rows} rows → ${after.versions} in ${after.rows} rows`,
    );
    return { before, after, removed: r.removed.length };
  }

  it("200 versions over 10 days: the 3 days beyond the kept week shrink to their last version (+ a publish)", async () => {
    const m = await measure("ret-shrink-10", 10);
    expect(m.before.versions).toBe(200);
    // 7 whole days (09-24 … 09-30) in full = 140; 09-21 … 09-23 keep their last version each; the 09-22 publish.
    expect(m.after.versions).toBe(144);
    expect(m.after.bytes).toBeLessThan(m.before.bytes);
  }, 120_000);

  it("30 days at the same pace: the list stops growing by 20 a day", async () => {
    const m = await measure("ret-shrink-30", 30);
    expect(m.before.versions).toBe(600);
    // 140 + one per older day (23) + the publish on the second day.
    expect(m.after.versions).toBe(164);
  }, 180_000);
});
