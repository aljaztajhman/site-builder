# Eval report

Mode: **record**, scope: **full**, started 2026-09-29T16:47:30.472Z, wall time 3420.5 s, total model spend €2.711.

## Summary

- Checkpoints passing every automated check: **54/54**
- Scripted edits: 38 pass, 5 fail, 2 manual
- Median generation cost €0.228 (target ≤ €1.500) ✓
- Median generation time 154.3 s (target ≤ 240 s) ✓
- Median edit cost €0.018 per edit
- **Errors:** zobozdravstvo-lebar

## Sites

Lighthouse thresholds: performance ≥ 90, accessibility 100, best practices ≥ 95, SEO ≥ 95.

| Site | Type | Direction | LH P/A/BP/SEO | axe | 360 px width | Facts | Placeholders | Export offline | Gen cost | Gen time | Pass |
|---|---|---|---|---|---|---|---|---|---|---|---|
| avtoservis-mrak | car-repair | bold-local | 100/100/100/100 | 0 | 360 | 0 | 4 | ✓ 1.0 MB | €0.242 | 184.3 s | ✓ |
| fizioterapija-pregib | physio | editorial | 100/100/100/100 | 0 | 360 | 0 | 0 | ✓ 0.8 MB | €0.228 | 157.9 s | ✓ |
| frizerstvo-lana | hairdresser | soft-studio | 100/100/100/100 | 0 | 360 | 0 | 5 | ✓ 1.2 MB | €0.249 | 152.3 s | ✓ |
| gostilna-zlata-zlica | restaurant | warm-craft | 99/100/100/100 | 0 | 360 | 0 | 2 | ✓ 1.3 MB | €0.235 | 149.2 s | ✓ |
| instalacije-rebernik | builder | bold-local | 100/100/100/100 | 0 | 360 | 0 | 5 | ✓ 0.7 MB | €0.181 | 93.1 s | ✓ |
| kmetija-grabnar | tourist-farm | alpine-nature | 98/100/100/100 | 0 | 360 | 0 | 8 | ✓ 1.4 MB | €0.236 | 278.8 s | ✓ |
| pekarna-kvas | bakery | warm-craft | 98/100/100/100 | 0 | 360 | 0 | 6 | ✓ 1.0 MB | €0.159 | 197.1 s | ✓ |
| racunovodstvo-seliskar | accountant | editorial | 100/100/100/100 | 0 | 360 | 0 | 3 | ✓ 0.7 MB | €0.154 | 122.7 s | ✓ |
| trgovina-oljka-in-sol | shop | warm-craft | 99/100/100/100 | 0 | 360 | 0 | 7 | ✓ 1.1 MB | €0.195 | 154.3 s | ✓ |
| zobozdravstvo-lebar | dental | — | — | — | — | — | — | — | — | — | error |

### avtoservis-mrak

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 818 | 20 | 0 | 0 | 0.0008 | 1.8 s |
| brief | 1 | 2224 | 1510 | 0 | 919 | 0.0188 | 9.6 s |
| design | 1 | 222 | 184 | 0 | 4169 | 0.0109 | 3.8 s |
| altText | 1 | 1813 | 234 | 0 | 573 | 0.0064 | 3.4 s |
| content | 2 | 9165 | 8140 | 16082 | 16082 | 0.1231 | 42.4 s |
| critique | 2 | 18679 | 1350 | 16293 | 16293 | 0.0816 | 14.5 s |
| edit | 6 | 32948 | 818 | 81545 | 16309 | 0.1128 | 14.4 s |
| **total** | | | | | | **0.3543** | |

Stage wall times: classify 1.8 s, brief 10.0 s, design 3.8 s, images 11.9 s, content 42.5 s, check 99.6 s, critique 14.5 s.

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 100/100/100/100 | 0 | ✓ |  | — |
| edit 1: “Make the header darker.” | 100/100/100/100 | 0 | ✓ | ✓ /chrome/header/tone = "inverse" | — |
| edit 2: “Dodaj pogosta vprasanja: garancija ostane, ce servis delamo po navodilih proizvajalca, redni servis je obicajno narejen isti dan.” | 100/100/100/100 | 0 | ✓ | ✓ faq present | — |
| edit 3: “We have an email now: servis@avtoservis-mrak.example” | 100/100/100/100 | 0 | ✓ | ✓ /business/email = "servis@avtoservis-mrak.example" | — |
| edit 4: “Spremeni telefonsko na 041 555 731” | 100/100/100/100 | 0 | ✓ | ✓ /business/phone = "+38641555731" | — |
| edit 5: “Dodajte se ceno za menjavo akumulatorja: od 90 eur z montazo.” | 100/100/100/100 | 0 | ✓ | ✓ "akumulator" found | — |

