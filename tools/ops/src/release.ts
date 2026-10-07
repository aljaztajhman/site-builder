/**
 * Release versions and notes for the promote workflow (docs/dev/workflow.md §3). Pure functions; the
 * workflow's git and gh calls are in release-cli.ts.
 */

export type Bump = "patch" | "minor" | "major";

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)$/;

const parse = (v: string): [number, number, number] | null => {
  const m = SEMVER.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};
const cmp = (a: [number, number, number], b: [number, number, number]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const fmt = (v: [number, number, number]) => `v${v.join(".")}`;

/** The newest release tag (vX.Y.Z; other tags are ignored), or null. */
export function latestTag(tags: string[]): string | null {
  const parsed = tags.map((t) => ({ t, v: /^v\d/.test(t) ? parse(t) : null })).filter((x): x is { t: string; v: [number, number, number] } => !!x.v);
  parsed.sort((a, b) => cmp(b.v, a.v));
  return parsed[0]?.t ?? null;
}

/**
 * The next tag: `explicit` (1.0.0 or v1.0.0) when given, which must be newer than every release tag;
 * otherwise the newest tag bumped (from v0.0.0 when there is none).
 */
export function nextVersion(tags: string[], bump: Bump, explicit?: string): string {
  const latest = latestTag(tags);
  const current = latest ? parse(latest)! : ([0, 0, 0] as [number, number, number]);
  if (explicit?.trim()) {
    const v = parse(explicit);
    if (!v) throw new Error(`"${explicit}" is not a version like 1.2.3`);
    if (latest && cmp(v, current) <= 0) throw new Error(`${fmt(v)} is not newer than ${latest}`);
    return fmt(v);
  }
  if (bump === "major") return fmt([current[0] + 1, 0, 0]);
  if (bump === "minor") return fmt([current[0], current[1] + 1, 0]);
  return fmt([current[0], current[1], current[2] + 1]);
}

export interface Commit {
  sha: string;
  subject: string;
  body: string;
}

export interface Change {
  title: string;
  pr: number | null;
  sha: string;
}

/**
 * What landed on main, from its first-parent history: a merge commit stands for its PR (the title is the
 * merge's body, GitHub's default), a squash commit "Title (#12)" too; merges of main into a branch are left
 * out; any other commit is listed by its subject.
 */
export function changesFrom(commits: Commit[]): Change[] {
  const out: Change[] = [];
  for (const c of commits) {
    const merge = /^Merge pull request #(\d+) from (\S+)/.exec(c.subject);
    if (merge) {
      const title = c.body.split("\n").map((l) => l.trim()).find(Boolean) ?? merge[2]!;
      out.push({ title, pr: Number(merge[1]), sha: c.sha });
      continue;
    }
    if (/^Merge (remote-tracking )?branch /.test(c.subject)) continue;
    const squash = /^(.*\S)\s+\(#(\d+)\)$/.exec(c.subject);
    out.push(squash ? { title: squash[1]!, pr: Number(squash[2]), sha: c.sha } : { title: c.subject, pr: null, sha: c.sha });
  }
  return out;
}

/** Release notes in Markdown (the GitHub release's body and the run summary). */
export function releaseNotes(opts: { version: string; previous: string | null; target: string; date: string; changes: Change[] }): string {
  const lines = [`## ${opts.version} (${opts.date})`, "", `Commit ${opts.target.slice(0, 7)}${opts.previous ? `, changes since ${opts.previous}` : ", the first release"}.`, ""];
  if (!opts.changes.length) lines.push("- No changes since the previous release.");
  for (const c of opts.changes) lines.push(`- ${c.title}${c.pr ? ` (#${c.pr})` : ` (${c.sha.slice(0, 7)})`}`);
  return `${lines.join("\n")}\n`;
}
