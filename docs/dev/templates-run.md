# Templates K, L, N, O, P, R, T in the engine: run checklist

Running checklist for teaching the engine the seven remaining hand-made templates (docs/design/templates), done the way M, S and J were (branch claude/templates-msj, TASKS.md "Templates M (Tablica), S (Cevi) and J (Skorja) in the engine"). Budget for the run: €0 (no live, record or judge evals, no generated images; `pnpm eval --offline` only).

## Setup (2026-10-02)

- [x] Step 0: Playwright Chromium renders docs/design/templates/m-tablica.html at 1280 px and the screenshot was opened and described. Playwright 1.63 expects Chromium revision 1243; the container has 1194. Workaround without downloading: a scratch `PLAYWRIGHT_BROWSERS_PATH` whose 1243 paths are symlinks to the 1194 binaries (Chromium 141).
- [x] Seven read-only analyses (one subagent per template), each gap list checked against the HTML before use.
- [x] `pnpm templates:compare <letters>` (tools/eval/src/templates-compare.ts): hand-made template and engine version (golden spec, fixture photos) at 1440, 1280, 390, 360 px; checks horizontal scroll, broken images, tap targets, one h1, one primary action in the hero, banned patterns; writes first-screen pairs to eval/runs/templates-<letter>/.

## Branches and spec versions

One branch and PR per one or two templates, each based on the previous (stacked), since directions.ts, design.ts, motifs.css and the spec version are shared. main is at spec v6.

| Branch | Templates | Spec |
| --- | --- | --- |
| claude/templates-rt | R Račun, T Etiketa | v7 |
| claude/templates-kl | K Jedilnik, L Ogledalo | v8 (built on claude/templates-rt) |
| claude/templates-o | O Nasmeh | v9 (built on claude/templates-kl) |
| claude/templates-np | N Markacija, P Pregib | v10 (built on claude/templates-o) |

## Decisions per template (from the analyses, checked against the HTML)

### R Račun (accountant, racunovodstvo-seliskar, no photos)
- Direction `racun`, motif `ledger`, font pair IBM Plex Sans / IBM Plex Sans (weight 700 max), display [40, 88], h2 [34, 72].
- Hero: `hero-signature:receipt` (new variant) with optional `receipt` prop (title, lines, total); the receipt's subtitle is the business name; the call is the primary button labelled with `factLabel`; one quiet text link beside it. Right 38 % band in the primary green on desktop, a band behind the receipt on phones. Torn edge and check marks are SVG tokens (no single-side borders, no box-shadow: the offset shadow is a pseudo-element in the inverse colour).
- Client types: `highlights:figures` (new variant), titles at figure size.
- Services: `services-list:rows` on mint (tone alt), ledger CSS.
- Founding year: `about:figure` (new variant) with optional `figure` {value, label}; the value must be in the client's text (the fact check covers numbers).
- Contact: `contact:call-out` tone inverse.
- Red ink (double rule) is a fixed motif colour like the plate's EU blue: it can't be the accent (2.82:1 on the dark ground).
- Golden: hours must be absent (the owner said not to show hours), not a placeholder.