### fizioterapija-pregib

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 859 | 19 | 0 | 0 | 0.0008 | 1.2 s |
| brief | 1 | 2276 | 1388 | 0 | 919 | 0.0178 | 8.6 s |
| design | 1 | 275 | 176 | 0 | 4169 | 0.0109 | 2.6 s |
| altText | 1 | 617 | 92 | 0 | 573 | 0.0031 | 2.6 s |
| content | 2 | 8482 | 7738 | 16082 | 16082 | 0.1185 | 39.6 s |
| critique | 2 | 17952 | 1001 | 16293 | 16293 | 0.0773 | 10.8 s |
| edit | 6 | 32569 | 1396 | 97854 | 0 | 0.0849 | 21.9 s |
| **total** | | | | | | **0.3133** | |

Stage wall times: classify 1.2 s, brief 9.1 s, design 2.6 s, images 3.8 s, content 39.7 s, check 90.6 s, critique 10.8 s.

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 100/100/100/100 | 0 | ✓ |  | — |
| edit 1: “Make the booking button more prominent: add a booking section on the homepage.” | 100/100/100/100 | 0 | ✓ | ✓ booking present | — |
| edit 2: “Dodaj pogosta vprašanja: napotnica ni potrebna, s seboj prinesite izvide, oblecite se udobno.” | 100/100/100/100 | 0 | ✓ | ✓ faq present | — |
| edit 3: “Use a warmer palette.” | 100/100/100/100 | 0 | ✓ | ✓ hue 175→17, sat 0.73→0.56 | — |
| edit 4: “Nova cena za dry needling kot dodatek je 38 €.” | 99/100/100/100 | 0 | ✓ | ✓ "38" found | — |
| edit 5: “Krajši uvod na domači strani.” | 100/100/100/100 | 0 | ✓ | ? needs a human look (see screenshot) | — |

### frizerstvo-lana

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 853 | 21 | 0 | 0 | 0.0008 | 1.1 s |
| brief | 1 | 2263 | 1437 | 0 | 919 | 0.0182 | 8.4 s |
| design | 1 | 262 | 203 | 0 | 4169 | 0.0112 | 3.0 s |
| altText | 1 | 3009 | 346 | 0 | 573 | 0.0094 | 5.7 s |
| content | 2 | 9375 | 8755 | 16082 | 16082 | 0.1288 | 45.0 s |
| critique | 2 | 19273 | 1132 | 16293 | 16293 | 0.0807 | 13.7 s |
| edit | 6 | 36519 | 1209 | 97854 | 0 | 0.0900 | 16.0 s |
| **total** | | | | | | **0.3391** | |

Stage wall times: classify 1.1 s, brief 8.7 s, design 3.0 s, images 21.3 s, content 45.0 s, check 59.4 s, critique 13.7 s.

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 100/100/100/100 | 0 | ✓ |  | — |
| edit 1: “Temnejša glava, prosim.” | 100/100/100/100 | 0 | ✓ | ✓ /chrome/header/tone = "inverse" | — |
| edit 2: “Use a warmer palette.” | 100/100/100/100 | 0 | ✓ | ✗ hue 351→351, sat 0.45→0.45 (rejected: /design/colors/accent: accent on inverse contrast 2.97 < 3) | — |
| edit 3: “Dodaj pogosta vprašanja. Naročanje je obvezno, barve so brez amoniaka, plačilo je možno tudi s kartico.” | 100/100/100/100 | 0 | ✓ | ✓ faq present | — |
| edit 4: “Change the phone number to 041 555 287.” | 100/100/100/100 | 0 | ✓ | ✓ /business/phone = "+38641555287" | — |
| edit 5: “Dodaj še podatke podjetja v nogo: Lana Vidmar s.p., matična številka 6612345000, davčna številka 51234567.” | 100/100/100/100 | 0 | ✓ | ✓ /business/provider/registrationNumber = "6612345000" | — |

