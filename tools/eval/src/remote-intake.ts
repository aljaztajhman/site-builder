/**
 * Runs fixture intakes against a deployed environment through its public API, like a user would:
 * log in, upload description + photos + logo, wait for generation, report status and cost.
 *
 *   REMOTE_URL=https://… REMOTE_PASSWORD=… pnpm tsx tools/eval/src/remote-intake.ts <fixture-id> [<fixture-id> …]
 *
 * Needs the fixture photos: `pnpm fixtures:photos`.
 */
import { readFile } from "node:fs/promises";
import { loadFixture } from "./fixtures/load.ts";
import { remoteAdmin } from "./remote-session.ts";

const base = process.env.REMOTE_URL;
const password = process.env.REMOTE_PASSWORD;
const ids = process.argv.slice(2);
if (!base || !password || ids.length === 0) {
  console.error("usage: REMOTE_URL=… REMOTE_PASSWORD=… remote-intake.ts <fixture-id> …");
  process.exit(2);
}

const admin = await remoteAdmin(base, password);
if (!admin.ok) throw new Error(`login failed: ${admin.status}`);
const cookie = admin.cookie;

async function intake(id: string): Promise<string> {
  const f = loadFixture(id);
  const form = new FormData();
  form.set("_csrf", admin.csrf);
  form.set("description", f.brief.description);
  form.set("scope", "full");
  for (const p of f.photos) form.append("photos", new Blob([await readFile(p.path)], { type: "image/jpeg" }), p.file.split("/").pop());
  if (f.logoPath) form.set("logo", new Blob([await readFile(f.logoPath)], { type: "image/svg+xml" }), "logo.svg");
  const res = await fetch(`${base}/api/sites`, { method: "POST", body: form, headers: { cookie }, redirect: "manual" });
  const loc = res.headers.get("location");
  if (res.status !== 303 || !loc) throw new Error(`${id}: intake failed ${res.status} ${await res.text()}`);
  return loc.split("/").pop()!;
}

const started = Date.now();
const sites = await Promise.all(ids.map(async (id) => ({ id, siteId: await intake(id) })));
for (const s of sites) console.log(`${s.id}: ${base}/sites/${s.siteId}`);

for (;;) {
  const states = await Promise.all(
    sites.map(async (s) => {
      const r = (await (await fetch(`${base}/api/sites/${s.siteId}`, { headers: { cookie } })).json()) as {
        site: { status: string };
        version: number | null;
        cost: { stage: string; eur: number }[];
        events: { stage: string; level: string; message: string }[];
        blockers: string[];
      };
      return { ...s, ...r };
    }),
  );
  const done = states.every((s) => s.site.status === "ready" || s.site.status === "failed");
  if (done || Date.now() - started > 20 * 60_000) {
    for (const s of states) {
      const eur = s.cost.reduce((a, c) => a + c.eur, 0);
      const checks = s.events.filter((e) => e.stage === "check").map((e) => e.message);
      const errors = s.events.filter((e) => e.level === "error").map((e) => e.message);
      console.log(`${s.id}: ${s.site.status}, v${s.version}, €${eur.toFixed(3)}, ${((Date.now() - started) / 1000).toFixed(0)} s wall`);
      console.log(`  stages: ${s.cost.map((c) => `${c.stage} €${c.eur.toFixed(3)}`).join(", ")}`);
      console.log(`  checks: ${checks.join(" | ")}`);
      if (errors.length) console.log(`  errors: ${errors.join(" | ")}`);
      console.log(`  publish blockers: ${s.blockers.length}`);
    }
    break;
  }
  await new Promise((r) => setTimeout(r, 10_000));
}
