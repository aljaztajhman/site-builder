/**
 * What each model did in a development project, and what it would have cost at Anthropic API prices
 * (HQ it-agent-cost-report). Reads Claude Code transcripts, read-only:
 *   <dir>/<sessionId>.jsonl                          the director (main session)
 *   <dir>/<sessionId>/subagents/agent-<id>.jsonl     each subagent, with agent-<id>.meta.json beside it
 *
 * Usage: pnpm agents:costs [--dir <project transcripts dir>] [--session <id>]... [--since <ISO>] [--until <ISO>]
 *                          [--out <file.md>] [--json <file.json>]
 *
 * Counting rule (checked on real transcripts): one API request is streamed as several assistant lines (one per content
 * block, `apiBlockIndex`) sharing a `requestId`. Input and cache fields are the same on every line; `output_tokens`
 * grows and the last line carries the final count. Each requestId is counted once, taking the maximum of every field.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, priceCard, repoRoot, type AppConfig } from "@sb/config";

type Prices = AppConfig["pricesUsdPerMTok"];

/**
 * Prices of models the product never calls but development agents do. Kept here, not in config: config's price table
 * is what the product's model client bills against (and the daily cap reserves), so it lists only models a stage may
 * run on. Config wins for any model in both. USD per million tokens, Anthropic first-party API (claude-api skill,
 * models table, 2026-10-06): Fable 5.1 cache reads are 0.025x input, Fable 5 0.1x.
 */
export const DEV_PRICES_USD_PER_MTOK: Prices = {
  "claude-fable-5-1": { input: 10, output: 50, cacheWrite5m: 12.5, cacheRead: 0.25 },
  "claude-fable-5": { input: 10, output: 50, cacheWrite5m: 12.5, cacheRead: 1 },
};

/** 1-hour cache writes bill at 2x the base input price on every model (5-minute writes at 1.25x, in config). */
export const CACHE_WRITE_1H_FACTOR = 2;

/** Not API calls: Claude Code writes these for local messages (errors, interrupts). */
const SYNTHETIC_MODELS = new Set(["<synthetic>"]);

export interface Tokens {
  input: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
  output: number;
}

export interface ApiRequest extends Tokens {
  requestId: string;
  model: string;
  at: string;
}

export interface Agent {
  sessionId: string;
  /** "director" for the main session, else the subagent id. */
  agentId: string;
  isDirector: boolean;
  description: string;
  agentType: string;
  role: string;
  /** The alias the agent was launched with (meta.json), if any. */
  modelAlias: string | null;
  /** Effort from meta.json, else the most common effort on its lines. */
  effort: string | null;
  start: string | null;
  end: string | null;
  requests: ApiRequest[];
}

export interface Priced extends Tokens {
  requests: number;
  usd: number;
}

export interface AgentRow extends Priced {
  sessionId: string;
  agentId: string;
  isDirector: boolean;
  description: string;
  agentType: string;
  role: string;
  modelAlias: string | null;
  models: string[];
  effort: string | null;
  start: string | null;
  wallClockMs: number;
}

export interface Report {
  generatedAt: string;
  eurPerUsd: number;
  filters: { sessions: string[] | null; since: string | null; until: string | null };
  totals: Priced & { eur: number };
  perModel: (Priced & { model: string; eur: number; agents: number; descriptions: string[] })[];
  perRole: { role: string; agents: number; usd: number; eur: number }[];
  agents: AgentRow[];
  directors: AgentRow[];
  warnings: string[];
}

export interface Filters {
  sessions?: string[];
  since?: string;
  until?: string;
}

const zero = (): Tokens => ({ input: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, output: 0 });

function inRange(at: string | undefined, f: Filters): boolean {
  if (!at) return !f.since && !f.until;
  const t = Date.parse(at);
  if (f.since && t < Date.parse(f.since)) return false;
  if (f.until && t > Date.parse(f.until)) return false;
  return true;
}

interface Usage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number } | null;
}

