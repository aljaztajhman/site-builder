/**
 * tsx tools/ops/src/branches-cli.ts [--days 7] [--delete]
 *
 * Lists remote branches already in main and older than --days (branches.ts) and, with --delete, deletes them
 * from origin. Needs a full clone (fetch-depth: 0) and the gh CLI with GH_TOKEN. Writes the list to
 * $GITHUB_STEP_SUMMARY when set.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { staleBranches, type RemoteBranch } from "./branches.ts";

const args = process.argv.slice(2);
const days = Number(args.includes("--days") ? args[args.indexOf("--days") + 1] : 7);
const remove = args.includes("--delete");
const run = (cmd: string, ...a: string[]) => execFileSync(cmd, a, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

const branches: RemoteBranch[] = run("git", "for-each-ref", "refs/remotes/origin", "--format=%(refname:lstrip=3)%09%(objectname)%09%(committerdate:iso-strict)")
  .split("\n")
  .filter(Boolean)
  .map((l) => l.split("\t"))
  .filter(([name]) => name && name !== "HEAD")
  .map(([name, sha, committedAt]) => ({ name: name!, sha: sha!, committedAt: committedAt! }));
const mergedByAncestry = new Set(
  run("git", "for-each-ref", "refs/remotes/origin", "--merged", "origin/main", "--format=%(refname:lstrip=3)")
    .split("\n")
    .filter(Boolean),
);
const prs = (state: string) => JSON.parse(run("gh", "pr", "list", "--state", state, "--limit", "1000", "--json", "headRefName,headRefOid")) as { headRefName: string; headRefOid: string }[];
const mergedPrHeads = new Map<string, Set<string>>();
for (const p of prs("merged")) mergedPrHeads.set(p.headRefName, (mergedPrHeads.get(p.headRefName) ?? new Set()).add(p.headRefOid));
const openPrBranches = new Set(prs("open").map((p) => p.headRefName));

const stale = staleBranches({ branches, mergedByAncestry, mergedPrHeads, openPrBranches, now: new Date(), days });
const lines = [`${stale.length} of ${branches.length} remote branches are in main and older than ${days} days${remove ? "; deleting them" : " (report only)"}.`, ...stale.map((b) => `${b.name} (${b.committedAt.slice(0, 10)})`)];
console.log(lines.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Stale branches\n\n${lines.map((l, i) => (i ? `- ${l}` : l)).join("\n")}\n\n`);
if (remove) {
  for (let i = 0; i < stale.length; i += 20) {
    const batch = stale.slice(i, i + 20).map((b) => b.name);
    run("git", "push", "origin", "--delete", ...batch);
    console.log(`deleted ${batch.join(", ")}`);
  }
}
