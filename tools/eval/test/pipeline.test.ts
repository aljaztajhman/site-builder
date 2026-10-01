import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { loadConfig } from "@sb/config";
import { ModelClient, ReplayTransport, applyChatEdit, generateSite, launchCheckBrowser, loadRecordings, type CallRecord, type CheckBrowser } from "@sb/engine";
import { Repo, createDb, createFsStorage, migrate, type Db } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { loadFixture } from "../src/fixtures/load.ts";
import { syntheticRecordings } from "../src/synthetic.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
let db: Db;
let repo: Repo;
let dir: string;
let browser: CheckBrowser;

beforeAll(async () => {
  db = await createDb("pglite://memory");
  await migrate(db);
  repo = new Repo(db);
  dir = await mkdtemp(path.join(tmpdir(), "sb-pipeline-"));
  browser = await launchCheckBrowser();
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await db?.close();
  await rm(dir, { recursive: true, force: true });
});

/**
 * Model calls in order, except that altText runs beside classify/brief/design, so its place
 * among those isn't fixed; everything from content on is strictly ordered.
 */
function expectStages(calls: CallRecord[], expected: string[]): void {
  const stages = calls.map((c) => c.stage as string);
  const planning = ["classify", "brief", "design", "altText"];
  const split = (s: string[]) => [s.filter((x) => planning.includes(x)), s.filter((x) => !planning.includes(x))] as const;
  const [gotPlan, gotRest] = split(stages);
  const [wantPlan, wantRest] = split(expected);
  expect(gotPlan.filter((s) => s !== "altText")).toEqual(wantPlan.filter((s) => s !== "altText"));
  expect(gotPlan.filter((s) => s === "altText")).toEqual(wantPlan.filter((s) => s === "altText"));
  expect(stages.slice(gotPlan.length)).toEqual(gotRest);
  expect(gotRest).toEqual(wantRest);
}

/** A pekarna-kvas site with small generated stand-in photos (no dependency on `pnpm fixtures:photos`) and the fixture logo. */
async function seedSite(slug: string) {
  const fixture = loadFixture("pekarna-kvas");
  const golden = JSON.parse(await readFile(path.join(here, "../golden/pekarna-kvas.json"), "utf8")) as SiteSpec;
  const storage = createFsStorage(path.join(dir, "storage"));
  const site = await repo.createSite({ name: slug, slug, intake: { description: fixture.brief.description, photoAssetIds: [], scope: "full" } });

  // Small generated stand-ins so the test doesn't depend on `pnpm fixtures:photos`.
  const photoIds: string[] = [];
  for (const [i, img] of golden.assets.images.entries()) {
    const data = await sharp({ create: { width: img.width / 4, height: img.height / 4, channels: 3, background: ["#8a6d4b", "#c9a57a", "#6b4f33"][i]! } }).jpeg().toBuffer();
    const key = `sites/${site.id}/uploads/p${i}.jpg`;
    await storage.put(key, data, "image/jpeg");
    photoIds.push((await repo.addAsset({ site_id: site.id, kind: "photo", storage_key: key, mime: "image/jpeg", width: null, height: null, bytes: data.length, original_name: null })).id);
  }
  const logo = await readFile(fixture.logoPath!);
  await storage.put(`sites/${site.id}/uploads/logo.svg`, logo, "image/svg+xml");
  const logoId = (await repo.addAsset({ site_id: site.id, kind: "logo", storage_key: `sites/${site.id}/uploads/logo.svg`, mime: "image/svg+xml", width: null, height: null, bytes: logo.length, original_name: null })).id;
  await db.query("update sites set intake = $2 where id = $1", [site.id, JSON.stringify({ description: fixture.brief.description, scope: "full", photoAssetIds: photoIds, logoAssetId: logoId })]);

  return { fixture, golden, storage, site };
}

