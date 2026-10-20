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
| 1 | Script: three concepts, hook, shot list, VO text (below) | Claude | 0 | owner picks one, marks lines to change |
| 2 | Storyboard stills: one generated still per shot + the real product frames, as a contact sheet | Claude | ≈ 1 | owner approves the look |
| 3 | Rough cut: draft shots on the cheap model, real captures, temp VO and music, assembled by `tools/promo` into the 30 s with burned-in captions | Claude | ≈ 5 | owner watches it on a phone, gives notes |
| 4 | Finals: surviving shots on Kling 3 Pro (one test shot first, ≈ €0.70; Veo 3.1 only if Kling disappoints, ≈ 3× the price), push-ins on real renders checked frame by frame, final VO (two voices to choose from), final music | Claude | 15–40 | owner picks the voice, approves the shots |
| 5 | Three cuts (15/30/60 s), with and without VO, 1:1 variant, thumbnails, AI note | Claude | 0–2 | files in `eval/promo/<date>/` (gitignored) and sent to the owner |
| 6 | Ads: 15 s cut with two hooks for a week; rebuild the losing hook (≈ €5) | owner (ad account) + Claude | ad budget, owner's | cost per sign-up known |

Prices checked on fal 2026-10-20: Kling 3 Pro $0.14/s (text and image to video), Veo 3.1 $0.40/s (fast $0.15/s), MiniMax H3 Max $0.0325/s (turbo $0.016/s), Wan 3 Prime image-to-video $0.05/s, ElevenLabs v4 $0.08 per 1000 characters, Stable Audio $0.20 per track, sound effects $0.002/s. Text preservation in image-to-video is not guaranteed by any model: inspect every clip.

## Tooling (step 3, Sonnet-sized work in `tools/promo`)

