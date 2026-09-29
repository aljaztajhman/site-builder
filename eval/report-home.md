# Eval report

Mode: **live**, scope: **home**, started 2026-09-29T19:04:30.030Z, wall time 2127.0 s, total model spend €1.330.

## Summary

- Checkpoints passing every automated check: **52/54**
- Scripted edits: 42 pass, 1 fail, 2 manual
- Median generation cost €0.087 (target ≤ €0.300) ✓
- Median generation time 104.8 s (target ≤ 60 s) ✗
- Median edit cost €0.010 per edit
- **Errors:** kmetija-grabnar

## Sites

Lighthouse thresholds: performance ≥ 90, accessibility 100, best practices ≥ 95, SEO ≥ 95.

| Site | Type | Direction | LH P/A/BP/SEO | axe | 360 px width | Facts | Placeholders | Export offline | Gen cost | Gen time | Pass |
|---|---|---|---|---|---|---|---|---|---|---|---|
| avtoservis-mrak | car-repair | bold-local | 100/100/100/100 | 0 | 360 | 0 | 4 | ✓ 1.0 MB | €0.106 | 111.4 s | ✓ |
| fizioterapija-pregib | physio | editorial | 99/100/100/100 | 0 | 360 | 0 | 0 | ✓ 0.8 MB | €0.083 | 105.7 s | ✓ |
| frizerstvo-lana | hairdresser | soft-studio | 99/100/100/100 | 0 | 360 | 0 | 4 | ✓ 1.2 MB | €0.086 | 113.4 s | ✓ |
| gostilna-zlata-zlica | restaurant | warm-craft | 99/100/100/100 | 0 | 360 | 0 | 2 | ✓ 1.3 MB | €0.101 | 101.0 s | ✓ |
| instalacije-rebernik | builder | bold-local | 100/100/100/100 | 0 | 360 | 0 | 1 | ✓ 0.7 MB | €0.081 | 55.7 s | ✓ |
| kmetija-grabnar | tourist-farm | — | — | — | — | — | — | — | — | — | error |
| pekarna-kvas | bakery | warm-craft | 100/100/100/100 | 0 | 360 | 0 | 6 | ✓ 1.0 MB | €0.091 | 104.8 s | ✓ |
| racunovodstvo-seliskar | accountant | editorial | 100/100/100/100 | 0 | 360 | 0 | 2 | ✓ 0.7 MB | €0.075 | 73.2 s | ✓ |
| trgovina-oljka-in-sol | shop | warm-craft | 100/100/100/100 | 0 | 360 | 0 | 6 | ✓ 1.1 MB | €0.087 | 97.6 s | ✓ |
| zobozdravstvo-lebar | dental | clinical-calm | 100/100/100/100 | 0 | 360 | 0 | 0 | ✓ 0.9 MB | €0.110 | 117.2 s | ✓ |

### avtoservis-mrak

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 818 | 17 | 0 | 0 | 0.0008 | 1.4 s |
| brief | 1 | 2237 | 1451 | 919 | 0 | 0.0165 | 9.3 s |
| design | 1 | 222 | 193 | 4169 | 0 | 0.0028 | 3.5 s |
| altText | 1 | 1813 | 223 | 573 | 0 | 0.0051 | 3.1 s |
| content | 2 | 6159 | 3100 | 32164 | 0 | 0.0428 | 17.8 s |
| critique | 2 | 12784 | 1236 | 32586 | 0 | 0.0382 | 15.8 s |
| edit | 5 | 15201 | 794 | 73704 | 18426 | 0.0853 | 12.9 s |
| **total** | | | | | | **0.1914** | |

Stage wall times: classify 1.5 s, brief 9.7 s, design 3.5 s, images 7.8 s, content 17.9 s, check 55.2 s, critique 15.8 s.

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
| classify | 1 | 859 | 19 | 0 | 0 | 0.0008 | 0.9 s |
| brief | 1 | 2289 | 1401 | 919 | 0 | 0.0161 | 9.0 s |
| design | 1 | 255 | 193 | 4169 | 0 | 0.0028 | 2.3 s |
| altText | 1 | 617 | 87 | 573 | 0 | 0.0019 | 1.9 s |
| content | 1 | 2104 | 1560 | 16082 | 0 | 0.0198 | 9.5 s |
| critique | 2 | 10640 | 2100 | 32586 | 0 | 0.0420 | 20.2 s |
| edit | 5 | 15359 | 952 | 92130 | 0 | 0.0505 | 13.1 s |
| **total** | | | | | | **0.1339** | |

