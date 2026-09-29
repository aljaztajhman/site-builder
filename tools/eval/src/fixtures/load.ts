import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FixtureBrief, FixtureEdits, type Fixture } from "./schema.ts";

/** Absolute path of tools/eval/fixtures. */
export const FIXTURES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../fixtures");

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8")) as unknown;
}

function issues(e: { issues: { path: PropertyKey[]; message: string }[] }): string {
  return e.issues.map((i) => `  ${i.path.map(String).join(".") || "(root)"}: ${i.message}`).join("\n");
}

/** Load and validate one fixture by id. Throws with every schema issue listed. */
export function loadFixture(id: string): Fixture {
  const dir = path.join(FIXTURES_DIR, id);
  if (!existsSync(dir)) throw new Error(`Fixture not found: ${id} (looked in ${dir})`);

  const brief = FixtureBrief.safeParse(readJson(path.join(dir, "brief.json")));
  if (!brief.success) throw new Error(`Fixture ${id}: brief.json is invalid\n${issues(brief.error)}`);
  const edits = FixtureEdits.safeParse(readJson(path.join(dir, "edits.json")));
  if (!edits.success) throw new Error(`Fixture ${id}: edits.json is invalid\n${issues(edits.error)}`);

  const b = brief.data;
  if (b.id !== id) throw new Error(`Fixture ${id}: brief.id "${b.id}" does not match its directory`);
  const logoPath = b.logo ? path.join(dir, b.logo) : null;
  if (logoPath && !existsSync(logoPath)) throw new Error(`Fixture ${id}: logo ${b.logo} does not exist`);

  return {
    id,
    dir,
    brief: b,
    edits: edits.data,
    logoPath,
    photos: b.photos.map((p) => ({ ...p, path: path.join(dir, ...p.file.split("/")) })),
  };
}

/** All fixtures, sorted by id. */
export function loadFixtures(): Fixture[] {
  return readdirSync(FIXTURES_DIR)
    .filter((name) => statSync(path.join(FIXTURES_DIR, name)).isDirectory())
    .filter((name) => existsSync(path.join(FIXTURES_DIR, name, "brief.json")))
    .sort()
    .map(loadFixture);
}
