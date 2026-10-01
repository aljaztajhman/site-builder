# Eval report

Mode: **offline**, scope: **full**, started 2026-10-01T07:53:47.844Z, wall time 33.2 s, total model spend €0.000.

Offline mode renders hand-authored golden specs with no model calls: it measures the components, directions and checks, not generation quality, cost or time.

## Summary

- Checkpoints passing every automated check: **1/1**
- Scripted edits: 0 pass, 0 fail, 0 manual
- Homepages repeating the contact facts (2+ contact blocks): 1/1
- First screen meets the composition targets: phone 1/1, desktop 1/1 (report-only; table below)

## First screen

Measured on the rendered homepage before scrolling: photo share · first photo at (screens) · buttons · headline lines · largest empty band (px). Targets: phone photo ≥ 25 % (with photos), ≤ 3 buttons, ≤ 4 lines, band ≤ 96 px; desktop photo ≥ 30 %, ≤ 3 buttons, ≤ 3 lines, band ≤ 160 px.

| Site | Photos | Phone 360×800 | Misses | Desktop 1280×800 | Misses |
|---|---|---|---|---|---|
| zobozdravstvo-lebar | 3 | 29 % · 0.12 · 3 · 3 · 81 | ✓ | 30 % · 0.16 · 2 · 2 · 145 | ✓ |

## Sites

Lighthouse thresholds: performance ≥ 90, accessibility 100, best practices ≥ 95, SEO ≥ 95.

| Site | Type | Direction | LH P/A/BP/SEO | axe | 360 px width | Facts | Placeholders | Export offline | Gen cost | Gen time | First preview | Pass |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| zobozdravstvo-lebar | dental | clinical-calm | 100/100/100/100 | 0 | 360 | 0 | 0 | ✓ 1.5 MB | — | — | — | ✓ |

### zobozdravstvo-lebar

Homepage: hero-split:image-right › booking:with-hours › services-list:two-column › steps:vertical › team:list › contact:split-map (2 contact blocks).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 100/100/100/100 | 0 | ✓ |  | — |
