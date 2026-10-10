# Model trials: quality per $

Which model gets which kind of unit is decided here from measured results, not reputation (owner, 2026-10-11: "experiment and see how much quality output per $ it creates"). The research behind the starting rules is in `agent-team.md` §1.

## How a unit is scored

| Field | Source |
|---|---|
| API $ | `pnpm agents:costs` (transcripts, exact per request; API-equivalent, the Max plan pays in limits) |
| Wall-clock | same report |
| First report passes | did the worker's own checks pass, and did the director's re-run of every touched package pass |
| Director fix-up | lines the director changed afterwards (merge conflicts excluded) |
| Later findings | reviewer findings, CI failures and bugs traced back to the unit, added when they appear |

**Quality per $** is read off these together: a cheap unit that needs a fix builder costs its own $ plus the fix's $.

## Trial rules (2026-10-11)

1. **Paired runs.** Some units get the same brief twice, Sonnet medium and Opus medium, in separate worktrees; the director keeps the better result and both are scored. First pair: F1b-3 (engine fact rules).
2. **Sonnet's planned share widens** from "failing tests exist" to "exact spec plus listed checks": F1b-2b, INV-1b, I3-0. Open design and taste stay on Opus.
3. Effort stays medium for both unless a unit's row says otherwise (the owner's rule: medium, high or xhigh only).
4. After about 8 scored Sonnet units and as many Opus units, the rules in `agent-team.md` §2 and the `delegate` skill are updated from this table, and the result is reported.

## Log

Costs from session c60f7eb8 (design studio), 2026-10-11. Earlier units ran at effort high, before the medium rule.

| Unit | Model · effort | Kind | Requests | API $ | Wall-clock | First report passes | Director fix-up | Later findings |
|---|---|---|---:|---:|---:|---|---|---|
| F1 guards | sonnet · high | code, spec'd | 38 | 2.27 | 9 min | yes | — | F1 review fixes (shared with renderer) |
| F1 renderer | sonnet · high | code, spec'd | 86 | 5.80 | 17 min | no: missed the components package test (clip-path) | — | fix builder $3.43 + review fixes $5.35 (Opus) |
| F2 agent loop client | sonnet · high | code, spec'd | 36 | 2.06 | 16 min | yes | — | review: 4 fixes (context_window, advisor max_tokens, NaN caps, batch tools) |
| F1b-0 asset ids | opus · medium | code, exact spec | 25 | 1.09 | 5 min | yes (1,023 tests) | 0 | — |
| F1b-1 spec v20 | opus · medium | code, design | 111 | 8.78 | 34 min | yes (5 packages) | 0 | catalogue +168 % (design gap, not the unit's) |
| INV-1a decisions + detector | opus · medium | code, spec'd | 42 | 2.69 | 10 min | yes (569) | 0 | — |
| Agent cost report | opus · medium | code, spec'd | 28 | 2.04 | 6 min | yes (8) | 0 | — |
| Phase 1 design | opus · xhigh | design | 43 | 4.55 | 19 min | n/a | 2 amendments after scouts (§2.1, §3.4) | — |
| Phase 1 design (stopped) | fable · high | design | 9 | 3.39 | 4 min | nothing written | — | — |
| Scouts (6 in this stretch) | haiku · low/medium | reading | 4–45 | 0.01–0.39 | 1–4 min | maps accurate; found 6 design/code mismatches | — | — |
