# CLAUDE.md

AI website builder for Slovenian small businesses. Product brief: docs/PRODUCT.md. Current phase: docs/phases/.

## Roadmap (read first)

The goal is a launch-ready v1.0. docs/ROADMAP.md is the plan: "Now", milestones M1–M7 with exit criteria, and a parking lot. A SessionStart hook prints "Now"; the first reply of a session opens with one line on where we are and what's next.
- Before starting anything that isn't "Now" or an open exit criterion, whether I asked for it or you're drifting into it, say it's off the roadmap and ask "park it or switch?". Wait for my answer.
- Finish open criteria before opening new fronts. New ideas and half-built extras go to the parking lot.
- When something meaningful lands (a criterion met, a PR merged, a decision made, money spent), tick the criteria, update "Now" and the counts. Only I move milestones or criteria; you propose.
- One working session at a time: finish it (or hand it back to me) before starting the next. Sessions that only read can run alongside.

## How to work

- When a step doesn't need my input, keep going. Put a one-line status note in the same message as your next action.
- Stop and ask only when you can't continue without me, or before anything destructive or costly:
  - deleting data, or files you didn't create in this run; deleting any Railway service, database, volume or bucket
  - force-pushing, rewriting history, pushing to main (except the first push that creates the repo)
  - changing anything outside this repository, except this product's own GitHub repo and Railway project
  - touching any other repo on my GitHub or any other Railway project
  - creating accounts, upgrading plans, entering payment details, buying anything
  - any paid model, image or eval call the development budget in Stranko HQ doesn't allow (see "Stranko HQ" below)
  - anything that pushes the estimated Railway bill above €50/month
- Work on a feature branch in a git worktree and open a pull request with auto-merge on (`gh pr merge --auto --merge`): it merges into main by itself once the required CI checks are green (owner, 2026-10-17). Leave auto-merge off, and say why in the PR, when a PR needs my look first: anything touching money, legal pages, the live spend cap, or a change I asked to review.
- Keep the task list in TASKS.md (the detailed engineering checklist). Tick items when done, add anything new you find. Read it at the start of every session.

## Stranko HQ (my control panel)

One screen for me: where the project is, what we did lately, what's next, what needs me, money this month, how the agent team is used. Page: `tools/hq/index.html`; I open it in the T3 Code preview after `node tools/hq/serve.mjs` (http://localhost:4747). Data: `.hq/data.js` in the main checkout (gitignored; shape and seed in `tools/hq/data.example.js`). Always write that one file, also from a worktree. I steer in chat; HQ shows the result. The old claude.ai HQ artifact is retired.

- **Session start**, before other work: read `.hq/data.js` (budget, open decisions, approvals) and TASKS.md.
- **Write for a CEO, not an engineer.** Short plain sentences: outcome, € if any, what's next. Commits, token counts, test output and file paths go in the PR or TASKS.md, never in HQ.
- **Rewrite `.hq/data.js` when something meaningful lands** (a PR merged, a milestone criterion met, a decision made, money spent), not after every run: headline (one line), summary (2–3 sentences), phases with %, 5–9 workstreams with %, status (moving, waiting, paused, done), what's left and last activity, the last ~7 shipped things with PR numbers, 3–5 next steps (who, € if paid), what needs me, and `team` from `node tools/hq/agent-stats.mjs`. A % is ticked TASKS.md boxes or your honest estimate of the work, never inflated. Keep my answers: a decision I made in chat leaves `decisions` and is noted in TASKS.md.
- **Decisions** I must make go in `decisions` (title, options, recommendation) and in the chat. Every "Blocked on me" line in a report must also be in `decisions`, `approvals` or `needs`.
- No overnight plans: development no longer runs in unattended cloud sessions.

### Development budget (money for building and testing)

Before any paid call (evals, judge runs, generated pictures, smoke tests on the live app, re-recording fixtures), read `budget` in `.hq/data.js` and follow it exactly:
- `mode: "none"`: spend nothing. Mark the TASKS.md item blocked ("budget: spend nothing") and move on to free work.
- `mode: "ask"`: add the run to `approvals` (`title`, `eur` your estimate, `why`, `status: "pending"`), ask me in chat, and wait for my yes. No answer means no.
- `mode: "within"`: allowed when this month's `spend` total plus the estimate stays within `monthlyEur`; otherwise ask as above.
- Right after each paid run, add it to `spend` (`at`, `eur` actual from the cost log, `what`). Estimates are not spend.
- Subagents get the remaining allowance stated in their prompt and report what they spent; check it.
- `liveDailyCap` is the live app's daily cap. When I change it, set `DAILY_SPEND_CAP_EUR` on Railway (web and worker).
- Work as a team by docs/dev/agent-team.md and its procedure, the `delegate` skill. **Small work goes light:** a change of roughly 50 lines or less that touches no money, spec version, security or publishing rule is done directly, with its test, and no Mode line, scout or reviewer. For anything bigger, write `Mode S|D|W · score n/5 · team: …` in the status note, and a Haiku scout maps before any builder. Every agent gets an explicit model and an effort of medium, high or xhigh (never low or max): Fable only, and sparingly, for a project's overall design and structure at its start and the highest-level architecture decisions; Opus at xhigh for phase design, phase review, ceiling decisions and escalation; Opus for directing, building, taste and review; Sonnet at medium as the implementer of test-covered units; Haiku for reading and mechanical work. Verify every package a change touches before accepting a worker's result. A hook (.claude/hooks/delegation.mjs) blocks agent launches that break these rules and logs them. Workflows only when I ask for one.
- Give every change a way to be checked: a test, a build, the eval script. Don't mark anything done that you haven't run.
- If a target can't be met, don't loosen the check or the threshold. Report the real number.
- The outside AI reviewers (pnpm outside-review) are one final gate per milestone, not a design compass. Don't run judging rounds to steer design between gates; my eye decides taste, and later real customers do.
- While iterating on generation quality, run `pnpm eval --only <fixture>` instead of the full suite.
- Before the final report, review the full diff against main and fix anything you'd block a merge for.