Stage wall times: classify 0.9 s, brief 9.4 s, design 2.3 s, images 3.1 s, content 9.5 s, check 60.2 s, critique 20.3 s.

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 99/100/100/100 | 0 | ✓ |  | — |
| edit 1: “Make the booking button more prominent: add a booking section on the homepage.” | 99/100/100/100 | 0 | ✓ | ✓ booking present | — |
| edit 2: “Dodaj pogosta vprašanja: napotnica ni potrebna, s seboj prinesite izvide, oblecite se udobno.” | 99/100/100/100 | 0 | ✓ | ✓ faq present | — |
| edit 3: “Use a warmer palette.” | 99/100/100/100 | 0 | ✓ | ✓ hue 175→13, sat 0.73→0.59 | — |
| edit 4: “Nova cena za dry needling kot dodatek je 38 €.” | 99/100/100/100 | 0 | ✓ | ✓ "38" found | — |
| edit 5: “Krajši uvod na domači strani.” | 99/100/100/100 | 0 | ✓ | ? needs a human look (see screenshot) | — |

### frizerstvo-lana

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 853 | 21 | 0 | 0 | 0.0008 | 1.0 s |
| brief | 1 | 2276 | 1502 | 919 | 0 | 0.0170 | 12.1 s |
| design | 1 | 272 | 210 | 4169 | 0 | 0.0030 | 2.8 s |
| altText | 1 | 3009 | 395 | 573 | 0 | 0.0087 | 5.5 s |
| content | 1 | 2432 | 1776 | 16082 | 0 | 0.0222 | 10.9 s |
| critique | 2 | 11792 | 999 | 32586 | 0 | 0.0345 | 10.9 s |
| edit | 5 | 17918 | 1043 | 92130 | 0 | 0.0556 | 13.5 s |
| **total** | | | | | | **0.1418** | |

Stage wall times: classify 1.0 s, brief 12.5 s, design 2.8 s, images 14.0 s, content 11.0 s, check 61.1 s, critique 11.0 s.

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 99/100/100/100 | 0 | ✓ |  | — |
| edit 1: “Temnejša glava, prosim.” | 99/100/100/100 | 0 | ✓ | ✓ /chrome/header/tone = "inverse" | — |
| edit 2: “Use a warmer palette.” | 82/100/100/100 | 0 | ✓ | ✓ hue 351→11, sat 0.45→0.57 | lighthouse performance 82 < 90 |
| edit 3: “Dodaj pogosta vprašanja. Naročanje je obvezno, barve so brez amoniaka, plačilo je možno tudi s kartico.” | 100/100/100/100 | 0 | ✓ | ✓ faq present | — |
| edit 4: “Change the phone number to 041 555 287.” | 100/100/100/100 | 0 | ✓ | ✓ /business/phone = "+38641555287" | — |
| edit 5: “Dodaj še podatke podjetja v nogo: Lana Vidmar s.p., matična številka 6612345000, davčna številka 51234567.” | 99/100/100/100 | 0 | ✓ | ✓ /business/provider/registrationNumber = "6612345000" | — |

### gostilna-zlata-zlica

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 906 | 18 | 0 | 0 | 0.0009 | 0.9 s |
| brief | 1 | 2358 | 1746 | 919 | 0 | 0.0192 | 14.5 s |
| design | 1 | 263 | 189 | 4169 | 0 | 0.0028 | 2.5 s |
| altText | 1 | 4803 | 548 | 573 | 0 | 0.0131 | 5.3 s |
| content | 1 | 2784 | 1731 | 16082 | 0 | 0.0224 | 10.4 s |
| critique | 2 | 13304 | 1585 | 32586 | 0 | 0.0421 | 15.0 s |
| edit | 5 | 18272 | 647 | 92130 | 0 | 0.0528 | 11.0 s |
| **total** | | | | | | **0.1534** | |

Stage wall times: classify 0.9 s, brief 14.8 s, design 2.5 s, images 18.2 s, content 10.4 s, check 39.0 s, critique 15.0 s.

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
| classify | 1 | 876 | 18 | 0 | 0 | 0.0008 | 1.0 s |
| brief | 1 | 2335 | 1343 | 919 | 0 | 0.0157 | 8.1 s |
| design | 1 | 243 | 200 | 4169 | 0 | 0.0029 | 2.4 s |
| content | 2 | 5681 | 3232 | 32164 | 0 | 0.0431 | 19.8 s |
| critique | 1 | 6221 | 566 | 16293 | 0 | 0.0184 | 6.6 s |
| edit | 6 | 21858 | 1357 | 110556 | 0 | 0.0683 | 17.5 s |
| **total** | | | | | | **0.1492** | |