describe("pipeline with replayed model responses (no network)", () => {
  it("generates, checks, critiques and applies a chat edit for pekarna-kvas", async () => {
    const { fixture, golden, storage, site } = await seedSite("pekarna-kvas");

    const recordings = syntheticRecordings(fixture, golden, [
      { reply: "Glava je zdaj temna.", patches: [{ op: "add", path: "/chrome/header/tone", value: "inverse" }] },
    ]);
    const calls: CallRecord[] = [];
    const client = new ModelClient({ config, transport: new ReplayTransport(recordings), spentToday: async () => 0, onCall: async (r) => void calls.push(r) });

    const gen = await generateSite({ config, repo, storage, client, browser, lighthouse: false }, site.id, null);
    expect(gen.check?.validation).toEqual([]);
    expect(gen.check?.facts).toEqual([]);
    expect(gen.check?.pages.flatMap((p) => p.axe)).toEqual([]);
    expect(gen.check?.pages.every((p) => !p.mobile.horizontalScroll)).toBe(true);
    expect(gen.critiqueRounds).toBe(1);
    expectStages(calls, ["classify", "brief", "design", "altText", "content", "critique"]);
    expect(gen.firstVersionMs).toBeGreaterThan(0);

    const spec = (await repo.getSpec(site.id))!.spec;
    expect(spec.design.direction).toBe("warm-craft");
    expect(spec.business.phone).toBe("+38641555906");
    expect(spec.assets.images.map((i) => i.alt)).toEqual(golden.assets.images.map((i) => i.alt));
    expect(await storage.list(`sites/${site.id}/media/`)).toEqual(expect.arrayContaining([`sites/${site.id}/media/img_01-360.avif`, `sites/${site.id}/media/logo.png`]));

    const msg = await repo.addChat(site.id, "user", "Temnejša glava prosim.");
    const edit = await applyChatEdit({ repo, client }, site.id, Number(msg.id));
    expect(edit.issues).toEqual([]);
    expect((await repo.getSpec(site.id))!.spec.chrome.header.tone).toBe("inverse");
    expect((await repo.listChat(site.id)).at(-1)?.content).toBe("Glava je zdaj temna.");
    expectStages(calls, ["classify", "brief", "design", "altText", "content", "critique", "edit"]);
  }, 180_000);

  it("replays the recorded pekarna-kvas run (real API responses): generation, then every scripted edit", async () => {
    const { fixture, storage, site } = await seedSite("pekarna-kvas-rec");
    const transport = new ReplayTransport(loadRecordings(path.join(here, "../recordings/pekarna-kvas")));
    const calls: CallRecord[] = [];
    const client = new ModelClient({ config, transport, spentToday: async () => 0, onCall: async (r) => void calls.push(r) });

    const gen = await generateSite({ config, repo, storage, client, browser, lighthouse: false }, site.id, null);
    expect(gen.check?.validation).toEqual([]);
    // Recorded with two content calls (section ids reused across pages); assembly now fixes the ids, so one is enough.
    expectStages(calls, ["classify", "brief", "design", "altText", "content", "critique", "critique"]);

    for (const edit of fixture.edits) {
      const msg = await repo.addChat(site.id, "user", edit.message);
      const r = await applyChatEdit({ repo, client }, site.id, Number(msg.id));
      expect(r.issues, edit.message).toEqual([]);
    }
  }, 180_000);

  it("regenerating keeps the business facts the owner typed in the editor", async () => {
    const { fixture, golden, storage, site } = await seedSite("pekarna-kvas-regen");
    const run = async () => {
      const client = new ModelClient({ config, transport: new ReplayTransport(syntheticRecordings(fixture, golden)), spentToday: async () => 0, onCall: async () => undefined });
      return generateSite({ config, repo, storage, client, browser, lighthouse: false }, site.id, null);
    };
    await run();
    // The owner fills the provider data for publishing and corrects the phone number in the editor.
    const current = (await repo.getSpec(site.id))!;
    const ops = [
      { op: "replace", path: "/business/phone", value: "+38641000111" },
      { op: "replace", path: "/business/provider/legalName", value: "Pekarna Kvas d.o.o." },
      { op: "replace", path: "/business/provider/taxNumber", value: "12345678" },
      { op: "replace", path: "/business/provider/registrationNumber", value: "1234567000" },
    ];
    const edited = structuredClone(current.spec);
    edited.business.phone = "+38641000111";
    edited.business.provider = { ...edited.business.provider, legalName: "Pekarna Kvas d.o.o.", taxNumber: "12345678", registrationNumber: "1234567000" };
    await repo.saveSpec(site.id, edited, "manual", "podatki", ops, current.version);

    const again = await run();
    const spec = (await repo.getSpec(site.id))!.spec;
    expect(spec.business.phone).toBe("+38641000111");
    expect(spec.business.provider).toMatchObject({ legalName: "Pekarna Kvas d.o.o.", taxNumber: "12345678", registrationNumber: "1234567000" });
    // The kept facts count as the client's own: the fact check passes.
    expect(again.check?.facts).toEqual([]);
    const events = await db.query<{ message: string }>("select message from site_events where site_id = $1", [site.id]);
    expect(events.rows.map((e) => e.message)).toContain("Kept the business facts of the previous version");
  }, 180_000);

  it("keeps the checked site when the critique answer is unusable", async () => {
    const { fixture, golden, storage, site } = await seedSite("pekarna-kvas-critique");
    const recordings = syntheticRecordings(fixture, golden).map((r) => (r.stage === "critique" ? { ...r, response: { ...r.response, text: "I looked at the screenshots and it all seems fine." } } : r));
    const client = new ModelClient({ config, transport: new ReplayTransport(recordings), spentToday: async () => 0, onCall: async () => undefined });
    const gen = await generateSite({ config, repo, storage, client, browser, lighthouse: false }, site.id, null);
    expect(gen.check?.validation).toEqual([]);
    expect((await repo.getSite(site.id))?.status).toBe("ready");
    const events = await db.query<{ message: string }>("select message from site_events where site_id = $1", [site.id]);
    expect(events.rows.map((e) => e.message)).toContain("Critique answer unusable; kept the checked site");
  }, 180_000);

  it("keeps the checked site when the critique request fails at the API", async () => {
    const { fixture, golden, storage, site } = await seedSite("pekarna-kvas-critique-400");
    const replay = new ReplayTransport(syntheticRecordings(fixture, golden));
    const transport: typeof replay = Object.assign(Object.create(replay) as typeof replay, {
      send: (req: Parameters<typeof replay.send>[0], stage: Parameters<typeof replay.send>[1]) =>
        req.stage === "critique" ? Promise.reject(Object.assign(new Error("400 image dimensions exceed max allowed size"), { status: 400 })) : replay.send(req, stage),
    });
    const client = new ModelClient({ config, transport, spentToday: async () => 0, onCall: async () => undefined });
    await generateSite({ config, repo, storage, client, browser, lighthouse: false }, site.id, null);
    expect((await repo.getSite(site.id))?.status).toBe("ready");
    const events = await db.query<{ message: string }>("select message from site_events where site_id = $1", [site.id]);
    expect(events.rows.map((e) => e.message)).toContain("Critique failed; kept the checked site");
  }, 180_000);

  it("rejects an edit that invents a phone number and keeps the spec", async () => {
    const fixture = loadFixture("pekarna-kvas");
    const golden = JSON.parse(await readFile(path.join(here, "../golden/pekarna-kvas.json"), "utf8")) as SiteSpec;
    const site = await repo.createSite({ name: "x", slug: "pekarna-kvas-2", intake: { description: fixture.brief.description, photoAssetIds: [], scope: "full" } });
    await repo.saveSpec(site.id, { ...golden, slug: "pekarna-kvas-2" }, "manual");
    const bad = { reply: "ok", patches: [{ op: "replace", path: "/business/phone", value: "+38641999999" }] };
    const client = new ModelClient({ config, transport: new ReplayTransport(syntheticRecordings(fixture, golden, [bad, bad]).filter((r) => r.stage === "edit")), spentToday: async () => 0, onCall: async () => undefined });
    const msg = await repo.addChat(site.id, "user", "Spremeni barvo gumbov.");
    const r = await applyChatEdit({ repo, client }, site.id, Number(msg.id));
    expect(r.version).toBeNull();
    expect(r.issues.join(" ")).toMatch(/phone/);
    expect((await repo.getSpec(site.id))!.version).toBe(1);
  });
});

