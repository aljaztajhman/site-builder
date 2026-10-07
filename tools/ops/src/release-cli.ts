/**
 * tsx tools/ops/src/release-cli.ts --target <sha> [--bump patch|minor|major] [--version 1.2.3] --notes <file>
 *
 * For the promote workflow: the next tag (from the existing vX.Y.Z tags) and release notes from main's
 * first-parent history between the newest tag and the target commit. Writes the notes to --notes and
 * `version=`, `previous=` to $GITHUB_OUTPUT (or stdout). Needs the full history and tags (fetch-depth: 0).
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
import { changesFrom, latestTag, nextVersion, releaseNotes, type Bump, type Commit } from "./release.ts";

const args = process.argv.slice(2);
const arg = (name: string) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined);
const target = arg("target");
const notesFile = arg("notes");
const bump = (arg("bump") ?? "patch") as Bump;
if (!target || !notesFile || !["patch", "minor", "major"].includes(bump)) {
  console.error("usage: release-cli.ts --target <sha> [--bump patch|minor|major] [--version 1.2.3] --notes <file>");
  process.exit(2);
}
const git = (...a: string[]) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

const sha = git("rev-parse", "--verify", `${target}^{commit}`).trim();
const tags = git("tag", "--list", "v*").split("\n").filter(Boolean);
const previous = latestTag(tags);
const version = nextVersion(tags, bump, arg("version"));
const range = previous ? `${previous}..${sha}` : sha;
const commits: Commit[] = git("log", "--first-parent", "--format=%H%x1f%s%x1f%b%x1e", range)
  .split("\x1e")
  .map((r) => r.replace(/^\n/, ""))
  .filter(Boolean)
  .map((r) => {
    const [sha = "", subject = "", body = ""] = r.split("\x1f");
    return { sha, subject, body };
  });
const notes = releaseNotes({ version, previous, target: sha, date: new Date().toISOString().slice(0, 10), changes: changesFrom(commits) });
writeFileSync(notesFile, notes);
const out = `version=${version}\nprevious=${previous ?? ""}\n`;
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, out);
process.stdout.write(out);
console.log(notes);
