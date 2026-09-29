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
  - spending more than €30 on model API calls in one run (track it; eval runs count)
  - anything that pushes the estimated Railway bill above €50/month
- Work on a feature branch in a git worktree and open a pull request. I review and merge manually.
- Keep the task list in TASKS.md. Tick items when done, add anything new you find. Read it at the start of every session.
- Split work that divides cleanly (component groups, fixtures, check tooling) across subagents. Check each subagent's evidence (test output, screenshots, scores) before accepting its result. Put search and log-reading subagents on a smaller model; keep code writing on the main model.
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

- Mobile first. Build and test at 360 px wide before desktop. Follow the mobile checklist in docs/PRODUCT.md.
- The banned-patterns list in docs/PRODUCT.md is a hard list. Enforce it in code wherever possible (token ranges, component variants that can't produce the pattern); the critique pass catches the rest.
- Never invent facts: no testimonials, reviews, ratings, awards, client logos, statistics, certifications, prices, opening hours, addresses, names or phone numbers that aren't in the client's input. Use a marked placeholder instead. A site with unfilled required placeholders can't be published.
