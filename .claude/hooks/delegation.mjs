// PreToolUse hook for the Agent tool (docs/dev/agent-team.md, .claude/skills/delegate). Enforces the agent-team rules
// on every agent launch and logs it to .claude/agent-log.jsonl. Exit 2 blocks the launch; stderr tells Claude why.
// Any crash exits 0 (the hook's onFailure default lets the call through), so a broken hook never stops work.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

function frontmatter(file) {
  try {
    const text = readFileSync(file, "utf8");
    const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
    if (!m) return {};
    const out = {};
    for (const line of m[1].split(/\r?\n/)) {
      const kv = /^([A-Za-z]+):\s*(.*)$/.exec(line);
      if (kv) out[kv[1]] = kv[2].trim();
    }
    return out;
  } catch {
    return {};
  }
}

/** Built-in agent types whose model is fixed by Claude Code itself (not the session's). */
const FIXED_BUILTINS = new Set(["claude-code-guide", "statusline-setup"]);

export function check(input) {
  const t = input.tool_input ?? {};
  const type = t.subagent_type ?? "general-purpose";
  const prompt = String(t.prompt ?? "");
  const project = path.join(projectDir, ".claude", "agents", `${type}.md`);
  const def = existsSync(project) ? frontmatter(project) : null;
  const model = t.model ?? def?.model ?? (FIXED_BUILTINS.has(type) ? "builtin" : undefined);
  const effort = t.effort ?? def?.effort;
  const mode = /\bMODE:\s*([SDW])\b/.exec(prompt)?.[1];
  const problems = [];

  if (type === "Explore") problems.push("The built-in Explore agent runs on Opus on subscription plans. Use subagent_type \"scout\" (Haiku) for reading.");
  if (!model) problems.push(`No model: pass model explicitly (agent type "${type}" would inherit the session's model). Pick it by docs/dev/agent-team.md §2.`);
  if (!mode) problems.push("No MODE line: the brief must start with `MODE: S|D|W (score n/5) · role: … · model: … · effort: …` (see the delegate skill).");
  if (effort === "max") problems.push("Effort max is not used here (diminishing returns, overthinking; agent-team.md §1.2).");
  if (model === "fable" || /fable/.test(String(model)) || type === "architect") {
    if (!/\bFABLE:\s*(phase-design|phase-review|ceiling|escalation)\b/.test(prompt)) problems.push("A Fable launch needs a `FABLE: phase-design|phase-review|ceiling|escalation` line saying what it is for.");
  }
  if ((model === "sonnet" || /sonnet/.test(String(model))) && effort && effort !== "medium" && effort !== "low") problems.push("Sonnet runs at medium effort here (high and max are token-hungry; agent-team.md §1.4).");

  return { problems, record: { at: new Date().toISOString(), type, model: model ?? null, effort: effort ?? null, isolation: t.isolation ?? def?.isolation ?? null, background: !!t.run_in_background, mode: mode ?? null, description: t.description ?? null, blocked: problems.length > 0 } };
}

function main() {
  let raw = "";
  try {
    raw = readFileSync(0, "utf8");
  } catch {
    process.exit(0);
  }
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }
  if (input.tool_name !== "Agent") process.exit(0);
  const { problems, record } = check(input);
  try {
    appendFileSync(path.join(projectDir, ".claude", "agent-log.jsonl"), JSON.stringify(record) + "\n");
  } catch {
    // logging is best effort
  }
  if (problems.length) {
    process.stderr.write(`Agent launch blocked by the agent-team rules (.claude/hooks/delegation.mjs):\n- ${problems.join("\n- ")}\n`);
    process.exit(2);
  }
  process.exit(0);
}

// Tests import check() with DELEGATION_HOOK_NO_MAIN=1 so nothing reads stdin.
if (!process.env.DELEGATION_HOOK_NO_MAIN) main();