function tokensOf(u: Usage): Tokens {
  const write = u.cache_creation_input_tokens ?? 0;
  const w1h = Math.min(u.cache_creation?.ephemeral_1h_input_tokens ?? 0, write);
  return {
    input: u.input_tokens ?? 0,
    // Without the 5m/1h breakdown (older transcripts) every write is taken as 5-minute.
    cacheWrite5m: write - w1h,
    cacheWrite1h: w1h,
    cacheRead: u.cache_read_input_tokens ?? 0,
    output: u.output_tokens ?? 0,
  };
}

interface Line {
  type?: string;
  timestamp?: string;
  requestId?: string;
  effort?: string;
  customTitle?: string;
  message?: { id?: string; model?: string; usage?: Usage };
}

/** One transcript file: its API requests (deduplicated by requestId), time span and efforts, within the filters. */
export function readTranscript(file: string, f: Filters = {}): Pick<Agent, "requests" | "start" | "end"> & { efforts: Map<string, number>; title: string | null } {
  const byId = new Map<string, ApiRequest>();
  const efforts = new Map<string, number>();
  let start: string | null = null;
  let end: string | null = null;
  let title: string | null = null;
  let anon = 0;
  for (const raw of fs.readFileSync(file, "utf8").split("\n")) {
    if (!raw.trim()) continue;
    let e: Line;
    try {
      e = JSON.parse(raw) as Line;
    } catch {
      continue;
    }
    if (e.type === "custom-title" && e.customTitle) title = e.customTitle;
    if (!inRange(e.timestamp, f)) continue;
    if (e.timestamp) {
      if (!start || e.timestamp < start) start = e.timestamp;
      if (!end || e.timestamp > end) end = e.timestamp;
    }
    if (e.type !== "assistant" || !e.message?.usage) continue;
    const model = e.message.model ?? "unknown";
    if (SYNTHETIC_MODELS.has(model)) continue;
    if (e.effort) efforts.set(e.effort, (efforts.get(e.effort) ?? 0) + 1);
    const id = e.requestId ?? e.message.id ?? `line-${anon++}`;
    const t = tokensOf(e.message.usage);
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, { requestId: id, model, at: e.timestamp ?? "", ...t });
      continue;
    }
    for (const k of Object.keys(t) as (keyof Tokens)[]) prev[k] = Math.max(prev[k], t[k]);
  }
  return { requests: [...byId.values()], start, end, efforts, title };
}

function topKey(m: Map<string, number>): string | null {
  let best: string | null = null;
  let count = -1;
  for (const [k, v] of m) if (v > count) [best, count] = [k, v];
  return best;
}

const ROLE_WORDS = ["scout", "builder", "implementer", "reviewer", "review", "architect", "asset-maker", "mechanic", "fable", "fix"];

/** The agent's role: its agent type, or for a generic type the first role word in its description. */
export function roleOf(agentType: string, description: string): string {
  if (agentType && !["general-purpose", "claude", "Explore"].includes(agentType)) return agentType;
  const d = description.toLowerCase();
  const word = ROLE_WORDS.find((w) => new RegExp(`\\b${w}\\b`).test(d));
  if (!word) return agentType === "Explore" ? "explore" : "general-purpose";
  if (word === "review") return "reviewer";
  if (word === "fix") return "builder";
  if (word === "fable") return "architect";
  return word;
}

interface Meta {
  agentType?: string;
  description?: string;
  model?: string;
  effort?: string;
}

