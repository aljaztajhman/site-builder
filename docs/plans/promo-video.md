# Promo video (owner, 2026-10-20: "switch, we're working on it now")

One professional 9:16 spot for Postavi, delivered as three cuts (15 s ad, 30 s promo, 60 s explainer), with a repeatable way to make more. Launch material for M7. Ceiling **€60** from the development budget (owner, 2026-10-20: "60 is OK, but let's be careful with money"). Ad spend is separate and the owner's.

## Rules

- **The product is never generated.** Every frame that shows Postavi (the typing, the build, the editor, the finished site) is a real capture of the app or a real render. Video models make people, places and mood only.
- **No invented facts, no fake customers.** Generated people are stylised and never presented as customers or testimonials. Realistic generated shots carry a small "vizualije ustvarjene z AI" note in the end card.
- **Don't lead with "AI"** (docs/GO-TO-MARKET.md §3): sell the outcome ("v minuti", "pokličejo vas z enim dotikom"). Vikanje throughout. Slovene typography.
- **Money:** every paid step is listed below with its estimate; nothing runs without the owner's OK on that step. Each run is booked in HQ `spend` right after. Drafts on the cheap model, finals on the quality model only for shots that survived the rough cut. Stop rule: if €30 are spent and the look is not there, stop and bring it to the owner.
- Captures use the real app at phone size (360 px site in the demo frame, 1080×1920 output), the showcase trades (packages/spec/src/showcase.ts: fictional businesses, colourways clients never get).

## Steps

| # | Step | Who | € | Done means |
|---|------|-----|---|------------|
| 1 | Script: eight concepts, hook, shot list, VO text (below) | Claude | 0 | done: owner picked 1, 4 and 8 |
| 2 | Storyboard stills: one generated still per shot, as a contact sheet | Claude | 0.62 spent | owner approves the look |
| 3 | Rough cut: draft shots on the cheap model, real captures, temp VO and music, assembled by `tools/promo` into the 30 s with burned-in captions | Claude | ≈ 5 | owner watches it on a phone, gives notes |
| 4 | Finals: surviving shots on Kling 3 Pro (one test shot first, ≈ €0.70; Veo 3.1 only if Kling disappoints, ≈ 3× the price), push-ins on real renders checked frame by frame, final VO (two voices to choose from), final music | Claude | 15–40 | owner picks the voice, approves the shots |
| 5 | Three cuts (15/30/60 s), with and without VO, 1:1 variant, thumbnails, AI note | Claude | 0–2 | files in `eval/runs/promo/<date>/` (gitignored) and sent to the owner |
| 6 | Ads: 15 s cut with two hooks for a week; rebuild the losing hook (≈ €5) | owner (ad account) + Claude | ad budget, owner's | cost per sign-up known |

Prices checked on fal 2026-10-20: Kling 3 Pro $0.14/s (text and image to video), Veo 3.1 $0.40/s (fast $0.15/s), MiniMax H3 Max $0.0325/s (turbo $0.016/s), Wan 3 Prime image-to-video $0.05/s, ElevenLabs v4 $0.08 per 1000 characters, Stable Audio $0.20 per track, sound effects $0.002/s. Text preservation in image-to-video is not guaranteed by any model: inspect every clip.

## Tooling (step 3, Sonnet-sized work in `tools/promo`)

