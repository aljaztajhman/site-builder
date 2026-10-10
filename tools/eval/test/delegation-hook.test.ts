import { describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The agent-team hook (.claude/hooks/delegation.mjs, docs/dev/agent-team.md): its rules, without running it as a hook.
process.env.DELEGATION_HOOK_NO_MAIN = "1";
process.env.CLAUDE_PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { check } = await import("../../../.claude/hooks/delegation.mjs");
const launch = (tool_input: Record<string, unknown>) => check({ tool_name: "Agent", tool_input }) as { problems: string[]; record: { model: string | null } };

describe("agent-team hook", () => {
  it("lets a project agent with a MODE line through and reads its model from the definition", () => {
    const r = launch({ subagent_type: "scout", prompt: "MODE: D (score 4/5) · role: scout", description: "map" });
    expect(r.problems).toEqual([]);
    expect(r.record.model).toBe("haiku");
  });
  it("blocks an agent that would inherit the session's model, the Explore agent, and a brief without MODE", () => {
    expect(launch({ subagent_type: "general-purpose", prompt: "MODE: S" }).problems.join()).toMatch(/No model/);
    expect(launch({ subagent_type: "Explore", model: "haiku", prompt: "MODE: S" }).problems.join()).toMatch(/Explore/);
    expect(launch({ subagent_type: "builder", prompt: "do it" }).problems.join()).toMatch(/MODE/);
  });
  it("needs a FABLE purpose line for Fable, medium effort for Sonnet, and never max", () => {
    expect(launch({ subagent_type: "architect", prompt: "MODE: S" }).problems.join()).toMatch(/FABLE/);
    expect(launch({ subagent_type: "architect", prompt: "MODE: S\nFABLE: phase-review of F1b" }).problems).toEqual([]);
    expect(launch({ subagent_type: "general-purpose", model: "sonnet", effort: "high", prompt: "MODE: D" }).problems.join()).toMatch(/Sonnet/);
    expect(launch({ subagent_type: "implementer", prompt: "MODE: D" }).problems).toEqual([]);
    expect(launch({ subagent_type: "general-purpose", model: "opus", effort: "max", prompt: "MODE: S" }).problems.join()).toMatch(/max/);
  });
});