describe("content stage", () => {
  it("falls back to plain JSON when the API rejects the content schema", async () => {
    const { generateContent, Brief } = await import("@sb/engine");
    const fixture = loadFixture("pekarna-kvas");
    const golden = JSON.parse(await readFile(path.join(here, "../golden/pekarna-kvas.json"), "utf8")) as SiteSpec;
    const recs = syntheticRecordings(fixture, golden);
    const brief = Brief.parse(JSON.parse(recs.find((r) => r.stage === "brief")!.response.text));
    const content = recs.find((r) => r.stage === "content")!.response;
    const seen: boolean[] = [];
    const client = new ModelClient({
      config,
      spentToday: async () => 0,
      onCall: async () => undefined,
      transport: {
        async send(req) {
          seen.push(!!req.schema);
          if (req.schema) throw Object.assign(new Error("output_config.format.schema: schema is too complex"), { status: 400 });
          return content;
        },
      },
    });
    const r = await generateContent(client, {
      slug: "pekarna-kvas",
      brief,
      design: golden.design,
      assets: golden.assets,
      scope: "full",
      heroImageIds: [],
      structuredOutput: true,
      retries: 2,
      corpus: fixture.brief.description,
    });
    expect(seen).toEqual([true, false]);
    expect(r.structuredFallback).toBe(true);
    expect(r.issues).toEqual([]);
    expect(r.attempts).toBe(1);
  });
});