### gostilna-zlata-zlica

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 906 | 18 | 0 | 0 | 0.0009 | 1.3 s |
| brief | 1 | 2345 | 1674 | 0 | 919 | 0.0204 | 10.7 s |
| design | 1 | 245 | 200 | 0 | 4169 | 0.0111 | 4.0 s |
| altText | 1 | 4803 | 534 | 0 | 573 | 0.0141 | 6.1 s |
| content | 2 | 9446 | 7196 | 16082 | 16082 | 0.1155 | 38.8 s |
| critique | 2 | 17909 | 530 | 16293 | 16293 | 0.0732 | 11.3 s |
| edit | 5 | 28130 | 969 | 81545 | 0 | 0.0707 | 13.6 s |
| **total** | | | | | | **0.3059** | |

Stage wall times: classify 1.3 s, brief 11.1 s, design 4.0 s, images 20.9 s, content 38.8 s, check 61.6 s, critique 11.4 s.

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 99/100/100/100 | 0 | ✓ |  | — |
| edit 1: “Remove the gallery.” | 99/100/100/100 | 0 | ✓ | ✓ 0 × gallery | — |
| edit 2: “Dodaj pogosta vprašanja: psi so dobrodošli na terasi, parkirišče je na Kapucinskem trgu, za skupine nad 10 oseb prosimo za rezervacijo.” | 99/100/100/100 | 0 | ✓ | ✓ faq present | — |
| edit 3: “Spremeni telefonsko številko v 04 555 98 76.” | 99/100/100/100 | 0 | ✓ | ✓ /business/phone = "+38645559876" | — |
| edit 4: “Make the homepage headline more direct and mention the Sunday lunch.” | 99/100/100/100 | 0 | ✓ | ✓ "nedeljsk" found | — |
| edit 5: “Na jedilni list dodaj še jagodne cmoke za 6,40 €.” | 99/100/100/100 | 0 | ✓ | ✓ "cmok" found | — |

### instalacije-rebernik

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 876 | 18 | 0 | 0 | 0.0008 | 1.2 s |
| brief | 1 | 2322 | 1319 | 0 | 919 | 0.0173 | 8.5 s |
| design | 1 | 252 | 194 | 0 | 4169 | 0.0111 | 3.2 s |
| content | 2 | 8769 | 8726 | 16082 | 16082 | 0.1275 | 44.0 s |
| critique | 1 | 8914 | 770 | 16293 | 0 | 0.0248 | 8.2 s |
| edit | 6 | 34191 | 1754 | 97854 | 0 | 0.0907 | 21.1 s |
| **total** | | | | | | **0.2722** | |

Stage wall times: classify 1.2 s, brief 8.9 s, design 3.2 s, images 0.0 s, content 44.0 s, check 27.5 s, critique 8.2 s.

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 100/100/100/100 | 0 | ✓ |  | — |
| edit 1: “Dodaj pogosta vprašanja o subvencijah Eko sklada: pomagamo pri vlogi, subvencijo je treba oddati pred začetkom del.” | 100/100/100/100 | 0 | ✓ | ✓ faq present | — |
| edit 2: “Add a section listing the towns we cover.” | 100/100/100/100 | 0 | ✓ | ✓ service-area present | — |
| edit 3: “Barve naj bodo temnejše, bolj resne.” | 100/100/100/100 | 0 | ✓ | ✓ #e8590c → #b8420a | — |
| edit 4: “I set up an email after all: matej@rebernik-instalacije.example” | 100/100/100/100 | 0 | ✓ | ✓ /business/email = "matej@rebernik-instalacije.example" | — |
| edit 5: “Dodaj, da imamo 24-urno intervencijo pri puščanju vode.” | 100/100/100/100 | 0 | ✓ | ✓ "intervencij" found | — |

### kmetija-grabnar

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 910 | 20 | 0 | 0 | 0.0009 | 0.9 s |
| brief | 1 | 2364 | 1782 | 919 | 0 | 0.0195 | 11.6 s |
| design | 1 | 244 | 185 | 4169 | 0 | 0.0027 | 2.0 s |
| altText | 1 | 4803 | 589 | 0 | 573 | 0.0146 | 6.5 s |
| content | 2 | 11223 | 9800 | 32164 | 0 | 0.1091 | 51.2 s |
| critique | 2 | 19972 | 1919 | 16293 | 16293 | 0.0887 | 18.8 s |
| edit | 6 | 39494 | 1246 | 81545 | 16309 | 0.1277 | 17.8 s |
| **total** | | | | | | **0.3632** | |

