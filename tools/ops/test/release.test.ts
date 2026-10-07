import { describe, expect, it } from "vitest";
import { staleBranches } from "../src/branches.ts";
import { changesFrom, latestTag, nextVersion, releaseNotes } from "../src/release.ts";

describe("release versions", () => {
  it("bump the newest vX.Y.Z tag and ignore other tags", () => {
    const tags = ["v1.2.3", "v1.10.0", "v1.9.9", "nightly", "v2.0.0-rc.1", "x1.0.0"];
    expect(latestTag(tags)).toBe("v1.10.0");
    expect(nextVersion(tags, "patch")).toBe("v1.10.1");
    expect(nextVersion(tags, "minor")).toBe("v1.11.0");
    expect(nextVersion(tags, "major")).toBe("v2.0.0");
  });

  it("start from v0.0.0, or take an explicit version that must be newer", () => {
    expect(nextVersion([], "patch")).toBe("v0.0.1");
    expect(nextVersion([], "patch", "1.0.0")).toBe("v1.0.0");
    expect(nextVersion(["v1.0.0"], "patch", "v1.1.0")).toBe("v1.1.0");
    expect(() => nextVersion(["v1.0.0"], "patch", "1.0.0")).toThrow(/not newer/);
    expect(() => nextVersion([], "patch", "1.0")).toThrow(/not a version/);
  });
});

describe("release notes", () => {
  const commits = [
    { sha: "a".repeat(40), subject: "Merge pull request #135 from owner/claude/demo-reduced-motion", body: "Landing demo plays for everyone: fades under reduced motion\n" },
    { sha: "b".repeat(40), subject: "Merge remote-tracking branch 'origin/main' into claude/x", body: "" },
    { sha: "c".repeat(40), subject: "Editor: crop photos in place (#140)", body: "Squashed body" },
    { sha: "d".repeat(40), subject: "Merge pull request #141 from owner/ops/backups", body: "" },
    { sha: "e".repeat(40), subject: "Fix a typo", body: "" },
  ];

  it("list each merged PR by its title, squash merges too, and leave out merges of main into branches", () => {
    expect(changesFrom(commits)).toEqual([
      { title: "Landing demo plays for everyone: fades under reduced motion", pr: 135, sha: "a".repeat(40) },
      { title: "Editor: crop photos in place", pr: 140, sha: "c".repeat(40) },
      { title: "owner/ops/backups", pr: 141, sha: "d".repeat(40) },
      { title: "Fix a typo", pr: null, sha: "e".repeat(40) },
    ]);
  });

  it("render as Markdown with the version, commit and previous tag", () => {
    const notes = releaseNotes({ version: "v1.3.0", previous: "v1.2.0", target: "f".repeat(40), date: "2026-10-07", changes: changesFrom(commits.slice(0, 3)) });
    expect(notes).toBe(
      "## v1.3.0 (2026-10-07)\n\nCommit fffffff, changes since v1.2.0.\n\n- Landing demo plays for everyone: fades under reduced motion (#135)\n- Editor: crop photos in place (#140)\n",
    );
    expect(releaseNotes({ version: "v1.0.0", previous: null, target: "f".repeat(40), date: "2026-10-07", changes: [] })).toContain("the first release.\n\n- No changes since the previous release.");
  });
});

describe("stale branches", () => {
  const now = new Date("2026-10-07T03:00:00Z");
  const old = "2026-09-20T10:00:00+02:00";
  const recent = "2026-10-05T10:00:00+02:00";
  const b = (name: string, sha: string, committedAt: string) => ({ name, sha, committedAt });

  it("are branches in main (by ancestry or as a merged PR's head) older than the cutoff, never main, release or an open PR's", () => {
    const stale = staleBranches({
      branches: [b("main", "m", old), b("release", "r", old), b("claude/merged", "1", old), b("claude/squashed", "2", old), b("claude/reused", "3", old), b("claude/open", "4", old), b("claude/fresh", "5", recent), b("claude/unmerged", "6", old)],
      mergedByAncestry: new Set(["main", "release", "claude/merged", "claude/open", "claude/fresh"]),
      mergedPrHeads: new Map([
        ["claude/squashed", new Set(["2"])],
        ["claude/reused", new Set(["old-tip"])],
      ]),
      openPrBranches: new Set(["claude/open"]),
      now,
      days: 7,
    });
    expect(stale.map((s) => s.name)).toEqual(["claude/merged", "claude/squashed"]);
  });
});
