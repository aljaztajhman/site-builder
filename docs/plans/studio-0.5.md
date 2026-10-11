# Design studio 0.5: live proof of concept

Owner, 2026-10-11: "a design studio 0.5, live; I'll test it myself a bit, do the POC, then the 1.0." Cut scope now, add the rest later. Studio 1.0 is still docs/plans/studio-phase2-design.md (S0–S7, SV); 0.5 is its first slice, built so 1.0 extends it instead of replacing it.

## What 0.5 does

For the owner's account only, a new homepage generation runs today's pipeline up to the merged content (classify → brief ∥ images → design → photos/alt → content → owner facts). Then:

1. **Shortlist (code).** The stances that fit the trade (`fittingStances`), and per intent the **approved** composition presets, palettes, pairings and wordmarks (`inventory()`, status `approved`). Drafts and rejected assets are never offered live.
2. **Director (one Opus call, structured output, stage `director`).** It sees the brief, the photo descriptions (alt text and grade), the facts that exist, and the shortlist (id + one-line description each). It returns:
   - `idea`: one sentence, the page's concept
   - `stance`: an id from the shortlist
   - `sections`: ordered list of `{ intent, preset }` (hero first; only shortlist ids; intents the business has content for)
   - `palette`, `pairing`, `wordmark?`: shortlist ids
   - `copy`: `{ headline, lead }` for the hero, plus per-section `headline` where the preset has the slot, in Slovene. It writes no facts: numbers, hours, prices, names and places come from the spec via the slots.
3. **Compose (code, no model call).** The composer builds the page from the base spec (today's content, facts and photos), the brief and the director's choice. Any id not in the shortlist, or a preset whose `needs` the spec can't fill, falls back to the composer's own deterministic pick for that intent.
4. **Guards.** `validateSite` and the composition guards (contrast, banned patterns, placeholders) must pass. If they don't, or any studio step throws, the job keeps today's spec and logs why. The owner always gets a site.
5. Checks and the save run as today. The critique is skipped for a composed homepage, since it can only fix copy.

What the owner sees: the site in the editor, composed sections editable as copy (already supported). The director's `idea` is logged with the job and shown in `/admin/engine`.

## Switch and money

- `designer.agent`: `"off" | "trial" | "on"` in config (today `false`; migrate the value). `"trial"` runs the studio only for accounts whose email is in `DESIGNER_TRIAL_EMAILS` (comma list, Railway web + worker; documented in .env.example). Guests, free accounts and everyone else: unchanged.
- `models.director` in config: Opus 5.5, effort from config, maxTokens from config. `studio.perRunMaxEur` 0.40 (hard stop through the client's `maxEur`/reservation). Cost is logged per stage in `model_calls` as for every call.
- The preview environment's daily cap (`DAILY_SPEND_CAP_EUR` €3) still applies.

## Not in 0.5 (1.0 adds these)

The six Haiku designers, the tournament critic and pre-screen, the finisher loop, spec v22 and stored alternatives, generated art per site (AI painting, linocut and poster per trade), the site kit for other pages, the owner progress screens, "Druge zamisli". 0.5 works on the homepage only.

## How it is checked

- Unit tests with recorded director answers for the 3 composer fixtures (pekarna-kvas, avtoservis-mrak, instalacije-rebernik), no real calls: shortlist contents (approved only), choice validation and fallback, compose from an arbitrary base spec (not only eval fixtures), guards pass, fallback to today's spec on a bad answer, the switch (off / trial with and without the email / on).
- One paid recording run on the 3 fixtures (≈ €0.30, within meta/budget), with screenshots at 1280 and 360 px.
- Live: after merge and the Railway variables, the owner generates on their account; their first test is the POC.
