/** Types for the agent-team PreToolUse hook (delegation.mjs), used by its test. */
export interface DelegationRecord {
  at: string;
  type: string;
  model: string | null;
  effort: string | null;
  isolation: string | null;
  background: boolean;
  mode: string | null;
  description: string | null;
  blocked: boolean;
}
export function check(input: { tool_name?: string; tool_input?: Record<string, unknown> }): { problems: string[]; record: DelegationRecord };
