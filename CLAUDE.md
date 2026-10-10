# CLAUDE.md

AI website builder for Slovenian small businesses. Product brief: docs/PRODUCT.md. Current phase: docs/phases/.

## How to work

- When a step doesn't need my input, keep going. Put a one-line status note in the same message as your next action.
- Stop and ask only when you can't continue without me, or before anything destructive or costly:
  - deleting data, or files you didn't create in this run; deleting any Railway service, database, volume or bucket
  - force-pushing, rewriting history, pushing to main (except the first push that creates the repo), merging into main
  - changing anything outside this repository, except this product's own GitHub repo and Railway project
  - touching any other repo on my GitHub or any other Railway project
  - creating accounts, upgrading plans, entering payment details, buying anything
  - any paid model, image or eval call the development budget in Stranko HQ doesn't allow (see "Stranko HQ" below)
  - anything that pushes the estimated Railway bill above €50/month
- Work on a feature branch in a git worktree and open a pull request. I review and merge manually.
- Keep the task list in TASKS.md (the detailed engineering checklist). Tick items when done, add anything new you find. Read it at the start of every session.

## Stranko HQ (my control panel)

https://claude.ai/artifact/WFgqTKUvSipeSjT1v5CqKT. I steer the project there: priorities, decisions, messages and the development budget. Read and write it with the ArtifactData tool. When HQ and TASKS.md disagree about priority, owner or status, HQ wins.

