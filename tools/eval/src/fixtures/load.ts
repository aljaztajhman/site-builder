import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FixtureBrief, FixtureEdits, type Fixture } from "./schema.ts";

/** Absolute path of tools/eval/fixtures. */
export const FIXTURES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../fixtures");
/**
 * Absolute path of tools/eval/twins: businesses of the same trades as the fixtures, for measuring how alike sites
 * of one trade come out (docs/plans/variety-engine.md, Step 0). No scripted edits; photos reuse the fixtures' own.
 */
export const TWINS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../twins");

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8")) as unknown;
}

function issues(e: { issues: { path: PropertyKey[]; message: string }[] }): string {
  return e.issues.map((i) => `  ${i.path.map(String).join(".") || "(root)"}: ${i.message}`).join("\n");
}

/** Load and validate one fixture by id (a twin when `root` is TWINS_DIR). Throws with every schema issue listed. */
export function loadFixture(id: string, root = FIXTURES_DIR): Fixture {
  const dir = path.join(root, id);
  if (!existsSync(dir)) throw new Error(`Fixture not found: ${id} (looked in ${dir})`);

  const brief = FixtureBrief.safeParse(readJson(path.join(dir, "brief.json")));
  if (!brief.success) throw new Error(`Fixture ${id}: brief.json is invalid\n${issues(brief.error)}`);
  // Twins have no scripted edits (they run with --no-edits); the fixtures have five each.
  const editsFile = path.join(dir, "edits.json");
  const edits = root === TWINS_DIR && !existsSync(editsFile) ? { success: true as const, data: [] } : FixtureEdits.safeParse(readJson(editsFile));
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
    photos: b.photos.map((p) => ({ ...p, path: path.join(p.from ? path.join(FIXTURES_DIR, p.from) : dir, ...p.file.split("/")) })),
  };
}

function loadAll(root: string): Fixture[] {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => statSync(path.join(root, name)).isDirectory())
    .filter((name) => existsSync(path.join(root, name, "brief.json")))
    .sort()
    .map((id) => loadFixture(id, root));
}

/** All fixtures, sorted by id. */
export function loadFixtures(): Fixture[] {
  return loadAll(FIXTURES_DIR);
}

/** The twins, sorted by id. */
export function loadTwins(): Fixture[] {
  return loadAll(TWINS_DIR);
}
