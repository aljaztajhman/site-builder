# Eval report

Mode: **record**, scope: **full**, started 2026-09-29T13:47:50.576Z, wall time 714.3 s, total model spend €0.401.

## Summary

- Checkpoints passing every automated check: **6/6**
- Scripted edits: 4 pass, 1 fail, 0 manual
- Median generation cost €0.283 (target ≤ €1.500) ✓
- Median generation time 276.6 s (target ≤ 240 s) ✗
- Median edit cost €0.023 per edit

## Sites

Lighthouse thresholds: performance ≥ 90, accessibility 100, best practices ≥ 95, SEO ≥ 95.

| Site | Type | Direction | LH P/A/BP/SEO | axe | 360 px width | Facts | Placeholders | Export offline | Gen cost | Gen time | Pass |
|---|---|---|---|---|---|---|---|---|---|---|---|
| pekarna-kvas | bakery | warm-craft | 100/100/100/100 | 0 | 360 | 0 | 6 | ✓ 1.0 MB | €0.283 | 276.6 s | ✓ |

### pekarna-kvas

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 911 | 19 | 0 | 0 | 0.0009 | 1.9 s |
| brief | 1 | 2331 | 1497 | 0 | 919 | 0.0189 | 9.9 s |
| design | 1 | 275 | 202 | 0 | 4169 | 0.0112 | 4.2 s |
| altText | 1 | 1813 | 218 | 0 | 573 | 0.0062 | 4.1 s |
| content | 2 | 40713 | 7665 | 16082 | 16082 | 0.1733 | 40.6 s |
| critique | 2 | 17364 | 576 | 16293 | 16293 | 0.0727 | 10.4 s |
| edit | 6 | 32241 | 1505 | 81545 | 16309 | 0.1175 | 22.0 s |
| **total** | | | | | | **0.4006** | |

Stage wall times: classify 1.9 s, brief 10.5 s, design 4.2 s, images 7.9 s, content 41.3 s, check 200.3 s, critique 10.4 s.

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 100/100/100/100 | 0 | ✓ |  | — |
| edit 1: “Temnejša glava prosim, zdaj je preveč bleda.” | 99/100/100/100 | 0 | ✓ | ✓ /chrome/header/tone = "inverse" | — |
| edit 2: “Add an FAQ: potica for Sunday can be ordered until Thursday; we don't bake gluten-free bread.” | 100/100/100/100 | 0 | ✓ | ✓ faq present | — |
| edit 3: “Toplejše barve, kot skorja kruha.” | 100/100/100/100 | 0 | ✓ | ✗ hue 29→29, sat 0.66→0.66 (rejected: /design/colors/surface: cream section background is banned) | — |
| edit 4: “Change the Saturday hours to 6.30–13.00.” | 100/100/100/100 | 0 | ✓ | ✓ "13.00" found | — |
| edit 5: “Odstrani galerijo, slik je dovolj drugod.” | 100/100/100/100 | 0 | ✓ | ✓ 0 × gallery | — |