Stage wall times: classify 0.9 s, brief 12.0 s, design 2.0 s, images 32.5 s, content 51.4 s, check 161.0 s, critique 18.8 s.

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 98/100/100/100 | 0 | ✓ |  | — |
| edit 1: “Uporabi toplejše barve, bolj lesene.” | 100/100/100/100 | 0 | ✓ | ✗ hue 89→89, sat 0.35→0.35 (rejected: /design/colors/background: cream or off-white page background is banned) | — |
| edit 2: “Remove the gallery, the photos in the other sections are enough.” | 99/100/100/100 | 0 | ✓ | ✓ 0 × gallery | — |
| edit 3: “Dodaj pogosta vprašanja: hišni ljubljenčki žal niso dovoljeni, prihod je od 14.00, odhod do 10.00.” | 100/100/100/100 | 0 | ✓ | ✓ faq present | — |
| edit 4: “Change the email to info@grabnar-luce.example” | 99/100/100/100 | 0 | ✓ | ✓ /business/email = "info@grabnar-luce.example" | — |
| edit 5: “Krajši uvod na domači strani.” | 99/100/100/100 | 0 | ✓ | ? needs a human look (see screenshot) | — |

### pekarna-kvas

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 911 | 19 | 0 | 0 | 0.0009 | 0.9 s |
| brief | 1 | 2331 | 1521 | 919 | 0 | 0.0172 | 10.4 s |
| design | 1 | 275 | 212 | 4169 | 0 | 0.0030 | 2.4 s |
| altText | 1 | 1813 | 222 | 573 | 0 | 0.0051 | 4.6 s |
| content | 2 | 9017 | 7950 | 32164 | 0 | 0.0894 | 42.7 s |
| critique | 2 | 17408 | 913 | 32586 | 0 | 0.0434 | 12.7 s |
| edit | 6 | 32900 | 1576 | 97854 | 0 | 0.0870 | 22.2 s |
| **total** | | | | | | **0.2460** | |

Stage wall times: classify 1.0 s, brief 10.8 s, design 2.4 s, images 14.7 s, content 42.7 s, check 112.7 s, critique 12.7 s.

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 98/100/100/100 | 0 | ✓ |  | — |
| edit 1: “Temnejša glava prosim, zdaj je preveč bleda.” | 97/100/100/100 | 0 | ✓ | ✓ /chrome/header/tone = "inverse" | — |
| edit 2: “Add an FAQ: potica for Sunday can be ordered until Thursday; we don't bake gluten-free bread.” | 100/100/100/100 | 0 | ✓ | ✓ faq present | — |
| edit 3: “Toplejše barve, kot skorja kruha.” | 100/100/100/100 | 0 | ✓ | ✗ hue 29→29, sat 0.66→0.66 (rejected: /design/colors/surface: cream section background is banned) | — |
| edit 4: “Change the Saturday hours to 6.30–13.00.” | 100/100/100/100 | 0 | ✓ | ✓ "13.00" found | — |
| edit 5: “Odstrani galerijo, slik je dovolj drugod.” | 99/100/100/100 | 0 | ✓ | ✓ 0 × gallery | — |

### racunovodstvo-seliskar

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 875 | 16 | 0 | 0 | 0.0008 | 1.7 s |
| brief | 1 | 2311 | 1221 | 0 | 919 | 0.0165 | 8.0 s |
| design | 1 | 165 | 177 | 0 | 4169 | 0.0108 | 2.3 s |
| content | 2 | 7709 | 7166 | 32164 | 0 | 0.0804 | 37.4 s |
| critique | 2 | 15728 | 1448 | 32586 | 0 | 0.0451 | 15.1 s |
| edit | 6 | 28207 | 1556 | 97854 | 0 | 0.0787 | 17.4 s |
| **total** | | | | | | **0.2323** | |