### T Etiketa (deli, trgovina-oljka-in-sol)
- Direction `etiketa`, motif `label`, font pair Lora / Karla, display [36, 72] at body 18 (the hand-made page has 67 px at 1280; the 4× display test holds it at 72).
- Hero: `hero-signature:label` with fact `address` (new): olive ground, white label card with a double inner rule and an olive branch (inline SVG in the site's colours), the address from the facts on the card, the photo in a tall arch, `inset` as a disc over its edge.
- Products: `price-list:tags` drawn as bottle labels in the label motif (branch, name, note, price; centred inside the label only, in motifs.css).
- Rest of the range: `text:narrow` under the label motif (short label left, one large serif sentence right).
- Gift boxes: `image-text:round` on the terracotta band, the link as the section's one button.
- Shop: `opening-hours:photo` (new) with the shop front in an arch and a detail disc.
- Colours: inverse #3b4819 (template #414f1f: no accent passes 3:1 on both #414f1f and white), accent #869850, surface #e3ebd3 (the template's #e9eeda sits on the cream detector's hue edge, 75.0).

### K Jedilnik (inn, gostilna-zlata-zlica, 8 photos)
- Motif `spoon` (bowl ellipse cx11 cy19 rx10.5 ry18 + handle M8.5 34h5l1.5 62a4 4 0 0 1-8 0z, viewBox 22×104), EB Garamond 600 / Figtree. Colours: primary/inverse greens #16382b/#0f2a20, brass #d2ab55 as band (on green 5.9-7.1:1; on white only decorative), accent a darker brass.
- Hero: full-bleed house photo (no overlay) with a white menu card (inner brass rule, outline offset -14 px) hanging 72 px into the next section: new hero variant (card).
- Two daily offers with prices at ~100 px on green: price-list render variant (offers), no new fields; menu editing is another team's: render only.
- Dishes as round plate photos (staggered middle), unpriced dishes as a ruled list with leaders and price placeholders (ričet, pečenke): products variant (plates).
- Terrace: seat count 40 as a 176 px numeral, second photo overlapping: image-text figure.
- Display 70 px at 18 body is 3.9×: the 4-7× test is not loosened; display ≥ 72 or body 17.

### L Ogledalo (hairdresser, frizerstvo-lana, 5 photos, logo)
- Motif `mirror`, Inter Tight 800 / DM Sans (new pair). Wine #7a2e3a, blush #f6e3e7 (not caught by the cream detector, h 347), dark #2b1418.
- Hero: white; the name at wall size in blush behind everything (aria-hidden, from business.name); three photos in arches of heights 8/11/8 staggered; headline 104 px. Needs several images in one hero: optional `images` on hero-signature (new variant mirrors).
- Wine band with the booking sentence and the number (cta band). Price list with "Cenik" at 176 px beside a ruled list (price-list render variant); prameni and fen frizura are price placeholders. Team on blush: arched interior photo with a small arch overlapping it. Hours and phone at 96 px. Phone bar white.

### O Nasmeh (dentist, zobozdravstvo-lebar, 3 photos)
- Motif `smile` (arc M4 5c5 18 27 18 32 0), Figtree / Figtree. Teal #0c7a70, deep #0f2f38, mint #dff4ee, coral #ff7a66 decorative only (2.55:1 on white); an accent that passes is ~#e4573f.
- Hero: round photo on a mint disc, coral arc under it, tilted note chip (deep ground). Headline is the first-visit promise.
- Signature: hours as a week chart (opening-hours variant week), computed from business.hours: 12 columns 7.00-19.00, one bar per day; on a phone the scale hides and bars keep their label. Inline style custom properties are allowed (CSP style-src 'unsafe-inline'; Picture already uses one).
- Services with arc bullets (SVG token, not borders) and a self-pay note card; team with round and arched photos; teal contact with the phone at 112 px.
- templateFor("dental", 3) becomes defined: the spec test that asserts it is undefined changes with the template, not loosened.

### N Markacija (tourist farm, kmetija-grabnar, 8 photos)
- Motif `trail`, Fraunces 900 / Nunito Sans. Forest #1d3a2a, red #c8202a (primary and band only: 2.19:1 on forest), meadow #eaf3e4, accent ~#4f8a5f, wood post a motif token.
- Hero: the view full-bleed (min-height 860), headline bottom-left 120 px, a wooden post with three red arrow signs (clip-path polygon(0 0, calc(100% - 26px) 0, 100% 50%, calc(100% - 26px) 100%, 0 100%), tilts -2 / 1.5 / -1 deg), white ridge silhouette as bottom edge (path in the HTML l.185, viewBox 1440×90). Signs say Raduha, Logarska dolina, Smučišče 10 min: only destinations and times the client gave.
- The template's 42 % overlay gives 2.58:1 white on a white pixel: the engine keeps its ≥ 70 % flat overlay (or a solid panel); reported as a difference.
- Rooms with two prices at 92 px; five-photo mosaic edge to edge (rows 7/5 and 3 equal, fixed heights); breakfast on meadow; red weekend band with hours at 80 px; trails with blaze bullets; hosts and contact on forest with a second ridge.
- clip-path only through shape tokens (`--shape-*` set in tokens.ts, used as `clip-path: var(--shape-sign)`), a test limits it.

### P Pregib (physio, fizioterapija-pregib, 1 photo, logo)
- Motif `bend`, Bricolage Grotesque 800 / Public Sans. Teal #0f6b63, dark #10302d, orange #e0833a (white on it 2.81: dark text on orange 5.04), mist #e6f2f0.
- Hero: the limb (path M200 -40 L200 430 L960 880, stroke 150, round, colour ~20 % teal on white) with an orange joint (circle r 46) behind the headline; photo with a cut corner (clip-path polygon, 64 px) hanging 72 px into the dark facts band.
- Four facts as 80 px orange numbers (all from the brief: 12 let, 4 leta, 60 min, 7-20): highlights figures. Complaints as cut-corner tiles (title only). Methods as one 50 px sentence. Four price cards with cut corners. Teal booking band. Three-column contact. Phone bar: book + call.
- clip-path only as a fixed set of shape classes keyed on the motif, the cut size a token; a test limits clip-path to those selectors.

## Progress

- [x] R: claude/templates-rt. templates:compare R passes at 1440, 1280, 390, 360; eval --offline 0 failures, LH 100/100/100/100, axe 0; lowest text contrast 6.75:1
- [x] T: claude/templates-rt. templates:compare T passes at all four widths; eval --offline 0 failures, LH 97/100/100/100, axe 0; lowest text contrast 5.18:1; phone first screen 10 % photo (report-only target 25 %, same as the hand-made page)
- [x] K: claude/templates-kl. templates:compare K passes at all four widths; eval --offline 0 failures, LH 95/100/100/100, axe 0; lowest text contrast 5.93:1 (brass on green)
- [x] L: claude/templates-kl. templates:compare L passes at all four widths; eval --offline 0 failures, LH 98/100/100/100, axe 0; lowest text contrast 7.11:1; first screen 21 % photo (report-only targets 25/30 %)
- [x] O: claude/templates-o. templates:compare O passes at all four widths; eval --offline 0 failures, LH 99/100/100/100, axe 0; lowest text contrast 4.54:1 (teal on mint); desktop headline 4 lines (report-only, same as the hand-made page)
- [ ] N
- [ ] P
- [ ] Swim set (only if all seven are done)
