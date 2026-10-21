// PreToolUse hook for Bash and PowerShell (owner, 2026-10-18): refuses a wait loop with no time limit. Two
// `until grep -q … ; do sleep 15; done` loops once waited over two hours for a log that never came. A loop that
// polls with sleep must be bounded: wrapped in `timeout <seconds>`, or counting attempts (`for i in $(seq …)` /
// `-lt`). Better still, run the command in the background and let the harness say when it ends. Exit 2 blocks the
// call and stderr tells Claude why; any crash exits 0, so a broken hook never stops work.
import { readFileSync } from "node:fs";

/** The reason a command is refused, or null when it's fine. */
export function endlessWait(command) {
  if (typeof command !== "string") return null;
  const polls = /\b(until|while)\b[\s\S]*?\b(sleep|Start-Sleep)\b/i.test(command);
  if (!polls) return null;
  const bounded =
    /\btimeout\s+(-\S+\s+)*\d+/.test(command) || // timeout 1800 bash -c '…'
    /-(lt|le)\s+\$?\{?\w+/.test(command) || // until [ $i -ge 60 ] / while [ $n -lt 40 ]
    /-(ge|gt)\s+\d+/.test(command) ||
    /\$i\s*-(lt|le)\s+\d+/i.test(command) || // PowerShell counters: $i -lt 40
    /\bfor\s*\(\s*\$\w+\s*=/i.test(command) ||
    /\bseq\b/.test(command);
  if (bounded) return null;
  return [
    "Blocked: a wait loop with no time limit (until/while … sleep).",
    "Bound it: wrap it in `timeout <seconds>` (e.g. `timeout 1800 bash -c '…'`) or count attempts (`for i in $(seq 1 120); do …; sleep 15; done`).",
    "Better: run the command itself with run_in_background and let the harness tell you when it ends, instead of polling a log file.",
  ].join(" ");
}

try {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const reason = endlessWait(input?.tool_input?.command);
  if (reason) {
    process.stderr.write(reason);
    process.exit(2);
  }
} catch {
  process.exit(0);
}