/** Every director and subagent of the selected sessions in `dir`. */
export function collectAgents(dir: string, f: Filters = {}): Agent[] {
  const sessions = f.sessions?.length
    ? f.sessions
    : fs.readdirSync(dir).filter((n) => n.endsWith(".jsonl")).map((n) => n.slice(0, -".jsonl".length));
  const agents: Agent[] = [];
  for (const sessionId of sessions) {
    const main = path.join(dir, `${sessionId}.jsonl`);
    const sessionDir = path.join(dir, sessionId);
    if (fs.existsSync(main)) {
      const t = readTranscript(main, f);
      let title = t.title;
      const titleFile = path.join(sessionDir, "custom-title.json");
      if (fs.existsSync(titleFile)) title = (JSON.parse(fs.readFileSync(titleFile, "utf8")) as { customTitle?: string }).customTitle ?? title;
      agents.push({
        sessionId,
        agentId: "director",
        isDirector: true,
        description: title ? `Director: ${title}` : `Director (${sessionId.slice(0, 8)})`,
        agentType: "main session",
        role: "director",
        modelAlias: null,
        effort: topKey(t.efforts),
        start: t.start,
        end: t.end,
        requests: t.requests,
      });
    }
    const subDir = path.join(sessionDir, "subagents");
    if (!fs.existsSync(subDir)) continue;
    for (const name of fs.readdirSync(subDir).filter((n) => n.endsWith(".jsonl")).sort()) {
      const base = name.slice(0, -".jsonl".length);
      const metaFile = path.join(subDir, `${base}.meta.json`);
      const meta: Meta = fs.existsSync(metaFile) ? (JSON.parse(fs.readFileSync(metaFile, "utf8")) as Meta) : {};
      const t = readTranscript(path.join(subDir, name), f);
      const agentType = meta.agentType ?? "unknown";
      const description = meta.description ?? base;
      agents.push({
        sessionId,
        agentId: base.replace(/^agent-/, ""),
        isDirector: false,
        description,
        agentType,
        role: roleOf(agentType, description),
        modelAlias: meta.model ?? null,
        effort: meta.effort ?? topKey(t.efforts),
        start: t.start,
        end: t.end,
        requests: t.requests,
      });
    }
  }
  return agents.filter((a) => a.requests.length > 0);
}

/** USD of one request at API prices; null for a model with no price. Long-prompt card by its whole prompt size. */
export function requestUsd(prices: Prices, r: ApiRequest): number | null {
  if (!prices[r.model]) return null;
  const card = priceCard({ pricesUsdPerMTok: prices }, r.model, r.input + r.cacheWrite5m + r.cacheWrite1h + r.cacheRead);
  return (
    (r.input * card.input +
      r.cacheWrite5m * card.cacheWrite5m +
      r.cacheWrite1h * card.input * CACHE_WRITE_1H_FACTOR +
      r.cacheRead * card.cacheRead +
      r.output * card.output) /
    1_000_000
  );
}

function add(into: Priced, r: Tokens, usd: number): void {
  into.requests += 1;
  into.input += r.input;
  into.cacheWrite5m += r.cacheWrite5m;
  into.cacheWrite1h += r.cacheWrite1h;
  into.cacheRead += r.cacheRead;
  into.output += r.output;
  into.usd += usd;
}

const priced = (): Priced => ({ requests: 0, usd: 0, ...zero() });

export function buildReport(agents: Agent[], config: Pick<AppConfig, "pricesUsdPerMTok" | "eurPerUsd">, f: Filters = {}): Report {
  const prices: Prices = { ...DEV_PRICES_USD_PER_MTOK, ...config.pricesUsdPerMTok };
  const unknown = new Map<string, number>();
  const totals = priced();
  const models = new Map<string, Priced & { agents: Set<string>; descriptions: string[] }>();
  const rows: AgentRow[] = [];
  const byStart = [...agents].sort((x, y) => (x.start ?? "").localeCompare(y.start ?? ""));
  for (const a of byStart) {
    const row: AgentRow = {
      ...priced(),
      sessionId: a.sessionId,
      agentId: a.agentId,
      isDirector: a.isDirector,
      description: a.description,
      agentType: a.agentType,
      role: a.role,
      modelAlias: a.modelAlias,
      models: [],
      effort: a.effort,
      start: a.start,
      wallClockMs: a.start && a.end ? Date.parse(a.end) - Date.parse(a.start) : 0,
    };
    const key = `${a.sessionId}/${a.agentId}`;
    for (const r of a.requests) {
      const usd = requestUsd(prices, r);
      if (usd === null) unknown.set(r.model, (unknown.get(r.model) ?? 0) + 1);
      add(row, r, usd ?? 0);
      add(totals, r, usd ?? 0);
      let m = models.get(r.model);
      if (!m) models.set(r.model, (m = { ...priced(), agents: new Set(), descriptions: [] }));
      add(m, r, usd ?? 0);
      if (!m.agents.has(key)) {
        m.agents.add(key);
        m.descriptions.push(a.description);
      }
      if (!row.models.includes(r.model)) row.models.push(r.model);
    }
    rows.push(row);
  }
  const roles = new Map<string, { agents: number; usd: number }>();
  for (const r of rows) {
    const g = roles.get(r.role) ?? { agents: 0, usd: 0 };
    g.agents += 1;
    g.usd += r.usd;
    roles.set(r.role, g);
  }
  const eur = (usd: number) => usd * config.eurPerUsd;
  return {
    generatedAt: new Date().toISOString(),
    eurPerUsd: config.eurPerUsd,
    filters: { sessions: f.sessions?.length ? f.sessions : null, since: f.since ?? null, until: f.until ?? null },
    totals: { ...totals, eur: eur(totals.usd) },
    perModel: [...models]
      .map(([model, m]) => {
        const { agents: set, descriptions, ...p } = m;
        return { model, ...p, eur: eur(p.usd), agents: set.size, descriptions };
      })
      .sort((x, y) => y.usd - x.usd),
    perRole: [...roles].map(([role, g]) => ({ role, ...g, eur: eur(g.usd) })).sort((x, y) => y.usd - x.usd),
    agents: rows,
    directors: rows.filter((r) => r.isDirector),
    warnings: [...unknown].map(([m, n]) => `No price for model ${m} (${n} requests): counted at $0.`),
  };
}

