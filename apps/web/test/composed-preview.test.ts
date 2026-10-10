import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@sb/config";
import { unzipTo } from "@sb/engine";
import { Repo, createDb, createFsStorage, migrate, type Platform, type Queue } from "@sb/platform";
import { COMPOSED_SHEETS, composedSheets } from "@sb/render";
import { migrateSpec, publishBlockers, type SiteSpec } from "@sb/spec";
import { createApp } from "../src/app.ts";
import { uncoveredClasses } from "../../../packages/render/test/composed-coverage.ts";
import { adminCookie } from "./session-helpers.ts";

/**
 * Preview = published (docs/plans/studio-phase1-design.md §3.3) for composed sections of spec v20. The kitchen-sink
 * fixture and the m, s and j templates (all with composed v20 sections) are created, published and fetched from
 * /preview/<id>/ and /s/<slug>/, and exported. Per page: the HTML is byte-equal in both (and in the export, apart from
 * the asset path prefix, which the export roots in its own folder); every composed stylesheet the page links has the
 * same bytes in the preview, the published site and the export, and those bytes are what @sb/render says (COMPOSED_SHEETS);
 * the page links exactly the sheets composedSheets() names; no unlinked sheet has a rule that applies to its markup.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const COMPOSED = path.join(here, "../../../tools/eval/composed");
const PASSWORD = "test-password-1234";
let platform: Platform;
let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-composedpreview-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = { send: async () => "job", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
});
afterAll(async () => {
  await platform.close();
  await rm(dir, { recursive: true, force: true });
});

/** The provider facts and email a template leaves as placeholders (publishing refuses while they stand). */
function fillPlaceholders(spec: SiteSpec): SiteSpec {
  const s = structuredClone(spec);
  const b = s.business as unknown as Record<string, unknown>;
  b.provider = { legalName: "Test d.o.o.", registrationNumber: "1234567000", taxNumber: "SI12345678" };
  if (typeof b.email !== "string") b.email = "info@primer.example";
  // A price the template leaves open is "on request"; the kitchen-sink's before-after pair gets the client words it lacks (test only).
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (o.arrangement === "before-after") o.captions = ["Prej", "Potem"];
      if (o.price && typeof o.price === "object" && "$placeholder" in (o.price as object)) o.price = { onRequest: true };
      Object.values(o).forEach(walk);
    }
  };
  for (const p of s.pages) walk(p.sections);
  return s;
}

const hrefs = (html: string) => [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]!).filter((h) => /\/composed(-v2-[a-z]+)?-[0-9a-f]{10}\.css$/.test(h));

/** The brief each site is built from (tools/eval/fixtures/<id>/brief.json): the client text its facts are checked against. */
const FIXTURE: Record<string, string> = { "kitchen-sink": "pekarna-kvas", m: "avtoservis-mrak", s: "instalacije-rebernik", j: "pekarna-kvas" };

const SITES: [string, () => Promise<SiteSpec>][] = [
  ["kitchen-sink", async () => migrateSpec(JSON.parse(await readFile(path.join(COMPOSED, "kitchen-sink.json"), "utf8"))) as SiteSpec],
  ...(["m", "s", "j"] as const).map((id) => [id, async () => migrateSpec(JSON.parse(await readFile(path.join(COMPOSED, `${id}.json`), "utf8"))) as SiteSpec] as [string, () => Promise<SiteSpec>]),
];

