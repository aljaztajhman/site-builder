/**
 * The nightly stale-branch report (docs/dev/workflow.md §2, §6): remote branches whose work is in main
 * (merged by ancestry, or the head of a merged pull request, which covers squash merges) and whose last
 * commit is older than `days`. Never main or release, never a branch with an open pull request.
 */

export interface RemoteBranch {
  name: string;
  sha: string;
  /** Last commit time, ISO. */
  committedAt: string;
}

export interface StaleInput {
  branches: RemoteBranch[];
  /** Branches main contains (git branch -r --merged). */
  mergedByAncestry: Set<string>;
  /** Head commit of every merged pull request, by branch name (a branch reused later has another tip). */
  mergedPrHeads: Map<string, Set<string>>;
  /** Branches with an open pull request. */
  openPrBranches: Set<string>;
  now: Date;
  days: number;
}

export const KEEP = new Set(["main", "release"]);

export function staleBranches(input: StaleInput): RemoteBranch[] {
  const cutoff = input.now.getTime() - input.days * 86_400_000;
  return input.branches
    .filter((b) => !KEEP.has(b.name) && !input.openPrBranches.has(b.name))
    .filter((b) => input.mergedByAncestry.has(b.name) || input.mergedPrHeads.get(b.name)?.has(b.sha))
    .filter((b) => Date.parse(b.committedAt) < cutoff)
    .sort((a, b) => a.committedAt.localeCompare(b.committedAt));
}