Stage wall times: classify 1.7 s, brief 8.4 s, design 2.3 s, images 0.0 s, content 37.4 s, check 57.6 s, critique 15.2 s.

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 100/100/100/100 | 0 | ✓ |  | — |
| edit 1: “Dodaj uradne ure: od ponedeljka do četrtka od 8.00 do 16.00, v petek od 8.00 do 13.00.” | 100/100/100/100 | 0 | ✓ | ✗ "16.00" not found (rejected: Output is not valid: Cannot read properties of undefined (reading 'forEach')) | — |
| edit 2: “Add a short FAQ: yes, we work with sole traders; yes, documents can be sent by email.” | 100/100/100/100 | 0 | ✓ | ✓ faq present | — |
| edit 3: “Temnejša glava.” | 100/100/100/100 | 0 | ✓ | ✓ /chrome/header/tone = "inverse" | — |
| edit 4: “Change the phone number to 02 555 47 99.” | 100/100/100/100 | 0 | ✓ | ✓ /business/phone = "+38625554799" | — |
| edit 5: “Na domači strani dodaj poziv, naj nas pokličejo za brezplačen prvi posvet.” | 100/100/100/100 | 0 | ✓ | ✓ "brezplač" found | — |

### trgovina-oljka-in-sol

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 883 | 18 | 0 | 0 | 0.0008 | 1.1 s |
| brief | 1 | 2312 | 1519 | 0 | 919 | 0.0190 | 9.3 s |
| design | 1 | 234 | 199 | 0 | 4169 | 0.0111 | 2.4 s |
| altText | 1 | 3009 | 384 | 0 | 573 | 0.0097 | 4.4 s |
| content | 2 | 8635 | 7094 | 16082 | 16082 | 0.1132 | 38.0 s |
| critique | 2 | 16862 | 804 | 32586 | 0 | 0.0415 | 10.5 s |
| edit | 6 | 31360 | 2106 | 97854 | 0 | 0.0889 | 23.1 s |
| **total** | | | | | | **0.2842** | |

Stage wall times: classify 1.1 s, brief 9.7 s, design 2.4 s, images 13.8 s, content 38.0 s, check 78.7 s, critique 10.5 s.

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 99/100/100/100 | 0 | ✓ |  | — |
| edit 1: “Use a warmer palette, more olive and terracotta.” | 99/100/100/100 | 0 | ✓ | ✗ hue 30→30, sat 0.26→0.26 (rejected: /design/colors/surface: cream section background is banned) | — |
| edit 2: “Odstrani galerijo.” | 99/100/100/100 | 0 | ✓ | ✓ 0 × gallery | — |
| edit 3: “Add a products section with olive oil, Piran salt and the gift boxes.” | 99/100/100/100 | 0 | ✓ | ✓ products present | — |
| edit 4: “Spremeni telefonsko številko na 05 555 18 69.” | 99/100/100/100 | 0 | ✓ | ✓ /business/phone = "+38655551869" | — |
| edit 5: “Mention on the homepage that we now ship gift boxes across Slovenia, free shipping over 75 €.” | 99/100/100/100 | 0 | ✓ | ✓ "75" found | — |

### zobozdravstvo-lebar

```
ModelOutputError: Model output for brief is invalid: The answer did not match the schema: [
  {
    "origin": "string",
    "code": "too_big",
    "maximum": 24,
    "inclusive": true,
    "path": [
      "pages",
      2,
      "navLabel"
    ],
    "message": "Too big: expected string to have <=24 characters"
  }
]
    at ModelClient.callJson (C:\Users\Aljaz\Desktop\Claude Code\site-builder\packages\engine\src\llm\client.ts:140:31)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async makeBrief (C:\Users\Aljaz\Desktop\Claude Code\site-builder\packages\engine\src\stages.ts:55:20)
    at async timed (C:\Users\Aljaz\Desktop\Claude Code\site-builder\packages\engine\src\pipeline.ts:59:13)
    at async stageTime (C:\Users\Aljaz\Desktop\Claude Code\site-builder\packages\engine\src\pipeline.ts:80:15)
    at async generateSite (C:\Users\Aljaz\Desktop\Claude Code\site-builder\packages\engine\src\pipeline.ts:92:30)
    at async runFixture (C:\Users\Aljaz\Desktop\Claude Code\site-builder\tools\eval\src\runner.ts:173:19)
    at async <anonymous> (C:\Users\Aljaz\Desktop\Claude Code\site-builder\tools\eval\src\cli.ts:66:15)
```
