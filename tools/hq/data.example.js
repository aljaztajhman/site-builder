// Stranko HQ data. The live copy is .hq/data.js at the repo root (gitignored, so worktrees and PRs never fight over
// it); this file is its seed: copy it there when .hq/data.js is missing. Claude rewrites .hq/data.js at the end of every run.
// Shape:
//   updatedAt, headline (one line), summary (2–3 sentences)
//   phases:    [{ name, pct, note, now? }]                 now = the single phase marked "we are here"
//   streams:   [{ name, pct, status, left, last }]         status: moving | waiting | paused | done
//   recent:    [{ date, text, pr? }]                       newest first, ~7
//   next:      [{ text, who: "you" | "claude", eur? }]     3–5
//   needs:     [{ kind, title, why }]                      owner tasks that are not a decision or approval
//   decisions: [{ title, options: [], recommendation }]    open decisions only
//   approvals: [{ title, eur, why, status: "pending" | "approved" | "declined" }]
//   budget:    { mode: "none" | "ask" | "within", monthlyEur, note, liveDailyCap, spend: [{ at, eur, what }] }
//   team:      output of node tools/hq/agent-stats.mjs
window.HQ = {
  "updatedAt": "2026-10-14",
  "headline": "The design studio works on your account; it needs your verdict before we build 1.0",
  "summary": "Last week was almost all the AI design studio: ~150 approved design parts, a live 0.5 trial that designs your homepages, and Okus round 3 comparing its pages with today's. Several older lines (variety, launch limits, billing, go-to-market) are parked at 30–75 %.",
  "phases": [
    {
      "name": "Phase 1 · engine live",
      "pct": 89,
      "note": "Generate, edit, publish, export on Railway"
    },
    {
      "name": "Phase 2 · accounts & editor",
      "pct": 71,
      "note": "Free-preview limits and the editor path open"
    },
    {
      "name": "Design studio",
      "pct": 40,
      "note": "0.5 live for you; 1.0 designed, not built",
      "now": true
    },
    {
      "name": "Phase 3 · billing & domains",
      "pct": 48,
      "note": "Domain flow built on fakes; no billing yet"
    }
  ],
  "streams": [
    {
      "name": "Design studio 0.5 (live trial)",
      "pct": 90,
      "status": "waiting",
      "left": "Your own test on the live app; the stepper step is on a branch without a PR",
      "last": "10-13"
    },
    {
      "name": "Design studio 1.0 (S0–S7)",
      "pct": 35,
      "status": "paused",
      "left": "Inventory and plan done; building S0–S7 not started (~€27 paid tests)",
      "last": "10-11"
    },
    {
      "name": "Okus taste ratings",
      "pct": 80,
      "status": "waiting",
      "left": "Round 3 (15 studio vs today's homepages) published, waiting for your ratings",
      "last": "10-13"
    },
    {
      "name": "Launch blockers (Phase 2)",
      "pct": 71,
      "status": "paused",
      "left": "Free-preview limits, the auth smoke test, the editor path",
      "last": "10-03"
    },
    {
      "name": "Variety engine",
      "pct": 62,
      "status": "paused",
      "left": "Paid steps 3–5 never run; step 6 not started",
      "last": "10-08"
    },
    {
      "name": "Analytics and operations",
      "pct": 43,
      "status": "paused",
      "left": "Analytics built but off; backups, monitoring, production env",
      "last": "10-07"
    },
    {
      "name": "Go-to-market",
      "pct": 33,
      "status": "paused",
      "left": "Town, design partners, waitlist, trademark",
      "last": "10-03"
    },
    {
      "name": "Dev speed and tooling",
      "pct": 100,
      "status": "done",
      "left": "Fast test tier 62 min → 47 s; leaner CLAUDE.md",
      "last": "10-13"
    }
  ],
  "recent": [
    {
      "date": "10-13",
      "text": "Fast tests: the eval tool's fast tier went from 62 min to 47 s",
      "pr": 211
    },
    {
      "date": "10-13",
      "text": "Okus round 3: 15 studio homepages against today's",
      "pr": 209
    },
    {
      "date": "10-13",
      "text": "Model trials, second batch",
      "pr": 179
    },
    {
      "date": "10-12",
      "text": "Studio 0.5 trial also runs on the admin session",
      "pr": 208
    },
    {
      "date": "10-11",
      "text": "Studio 0.5: the live designer (art director, painted mockup, rebuild) behind your switch",
      "pr": 207
    },
    {
      "date": "10-11",
      "text": "Your approval round applied: 106 design parts approved, 49 rejected",
      "pr": 206
    },
    {
      "date": "10-11",
      "text": "49 new section designs, 4 motion presets, 24 reference homepages",
      "pr": 197
    }
  ],
  "next": [
    {
      "text": "Try Studio 0.5 on your account and rate Okus round 3; that decides whether 1.0 is worth building",
      "who": "you"
    },
    {
      "text": "Open the PR for the studio step in the generation stepper (built, never opened)",
      "who": "claude"
    },
    {
      "text": "Studio 1.0, step S0: model bake-off on 3 test sites",
      "who": "claude",
      "eur": 2.5
    },
    {
      "text": "Close the launch blockers: free-preview limits and the sign-in smoke test",
      "who": "claude"
    },
    {
      "text": "Tidy up: ~55 old worktrees, and TASKS.md boxes that lag behind what shipped",
      "who": "claude"
    }
  ],
  "needs": [
    {
      "kind": "Confirm",
      "title": "Development budget",
      "why": "HQ's last setting (10 Oct) was $90/month for the API and $10 for pictures; until you confirm, Claude asks before any paid run"
    },
    {
      "kind": "Test",
      "title": "Studio 0.5 on your live account",
      "why": "Your call decides 1.0 or a different direction"
    },
    {
      "kind": "Rate",
      "title": "Okus round 3",
      "why": "15 pairs; tells us if the studio beats today's pages"
    }
  ],
  "team": {
    "since": "29 Sep",
    "launches": 68,
    "sessions": 29,
    "subShareOut": 34,
    "before": {
      "label": "Before team rules",
      "sub": "29 Sep – 10 Oct",
      "n": 56,
      "mix": {
        "Opus": 41,
        "Sonnet": 10,
        "Haiku": 0,
        "Fable": 5
      }
    },
    "after": {
      "label": "Since team rules",
      "sub": "11 – 14 Oct",
      "n": 12,
      "mix": {
        "Opus": 7,
        "Sonnet": 0,
        "Haiku": 5,
        "Fable": 0
      }
    },
    "roles": {
      "General (untyped)": 55,
      "Scout": 6,
      "Builder": 4,
      "Asset maker": 2,
      "Reviewer": 1,
      "Implementer": 0
    },
    "note": "Local sessions only; cloud runs aren't on this machine. Since the 11 Oct rules every launch has a typed role, and Haiku went from 0 to 5 of 12. The hook blocked 4 launches with a missing brief header. The Sonnet implementer hasn't been used yet."
  },
  "budget": {
    "mode": "ask",
    "monthlyEur": 86,
    "note": "$90 API + $10 pictures a month (HQ, 10 Oct). Spend after 12 Oct isn't logged yet.",
    "liveDailyCap": null,
    "spend": [
      {
        "at": "2026-10-02",
        "eur": 1.29,
        "what": "Template evals, 3 fixtures (2 runs)"
      },
      {
        "at": "2026-10-07",
        "eur": 0.01,
        "what": "Junk-threshold calibration"
      },
      {
        "at": "2026-10-08",
        "eur": 8.78,
        "what": "Variety measurements and template pictures (6 runs)"
      },
      {
        "at": "2026-10-11",
        "eur": 0.22,
        "what": "Hero pictures and Studio 0.5 director recording"
      },
      {
        "at": "2026-10-12",
        "eur": 3.29,
        "what": "Mockup spikes 1–2 and Studio 0.5b recordings"
      }
    ]
  },
  "decisions": [],
  "approvals": []
};