- **Session start**, before other work: read `requests` with status `new`, `activity` with `by == "you"` and `seen == false`, `decisions` that are `decided` without an `outcome`, `approvals` that changed, and `meta/budget`. Act on them. Then mark each request `seen` (and `done` with a `reply` when finished), set those activity entries `seen: true`, and write each decision's `outcome`.
- **My edits win.** If I changed an item's status, priority, owner or `next`, or left a note, follow it. Don't overwrite my changes; if you disagree, say so in a note on the item.
- **Keep it current.** Starting an item: status `doing`. Finishing it: `done`, plus a note with what ran. Anything shipped or set up: one `activity` entry (`by: "claude"`, `seen: true`, a PR link). New work found: a new `items` doc (and in TASKS.md). End of every run: rewrite `meta/overview` (phase, headline, summary, health tiles) and the order of `next` on your items.
- **Decisions** I must make go in `decisions` with options and a recommendation, never only in chat.
- **HQ in every step, not only at the start and end.** Read the relevant HQ items before working on an area and follow their notes. Write to HQ when it happens, not in a batch at the end: a PR opened, merged or failing CI (note + activity), something I asked for in chat (an item or a note on one; a quick question needs nothing), a fact found (a note on the item it affects), a cost measured (the item's note). Every "Blocked on me" line in a report must also be an HQ decision, approval or `owner: "you"` item, and every open HQ item you touched must say where it stands. Subagents get the item ids they work on and report back what to write; you write it.
- **Overnight plans** (`overnight/<id>`): large work for unattended cloud sessions. Fields: `title`, `goal`, `mode` (S, D, W: docs/dev/agent-team.md), `size` (S, M, L, XL), `hours`, `cost` (free, api, money), `estEur` (paid plans), `items` (ids), `steps`, `checks` (how it is verified), `status` (proposed, approved, running, done, skipped), `order` (lower first), `result`, `link` (the PR), `finishedAt`, `createdAt`, `updatedAt`, `updatedBy`. End of every run: keep 3–6 open proposals, the most valuable large work first, each one a coherent PR with its checks. A plan's cost follows the development budget below exactly: under "spend nothing" only free plans are proposed for tonight; paid plans carry `estEur` and wait.
- **An overnight cloud session** runs the plan HQ shows as "Tonight": a `running` plan, else the first `approved` plan the budget allows, else the first `proposed` free plan. It sets `status: "running"` when it starts, works on a branch and opens a PR (never merges), and finishes with `status: "done"`, `result` (what changed, what ran, measured numbers, what is left), `link`, `finishedAt` and an `activity` entry. It does the session-start reads above first and respects every stop-and-ask rule: when it would need me, it stops that part, says so in `result`, and moves on to work that doesn't.
- Items: `items/<id>` with `title`, `detail`, `area` (launch, generation, editor, platform, images, content, billing, growth), `phase`, `status` (todo, doing, blocked, done), `blockedBy`, `priority` (critical, high, normal, low), `owner` (claude, you), `cost` (free, api, money), `ref`, `next` (number, lower first), `notes` [{by, at, text}], `updatedAt`, `updatedBy`.

### Development budget (money for building and testing)

Before any paid call (evals, judge runs, generated pictures, smoke tests on the live app, re-recording fixtures), read `meta/budget` and follow it exactly:
- `mode: "none"`: spend nothing. Mark the item blocked ("budget: spend nothing") and move on to free work.
- `mode: "ask"`: create `approvals/<id>` with `title`, `eur` (your estimate), `why`, `kind` (evals, images, smoke, recording), `at`, `status: "pending"`, and wait until it is `approved`. Declined or unanswered means no.
- `mode: "within"`: allowed only if the kind is allowed in `kinds`, the estimate is at most `askOver`, this session's total stays within `perSession`, and this month's `spend` total plus the estimate stays within `monthly`. Any limit that's empty means ask. Over a limit means an approval as above.
- Right after each paid run, log it in `spend/<id>`: `at`, `eur` (actual, from the cost log), `kind`, `what`. Estimates are not logged as spend.
- Subagents get the remaining allowance stated in their prompt and report what they spent; check it.
- `liveDailyCap` is the live app's daily cap. When it differs from `liveApplied`, set `DAILY_SPEND_CAP_EUR` on Railway (web and worker) and write the new `liveApplied`.
- Work as a team by docs/dev/agent-team.md and its procedure, the `delegate` skill. Before any non-trivial task, write `Mode S|D|W · score n/5 · team: …` in the status note; HQ overnight plans carry it as `mode`. A Haiku scout maps before any builder. Every agent gets an explicit model: Fable for phase design, phase review, ceiling decisions and escalation; Opus for directing, building, taste and review; Sonnet at medium as the implementer of test-covered units; Haiku for reading and mechanical work. Verify every package a change touches before accepting a worker's result. A hook (.claude/hooks/delegation.mjs) blocks agent launches that break these rules and logs them. Workflows are allowed in overnight runs whose HQ plan says `mode: "W"` and that I approved.
- Give every change a way to be checked: a test, a build, the eval script. Don't mark anything done that you haven't run.
- If a target can't be met, don't loosen the check or the threshold. Report the real number.
- While iterating on generation quality, run `pnpm eval --only <fixture>` instead of the full suite.
- Before the final report, review the full diff against main and fix anything you'd block a merge for.

## How to communicate

- Write only what I need to know. No restating the task, no step-by-step recap, no praise, no filler.
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
- Every PR runs CI: typecheck, lint, `pnpm test`. Never make CI pass by skipping or deleting tests.
- Deployed environments are public URLs: keep the dashboard and API behind the access password, send noindex, and enforce the daily model-spend cap.

## Rules for generated sites

- Responsive, not mobile-first: every site must be excellent at desktop widths (1280 px and up) and on phones (360 px). Build, look at and test both. The mobile checklist in docs/PRODUCT.md still applies in full.
- The banned-patterns list in docs/PRODUCT.md is a hard list. Enforce it in code wherever possible (token ranges, component variants that can't produce the pattern); the critique pass catches the rest.
- Never invent facts: no testimonials, reviews, ratings, awards, client logos, statistics, certifications, prices, opening hours, addresses, names or phone numbers that aren't in the client's input. Use a marked placeholder instead. A site with unfilled required placeholders can't be published.
