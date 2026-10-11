import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadConfig } from "@sb/config";
import { composerFixture } from "@sb/inventory";
import { publishChecklist, type SiteSpec } from "@sb/spec";
import { ImageGenerator, ModelClient, ReplayTransport, runStudio, studioGuards, type MockupDeps, type ModelRequest } from "../src/index.ts";

/**
 * Studio 0.5b on recorded runs (pnpm studio:poc --fixture <id> --record, tools/eval/recordings-studio-mockup): the art
 * director's and the rebuild's answers and the painted mockup, replayed with no call. The page must come from the
 * mockup path, pass the guards, keep every fact the client's, and add no new kind of placeholder.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "../../..");
const RECORDINGS = path.join(ROOT, "tools/eval/recordings-studio-mockup");
const config = loadConfig();

function replayed(id: string) {
  const fx = composerFixture(id);
  const dir = path.join(RECORDINGS, id);
  const seen: ModelRequest[] = [];
  const replay = new ReplayTransport(dir);
  const client = new ModelClient({ config, spentToday: async () => 0, onCall: async () => undefined, transport: { send: (req, stage) => (seen.push(req), replay.send(req, stage)) } });
  const painter = new ImageGenerator({ config, transport: { generate: async () => new Uint8Array(readFileSync(path.join(dir, "mockup.jpg"))) }, spentToday: async () => 0, onCall: async () => undefined });
  const photo = (n: number) => new Uint8Array(readFileSync(path.join(ROOT, "tools/eval/fixtures", id, "photos", `0${n}.jpg`)));
  const deps: MockupDeps = {
    painter,
    photo: async (imgId) => {
      const i = fx.base.assets.images.findIndex((x) => x.id === imgId);
      return i >= 0 ? photo(i + 1) : undefined;
    },
    ...(fx.base.assets.logo ? { logo: async () => new Uint8Array(readFileSync(path.join(ROOT, "tools/eval/fixtures", id, "logo.svg"))) } : {}),
    imageIds: async (n) => Array.from({ length: n }, (_, i) => `img_g${i + 11}`),
    store: async (imgId) => `sites/x/generated/${imgId}.jpg`,
  };
  return { fx, client, deps, seen };
}

const home = (spec: SiteSpec) => spec.pages.find((p) => p.kind === "home")!;

describe("the mockup pipeline on recorded runs", () => {
  it.each(["pekarna-kvas", "avtoservis-mrak"])("%s: built from the mockup, guards pass, the hero first, facts through slots", async (id) => {
    const { fx, client, deps, seen } = replayed(id);
    const r = await runStudio(client, config, { spec: fx.base, brief: fx.sources.brief, corpus: fx.description, seed: 1, ...(fx.tradeWord ? { tradeWord: fx.tradeWord } : {}), mockup: deps });
    if (!r.ok) throw new Error(`${r.reason} / ${r.mockup?.reason}`);
    expect(r.path).toBe("mockup");
    expect(seen.map((q) => q.stage)).toEqual(["artDirector", "rebuild"]);
    expect(r.idea.length).toBeGreaterThan(20);
    expect(studioGuards(r.spec, fx.base, fx.description)).toBeNull();
    const sections = home(r.spec).sections;
    expect((sections[0]!.props as { intent?: string }).intent).toBe("hero");
    expect(sections.length).toBeGreaterThanOrEqual(4);
    // One h1, no call button in a composed section, the phone and the hours still on the page.
    const text = JSON.stringify(sections);
    expect(text.match(/"level":1/g)).toHaveLength(1);
    expect(text).not.toMatch(/"action":"call","label"/);
    expect(text).toMatch(/"kind":"hours"|"type":"opening-hours"|"type":"contact"/);
    // Every crop on the page is a labelled AI picture; the client's photos are their own files.
    for (const img of r.spec.assets.images.filter((i) => i.origin === "generated")) expect(img.src).toMatch(/^sites\/x\/generated\//);
    for (const img of fx.base.assets.images) expect(r.spec.assets.images.find((i) => i.id === img.id)?.origin ?? "client").toBe(img.origin ?? "client");
    // No placeholder kind the golden doesn't have (publishing would block on it).
    const kinds = (s: SiteSpec) => new Set(publishChecklist(s).map((b) => `${b.kind}:${b.kind === "placeholder" ? b.detail : ""}`));
    for (const k of kinds(r.spec)) expect(kinds(fx.base).has(k), k).toBe(true);
    expect(r.mockup!.eur.mockup).toBeGreaterThan(0);
  }, 60_000);
});
