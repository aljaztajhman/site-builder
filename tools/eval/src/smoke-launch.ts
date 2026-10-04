/**
 * pnpm smoke:launch <site-id> [--check]
 *
 * The deployed smoke test with the free generation limits in one command (it-smoke-test-limits): checks for free
 * that the environment is ready (REMOTE_URL and REMOTE_PASSWORD set, the site ready, Cloudflare's always-pass
 * Turnstile keys in place), prints the owner's key-swap steps when they aren't, and otherwise runs remote-smoke.ts
 * with --limits (~€0.42 in model calls) and prints the steps to restore the real keys. --check stops after the free
 * checks. Never reads or prints the real Turnstile keys or the access password.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { repoRoot } from "@sb/config";
import { remoteAdmin } from "./remote-session.ts";
import { swapSteps, turnstileKeyKind } from "./smoke-launch-steps.ts";

const siteId = process.argv[2];
const checkOnly = process.argv.includes("--check");
const base = process.env.REMOTE_URL;
const password = process.env.REMOTE_PASSWORD;
const steps = swapSteps({ url: base ?? "https://<preview web URL>", siteId: siteId ?? "<site-id>" });
const print = (title: string, list: string[]) => console.log(`\n${title}\n${list.map((s, i) => `  ${i + 1}. ${s}`).join("\n")}\n`);

if (!siteId || siteId.startsWith("--") || !base || !password) {
  console.error(`usage: REMOTE_URL=… REMOTE_PASSWORD=… pnpm smoke:launch <site-id> [--check]${!base ? "\n  REMOTE_URL is not set" : ""}${!password ? "\n  REMOTE_PASSWORD is not set" : ""}`);
  print("Before the run (owner):", steps.before);
  process.exit(2);
}

// Free checks: the landing page's Turnstile key kind (a public value; not printed), the admin login, the site.
const landing = await fetch(base).then((r) => r.text()).catch(() => "");
const keys = turnstileKeyKind(landing);
const admin = await remoteAdmin(base, password);
const site = admin.ok
  ? ((await (await fetch(`${base}/api/sites/${siteId}`, { headers: { cookie: admin.cookie } })).json().catch(() => null)) as { site?: { status: string }; version?: number | null } | null)
  : null;
console.log(`landing reachable: ${landing ? "yes" : "no"}`);
console.log(`Turnstile keys: ${keys === "test" ? "Cloudflare's test keys (the anonymous steps can run)" : keys === "production" ? "production keys" : "none set (previews without an account are refused)"}`);
console.log(`admin login: ${admin.ok ? "ok" : `refused (HTTP ${admin.status})`}`);
console.log(`site ${siteId}: ${site?.site ? `${site.site.status}, v${site.version ?? "–"}` : "not found"}`);

const ready = !!landing && keys === "test" && admin.ok && site?.site?.status === "ready";
if (checkOnly) process.exit(ready ? 0 : 1);
if (!ready) {
  if (keys !== "test") print("Swap in the test keys first (owner):", steps.before);
  console.error("Not ready: nothing was run, no model call made.");
  process.exit(2);
}

console.log("\nRunning remote-smoke.ts --limits (about €0.42 in model calls) …\n");
const child = spawn(process.execPath, ["--import", "tsx", path.join(repoRoot, "tools/eval/src/remote-smoke.ts"), siteId, "--limits"], { stdio: "inherit", env: process.env });
const code = await new Promise<number>((r) => child.on("exit", (c) => r(c ?? 1)));
print("After the run (owner): restore the real keys", steps.after);
process.exit(code);