## How to communicate

- Write only what I need to know. No restating the task, no step-by-step recap, no praise, no filler.
- Short and concise overall (owner, 2026-10-20): a few lines where a few lines do; long detail goes in the plan file, PR or TASKS.md.
- Status notes: one line.
- End every run with exactly these three headings and nothing after them:
  - **Blocked on me**: decisions or actions only I can take. "None" if none.
  - **Changed**: what exists now that didn't, in a few lines.
  - **Found**: problems, risks, measured numbers, and anything you couldn't confirm (say where you looked).
- English for code, docs and reports. Generated website content is Slovene.

## Engineering rules

- TypeScript strict, pnpm workspaces, Node LTS.
- The site spec (packages/spec) is the single source of truth. Every change to a site is a change to its spec. Never hand-edit rendered output.
- Spec changes need a version bump and a migration with a test.
- One component library renders both the dashboard preview and the published site. Preview must equal published output.
- Model IDs, effort levels, token prices, plan limits and pricing live in config, never in code.
- Unit tests never call the real model API; use recorded fixtures. Only `pnpm eval` makes real calls.
- Log tokens and € cost per pipeline stage for every real model call.
- Check the current Anthropic API docs for parameter names (effort, structured outputs, prompt caching). Don't guess field names.
- Secrets in .env locally and in Railway variables when deployed. .env.example documents every variable. Never print secret values in messages or reports.
- Every PR runs CI: typecheck, lint, `pnpm test` (fast tier) and `pnpm test:slow` (slow tier); a PR that changes only docs (.md files, docs/) runs typecheck, lint, the build and migrations only. Never make CI pass by skipping or deleting tests.
- Deployed environments are public URLs: keep the dashboard and API behind the access password, send noindex, and enforce the daily model-spend cap.

## Rules for generated sites

- Responsive, not mobile-first: every site must be excellent at desktop widths (1280 px and up) and on phones (360 px). Build, look at and test both. The mobile checklist in docs/PRODUCT.md still applies in full.
- The banned-patterns list in docs/PRODUCT.md is a hard list. Enforce it in code wherever possible (token ranges, component variants that can't produce the pattern); the critique pass catches the rest.
- Never invent facts: no testimonials, reviews, ratings, awards, client logos, statistics, certifications, prices, opening hours, addresses, names or phone numbers that aren't in the client's input. Use a marked placeholder instead. A site with unfilled required placeholders can't be published.

## Commands

pnpm 12 workspaces, Node 24+, TypeScript, Vitest, ESLint. Run from the repo root; quiet forms:

- Install: `pnpm install --frozen-lockfile`
- Test one file: `pnpm exec vitest run <file> --reporter=dot`
- Test one package: `pnpm exec vitest run packages/<p>/test --reporter=dot --maxWorkers=1`
- Test all: `pnpm test --reporter=dot` (browser tests need `pnpm --filter @sb/engine exec playwright install chromium` once)
- Type-check: `pnpm typecheck`
- Lint: `pnpm lint --quiet`
- Build (web client): `pnpm --filter @sb/web build`
- Offline eval (free, as CI runs it): `pnpm eval --offline --strict`

## Structure

- `apps/web`: dashboard, editor, API, landing page and published-site serving; `apps/worker`: pg-boss queue jobs and housekeeping
- `packages/spec`: site spec schemas, versions and migrations; `engine`: generation pipeline, facts, publishing; `components` + `render`: the one renderer for preview, publish and export; `platform`: DB, costs, mail; `config`: loads `config/app.config.json`; `inventory`, `morph`: design assets and transitions
- `tools/eval`: `pnpm eval` and the sheet/compare scripts, fixtures and recordings
- `docs/dev/`: architecture, components, agent team, workflow

## Compact instructions

When compacting, keep: the current task goal, HQ item ids, the plan file path, decisions made and why, files changed, checks still failing. Drop file contents and command output already acted on.
