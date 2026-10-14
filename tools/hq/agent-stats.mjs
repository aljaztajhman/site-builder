#!/usr/bin/env node
// Agent-team numbers for the HQ dashboard (`meta/dashboard.team`). Reads this machine's Claude Code transcripts for
// this project (main sessions and their sub-agents) and the delegation hook's log; prints the `team` JSON.
// Cloud sessions aren't on this machine, so they aren't counted.
// Usage: node tools/hq/agent-stats.mjs [--rules-from 2026-10-11]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const argi = process.argv.indexOf("--rules-from");
const RULES_FROM = argi > 0 ? process.argv[argi + 1] : "2026-10-11";
const ROOT = path.join(os.homedir(), ".claude", "projects");
const ROLE = {
  "general-purpose": "General (untyped)", claude: "General (untyped)", Explore: "Scout", scout: "Scout",
  builder: "Builder", "asset-maker": "Asset maker", reviewer: "Reviewer", implementer: "Implementer",
  mechanic: "Mechanic", "test-runner": "Test runner", researcher: "Researcher", Plan: "Planner",
};
const family = (m) => (/opus/.test(m) ? "Opus" : /sonnet/.test(m) ? "Sonnet" : /haiku/.test(m) ? "Haiku" : /fable/.test(m) ? "Fable" : null);

function scan(file) {
  let first = null, out = 0;
  const models = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line) continue;
    let j;
    try { j = JSON.parse(line); } catch { continue; }
    if (j.timestamp && !first) first = j.timestamp;
    const u = j.type === "assistant" && j.message?.usage;
    if (!u) continue;
    out += u.output_tokens || 0;
    const f = family(j.message.model || "");
    if (f) models[f] = (models[f] || 0) + 1;
  }
  const model = Object.entries(models).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { first, out, model };
}

const subs = [];
let mainOut = 0, sessions = 0;
for (const dir of fs.readdirSync(ROOT).filter((d) => d.includes("site-builder"))) {
  const dp = path.join(ROOT, dir);
  for (const f of fs.readdirSync(dp)) {
    if (f.endsWith(".jsonl")) { sessions++; mainOut += scan(path.join(dp, f)).out; }
    const sd = path.join(dp, f, "subagents");
    if (!fs.existsSync(sd)) continue;
    for (const s of fs.readdirSync(sd).filter((x) => x.endsWith(".jsonl"))) {
      let meta = {};
      try { meta = JSON.parse(fs.readFileSync(path.join(sd, s.replace(/\.jsonl$/, ".meta.json")), "utf8")); } catch { /* no meta: untyped */ }
      const r = scan(path.join(sd, s));
      if (r.model) subs.push({ ...r, type: meta.agentType || "general-purpose" });
    }
  }
}
subs.sort((a, b) => (a.first || "").localeCompare(b.first || ""));

const mix = (rows) => {
  const m = { Opus: 0, Sonnet: 0, Haiku: 0, Fable: 0 };
  for (const r of rows) m[r.model]++;
  return m;
};
const day = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const before = subs.filter((r) => r.first < RULES_FROM);
const after = subs.filter((r) => r.first >= RULES_FROM);
const roles = {};
for (const r of subs) { const k = ROLE[r.type] ?? r.type; roles[k] = (roles[k] || 0) + 1; }
if (!("Implementer" in roles)) roles.Implementer = 0;

let blocked = 0;
const log = path.join(process.cwd(), ".claude", "agent-log.jsonl");
if (fs.existsSync(log)) {
  for (const l of fs.readFileSync(log, "utf8").split("\n")) { try { if (JSON.parse(l).blocked) blocked++; } catch { /* partial line */ } }
}
const subOut = subs.reduce((a, r) => a + r.out, 0);
const last = subs.at(-1)?.first ?? new Date().toISOString();

console.log(JSON.stringify({
  since: subs[0] ? day(subs[0].first) : "",
  launches: subs.length,
  sessions,
  subShareOut: Math.round((subOut / Math.max(subOut + mainOut, 1)) * 100),
  before: { label: "Before team rules", sub: before.length ? `${day(before[0].first)} – ${day(new Date(new Date(RULES_FROM) - 864e5).toISOString())}` : "", n: before.length, mix: mix(before) },
  after: { label: "Since team rules", sub: `${day(RULES_FROM)} – ${day(last)}`, n: after.length, mix: mix(after) },
  roles: Object.fromEntries(Object.entries(roles).sort((a, b) => b[1] - a[1])),
  blockedByHook: blocked,
  note: "Local sessions only; cloud runs aren't on this machine.",
}, null, 2));
