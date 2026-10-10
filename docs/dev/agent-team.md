# Agent team: how Claude Code works on Stranko

Status: adopted for new work from 2026-10-10 once this PR is merged. Owner (2026-10-10): use Opus as director and Sonnet or Haiku as workers where it pays; judge every piece of work on whether one session does it or a director with workers does; "agents can work as a team, and I want to incorporate that setup in our work". First project: the design studio (`docs/plans/design-studio.md`). HQ item `it-agent-team`.

**The goal** (owner, 2026-10-10): get the most out of agents, develop more efficiently, and keep or raise the quality of what we ship. A team is used only where it buys one of those; §8 measures both.

This is about how *we build* Stranko. How the *product* uses the same models at runtime is `docs/plans/design-studio.md` §6.4. Both follow the same rule: Opus decides, cheaper models produce, and code and checks verify.

## 1. What the research says

Sources: Anthropic, ["How we built our multi-agent research system"](https://www.anthropic.com/engineering/multi-agent-research-system); Anthropic, ["Building effective agents"](https://www.anthropic.com/engineering/building-effective-agents); the Claude Code docs on [subagents](https://code.claude.com/docs/en/sub-agents), [agent teams](https://code.claude.com/docs/en/agent-teams), [workflows](https://code.claude.com/docs/en/workflows), [costs](https://code.claude.com/docs/en/costs), [best practices](https://code.claude.com/docs/en/best-practices) and [model config](https://code.claude.com/docs/en/model-config). Read 2026-10-10.

1. **A team wins on work that splits into independent strands.** Anthropic's research system (Opus lead, Sonnet workers) beat a single Opus agent by 90 % on their research evals. Anthropic's own caveat: most coding tasks have fewer truly parallel parts than research, and tasks where every agent needs the same context, or that have many dependencies between them, are a poor fit.
2. **A team costs a multiple of the tokens.** In that system an agent used about 4× the tokens of a chat and a multi-agent system about 15×. Claude Code's docs give about 7× a normal session for an agent team in plan mode. Token use explained 80 % of the quality difference: a team buys quality by spending tokens in separate, focused contexts. That only pays when the work's value covers it.
3. **The orchestrator owns the split.** Workers don't talk to each other; every decision about what comes next stays with the lead. Each worker needs an objective, an output format, the tools and sources to use, and clear boundaries. Vague delegation produced duplicated and missing work.
4. **Effort scales with the task.** Anthropic's rule of thumb: a simple task gets 1 agent; a comparison gets 2–4; only broad work gets 10 or more. Claude Code's docs suggest teams of 3–5 with 5–6 tasks each, and give a warning above 25 workflow agents.
5. **Verification decides whether it worked.** Each worker returns evidence (test output, screenshots, numbers), not claims. A fresh reviewer with no stake in the code checks the diff against the plan. Outcome over process: judge the result, not the path.
6. **Start simple.** Add a layer only when a simpler setup has shown a weakness.
7. **Pick the model by the judgment the task needs, and judge cost per finished task.** Judgment-heavy work and implementation → Opus, with effort as the dial (medium for well-specified building, high for design, review and hard problems). Reading, searching, counting and mechanical edits → Haiku 5.5 (40× cheaper than Opus in API prices). Sonnet 5.5 costs half of Opus per token, but defaults to high effort and can spend more than twice the tokens, or need more turns and rework, so per finished task it can cost as much as Opus or more. Anthropic's own advice: before mixing models, measure the strongest model at lower effort; one model also means one prompt cache. So the default pair is **Opus + Haiku**; Sonnet is an arm to measure, not a default (owner, 2026-10-10: "best to use Opus + Haiku").

## 2. What Claude Code gives us

| Tool | What it is | Our use |
|---|---|---|
| **Subagents** (`.claude/agents/*.md`) | A worker with its own context, tools, `model` and `effort`, optionally in its own git worktree (`isolation: worktree`). Only its final report returns to the parent. Runs in the foreground or background; nesting allowed. Works in cloud sessions. | **The default worker.** Our four roles below |
| **Workflows** (Workflow tool, `.claude/workflows/`) | A script that orchestrates many subagents: fan-out, pipelines, verification votes; up to 16 at a time; resumable. Starts only on an explicit opt-in in the owner's own words. | Many similar units: inventory batches, broad audits |
| **Agent teams** (experimental) | Teammates as full sessions that message each other and share a task list. Interactive only; no worktree isolation; no resume. | Not for now. Maybe for competing-hypothesis debugging in a session the owner is watching |
| **`opusplan`, advisor** | Opus plans while Sonnet executes; or the session consults a stronger model at decision points (advisor: Anthropic API billing only, experimental). | Optional for a solo session; not needed when an Opus director delegates |

Not documented, so decided here: how worktree branches get back (§6). The built-in Explore agent runs on the session's model, so under an Opus director it would read on Opus; our `scout` replaces it at Haiku prices.

## 3. Roles

| Role | Where | Model, effort | Does | Never |
|---|---|---|---|---|
| **Director** | the main session | Opus 5.5, high | Reads HQ and TASKS; triages (§4); plans; writes the delegation briefs; makes the decisions that need judgment; integrates; verifies; writes HQ; opens the PR; runs every paid call | Hands off a decision it should make |
| **Scout** | `.claude/agents/scout.md` | Haiku 5.5, low | Finds files, reads code and logs, counts, maps an area, summarises a report | Edits anything |
| **Builder** | `.claude/agents/builder.md` | Opus 5.5, medium; own worktree | Implements one well-specified unit with its tests, runs the checks, commits on its branch, reports with evidence | Touches files outside its brief; HQ; merges; paid calls |
| **Reviewer** | `.claude/agents/reviewer.md` | Opus 5.5, high; read-only | Reviews a diff against its plan and brief: correctness, requirements, the CLAUDE.md rules (spec, facts, banned list, both widths); not style | Edits; approves its own work |
| **Asset maker** | `.claude/agents/asset-maker.md` | Opus 5.5, medium; own worktree | Makes inventory assets in batches (drawings, palettes, compositions, fixtures) with their registry entries, render tests and contact sheet | Approves assets (the owner's gallery and the director's curation do) |

A role's model is a starting point. The director may pass a different one per task: Haiku for a mechanical builder task (a rename across 40 files with a codemod), Opus at high effort for a builder task that needs taste (a hand-made reference homepage, a tricky migration). Sonnet only as a deliberate comparison arm (§8), and then at **medium** effort: Anthropic recalibrated Sonnet 5.5's effort levels and advises starting coding agents at medium; the first Sonnet builders here ran at high, which overspends. Not yet known: how the owner's Claude plan weighs Opus against Sonnet usage, so "most out of the plan limits" is settled by the owner's setup measurements, not assumed.

## 4. Triage: every task gets a mode first

Before work starts, the director picks a mode and says it in the status note ("Mode D: 3 builders + reviewer"). HQ overnight plans carry it in a `mode` field.

| Mode | Shape | Use when |
|---|---|---|
| **S, solo** | One session does it; scouts optional for reading | Sequential or tightly coupled work; one package or the same files; under about 2 hours; bug fixes; plans and docs; anything where most of the work is judgment |
| **D, director + workers** | Opus director, 2–6 subagents (Opus builders and asset makers, Haiku scouts), one Opus reviewer at the end | The work splits into **2–6 units that don't share files**, each about 30 minutes or more and each with its own check; or a large area has to be read without filling the director's context; or an independent review is worth it (a spec change, a migration, money, security) |
| **W, workflow** | A Workflow script fans out and verifies | **8 or more similar units** (assets, fixtures, files to migrate, pages to audit), or findings that need adversarial verification. Overnight only when the HQ plan says `mode: "W"` and the owner approved it |

**Quick score** (the director's call, written in one line): count one point for each that holds.

- **Independent**: the units can be built without seeing each other's code.
- **Disjoint**: each unit owns separate files or packages.
- **Checkable**: each unit has its own test, render or number.
- **Big**: each unit is 30 minutes or more of work.
- **Broad**: the reading needed would crowd one context.

0–2 points → S. 3–4 → D. 5, plus 8 or more units → W. Any **hard no** forces S: the units edit the same files; the design isn't settled yet (settle it in S first, then fan out); or the task is mostly a decision.

**Hybrid is normal**: settle the interfaces in S (a schema, a type, a spec version), then fan out the parts in D. Most of Stranko's big PRs have that shape: one spec change, then renderer, engine, editor and tests in different packages.

## 5. The delegation brief

Every worker gets a brief with these parts; a worker doesn't see the director's conversation.

```
Objective: one sentence, the outcome.
Context: the plan section, the HQ item id, the files to read first, the interface it builds against (paste it).
Owns: the files or folders it may change. Everything else is read-only.
Done means: the checks to run and pass (exact commands), the evidence to return.
Constraints: the CLAUDE.md rules that bite here (name them); no HQ writes; no merges; no paid model or image calls unless an allowance is stated (then: the remaining € and the stop).
Report: status (done / partly / blocked), what changed (files), evidence (command output, screenshot paths, numbers), what is left, anything the director must decide, € spent.
```

The director checks each report: reads the diff, reruns the checks itself (on the touched files, `--maxWorkers=1` locally), and looks at screenshots. A worker's "done" is a claim until then.

## 6. Branches and merging

- One feature branch per plan or PR, created by the director (`claude/<topic>`), with the shared interfaces committed on it before any worker starts.
- A builder or asset maker runs with `isolation: worktree`. Claude Code creates the worktree under `.claude/worktrees/` (gitignored) and, because `.claude/settings.json` sets `worktree.baseRef: "head"`, branches it from the director's current `HEAD`, so workers see the committed interfaces. `.worktreeinclude` copies `.env` in. The worker commits on its worktree's branch and reports the branch name.
- The director merges each finished worker branch into the feature branch (no squash inside the feature branch), resolves conflicts, runs typecheck, lint and the touched tests, then opens one PR. The owner still merges to `main` by hand.
- A worktree with commits stays on disk until it is merged and Claude Code's periodic sweep (or `git worktree remove`) clears it; a worktree without changes is removed when its worker finishes.
- Units that would touch the same file are not run in parallel (§4 hard no), so conflicts stay small.

## 7. Cost and limits

- **Development agents run on the Claude Code account, not on the product's API budget**, as long as Claude Code isn't billed through the product's API key (owner to confirm: HQ `it-claude-code-billing`). They still use the plan's usage limits, so the caps below apply anyway.
- Mode D: at most 6 workers at once and 1 reviewer per PR. **On this machine at most 3 builders run at the same time** (each installs and runs tests; the machine slows down beyond that). Cloud sessions can run 6. Mode W: at most 25 agents per run unless the HQ plan says otherwise. Scouts on Haiku; builders, asset makers, the reviewer and the director on Opus with effort set per task.
- Paid model and image calls (evals, fal) stay with the director and follow `meta/budget` and the test discipline in `docs/plans/design-studio.md` §11. A worker gets an allowance only when its brief states one.
- Subagent prompt caches last 5 minutes. Briefs that share a long fixed preamble (the asset maker's style rules) put it first so batches reuse it.

## 8. Is it working? Efficiency and quality, measured

The owner keeps a measurement system for agent setups (quality and API-price cost per setup). Each overnight result and each PR description records what it needs: the mode; the agents used (role × count × model); wall-clock hours; whether CI was green on the first push; what the reviewer caught; what a worker got wrong and the director had to redo; and, for inventory, the share of assets the owner rejected.

After the design studio's free phases (about 10 PRs), the director compares them with the last 10 solo PRs of similar size and writes the result in HQ `it-agent-team`:

| Measure | Target for the team setup |
|---|---|
| Work per overnight session (PRs or plan steps finished) | higher than solo |
| Wall-clock hours per PR of similar size | lower than solo |
| CI green on first push | at least as often as solo |
| Bugs found after merge (owner, later PRs) | no more than solo |
| Reviewer findings fixed before the PR | counted; a reviewer that never finds anything is a cost to cut |
| Owner rejections in the inventory gallery | under 30 % per batch, or the batch's brief changes |

If quality drops on any line, the score in §4 tightens (fewer Mode D tasks, Opus builders for that kind of work) before speed is counted. The rule changes on evidence, as everything else does here.

## 9. First project: the design studio

| Work (`docs/plans/design-studio.md` §11) | Mode | Team |
|---|---|---|
| F1 composition language | S, then D | Director settles the spec v19 schemas and guards. Then 3 builders: renderer + CSS (`packages/components`), validation + repair + tests (`packages/spec`), M/S/J compositions + compose sheet (`tools/eval`). Reviewer: the spec change and the guards |
| F2 tool use in the model client | S | One package, tightly coupled; reviewer on the recording and replay |
| M1 Haiku 5.5 in client and config | S | Small; scout reads the Anthropic notes already summarised in the plan |
| F3–F6 foundations | D | 4 builders, one per unit (inventory registry, Okus, seed and uniqueness registry, fixtures), each in its own package; reviewer |
| I1–I9 inventory | W | Asset makers per batch (one font family group, one palette set, one trade's drawings), Haiku scouts for licences and glyph coverage, an Opus reviewer per batch's contact sheet; the director curates; the owner approves in the gallery |
| I10 reference homepages | D | 4–5 builders on Opus at high effort (design taste is the job), one stance and trade each; the director picks which go into Okus |
| F1b composition language v2 | S, then D | Same shape as F1 |
| S0–S6 the studio (paid) | D | Builders write the stages in parallel where packages separate; **only the director runs paid evals** |
| S7 owner screens | D | Builders for the progress screen, Druge zamisli and Predlagaj drugačno; browser checks at 360 and 1280 px |
| Phase 3 measuring | S | The director runs the eval; scouts summarise the reports |
