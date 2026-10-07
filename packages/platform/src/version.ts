import { execFileSync } from "node:child_process";

/**
 * The version this process runs (docs/dev/workflow.md §3: "which version is live" is one request to /health).
 * - commit: RAILWAY_GIT_COMMIT_SHA (Railway sets it for every deploy from GitHub), else GIT_COMMIT_SHA (any
 *   other build), else the working tree's `git rev-parse HEAD` (local), else null.
 * - tag: APP_VERSION when it is a release tag (v1.2.3); null otherwise. The promote workflow makes the tags.
 * Only these two shapes are ever echoed, never the raw variable.
 */
export interface RunningVersion {
  /** Short commit SHA (7 hex characters), or null when unknown. */
  sha: string | null;
  /** Release tag such as v1.2.3, or null (staging, local, or production before APP_VERSION is set). */
  tag: string | null;
}

const SHA = /^[0-9a-f]{7,40}$/i;
const TAG = /^v\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

function gitHead(): string | null {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 2000 }).trim();
  } catch {
    return null;
  }
}

export function readVersion(env: NodeJS.ProcessEnv = process.env, git: () => string | null = gitHead): RunningVersion {
  const commit = [env.RAILWAY_GIT_COMMIT_SHA, env.GIT_COMMIT_SHA].map((v) => v?.trim()).find((v) => v && SHA.test(v)) ?? git();
  const tag = env.APP_VERSION?.trim();
  return { sha: commit && SHA.test(commit) ? commit.slice(0, 7).toLowerCase() : null, tag: tag && TAG.test(tag) ? tag : null };
}

let cached: RunningVersion | undefined;
/** readVersion() once per process (it may run git). */
export function runningVersion(): RunningVersion {
  return (cached ??= readVersion());
}

/** "v1.2.3 (abc1234)", "abc1234", or "unknown", for logs. */
export function versionLabel(v: RunningVersion): string {
  if (v.tag && v.sha) return `${v.tag} (${v.sha})`;
  return v.tag ?? v.sha ?? "unknown";
}
