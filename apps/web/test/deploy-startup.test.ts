import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { csrfIn, setCookies } from "./session-helpers.ts";

/**
 * A deployed environment where none of the new optional variables is set yet (NODE_ENV=production,
 * RAILWAY_ENVIRONMENT set; SESSION_SECRET, RESEND_API_KEY, EMAIL_FROM, TURNSTILE_*, APP_URL and
 * RAILWAY_PUBLIC_DOMAIN unset): the real web and worker entry points start, say what is missing in one
 * line, the admin password works, and only the features that need a variable refuse, in Slovene.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const PASSWORD = "deploy-test-password-1234";
const UNSET = ["SESSION_SECRET", "RESEND_API_KEY", "EMAIL_FROM", "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY", "APP_URL", "RAILWAY_PUBLIC_DOMAIN", "MODEL_REPLAY_DIR", "FAL_KEY", "APP_CONFIG_PATH"];
let dir: string;
const children: ChildProcess[] = [];

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-deploy-"));
});
afterAll(async () => {
  for (const c of children) c.kill();
  await new Promise((r) => setTimeout(r, 500));
  await rm(dir, { recursive: true, force: true }).catch(() => undefined);
});

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
  });

/** Starts an entry point as Railway would (production env, the new variables unset); resolves when `ready` is printed. */
function start(entry: string, extra: Record<string, string>, ready: RegExp): Promise<{ output: () => string }> {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production", RAILWAY_ENVIRONMENT: "preview", ACCESS_PASSWORD: PASSWORD, DATABASE_URL: "pglite://memory", STORAGE_DRIVER: "fs", ...extra };
  for (const name of UNSET) delete env[name];
  const child = spawn(process.execPath, ["--import", "tsx", entry], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  let out = "";
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${entry} didn't start in time:\n${out}`)), 90_000);
    const onData = (d: Buffer) => {
      out += d.toString();
      if (ready.test(out)) {
        clearTimeout(timer);
        resolve({ output: () => out });
      }
    };
    child.stdout!.on("data", onData);
    child.stderr!.on("data", onData);
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`${entry} exited with ${code}:\n${out}`));
    });
  });
}

describe("deployed without the new optional variables", () => {
  it("web starts, names what's missing, the admin password works, email sign-in refuses in Slovene", async () => {
    const port = await freePort();
    const web = await start("apps/web/src/main.ts", { PORT: String(port), STORAGE_DIR: path.join(dir, "web") }, /\[web\] http:\/\/localhost:\d+/);
    const base = `http://127.0.0.1:${port}`;
    const line = web.output().split("\n").find((l) => l.startsWith("[web] not set:")) ?? "";
    for (const name of ["SESSION_SECRET", "RESEND_API_KEY", "EMAIL_FROM", "APP_URL", "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"]) expect(line, name).toContain(name);

    expect((await fetch(`${base}/health`)).status).toBe(200);
    const page = await fetch(`${base}/login`);
    expect(page.status).toBe(200);
    const device = setCookies(page).sb_device!;
    const csrf = csrfIn(await page.text());

    // The admin password still works (cookie keys derived from ACCESS_PASSWORD), Secure when deployed.
    const login = await fetch(`${base}/login`, { method: "POST", body: new URLSearchParams({ password: PASSWORD, next: "/sites" }), headers: { cookie: `sb_device=${device}` }, redirect: "manual" });
    expect(login.status).toBe(302);
    expect(login.headers.getSetCookie().find((c) => c.startsWith("sb_session="))).toMatch(/Secure/);
    const sites = await fetch(`${base}/sites`, { headers: { cookie: `sb_device=${device}; sb_session=${setCookies(login).sb_session}` }, redirect: "manual" });
    expect(sites.status).toBe(200);

    // Email sign-in refuses, in Slovene, without crashing anything.
    const email = await fetch(`${base}/login/email`, { method: "POST", body: new URLSearchParams({ email: "ana@siol.net", _csrf: csrf }), headers: { cookie: `sb_device=${device}` } });
    expect(email.status).toBe(503);
    expect(await email.text()).toContain("Prijava po e-pošti trenutno ni na voljo.");

    // Previews without an account refuse (no Turnstile keys), up front on the page and at the intake.
    expect(await (await fetch(`${base}/`, { headers: { cookie: `sb_device=${device}` } })).text()).toContain("Predogled brez prijave trenutno ni na voljo.");
    const ticket = await fetch(`${base}/api/intake/ticket`, {
      method: "POST",
      body: new URLSearchParams({ _csrf: csrf, description: "Pekarna Kvas v Kamniku, Šutna 30. Kruh z drožmi, rogljički in potica." }),
      headers: { cookie: `sb_device=${device}` },
    });
    expect(ticket.status).toBe(503);
    expect(await ticket.json()).toMatchObject({ code: "bot_check_unavailable", message: "Brezplačni predogled brez prijave trenutno ni na voljo. Prijavite se z e-pošto." });
    expect((await fetch(`${base}/health`)).status).toBe(200);
  }, 120_000);

  it("the worker starts", async () => {
    const worker = await start("apps/worker/src/main.ts", { STORAGE_DIR: path.join(dir, "worker") }, /\[worker\] listening/);
    expect(worker.output()).toContain("[worker] listening");
  }, 120_000);
});