const n = (x: number) => x.toLocaleString("en-US");
const usd = (x: number) => `$${x.toFixed(2)}`;
const eurS = (x: number) => `€${x.toFixed(2)}`;
const cell = (s: string) => s.replace(/\|/g, "\\|");

function duration(ms: number): string {
  const m = Math.round(ms / 60_000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function renderMarkdown(r: Report): string {
  const out: string[] = [];
  out.push("# Agent costs");
  out.push("");
  out.push(
    "> API-equivalent costs: what these requests would have cost at Anthropic first-party API prices. On the Max plan the work used plan limits (5-hour and weekly), not money.",
  );
  out.push("");
  const f = r.filters;
  out.push(
    `Sessions: ${f.sessions ? f.sessions.join(", ") : "all"}. Range: ${f.since ?? "start"} to ${f.until ?? "now"}. € at ${r.eurPerUsd} per $. Generated ${r.generatedAt}.`,
  );
  out.push("");
  out.push(
    `**Total: ${usd(r.totals.usd)} (${eurS(r.totals.eur)})** over ${n(r.totals.requests)} requests by ${r.agents.length} agents (${r.directors.length} director session${r.directors.length === 1 ? "" : "s"}).`,
  );
  if (r.warnings.length) {
    out.push("");
    for (const w of r.warnings) out.push(`- Warning: ${w}`);
  }
  out.push("");
  out.push("## 1. Per model");
  out.push("");
  out.push("| Model | Requests | Input | Cache write 5m | Cache write 1h | Cache read | Output | USD | EUR |");
  out.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const m of r.perModel)
    out.push(
      `| ${m.model} | ${n(m.requests)} | ${n(m.input)} | ${n(m.cacheWrite5m)} | ${n(m.cacheWrite1h)} | ${n(m.cacheRead)} | ${n(m.output)} | ${usd(m.usd)} | ${eurS(m.eur)} |`,
    );
  out.push(
    `| **Total** | ${n(r.totals.requests)} | ${n(r.totals.input)} | ${n(r.totals.cacheWrite5m)} | ${n(r.totals.cacheWrite1h)} | ${n(r.totals.cacheRead)} | ${n(r.totals.output)} | ${usd(r.totals.usd)} | ${eurS(r.totals.eur)} |`,
  );
  out.push("");
  out.push("## 2. Per agent");
  out.push("");
  out.push("Sorted by start time. Role: the agent type, or for general-purpose agents the role word in the description.");
  out.push("");
  out.push("| Start (UTC) | Agent | Kind | Role | Model | Effort | Wall clock | Requests | Input | Cache write | Cache read | Output | USD |");
  out.push("|---|---|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|");
  for (const a of r.agents) {
    const model = `${a.modelAlias ? `${a.modelAlias} → ` : ""}${a.models.join(", ")}`;
    out.push(
      `| ${a.start?.slice(0, 16).replace("T", " ") ?? ""} | ${cell(a.description)} | ${a.isDirector ? "director" : "subagent"} | ${a.role} | ${model} | ${a.effort ?? ""} | ${duration(a.wallClockMs)} | ${n(a.requests)} | ${n(a.input)} | ${n(a.cacheWrite5m + a.cacheWrite1h)} | ${n(a.cacheRead)} | ${n(a.output)} | ${usd(a.usd)} |`,
    );
  }
  out.push("");
  out.push("## 3. Per role and per model");
  out.push("");
  out.push("| Role | Agents | USD | EUR |");
  out.push("|---|---:|---:|---:|");
  for (const g of r.perRole) out.push(`| ${g.role} | ${g.agents} | ${usd(g.usd)} | ${eurS(g.eur)} |`);
  out.push("");
  out.push("| Model | Agents | USD | EUR |");
  out.push("|---|---:|---:|---:|");
  for (const m of r.perModel) out.push(`| ${m.model} | ${m.agents} | ${usd(m.usd)} | ${eurS(m.eur)} |`);
  out.push("");
  out.push("### What each model did");
  for (const m of r.perModel) {
    out.push("");
    out.push(`**${m.model}** (${m.agents} agents, ${usd(m.usd)})`);
    out.push("");
    for (const d of m.descriptions) out.push(`- ${d}`);
  }
  out.push("");
  out.push("## 4. Director (main session)");
  out.push("");
  const subUsd = r.totals.usd - r.directors.reduce((s, d) => s + d.usd, 0);
  out.push("| Session | Model | Effort | Wall clock | Requests | Input | Cache write | Cache read | Output | USD | Share |");
  out.push("|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const d of r.directors)
    out.push(
      `| ${cell(d.description)} (${d.sessionId.slice(0, 8)}) | ${d.models.join(", ")} | ${d.effort ?? ""} | ${duration(d.wallClockMs)} | ${n(d.requests)} | ${n(d.input)} | ${n(d.cacheWrite5m + d.cacheWrite1h)} | ${n(d.cacheRead)} | ${n(d.output)} | ${usd(d.usd)} | ${r.totals.usd ? Math.round((d.usd / r.totals.usd) * 100) : 0}% |`,
    );
  out.push("");
  out.push(`Subagents together: ${usd(subUsd)} (${eurS(subUsd * r.eurPerUsd)}).`);
  out.push("");
  return out.join("\n");
}

/** ~/.claude/projects/<repo path with every non-alphanumeric character as "-">, for the main checkout (not a worktree). */
export function defaultProjectDir(root = repoRoot): string {
  const main = root.replace(/[\\/]\.claude[\\/]worktrees[\\/][^\\/]+[\\/]?$/, "");
  return path.join(os.homedir(), ".claude", "projects", main.replace(/[^A-Za-z0-9]/g, "-"));
}

export function parseArgs(argv: string[]): Filters & { dir?: string; out?: string; json?: string } {
  const o: Filters & { dir?: string; out?: string; json?: string; sessions: string[] } = { sessions: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[i + 1];
    const need = () => {
      if (v === undefined || v.startsWith("--")) throw new Error(`${a} needs a value`);
      i++;
      return v;
    };
    if (a === "--dir") o.dir = need();
    else if (a === "--session") o.sessions.push(need());
    else if (a === "--since") o.since = need();
    else if (a === "--until") o.until = need();
    else if (a === "--out") o.out = need();
    else if (a === "--json") o.json = need();
    else throw new Error(`Unknown option ${a}`);
  }
  for (const d of [o.since, o.until]) if (d && Number.isNaN(Date.parse(d))) throw new Error(`Not a date: ${d}`);
  return o;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const dir = args.dir ?? defaultProjectDir();
  if (!fs.existsSync(dir)) throw new Error(`No transcripts at ${dir}: pass --dir`);
  const report = buildReport(collectAgents(dir, args), loadConfig(), args);
  const md = renderMarkdown(report);
  if (args.out) fs.writeFileSync(args.out, md);
  if (args.json) fs.writeFileSync(args.json, JSON.stringify(report, null, 2));
  if (!args.out) process.stdout.write(md);
  else console.log(`Wrote ${args.out}: ${usd(report.totals.usd)} over ${report.totals.requests} requests, ${report.agents.length} agents.`);
  for (const w of report.warnings) console.warn(`Warning: ${w}`);
}
