# Agent team: how Claude Code works on Stranko

Status: v2, 2026-10-11. v1 (2026-10-10, PR #159) was written down but not enforced, and drifted (owner: "why are we not adhering to our system?"). v2 adds the model research below, the `delegate` skill (`.claude/skills/delegate/`) and a hook that checks every agent launch (`.claude/hooks/delegation.mjs`). HQ item `it-agent-team`.

**The goal** (owner): get the most out of agents, develop more efficiently, and keep or raise quality. **The constraint**: Claude Code runs on the owner's **Claude Max 5x** plan. It has a 5-hour window and a weekly window shared across models, plus an Opus-specific limit, and Fable may bill usage credits instead. "Efficient" therefore means the most finished, checked work per unit of plan usage, not per API euro. Development agents never touch the product's $90 API budget.

This is about how *we build* Stranko. How the *product* uses the same models at runtime is `docs/plans/design-studio.md` §6.4.

## 1. What the research says (2026-10-10)

Three scouts read Anthropic's API documentation (the bundled `claude-api` skill: models, model migration guides, cost optimisation, agent design), the Claude Code docs (model config, advisor, sub-agents, costs, best practices) and practitioner reports (Artificial Analysis and Vals AI benchmarks, blogs; mostly second-hand, dated September and October 2026). Sources at the end.

1. **A team pays only when there is bulk to hand off.** Anthropic: an orchestrator "buys something only when there is bulk to hand off. When the work is one dependent chain, or fits in a single context … in every such case measured, the coordinator's model alone at lower effort came out ahead" (`cost-optimization.md` §2.7). Their multi-agent research system beat a single Opus by 90 % on broad research at about 15× the tokens of a chat; Claude Code agent teams use about 7× a normal session.
2. **Effort is the main dial, and medium is the default.** In Claude Code, Opus 5.5, Sonnet 5.5 and Haiku 5.5 default to medium effort ("day-to-day engineering work with a clear scope"); high suits "fixing a bug in an existing codebase"; max "may show diminishing returns and is prone to overthinking". Thinking can't be turned off on the 5.5 models, so lowering effort is how to spend less. Practitioner measurements (Artificial Analysis, reported second-hand): high used about 2× the tokens of medium, and max about 22×, for the same scores. **Owner rule (2026-10-10): only medium, high and xhigh are used; never low, never max.**
3. **The strongest model at lower effort often beats a cheaper model.** Anthropic measured "the frontier model at `low` effort out-solved a smaller model for less per solved task on one benchmark". Judge cost per *finished* task, not per token.
4. **Sonnet 5.5's bad reputation is mostly an effort problem.** At max effort it is the most token-hungry model Artificial Analysis has measured (about 193k output tokens and $7.60 per task, more than Opus 5.5 at max). At medium it costs about $0.59 per task, and Anthropic reports it beating Sonnet 5 at high on coding evals "typically at under a fifth of the cost". Claude Code's docs still recommend Sonnet for "daily coding tasks". We keep the owner's preference (Opus + Haiku, §3) and measure Sonnet only as an arm. Sonnet is also the way to keep working when the *Opus-specific* limit is hit, since switching models helps with that limit, unlike the shared session and weekly limits.
5. **Haiku 5.5 is the reading and volume model.** Anthropic: "high-volume, latency-sensitive work such as classification, routing, extraction, and sub-agent tasks"; "substantially better at instruction following and at running as a sub-agent". At low effort in long agent prompts it "is more likely … to skip a search, stop early, or skip a check", so scouts that must be thorough run at medium. No independent evaluation of Haiku 5.5 as a sub-agent exists yet; our own log and the owner's measurements are the evidence.
6. **Fable 5.1 is for the work that sets everything after it.** Claude Code: "your hardest and longest-running tasks": root-cause investigations, outage debugging, architecture decisions. $10/$50 per MTok; turns of 15 minutes are normal; it over-elaborates unless steered (state the reason, say what not to do, give it a file to write to, avoid over-prescriptive scaffolding). On some plans it bills usage credits rather than plan limits. Owner (2026-10-11): "we can use Fable if we do it smartly … utilize the strengths from all models, from Fable to Haiku." Owner rule after the first phase-design call burned over 200k tokens (2026-10-10): Fable is used **sparingly**, only for a project's overall design and structure at its start, and for the most high-level, cross-cutting architecture decisions when they are needed. Phase design, phase review and escalation go to Opus at xhigh.
7. **The advisor pattern works, but not on our plan.** In Anthropic's tests, Sonnet with an Opus advisor scored higher and cost 11–12 % less per agentic task, and Haiku with an Opus advisor doubled its BrowseComp score. In Claude Code the advisor "requires the Anthropic API", so our Max-plan development sessions can't use it. The product can (design-studio §6.4).
8. **Model switches cost cache and reasoning.** Caches are per model; "a mid-conversation switch cold-starts the cache", and thinking blocks don't carry across models. So each agent stays on one model, and work is handed between agents, not between models inside one conversation.
9. **Hidden Opus usage.** The built-in Explore agent runs on Opus on subscription plans, and "a switch to Opus also applies to the subagents that inherit your session's model". So every agent gets an explicit model, and reading goes to our Haiku scout, never to Explore.
10. **Subagents protect the most expensive context: the director's.** "The verbose output stays in the subagent's context while only a summary returns." On a long session the director's own context is the biggest consumer of the plan, so the director delegates reading and keeps its own context lean (`/compact` at phase boundaries).
11. **Reviewers over-report.** Tell them to "flag only gaps that affect correctness or the stated requirements".
12. **Not published anywhere**: how much an Opus, Sonnet or Haiku token counts against a subscription. `/usage` shows the subagent share; the agent log (§8) and the owner's measurement system settle it for us.

## 2. Model profiles

| Model | API price in/out per MTok | Best at (per Anthropic) | Here: use for | Effort | Don't use for |
|---|---|---|---|---|---|
| **Fable 5.1** | $10 / $50 | the hardest and longest-running work: root causes, outages, architecture | a **project's** overall design and structure at its start (a new product area, a new system); the most high-level, cross-cutting architecture decisions, when needed | high | phase design or review, escalation, building, reading, review; anything without a `FABLE: project-design` or `FABLE: architecture` line |
| **Opus 5.5** | $4 / $20 | complex reasoning, long agentic coding, judgment | the director; building code; design taste (stances, references, drawings); reviews | medium by default; high for design taste, review, bugs in existing code; **xhigh** for phase design, phase review, ceiling decisions and escalation (the architect); **never low or max** | reading, searching, mechanical edits |
| **Sonnet 5.5** | $2 / $10 | daily coding at medium effort | the **implementer**: makes failing tests pass against an interface Opus (or Fable) fixed; well-specified, test-covered units; the fallback when the Opus-specific limit is hit; measured against Opus builders | medium only | open design, units without tests to aim at, high or max effort (token-hungry) |
| **Haiku 5.5** | $0.10 / $0.50 | high-volume reading, extraction, classification, sub-agent tasks | scouts (map code, read logs, summarise reports, research the web); mechanical edits from an exact list; running checks and reporting | medium | judgment, design, deciding what to build |

## 3. Roles

| Role | Definition | Model, effort | Does | Never |
|---|---|---|---|---|
| **Director** | the main session | Opus 5.5 (the session model), medium; high for phase planning and integration | HQ and TASKS; triage (§5); writes briefs; makes the decisions; integrates; verifies (§7); writes HQ; opens PRs; runs every paid call | reads large areas itself (a scout does); hands off a decision it should make |
| **Scout** | `.claude/agents/scout.md` | Haiku 5.5, medium | maps the files, signatures and patterns a unit touches **before any builder starts**; reads logs and reports; web research | edits anything |
| **Builder** | `.claude/agents/builder.md` | Opus 5.5, medium; own worktree | implements one unit from a brief that includes the scout's map; tests; commits; reports with evidence | touches files outside its brief; HQ; merges; paid calls |
| **Mechanic** | `.claude/agents/mechanic.md` | Haiku 5.5, medium; own worktree | mechanical work from an exact list: download and subset files, register a list of assets, rename across files, run a sheet and report | decides what or how |
| **Asset maker** | `.claude/agents/asset-maker.md` | Opus 5.5, medium; high where taste is the job | designs inventory assets (drawings, palettes, compositions, stances) | approves its own assets |
| **Reviewer** | `.claude/agents/reviewer.md` | Opus 5.5, high; read-only | reviews a diff against plan and brief: correctness and requirements only | edits; style comments |
| **Implementer** | `.claude/agents/implementer.md` | Sonnet 5.5, medium; own worktree | makes the failing tests of a fixed interface pass; reports with evidence | changes the interface or the tests (stops and reports instead) |
| **Architect** | `.claude/agents/architect.md` | Opus 5.5, xhigh | phase design (writes the design file), phase review, the product's ceiling decisions, escalation; answers with decisions and their reasons | builds or reviews routine work |
| **Strategist** | `architect` with `model: fable` and a `FABLE:` line | Fable 5.1, high | a project's overall design and structure at its start; the highest-level architecture decisions | anything at phase level or below |

## 4. How agents work together

| Pattern | Shape | When |
|---|---|---|
| **Solo with scouts** (the default) | the director does the work; Haiku scouts do the reading | coupled work, one dependent chain, anything that fits one context (§1.1) |
| **Scout → builders → reviewer** | a scout maps; Opus builders build disjoint units in worktrees; the director verifies; an Opus reviewer checks where the rules call for one | 2–6 independent units with their own checks |
| **Mechanic batch** | the director (or an asset maker) decides the list; Haiku mechanics execute it | bulk mechanical work: downloads, registrations, renames, generated sheets |
| **Fan-out with verification** (Workflow) | many workers, each verified | 8 or more similar units; overnight only when the HQ plan says `mode: "W"` and the owner approved it |
| **Best of N for taste** | 2–3 Opus drafts at medium, the director picks and merges the best parts | where quality is taste and the asset sets the bar (references, a stance deck) |
| **Bookends: the architect designs and reviews, builders build, Haiku reads** | at a phase's start the architect (Opus xhigh) writes the design (interfaces, schemas, risks, the order of units) into a file in the repo; scouts map; Opus builders and Sonnet implementers build; at the end the architect reviews the whole phase diff before it merges. Fable only once per project, for its overall design | every phase of the design studio and any change with long consequences; one design and one review call per phase |
| **Opus specs, Sonnet implements** | Opus writes the interface and failing tests; a Sonnet implementer makes them pass; the director verifies | large but well-specified units, where most of the work is filling in |
| **Escalation ladder** | Opus medium → Opus high → architect (Opus xhigh) | after two failed attempts on the same problem (the "two strikes" rule) |

## 5. Triage: every task gets a mode first

Before any work, the director writes one status line: `Mode S|D|W · score n/5 · team: <roles × model>`.

| Mode | Shape | Use when |
|---|---|---|
| **S, solo** | the director, with Haiku scouts for reading | sequential or coupled work; one package or the same files; under about 2 hours; fixes; plans and docs; mostly judgment |
| **D, director + workers** | scout first, then 2–6 builders/mechanics/asset makers, one reviewer where §7 says | 2–6 units that don't share files, each about 30 minutes or more with its own check; or a large area must be read; or an independent review is required |
| **W, workflow** | a Workflow script | 8 or more similar units, or findings that need adversarial verification |

**Score**: one point each for **independent**, **disjoint** (separate files or packages), **checkable**, **big** (30 minutes or more per unit) and **broad** (the reading would crowd one context). 0–2 → S; 3–4 → D; 5 plus 8 or more units → W. **Hard no → S**: the units edit the same files; the design isn't settled (settle it in S, then fan out); the task is mostly a decision; or the work fits one context at lower effort (§1.1).

## 6. The delegation brief

Every agent launch carries these lines (the hook checks `MODE:`; the `delegate` skill has the template):

```
MODE: D (score 4/5) · role: builder · model: opus · effort: medium
Objective: one sentence, the outcome.
Context: plan section, HQ item id, the SCOUT MAP (paste it), the interface to build against.
Owns: the files or folders it may change. Everything else is read-only.
Done means: exact commands to run and pass; the evidence to return.
Constraints: the CLAUDE.md rules that bite here; no HQ writes; no merges; no paid calls unless an allowance is stated.
Report: status; branch and commits; files; evidence; what's left; decisions for the director; € spent.
```

## 7. Verification (the director, before accepting any worker's result)

1. Read the diff (`git diff --stat`, then the parts that matter).
2. Typecheck and lint.
3. Run the tests of **every package the diff touches**, not just the new tests: `git diff --name-only <base>... | <packages>` → `vitest run packages/<p>/test ... --maxWorkers=1`. (F1 missed the components package this way and CI caught it.)
4. Look at any screenshots or contact sheets the change produces.
5. A reviewer runs when the change touches the spec (version, migration), money, security, publishing rules, a database migration, or more than about 500 lines of logic; otherwise the director's check is the review. Reviewers report correctness and requirement gaps only.
6. CI green before merging; a red check is read, never re-run blindly more than once.

## 8. Logging and measuring

- The hook appends every agent launch to `.claude/agent-log.jsonl` (gitignored): time, role, model, effort, isolation, mode, description.
- Each PR description has an **Agent setup** line: mode, roles × model × effort, wall-clock, subagent tokens (from the agent reports), what the reviewer caught, what was redone.
- After about 10 team PRs, the director compares them with solo PRs of similar size: work per session, hours per PR, CI green on first push, bugs found after merge, reviewer catches, gallery rejections. The results go in HQ `it-agent-team`. If quality drops anywhere, the rules tighten before speed counts. The owner's measurement system adds API-price cost per setup.

## 9. Branches and merging

- One feature branch per plan or PR, created by the director (`claude/<topic>`), with the shared interfaces committed before any worker starts.
- Builders, mechanics and asset makers run with `isolation: worktree`. `.claude/settings.json` sets `worktree.baseRef: "head"`, so a worker branches from the director's `HEAD` when it is launched from that checkout; `.worktreeinclude` copies `.env`. When the director works in another worktree, the brief tells the worker to `git fetch` and branch from the feature branch.
- The director merges each finished worker branch into the feature branch, verifies (§7), and opens one PR. Units that would touch the same file never run in parallel.

## 10. Plan limits (Max 5x)

- **The director's context is the biggest consumer.** Delegate reading to scouts; `/compact` with instructions at phase boundaries; don't re-read large files.
- On this machine at most **3** builders, mechanics or asset makers run at once (each installs and runs tests). Scouts are read-only and don't count.
- Effort medium unless §2 says otherwise; only medium, high and xhigh; never low or max.
- Fable: every call has a `FABLE:` line naming its purpose (`project-design` or `architecture`), normally once per project; the log counts them and the PR's agent setup line says what each bought. A phase design on Fable used over 200k tokens before writing anything (2026-10-10), so phase work goes to the architect on Opus xhigh. If the owner sees Fable billing usage credits, the HQ budget note says how much per month.
- If the Opus-specific limit is hit, switch the session to Sonnet (medium) and keep going; if the session or weekly limit is hit, stop and schedule the continuation.
- Workflow agents (`agent()` inside a Workflow script) bypass the Agent hook. Their scripts must set `model` and `effort` per `agent()` call by this table.

## 11. First project: the design studio

| Work (`docs/plans/design-studio.md` §11) | Mode | Team |
|---|---|---|
| Phase 1 and Phase 2 bookends | — | architect (Opus xhigh): design the phase (F1b language v2; the studio pipeline S0–S6 incl. the art director's prompt and rubric), then review the phase diff before it merges |
| Inventory batches I1–I7, I9 | D/W | scout maps the registry once (shared map); an asset maker (Opus) designs or picks; mechanics (Haiku) download, subset, register and run sheets; the director curates; the owner approves in the gallery |
| I8 stances, I10 references | D | asset makers on Opus high, best of N where the bar is set; no reviewer (taste goes to the owner via Okus and the gallery) |
| F1b composition language v2 | S, then D | the director settles schemas; scout map; builders for guards and renderer; reviewer (spec change) |
| S0–S6 the studio (paid) | D | architect designs the stages and prompts; scout map per stage; Opus builders, Sonnet implementers for test-covered stages; **only the director runs paid evals**; architect reviews the phase |
| S7 owner screens | D | scout map of the editor; builders; browser checks at 360 and 1280 px |
| Phase 3 measuring | S | the director runs the eval; scouts summarise the reports |

## Sources

- Anthropic: the bundled `claude-api` skill, `shared/models.md`, `shared/model-migration.md` (Fable 5.1, Opus 5.5, Sonnet 5.5, Haiku 5.5 sections), `shared/cost-optimization.md` §2.6–2.7, `shared/agent-design.md`, `shared/managed-agents-multiagent.md`, `shared/tool-use-concepts.md` (Advisor).
- Claude Code docs: [model-config](https://code.claude.com/docs/en/model-config), [advisor](https://code.claude.com/docs/en/advisor), [sub-agents](https://code.claude.com/docs/en/sub-agents), [costs](https://code.claude.com/docs/en/costs), [best-practices](https://code.claude.com/docs/en/best-practices), [agents](https://code.claude.com/docs/en/agents).
- Anthropic engineering: [multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system), [building effective agents](https://www.anthropic.com/engineering/building-effective-agents), [the advisor strategy](https://claude.com/blog/the-advisor-strategy).
- Practitioner reports, second-hand and to be treated as such:
  - Artificial Analysis figures, via [dreasays](https://dreasays.substack.com/p/claude-55-is-brilliant-confusing), [codersera](https://codersera.com/blog/claude-sonnet-5-5-vs-opus-5-5-2026/) and [emergent](https://emergent.sh/learn/sonnet-5-5-vs-opus-5-5).
  - Fable 5.1 reviews: [buildfastwithai](https://blog.buildfastwithai.com/claude-fable-5-1-review), [kingy](https://kingy.ai/blog/claude-fable-5-1-benchmarks-price-mythos-access/).
  - Subagent usage: [aident](https://aident.ai/blog/stop-claude-code-subagents-burning-tokens).
