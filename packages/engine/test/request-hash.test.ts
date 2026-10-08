import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadConfig } from "@sb/config";
import { migrateSpec, type SiteSpec } from "@sb/spec";
import { ModelClient, editSpec, requestHash, type ModelRequest, type ModelTransport } from "../src/index.ts";

const config = loadConfig();
const here = path.dirname(fileURLToPath(import.meta.url));
const golden = migrateSpec(JSON.parse(readFileSync(path.join(here, "../../../tools/eval/golden/gostilna-zlata-zlica.json"), "utf8")));

/** The golden with its pictures and logo stored the way a run stores them: under `sites/<site id>/`. */
function specOf(siteId: string): SiteSpec {
  const key = (src: string) => `sites/${siteId}/${src}`;
  const a = golden.assets;
  return { ...golden, assets: { ...a, images: a.images.map((i) => ({ ...i, src: key(i.src) })), ...(a.logo ? { logo: { ...a.logo, src: key(a.logo.src) } } : {}) } };
}

const STOP = new Error("captured");
/** The edit request the editor sends for this spec and message (the transport keeps it and answers nothing). */
async function editRequest(spec: SiteSpec, message: string): Promise<ModelRequest> {
  const seen: ModelRequest[] = [];
  const transport: ModelTransport = {
    async send(r) {
      seen.push(r);
      throw STOP;
    },
  };
  const client = new ModelClient({ config, transport, spentToday: async () => 0, onCall: async () => undefined });
  await expect(editSpec(client, { spec, message, corpus: "" })).rejects.toBe(STOP);
  return seen[0]!;
}

/** requestHash before site ids were normalised: recordings committed until 2026-10-08 carry it. */
const legacyHash = (req: ModelRequest, model: string) =>
  createHash("sha256")
    .update(JSON.stringify({ model, stage: req.stage, system: req.system, messages: req.messages, schema: req.schema ?? null }))
    .digest("hex")
    .slice(0, 16);

const A = "site_0123456789abcdef";
const B = "site_fedcba9876543210";
const model = config.models.edit.model;

describe("requestHash and the run's site id", () => {
  it("hashes the same edit request equally for two runs' site ids, and sends each run's real id", async () => {
    const a = await editRequest(specOf(A), "Temnejša glava.");
    const b = await editRequest(specOf(B), "Temnejša glava.");
    expect(golden.assets.images.length).toBeGreaterThan(0);
    // The model still gets the real storage keys: only the hash ignores the id.
    expect(JSON.stringify(a.messages)).toContain(`sites/${A}/uploads/`);
    expect(JSON.stringify(b.messages)).toContain(`sites/${B}/uploads/`);
    expect(JSON.stringify(a.messages)).not.toBe(JSON.stringify(b.messages));
    expect(legacyHash(a, model)).not.toBe(legacyHash(b, model));
    expect(requestHash(a, model)).toBe(requestHash(b, model));
  });

  it("still tells a real change apart: another message, another picture, another storage folder", async () => {
    const base = requestHash(await editRequest(specOf(A), "Temnejša glava."), model);
    expect(requestHash(await editRequest(specOf(B), "Svetlejša glava."), model)).not.toBe(base);
    const s = specOf(B);
    const moved = { ...s, assets: { ...s.assets, images: s.assets.images.map((i, n) => (n === 0 ? { ...i, src: i.src.replace("/uploads/", "/generated/") } : i)) } };
    expect(requestHash(await editRequest(moved, "Temnejša glava."), model)).not.toBe(base);
  });

  it("gives a request without a site id the hash it had before (committed recordings keep matching)", async () => {
    const plain = await editRequest(golden, "Temnejša glava.");
    expect(JSON.stringify(plain.messages)).not.toContain("sites/site_");
    expect(requestHash(plain, model)).toBe(legacyHash(plain, model));
    const brief: ModelRequest = { stage: "brief", system: ["sys"], messages: [{ role: "user", content: "Pekarna v Kamniku." }] };
    expect(requestHash(brief, "m")).toBe(legacyHash(brief, "m"));
  });

  it("normalises only a site id in a storage key, nothing that merely looks like one", () => {
    const req = (content: string): ModelRequest => ({ stage: "edit", system: ["sys"], messages: [{ role: "user", content }] });
    for (const text of [`site ${A} in prose`, `_sites/${A}/index.html`, `sites/${A.slice(0, -1)}/uploads/a.jpg`, `sites/${A.toUpperCase()}/uploads/a.jpg`]) {
      expect(requestHash(req(text), "m"), text).toBe(legacyHash(req(text), "m"));
    }
    expect(requestHash(req(`sites/${A}/media/x.avif`), "m")).toBe(requestHash(req(`sites/${B}/media/x.avif`), "m"));
  });
});