- `capture.ts`: Playwright opens `/nova?primer=<id>` (or the ad composition page) at 1080×1920, phone mode, records the typing → build → result as a frame sequence; stitched with Playwright's bundled ffmpeg (`%LOCALAPPDATA%/ms-playwright/ffmpeg-*`). First try `recordVideo`; if frames drop during the morph, step the Web Animations clock and screenshot per frame.
- `assemble.ts`: an edit list (shot, in, out, caption, VO cue) → ffmpeg concat with burned-in captions (Slovene, large, safe area for the platforms' UI), music ducked under VO, end card.
- Generated media go through fal's MCP; every job's cost is written to `eval/promo/<date>/costs.json` and booked in HQ.

## Owner's part

- Pick a concept (step 1) and later the voice (step 4). About 10 minutes per step.
- Watch each cut on a phone, not a monitor.
- Accounts for TikTok, Instagram, YouTube and Meta Ads are the owner's to create and sign in to; uploads are the owner's.
- Ad budget decision for step 6 (suggested €5 a day per hook for a week).

## Step 1: three concepts (30 s, 9:16)

Legend: [GEN] generated video, [CAP] real capture of the app, [I2V] image-to-video on a real render, [MG] motion graphics. VO is read in a calm, warm voice, vikanje. Captions are burned in for sound-off viewing.

### A · "Pod umivalnikom" (tradesperson hook)

The pain first: a craftsman loses a job because the customer can't find him. Then the fix, in a minute, from the van.

| Time | Shot | Caption | VO |
|------|------|---------|----|
| 0–3 | [GEN] Inštalater pod umivalnikom, telefon zazvoni, roka seže po njem. Close, warm light. | Še vedno brez spletne strani? | — |
| 3–7 | [GEN] V kombiju, med malico. Telefon v roki, pogled dol. | Opišite podjetje v nekaj stavkih. | Opišite, kaj delate in kje. |
| 7–13 | [CAP] Tipkanje opisa (showcase Inštalater: "Sem Matej Rebernik, inštalater z mojstrskim izpitom …"), pritisk na Ustvari, gradnja strani v štirih korakih. | V minuti vidite svojo stran. | V minuti imate stran, ki jo stranke najdejo na telefonu. |
| 13–19 | [I2V] Končana stran, počasen zoom; nato [CAP] drsenje: storitve, območje, gumb Pokličite. | Pokličejo vas z enim dotikom. | Pokličejo vas z enim dotikom. Česar ne napišete, si ne izmislimo. |
| 19–24 | [CAP] Urejanje na mestu: dotik na ceno, popravek, Objavi. | Popravite sami. Brez agencije. | Spremembe naredite sami, kadar hočete. |
| 24–27 | [GEN] Isti inštalater zvečer, telefon zazvoni, nasmeh. | Nova stranka. | — |
| 27–30 | [MG] End card: postavi.si · "Spletna stran v minuti." · AI note | postavi.si | Postavi. Spletna stran v minuti. |

Why it works: the ring at 0 s and 24 s is the loop; the audience sees itself. Risk: a generated person must look Slovene-ordinary, not stock-cinematic; stills in step 2 settle this.

### B · "60 sekund" (timer)

One claim, proven on screen. The product fills the frame; the people are context.

| Time | Shot | Caption | VO |
|------|------|---------|----|
| 0–2 | [MG] Big timer 60 → starts; [GEN] pekarna ob petih zjutraj, testo na mizi. | 60 sekund. | Koliko časa potrebujete za spletno stran? |
| 2–6 | [GEN] Pekovske roke posujejo moko; telefon ob skledi. | Medtem ko vzhaja kruh … | Mi rečemo: minuto. |
| 6–14 | [CAP] Tipkanje (showcase Pekarna: "Pekarna Kvas je naša mala družinska pekarna v Kamniku …"), gradnja. Timer teče v kotu. | Opišete. Stran se postavi sama. | Opišete pekarno. Stran se postavi sama: besedila, barve, fotografije. |
| 14–20 | [I2V] / [CAP] Končana stran, drsenje; timer se ustavi pri ~45 s. | Končano. Pred minuto. | Preden je kruh v peči, je stran na telefonu. |
| 20–25 | [CAP] Urejanje: nova cena kruha, Objavi. | Cene spremenite sami. | Cene, ure in fotografije spremenite sami. |
| 25–30 | [MG] End card: postavi.si · "Spletna stran v minuti." · price line when public · AI note | postavi.si | Postavi. Spletna stran v minuti. |

Why it works: a visible timer is a promise the viewer checks; PHASE-2 defines "≤ 60 s" as the first preview, so the capture must show the real time with no cut. Risk: on a slow day the real build runs past 60 s; then the claim becomes "v minuti ali dveh" or the shot is retaken.

### C · "Deset obrti" (trade montage)

Rhythm and breadth: every trade, same minute. Best for the 15 s cut and for the "komentiraj svojo dejavnost" loop.

| Time | Shot | Caption | VO |
|------|------|---------|----|
| 0–3 | [GEN] three 1 s cuts: frizerka s škarjami, mehanik pod dvigalom, kuhar pri štedilniku. | Frizer. Mehanik. Gostilna. | Frizer. Mehanik. Gostilna. |
| 3–8 | [CAP] Demo: opis se natipka, stran zgradi (Frizer). | Vsaka obrt. Ena minuta. | Vsaka obrt dobi svojo stran. V minuti. |
| 8–18 | [CAP] Demo morph: Frizer → Zobozdravnik → Avtoservis → Gostilna → Pekarna, each ~2 s, trade label on screen. | (trade labels) | Zobozdravnik. Avtoservis. Gostilna. Pekarna. Vsaka po svoje, nobena iz predala. |
| 18–24 | [GEN] 1 s cuts of three more trades, each cut to [I2V] their finished site. | Tudi vaša. | Tudi vaša. |
| 24–27 | [CAP] Urejanje in Objavi. | Uredite sami. | Uredite jo sami, kadar hočete. |
| 27–30 | [MG] End card: postavi.si · "Katero obrt imate vi? Napišite v komentar." · AI note | postavi.si | Postavi. Spletna stran v minuti. |

Why it works: the morph is the product's own trick and nobody else has it; comments feed the next shorts. Risk: fast cuts need the morph captured clean at 60 fps.

### Recommendation

**A for the 30 s promo** (the emotional hook sells to owners who don't wake up wanting a website, GTM §3 "triggers"), **C for the 15 s ad and the shorts series**, B's timer as a motif inside A (a small timer during the build). Pick one for the first production; the other follows from the same captures.

## VO voice and music

- VO: ElevenLabs v4 with `language_code: "sl"`; two candidate voices rendered on the end-card line for the owner to choose (step 4). Formal, warm, unhurried; no "AI" radio voice.
- Music: one Stable Audio track (warm, acoustic, 90–100 bpm, no vocals) or a licensed library track if the owner wants a guaranteed-clean licence for paid ads.

## Not in scope

Real customer footage (comes with the free beta, M7a, and beats everything here), a presenter or talking avatar, English versions.
