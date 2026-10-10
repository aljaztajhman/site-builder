---
name: delegate
description: Stranko's agent-team procedure (docs/dev/agent-team.md). Use before starting any non-trivial task and before every Agent launch — triage the task (mode S/D/W), pick roles and models (Opus + Haiku, Fable only on escalation), map with a Haiku scout before any builder, write the brief, verify every touched package, record the setup. Not optional: the PreToolUse hook rejects agent launches without an explicit model or a MODE line.
---

# Delegate (Stranko agent team)

The rules and the research behind them are in `docs/dev/agent-team.md`. This is the procedure. The owner's plan is Claude **Max 5x**: the scarce resource is plan usage, and the director's own context is its biggest consumer.

## 1. Triage (before any work)

Score the task, one point each: **independent** units · **disjoint** files/packages · **checkable** units · **big** (≥ 30 min each) · **broad** reading.
- 0–2 → **S** (solo with Haiku scouts) · 3–4 → **D** · 5 and ≥ 8 similar units → **W** (overnight only with an approved `mode: "W"` HQ plan)
- **Hard no → S**: units share files; design not settled; mostly a decision; or the work fits one context at lower effort (Anthropic measured: then the strongest model alone at lower effort wins).

Write the status line first: `Mode D · score 4/5 · team: scout(haiku) → 2 builder(opus·medium) → reviewer(opus·high)`.

## 2. Pick the team

| Need | Role | Model · effort |
|---|---|---|
| read code / logs / reports / web, map an area | `scout` | haiku · medium (low for one lookup) |
| mechanical edits from an exact list, downloads, registrations, running sheets | `mechanic` | haiku · medium |
| build a unit of code | `builder` | opus · medium (high for bugs in existing code or tricky migrations) |
| design assets (taste) | `asset-maker` | opus · medium; high when the asset sets the bar |
| review a diff | `reviewer` | opus · high |
| make failing tests pass against a fixed interface | `implementer` | sonnet · medium |
| phase design (bookend), phase review (bookend), the product's ceiling decisions, escalation after two failed attempts | `architect` | fable · high, `FABLE: phase-design|phase-review|ceiling|escalation` line |

Never: the built-in **Explore** (runs on Opus), `general-purpose` without an explicit `model`, **max** effort, Sonnet at high/max, Fable for routine building or reading.

The usual shape of a phase: **architect designs → scouts map → builders/implementers build → director verifies → architect reviews the phase**.

## 3. Scout first

Before any builder or asset maker: one `scout` maps the files, signatures, patterns, test commands and pitfalls the unit touches. Paste the map into the brief. A builder that has to explore on its own costs Opus tokens for Haiku work.

## 4. Brief template

```
MODE: D (score 4/5) · role: builder · model: opus · effort: medium
Objective: <one sentence>
Context: <plan §, HQ item id> · SCOUT MAP: <pasted> · interface: <pasted or path@commit>
Base: git fetch origin && git checkout -b <branch> origin/<feature-branch>
Owns: <files/folders>; everything else read-only
Done means: <exact commands>; evidence: <what to return>
Constraints: <CLAUDE.md rules that bite>; no HQ writes, merges or paid calls (unless allowance: €X, stop at €Y)
Report: status · branch/commits · files · evidence · left · decisions for the director · € spent · subagent tokens if known
```

## 5. Limits

At most 3 builders/mechanics/asset makers at once on the local machine (scouts don't count). `/compact` with instructions at phase boundaries. Don't re-read large files the scout already summarised.

## 6. Verify (before accepting a result)

1. Read the diff.
2. Typecheck + lint.
3. Tests of **every touched package**: `git diff --name-only origin/main... | grep -oE '^(packages|apps|tools)/[^/]+(/[^/]+)?' | sort -u` → `corepack pnpm exec vitest run <those>/test --maxWorkers=1`.
4. Look at screenshots/sheets the change produces.
5. Reviewer when it touches spec version/migration, money, security, publishing rules, a DB migration, or > ~500 lines of logic.
6. CI green before merge; read a red check, rerun at most once if it's a known flaky test.

## 7. Record

PR description: **Agent setup** — mode, roles × model × effort, wall-clock, subagent tokens, reviewer catches, what was redone. The hook logs every launch to `.claude/agent-log.jsonl`.