Stage wall times: classify 1.0 s, brief 8.4 s, design 2.4 s, images 0.0 s, content 19.8 s, check 17.5 s, critique 6.6 s.

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 100/100/100/100 | 0 | ✓ |  | — |
| edit 1: “Dodaj pogosta vprašanja o subvencijah Eko sklada: pomagamo pri vlogi, subvencijo je treba oddati pred začetkom del.” | 100/100/100/100 | 0 | ✓ | ✓ faq present | — |
| edit 2: “Add a section listing the towns we cover.” | 100/100/100/100 | 0 | ✓ | ✓ service-area present | — |
| edit 3: “Barve naj bodo temnejše, bolj resne.” | 76/100/100/100 | 0 | ✓ | ✓ #0b5fd6 → #0a3a7a | lighthouse performance 76 < 90 |
| edit 4: “I set up an email after all: matej@rebernik-instalacije.example” | 100/100/100/100 | 0 | ✓ | ✓ /business/email = "matej@rebernik-instalacije.example" | — |
| edit 5: “Dodaj, da imamo 24-urno intervencijo pri puščanju vode.” | 100/100/100/100 | 0 | ✓ | ✓ "intervencij" found | — |

### kmetija-grabnar

```
Error: 400 {"type":"error","error":{"type":"invalid_request_error","message":"messages.0.content.1.image.source.base64.data: At least one of the image dimensions exceed max allowed size: 8000 pixels"},"request_id":"req_011CfYH6q7T8XPQheUPN3XTo"}
    at APIError.generate (C:\Users\Aljaz\Desktop\Claude Code\site-builder\node_modules\.pnpm\@anthropic-ai+sdk@0.129.0_zod@4.6.5\node_modules\@anthropic-ai\sdk\src\core\error.ts:75:14)
    at Anthropic.makeStatusError (C:\Users\Aljaz\Desktop\Claude Code\site-builder\node_modules\.pnpm\@anthropic-ai+sdk@0.129.0_zod@4.6.5\node_modules\@anthropic-ai\sdk\src\client.ts:987:28)
    at Anthropic.makeRequest (C:\Users\Aljaz\Desktop\Claude Code\site-builder\node_modules\.pnpm\@anthropic-ai+sdk@0.129.0_zod@4.6.5\node_modules\@anthropic-ai\sdk\src\client.ts:1291:24)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
```

### pekarna-kvas

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 911 | 19 | 0 | 0 | 0.0009 | 0.8 s |
| brief | 1 | 2344 | 1558 | 919 | 0 | 0.0176 | 11.1 s |
| design | 1 | 280 | 208 | 4169 | 0 | 0.0030 | 3.6 s |
| altText | 1 | 1813 | 225 | 573 | 0 | 0.0052 | 2.8 s |
| content | 1 | 2379 | 1550 | 16082 | 0 | 0.0202 | 9.4 s |
| critique | 2 | 12560 | 1928 | 32586 | 0 | 0.0438 | 18.6 s |
| edit | 5 | 14746 | 763 | 92130 | 0 | 0.0478 | 12.8 s |
| **total** | | | | | | **0.1383** | |

Stage wall times: classify 0.8 s, brief 11.5 s, design 3.6 s, images 7.3 s, content 9.4 s, check 53.5 s, critique 18.6 s.

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 100/100/100/100 | 0 | ✓ |  | — |
| edit 1: “Temnejša glava prosim, zdaj je preveč bleda.” | 100/100/100/100 | 0 | ✓ | ✓ /chrome/header/tone = "inverse" | — |
| edit 2: “Add an FAQ: potica for Sunday can be ordered until Thursday; we don't bake gluten-free bread.” | 100/100/100/100 | 0 | ✓ | ✓ faq present | — |
| edit 3: “Toplejše barve, kot skorja kruha.” | 100/100/100/100 | 0 | ✓ | ✓ hue 29→28, sat 0.66→0.72 | — |
| edit 4: “Change the Saturday hours to 6.30–13.00.” | 100/100/100/100 | 0 | ✓ | ✓ "13.00" found | — |
| edit 5: “Odstrani galerijo, slik je dovolj drugod.” | 100/100/100/100 | 0 | ✓ | ✓ 0 × gallery | — |

### racunovodstvo-seliskar

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 875 | 19 | 0 | 0 | 0.0008 | 1.4 s |
| brief | 1 | 2324 | 1277 | 919 | 0 | 0.0151 | 8.9 s |
| design | 1 | 167 | 178 | 4169 | 0 | 0.0025 | 2.6 s |
| content | 1 | 1889 | 1480 | 16082 | 0 | 0.0187 | 9.0 s |
| critique | 2 | 10978 | 1517 | 32586 | 0 | 0.0375 | 14.9 s |
| edit | 5 | 13867 | 1198 | 92130 | 0 | 0.0500 | 15.5 s |
| **total** | | | | | | **0.1248** | |

