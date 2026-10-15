# Studio shoot-out (2026-10-15)

The same 10 fresh businesses (tools/eval/fresh) designed three ways, homepage only:

- **today**: today's pipeline, replayed free from tools/eval/recordings-fresh10.
- **picture**: `studio.mode "mockup"`. Opus art director, then a GPT Image 2.5 mockup, then an Opus rebuild.
- **fable**: `studio.mode "direct"`. Fable 5.1 art director and composer, no image.

Commands:
- `pnpm studio:poc --fresh --mode mockup --record --max-eur 4 --max-fal 5.5`
- `--mode direct --max-eur 16`
- `pnpm outside-review --run-dir eval/runs-shootout-<set> --out eval/outside-review/shootout-<set>`
- `pnpm outside-review --set …` (shootout-sets, shootout-sets-after50)
- `pnpm variety` (shootout-variety)

| | today | picture | fable |
|---|---|---|---|
| Per-page mean (Gemini / GPT / Fable) | 3.47 (3.92 / 3.21 / 3.29) | 2.86 (3.17 / 2.68 / 2.73) | 2.98 (3.26 / 2.85 / 2.83) |
| Blockers named | 9 | 65 | 57 |
| Distinctiveness | 3.45 | 3.20 | 3.58 |
| Imagery | 3.50 | 2.33 | 2.73 |
| Built by the studio | – | 8 / 10 | 7 / 10 |
| € per homepage | ≈ 0.25 | 0.29 | 0.66 |
| Look distance, mean | 0.58 | 0.56 | 0.56 |
| Set verdict (overall / variety): Gemini · GPT · Fable | 2/2 · 3/3 · 3/2 | 2/2 · 3/3 · 3/2 | 2/2 · 3/3 · 3/2 |

The 50 Review 50 pages as one set: 3/3 · 3/2 · 3/2.

Notes:
- "today" here was rendered and scored in the same run as the studios. The earlier fresh-10 score, from a separate run, was 3.58.
- One Gemini call timed out on plesna-sola-takt in the today set (HTTP 504).

Why the studios lose:
- Their composed pages skip the Review 50 fixes. Reviewers list sentences printed twice, the address shown twice in one section, empty sections, and drawings cropped with a text fragment at the edge.
- The picture studio's AI drawings carry the AI badge, and reviewers call them clip-art.
- The Fable studio leans on one thin line icon and drops most photos.

Every reviewer, on every set: one split-hero template in ten outfits.

Spent: €15.03.
