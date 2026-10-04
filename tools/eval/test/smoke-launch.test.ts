import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TURNSTILE_TEST_SECRET_KEY, TURNSTILE_TEST_SITE_KEY, swapSteps, turnstileKeyKind } from "../src/smoke-launch-steps.ts";

/** `pnpm smoke:launch` (it-smoke-test-limits): what it reads from the landing page and what it prints, never a real key. */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("smoke:launch", () => {
  it("tells Cloudflare's test site key from a real one and from none, by the landing page's widget", () => {
    expect(turnstileKeyKind(`<div class="cf-turnstile" data-sitekey="${TURNSTILE_TEST_SITE_KEY}" data-size="flexible"></div>`)).toBe("test");
    expect(turnstileKeyKind('<div class="cf-turnstile" data-sitekey="0x4AAAAAAAreal" data-size="flexible"></div>')).toBe("production");
    expect(turnstileKeyKind("<form><textarea></textarea></form>")).toBe("none");
  });

  it("prints the swap as the owner's steps, with only Cloudflare's public test keys in them", () => {
    const { before, after } = swapSteps({ url: "https://preview.example", siteId: "site_0123456789abcdef" });
    const text = [...before, ...after].join("\n");
    expect(text).toContain(TURNSTILE_TEST_SITE_KEY);
    expect(text).toContain(TURNSTILE_TEST_SECRET_KEY);
    expect(text).toContain("REMOTE_URL=https://preview.example REMOTE_PASSWORD=<the access password> pnpm smoke:launch site_0123456789abcdef");
    expect(text).toMatch(/back to the real values/);
    expect(before[0]).toMatch(/€0\.42/);
  });

  it("without REMOTE_URL and REMOTE_PASSWORD prints the steps, runs nothing and never echoes a key it was given", () => {
    const r = spawnSync(process.execPath, ["--import", "tsx", path.join(root, "tools/eval/src/smoke-launch.ts"), "site_0123456789abcdef"], {
      cwd: root,
      encoding: "utf8",
      env: { PATH: process.env.PATH, TURNSTILE_SECRET_KEY: "real-secret-must-not-print", TURNSTILE_SITE_KEY: "real-site-key-must-not-print" },
      timeout: 60_000,
    });
    expect(r.status).toBe(2);
    const out = `${r.stdout}${r.stderr}`;
    expect(out).toContain("REMOTE_URL is not set");
    expect(out).toContain("Before the run (owner):");
    expect(out).not.toContain("must-not-print");
    expect(out).not.toContain("Running remote-smoke");
  }, 70_000);
});