Stage wall times: classify 1.4 s, brief 9.3 s, design 2.6 s, images 0.0 s, content 9.0 s, check 35.9 s, critique 14.9 s.

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 100/100/100/100 | 0 | ✓ |  | — |
| edit 1: “Dodaj uradne ure: od ponedeljka do četrtka od 8.00 do 16.00, v petek od 8.00 do 13.00.” | 100/100/100/100 | 0 | ✓ | ✓ "16.00" found | — |
| edit 2: “Add a short FAQ: yes, we work with sole traders; yes, documents can be sent by email.” | 100/100/100/100 | 0 | ✓ | ✓ faq present | — |
| edit 3: “Temnejša glava.” | 100/100/100/100 | 0 | ✓ | ✓ /chrome/header/tone = "inverse" | — |
| edit 4: “Change the phone number to 02 555 47 99.” | 100/100/100/100 | 0 | ✓ | ✓ /business/phone = "+38625554799" | — |
| edit 5: “Na domači strani dodaj poziv, naj nas pokličejo za brezplačen prvi posvet.” | 100/100/100/100 | 0 | ✓ | ✓ "brezplač" found | — |

### trgovina-oljka-in-sol

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 883 | 18 | 0 | 0 | 0.0008 | 1.2 s |
| brief | 1 | 2325 | 1579 | 919 | 0 | 0.0177 | 9.6 s |
| design | 1 | 237 | 224 | 4169 | 0 | 0.0031 | 2.8 s |
| altText | 1 | 3009 | 372 | 0 | 573 | 0.0096 | 4.5 s |
| content | 1 | 2483 | 1564 | 16082 | 0 | 0.0205 | 9.9 s |
| critique | 2 | 13127 | 861 | 32586 | 0 | 0.0356 | 10.6 s |
| edit | 5 | 15123 | 741 | 92130 | 0 | 0.0482 | 12.7 s |
| **total** | | | | | | **0.1355** | |

Stage wall times: classify 1.2 s, brief 9.9 s, design 2.9 s, images 11.2 s, content 10.0 s, check 51.8 s, critique 10.6 s.

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 100/100/100/100 | 0 | ✓ |  | — |
| edit 1: “Use a warmer palette, more olive and terracotta.” | 100/100/100/100 | 0 | ✓ | ✗ hue 30→66, sat 0.26→0.39 | — |
| edit 2: “Odstrani galerijo.” | 100/100/100/100 | 0 | ✓ | ✓ 0 × gallery | — |
| edit 3: “Add a products section with olive oil, Piran salt and the gift boxes.” | 99/100/100/100 | 0 | ✓ | ✓ products present | — |
| edit 4: “Spremeni telefonsko številko na 05 555 18 69.” | 99/100/100/100 | 0 | ✓ | ✓ /business/phone = "+38655551869" | — |
| edit 5: “Mention on the homepage that we now ship gift boxes across Slovenia, free shipping over 75 €.” | 99/100/100/100 | 0 | ✓ | ✓ "75" found | — |

### zobozdravstvo-lebar

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 892 | 18 | 0 | 0 | 0.0008 | 1.1 s |
| brief | 2 | 6461 | 3301 | 1838 | 0 | 0.0398 | 22.3 s |
| design | 1 | 267 | 210 | 4169 | 0 | 0.0030 | 3.2 s |
| altText | 1 | 1813 | 242 | 573 | 0 | 0.0053 | 3.6 s |
| content | 1 | 2474 | 1648 | 16082 | 0 | 0.0212 | 10.9 s |
| critique | 2 | 11822 | 1579 | 32586 | 0 | 0.0395 | 15.4 s |
| edit | 5 | 15933 | 1074 | 92130 | 0 | 0.0525 | 15.5 s |
| **total** | | | | | | **0.1621** | |

Stage wall times: classify 1.1 s, brief 22.6 s, design 3.2 s, images 7.0 s, content 10.9 s, check 56.9 s, critique 15.4 s.

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 100/100/100/100 | 0 | ✓ |  | — |
| edit 1: “Naslov na domači strani naj bo bolj neposreden.” | 100/100/100/100 | 0 | ✓ | ? needs a human look (see screenshot) | — |
| edit 2: “We decided to publish two prices after all: check-up 45 €, teeth whitening 250 €.” | 100/100/100/100 | 0 | ✓ | ✓ "250" found | — |
| edit 3: “Dodaj predstavitev ekipe: dr. Lebar in asistentka Maja.” | 100/100/100/100 | 0 | ✓ | ✓ team present | — |
| edit 4: “Use a darker primary colour, it looks too light.” | 100/100/100/100 | 0 | ✓ | ✓ #2f6f8f → #1d4d66 | — |
| edit 5: “Ob petkih smo po novem odprti do 15.00.” | 100/100/100/100 | 0 | ✓ | ✓ "15.00" found | — |