describe("composed v20 sections: preview equals published", () => {
  it.each(SITES)("%s: pages and composed sheets are byte-equal in the preview, the published site and the export", async (id, load) => {
    const app = createApp({ platform, config: loadConfig(), auth: { password: PASSWORD, secret: "s".repeat(32), secureCookies: false } });
    const req = (p: string, init?: RequestInit) => Promise.resolve(app.request(p, init));
    const cookie = await adminCookie(req, PASSWORD);
    const spec = fillPlaceholders(await load());
    spec.slug = `cp-${id}`;
    expect(publishBlockers(spec).filter((b) => !/photo|alt/i.test(b)), "nothing but the photo descriptions may block publishing").toEqual([]);
    const brief = (JSON.parse(await readFile(path.join(here, "../../../tools/eval/fixtures", FIXTURE[id]!, "brief.json"), "utf8")) as { description: string }).description;
    const site = await platform.repo.createSite({ name: id, slug: spec.slug, intake: { description: `${brief} Prej Potem Test d.o.o. 1234567000 SI12345678 info@primer.example`, photoAssetIds: [], scope: "home" } });
    await platform.repo.saveSpec(site.id, spec, "generate");
    const pub = await app.request(`/api/sites/${site.id}/publish`, { method: "POST", headers: { cookie } });
    expect(pub.status, JSON.stringify(await pub.clone().json())).toBe(200);

    const exported = await app.request(`/api/sites/${site.id}/export?anyway=1`, { headers: { cookie } });
    expect(exported.status).toBe(200);
    const out = path.join(dir, `export-${id}`);
    await unzipTo(new Uint8Array(await exported.arrayBuffer()), out);
    // The export has a redirecting index.html at its root and the site in a folder of its slug.
    const exportRoot = path.join(out, spec.slug);

    let withComposed = 0;
    let sheetsSeen = 0;
    for (const page of spec.pages) {
      const file = page.slug === "" ? "index.html" : `${page.slug}.html`;
      const wanted = composedSheets(page.sections).map((k) => COMPOSED_SHEETS[k]());
      const live = await (await app.request(`/s/${spec.slug}/${file}`)).text();
      const preview = await app.request(`/preview/${site.id}/${file}`, { headers: { cookie } });
      expect(preview.status, file).toBe(200);
      const previewHtml = await preview.text();
      expect(previewHtml, `${id}/${file}: preview equals published`).toBe(live);
      // The page links exactly the sheets composedSheets() says.
      const linked = hrefs(live);
      expect(linked.map((h) => h.split("/").pop()), `${id}/${file}: linked sheets`).toEqual(wanted.map((w) => w.name));
      if (wanted.length === 0) continue;
      withComposed++;
      for (const [n, sheet] of wanted.entries()) {
        const fromPublished = await app.request(new URL(linked[n]!, `http://x/s/${spec.slug}/${file}`).pathname);
        const fromPreview = await app.request(new URL(linked[n]!, `http://x/preview/${site.id}/${file}`).pathname, { headers: { cookie } });
        expect(fromPublished.status, sheet.name).toBe(200);
        expect(fromPreview.status, sheet.name).toBe(200);
        const a = new Uint8Array(await fromPublished.arrayBuffer());
        const b = new Uint8Array(await fromPreview.arrayBuffer());
        expect(Buffer.from(b).equals(Buffer.from(a)), `${id}/${sheet.name}: preview bytes = published bytes`).toBe(true);
        expect(Buffer.from(a).toString("utf8"), `${id}/${sheet.name}: bytes are what @sb/render says`).toBe(sheet.css);
        sheetsSeen++;
      }
      // The export: the same page (its asset prefix aside) and the same sheet bytes.
      const exportedHtml = await readFile(path.join(exportRoot, file), "utf8");
      const prefix = (h: string) => h.replace(/(?:\.\.\/)*(?:_shared\/[0-9a-f]+|assets)\//g, "ASSETS/").replace(/(?:\.\.\/|\.\/)+/g, "");
      expect(prefix(exportedHtml), `${id}/${file}: export equals published apart from the asset prefix`).toBe(prefix(live));
      for (const sheet of wanted) {
        const files = await findFiles(out, sheet.name);
        expect(files.length, `${id}/${sheet.name} in the export`).toBe(1);
        expect(await readFile(files[0]!, "utf8"), `${id}/${sheet.name} in the export`).toBe(sheet.css);
      }
      // No composed sheet the page leaves out has a rule that could apply to its markup (the page links every sheet it needs).
      expect(uncoveredClasses(live), `${id}/${file}: rules of unlinked composed sheets that could apply`).toEqual([]);
    }
    expect(withComposed, `${id}: pages with composed sections`).toBeGreaterThanOrEqual(1);
    expect(sheetsSeen).toBeGreaterThanOrEqual(2);
  }, 120_000);
});

async function findFiles(root: string, name: string): Promise<string[]> {
  const found: string[] = [];
  for (const e of await readdir(root, { withFileTypes: true })) {
    const p = path.join(root, e.name);
    if (e.isDirectory()) found.push(...(await findFiles(p, name)));
    else if (e.name === name) found.push(p);
  }
  return found;
}