- `capture.ts`: Playwright opens `/nova?primer=<id>` (or the ad composition page) at 1080×1920, phone mode, records the typing → build → result as a frame sequence; stitched with Playwright's bundled ffmpeg (`%LOCALAPPDATA%/ms-playwright/ffmpeg-*`). First try `recordVideo`; if frames drop during the morph, step the Web Animations clock and screenshot per frame.
- `assemble.ts`: an edit list (shot, in, out, caption, VO cue) → ffmpeg concat with burned-in captions (Slovene, large, safe area for the platforms' UI), music ducked under VO, end card.
- Generated media go through fal's MCP; every job's cost is written to `eval/runs/promo/<date>/costs.json` and booked in HQ.

## Owner's part

- Pick a concept (step 1) and later the voice (step 4). About 10 minutes per step.
- Watch each cut on a phone, not a monitor.
- Accounts for TikTok, Instagram, YouTube and Meta Ads are the owner's to create and sign in to; uploads are the owner's.
- Ad budget decision for step 6 (suggested €5 a day per hook for a week).

## Picked concepts (owner, 2026-10-20: "Concept 1 and 4 I like. 8 also for some.")

Eight concepts were shown (claude.ai artifact "Postavi Promo Concepts"). Picked: **1 Pod umivalnikom** for the 30 s promo, **4 Imate spletno stran?** for the 15 s ad, **8 Stran iz leta 2009** for a 15 s retargeting cut (people who used the free site checker). Not picked: 2 "60 sekund" (timer; its timer survives as a small motif during the build), 3 "Deset obrti" (trade montage on the morph; a later shorts series), 5 "Pokličite" (customer's side), 6 "Česar ne napišete, si ne izmislimo" (honesty), 7 "Nedeljsko kosilo" (grown child sets up the parents' site).

Legend: [GEN] generated video, [CAP] real capture of the app, [I2V] image-to-video on a real render, [MG] motion graphics. VO calm and warm, vikanje. Captions burned in.

### 1 · "Pod umivalnikom" (30 s promo)

The missed call is not the problem; being unfindable is. Two missed calls, two endings.

| Time | Shot | Caption | VO |
|------|------|---------|----|
| 0–3 | [GEN] Inštalater pod umivalnikom, telefon na tleh zvoni, ne more dvigniti. | Še vedno brez spletne strani? | — |
| 3–6 | [GEN] Klicateljica za kuhinjsko mizo išče po telefonu, ne najde nič, pokliče naslednjega. | Stranka vas išče. Ne najde vas. | Ko ne morete dvigniti, vas stranka poišče. Če vas ne najde, pokliče naslednjega. |
| 6–9 | [GEN] V kombiju med malico, telefon v rokah, tipka. | Opišite podjetje v nekaj stavkih. | Opišite, kaj delate in kje. |
| 9–15 | [CAP] Tipkanje opisa (showcase Inštalater), Ustvari, gradnja v štirih korakih; majhen števec časa v kotu. | V minuti vidite svojo stran. | V minuti imate stran, ki jo stranke najdejo na telefonu. |
| 15–20 | [I2V] Končana stran, počasen zoom; [CAP] drsenje: storitve, območje, Pokličite, obrazec. | Pokličejo vas. Ali pa pustijo sporočilo. | Pokličejo vas z enim dotikom. Če ne morete dvigniti, pustijo sporočilo. |
| 20–24 | [CAP] Urejanje na mestu: dotik na ceno, popravek, Objavi. | Popravite sami. Brez agencije. | Spremembe naredite sami, kadar hočete. |
| 24–27 | [GEN] Zvečer za mizo, telefon pri ušesu, zapisuje v beležko. | Pokliče nazaj. Delo je njegovo. | — |
| 27–30 | [MG] End card: postavi.si · "Spletna stran v minuti." · AI note | postavi.si | Postavi. Spletna stran v minuti. |

### 4 · "Imate spletno stran?" (15 s ad)

Comedy timing; works without sound. Nobody speaks on camera: the line is a caption.

| Time | Shot | Caption | VO |
|------|------|---------|----|
| 0–3 | [GEN] Frizerski salon, stranka pri pultu vpraša. | „Imate spletno stran?“ | — |
| 3–5 | [GEN] Frizerka skomigne, neroden nasmeh. Tišina. | „Ne … samo Facebook.“ | — |
| 5–10 | [CAP] Hiter rez: opis se natipka (showcase Frizer), stran se zgradi; števec. | Minuto kasneje. | Opišite salon. V minuti imate stran. |
| 10–13 | [GEN] Frizerka obrne telefon proti stranki (zaslon bel); [CAP] stran vkomponirana na zaslon. | „Imamo.“ | Pokličejo vas z enim dotikom. |
| 13–15 | [MG] End card: postavi.si · "Spletna stran v minuti." · AI note | postavi.si | Postavi. |

### 8 · "Stran iz leta 2009" (15 s retargeting)

No generated people. A dated fictional site (built by us in HTML: tiny text, no call button, broken at 360 px) against the generated one.

| Time | Shot | Caption | VO |
|------|------|---------|----|
| 0–3 | [CAP] Telefon: stara stran, drobne črke, stiskanje s prsti, nič se ne zgodi. | Vaša stran iz leta 2009? | Tako vas vidijo stranke na telefonu. |
| 3–8 | [CAP] Deljen zaslon: stara levo, nova desno; nova se zgradi v štirih korakih. | Ali vaša konkurenca? | Tako jih vidi konkurenca. |
| 8–12 | [CAP] Stara stran se skrči in izgine; nova čez cel zaslon, drsenje, Pokličite. | Pokličejo vas z enim dotikom. | Opišite podjetje. V minuti imate stran, ki deluje na telefonu. |
| 12–15 | [MG] End card: postavi.si · "Brezplačen pregled strani" link to /pregled | postavi.si/pregled | Preverite svojo stran. Brezplačno. |

### Step 2: storyboard stills (done 2026-10-20, €0.62)

`pnpm promo:stills` (tools/promo/stills.ts, shots in tools/promo/storyboard.json): 9 stills on nano-banana-2 for the six generated shots of concepts 1 and 4, in eval/runs/promo/2026-10-20T20-16-28/ (contact-sheet.png). Look: documentary, Slovene-ordinary, no stock gloss. Open point for step 4: the plumber is a different man in 1a, 1c and 1d; the video model needs a reference image of one person (Kling elements or a reference-to-video endpoint) to keep him the same across shots.

## VO voice and music

- VO: ElevenLabs v4 with `language_code: "sl"`; two candidate voices rendered on the end-card line for the owner to choose (step 4). Formal, warm, unhurried; no "AI" radio voice.
- Music: one Stable Audio track (warm, acoustic, 90–100 bpm, no vocals) or a licensed library track if the owner wants a guaranteed-clean licence for paid ads.

## Not in scope

Real customer footage (comes with the free beta, M7a, and beats everything here), a presenter or talking avatar, English versions.
