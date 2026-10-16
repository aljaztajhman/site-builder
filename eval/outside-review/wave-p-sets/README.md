# Design 5 Wave P: set round result (2026-10-16)

Proof sets: the 25 Review 50 businesses (home + regenerated = 50 pages) and the fresh 10, each page given one of 8 first-screen structure presets (`composition/hero/<structure>-1`) and its own chrome (header family, header tone, phone action), rendered free with `pnpm structure-proof`. Whole-set round: `pnpm outside-review --set`, three reviewers, **€0.2073** (estimate €0.14).

## Against the pass bar

Pass bar (owner, 2026-10-16): variety ≥ 3.5 from 2 of 3 reviewers on both sets; no reviewer's overall drops; the owner agrees on the contact sheets.

Overall / variety, per reviewer (Gemini · GPT · Fable):

| Set | Before | Wave P | Variety ≥ 3.5 from 2 of 3 | Overall held |
|---|---|---|---|---|
| fresh 10 | 2/2 · 3/3 · 3/2 | 3/3 · 3/3 · 3/2 | no (0 of 3) | yes (Gemini 2 → 3) |
| Review 50 | 3/3 · 3/2 · 3/2 | 2/2 · 2/2 · 3/2 | no (0 of 3) | **no** (Gemini 3 → 2, GPT 3 → 2) |

**Result: fail.** Per the plan, the plumbing (U1–U5) stops. Before: eval/outside-review/shootout-sets (fresh 10 "today") and shootout-sets-after50.

## What the reviewers say still repeats

All three, both sets:
- **Two typefaces and one type scale** on every page (a heavy grotesk and one heavy serif); pages "differ by colour, not by design".
- **The same chrome details**: a thin bare header with a lone "Domov", one small "Pokličite" button or underlined link, the phone call/directions bar (and it covers content), the "Ustvarjeno z UI" chip in the same corner of every picture.
- **Structures are recognised as recipes.** With one preset per structure, 50 pages show each layout ~6 times; Fable: "five hero recipes rotate across all 50"; Gemini names the mosaic and the photo-over-dark-band verbatim across pages.
- **Text-only heroes read as empty or unfinished** (poster, ledger, field without a picture): "a barren white void", "a broken wireframe", "a directory listing".
- **Imagery**: generic or unrelated pictures (vineyards for a tyre shop, a landscape for a carpenter), the same crops reused.

New defects the structures brought (why Review 50's overall dropped):
- Display-size headlines break inside words or clip off the first screen (računovodstvo, elektro, ključavničarstvo, instalacije, prevajanje): poster/strata/field type at 7–9 vw has no fitting for long Slovene words.
- Large empty desktop areas in the poster and ledger layouts.

## What this points to

The direction's §6 lever, as the plan's stop rule says: type voice (more than two faces, a real scale system), the CTA and chrome details, and imagery, rather than more first-screen layouts. Headline fitting (no mid-word breaks, no clipping) is a defect fix either way.
