// SessionStart hook: puts the v1.0 roadmap's "Now" and milestone lines into every session's context, with the drift
// rule (docs/ROADMAP.md, "How we stay on track"). Prints nothing and exits 0 when the file is missing, so a session
// never fails because of it.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const file = path.join(root, "docs", "ROADMAP.md");
if (!existsSync(file)) process.exit(0);

const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const now = /^## Now\n([\s\S]*?)\n---/m.exec(text)?.[1]?.trim() ?? "(no Now section)";
const milestones = [...text.matchAll(/^### (M\d.*)$/gm)].map((m) => `- ${m[1]}`).join("\n");

console.log(`ROADMAP TO v1.0 (docs/ROADMAP.md): read before acting.
${now}

Milestones (Claude's track: M1 → M2 → M4 → M5 → M6 → M7; M3 is the owner's, in parallel):
${milestones}

Rule: before starting any work that is not "Now" or an open exit criterion on the roadmap, whether the owner asked for it or not, say "this is off the roadmap" and ask "park it or switch?" first. Ideas go to the parking lot. Start your first reply with one line: where we are and what's next. At the end of a run, update "Now", tick the criteria and the counts.`);
