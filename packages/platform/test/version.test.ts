import { describe, expect, it } from "vitest";
import { readVersion, versionLabel } from "../src/version.ts";

const noGit = () => null;

describe("running version", () => {
  it("takes Railway's commit SHA first, then GIT_COMMIT_SHA, then git", () => {
    const sha = "0123456789abcdef0123456789abcdef01234567";
    expect(readVersion({ RAILWAY_GIT_COMMIT_SHA: sha, GIT_COMMIT_SHA: "fedcba9" }, noGit)).toEqual({ sha: "0123456", tag: null });
    expect(readVersion({ GIT_COMMIT_SHA: "FEDCBA98" }, noGit).sha).toBe("fedcba9");
    expect(readVersion({}, () => sha).sha).toBe("0123456");
    expect(readVersion({}, noGit)).toEqual({ sha: null, tag: null });
  });

  it("shows only a SHA-shaped commit and a release-shaped tag, never other variable content", () => {
    expect(readVersion({ RAILWAY_GIT_COMMIT_SHA: "not a sha; rm -rf", APP_VERSION: "<script>" }, noGit)).toEqual({ sha: null, tag: null });
    expect(readVersion({ APP_VERSION: "v1.2.3" }, noGit).tag).toBe("v1.2.3");
    expect(readVersion({ APP_VERSION: "v2.0.0-rc.1" }, noGit).tag).toBe("v2.0.0-rc.1");
    expect(readVersion({ APP_VERSION: "1.2.3" }, noGit).tag).toBeNull();
  });

  it("labels it for the start-up log", () => {
    expect(versionLabel({ sha: "abc1234", tag: "v1.0.0" })).toBe("v1.0.0 (abc1234)");
    expect(versionLabel({ sha: "abc1234", tag: null })).toBe("abc1234");
    expect(versionLabel({ sha: null, tag: null })).toBe("unknown");
  });
});
