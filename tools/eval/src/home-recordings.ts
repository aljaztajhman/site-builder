/**
 * pnpm recordings:home — homepage-scope replay recordings for every fixture, built from its golden spec with no
 * model call (it-home-replay), in tools/eval/recordings/<id>/home/. The worker's replay mode (MODEL_REPLAY_DIR =
 * a fixture's recordings) answers a homepage job (a free preview) from them and a full-site job from the recorded
 * full-site calls, so a replay demo and the `pnpm smoke:launch` dry run can make a free preview.
 *
 * A replayed answer can't follow what a visitor typed: the facts of the fixture's homepage aren't in another
 * description, so the content step's fact check asks again. The content answer is therefore there once per allowed
 * attempt (config limits.contentRetries + 1): the job then ends like a real one whose model couldn't fix them (the
 * site is saved, the issues logged, publishing blocked). With the fixture's own description the first one passes.
 * The chat edits only change the header's tone, so they apply to any homepage.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@sb/config";
import type { Recording } from "@sb/engine";
import { migrateSpec, type SiteSpec } from "@sb/spec";
import { loadFixtures } from "./fixtures/load.ts";
import type { Fixture } from "./fixtures/schema.ts";
import { syntheticRecordings } from "./synthetic.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
export const RECORDINGS_DIR = path.join(here, "../recordings");
const GOLDEN_DIR = path.join(here, "../golden");

/** Chat edits a replayed homepage answers with, in turn: the header dark, light, as the page. */
export const HOME_EDITS = [
  { reply: "Glavo smo potemnili.", patches: [{ op: "add", path: "/chrome/header/tone", value: "inverse" }] },
  { reply: "Glava je zdaj svetla.", patches: [{ op: "replace", path: "/chrome/header/tone", value: "alt" }] },
  { reply: "Glava je spet v barvi strani.", patches: [{ op: "replace", path: "/chrome/header/tone", value: "default" }] },
];

/** The homepage-scope recordings of one fixture, numbered in call order. */
export function homeRecordings(fixture: Fixture): Recording[] {
  const golden = migrateSpec(JSON.parse(readFileSync(path.join(GOLDEN_DIR, `${fixture.id}.json`), "utf8"))) as SiteSpec;
  const base = syntheticRecordings(fixture, golden, HOME_EDITS, "home");
  const attempts = loadConfig().limits.contentRetries + 1;
  const out = base.flatMap((r) => (r.stage === "content" ? Array.from({ length: attempts }, () => r) : [r]));
  return out.map((r, seq) => ({ ...r, seq }));
}

export const homeDir = (id: string) => path.join(RECORDINGS_DIR, id, "home");
export const recordingFile = (r: Recording) => `${String(r.seq).padStart(3, "0")}-${r.stage}.json`;

/** Writes every fixture's homepage recordings, replacing what was there. */
export function writeHomeRecordings(): string[] {
  const written: string[] = [];
  for (const fixture of loadFixtures()) {
    const dir = homeDir(fixture.id);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    for (const r of homeRecordings(fixture)) writeFileSync(path.join(dir, recordingFile(r)), `${JSON.stringify(r, null, 2)}\n`);
    written.push(`${fixture.id}: ${readdirSync(dir).length} recordings`);
  }
  return written;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const line of writeHomeRecordings()) console.log(line);
}
