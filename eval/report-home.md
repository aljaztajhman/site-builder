# Eval report

Mode: **live**, scope: **home**, started 2026-09-29T19:59:43.703Z, wall time 2482.1 s, total model spend €1.588.

## Summary

- Checkpoints passing every automated check: **60/60**
- Scripted edits: 46 pass, 1 fail, 3 manual
- Median generation cost €0.095 (target ≤ €0.300) ✓
- Median generation time 109.8 s (target ≤ 60 s) ✗
- Median edit cost €0.010 per edit

## Sites

Lighthouse thresholds: performance ≥ 90, accessibility 100, best practices ≥ 95, SEO ≥ 95.

| Site | Type | Direction | LH P/A/BP/SEO | axe | 360 px width | Facts | Placeholders | Export offline | Gen cost | Gen time | Pass |
|---|---|---|---|---|---|---|---|---|---|---|---|
| avtoservis-mrak | car-repair | bold-local | 100/100/100/100 | 0 | 360 | 0 | 4 | ✓ 1.0 MB | €0.167 | 101.3 s | ✓ |
| fizioterapija-pregib | physio | editorial | 99/100/100/100 | 0 | 360 | 0 | 0 | ✓ 0.8 MB | €0.085 | 92.2 s | ✓ |
| frizerstvo-lana | hairdresser | soft-studio | 99/100/100/100 | 0 | 360 | 0 | 4 | ✓ 1.2 MB | €0.098 | 123.4 s | ✓ |
| gostilna-zlata-zlica | restaurant | warm-craft | 100/100/100/100 | 0 | 360 | 0 | 2 | ✓ 1.3 MB | €0.095 | 108.0 s | ✓ |
| instalacije-rebernik | builder | bold-local | 100/100/100/100 | 0 | 360 | 0 | 1 | ✓ 0.7 MB | €0.083 | 71.2 s | ✓ |
| kmetija-grabnar | tourist-farm | alpine-nature | 99/100/100/100 | 0 | 360 | 0 | 5 | ✓ 1.4 MB | €0.141 | 141.1 s | ✓ |
| pekarna-kvas | bakery | warm-craft | 100/100/100/100 | 0 | 360 | 0 | 5 | ✓ 1.0 MB | €0.094 | 114.1 s | ✓ |
| racunovodstvo-seliskar | accountant | editorial | 99/100/100/100 | 0 | 360 | 0 | 1 | ✓ 0.7 MB | €0.090 | 111.6 s | ✓ |
| trgovina-oljka-in-sol | shop | warm-craft | 99/100/100/100 | 0 | 360 | 0 | 2 | ✓ 1.1 MB | €0.097 | 116.6 s | ✓ |
| zobozdravstvo-lebar | dental | clinical-calm | 100/100/100/100 | 0 | 360 | 0 | 0 | ✓ 0.9 MB | €0.090 | 81.1 s | ✓ |

### avtoservis-mrak

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 818 | 20 | 0 | 0 | 0.0008 | 1.3 s |
| brief | 1 | 2237 | 1395 | 0 | 919 | 0.0178 | 8.6 s |
| design | 1 | 221 | 187 | 0 | 4169 | 0.0110 | 3.6 s |
| altText | 1 | 1813 | 227 | 0 | 573 | 0.0063 | 2.9 s |
| content | 1 | 2207 | 1597 | 0 | 16082 | 0.0521 | 10.3 s |
| critique | 2 | 17041 | 1343 | 16293 | 16293 | 0.0787 | 13.5 s |
| edit | 5 | 15485 | 819 | 73704 | 18426 | 0.0860 | 11.3 s |
| **total** | | | | | | **0.2526** | |

Stage wall times: classify 1.3 s, brief 9.0 s, design 3.6 s, images 7.9 s, content 10.4 s, check 55.4 s, critique 13.6 s.

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
| classify | 1 | 859 | 19 | 0 | 0 | 0.0008 | 1.0 s |
| brief | 1 | 2289 | 1408 | 919 | 0 | 0.0162 | 9.0 s |
| design | 1 | 254 | 184 | 4169 | 0 | 0.0027 | 2.2 s |
| altText | 1 | 617 | 87 | 573 | 0 | 0.0019 | 1.8 s |
| content | 1 | 2112 | 1446 | 16082 | 0 | 0.0188 | 9.5 s |
| critique | 2 | 17356 | 1106 | 32586 | 0 | 0.0450 | 13.9 s |
| edit | 5 | 14776 | 1039 | 92130 | 0 | 0.0502 | 14.7 s |
| **total** | | | | | | **0.1357** | |

Stage wall times: classify 1.0 s, brief 9.3 s, design 2.2 s, images 2.9 s, content 9.6 s, check 53.3 s, critique 14.0 s.

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 99/100/100/100 | 0 | ✓ |  | — |
| edit 1: “Make the booking button more prominent: add a booking section on the homepage.” | 99/100/100/100 | 0 | ✓ | ✓ booking present | — |
| edit 2: “Dodaj pogosta vprašanja: napotnica ni potrebna, s seboj prinesite izvide, oblecite se udobno.” | 99/100/100/100 | 0 | ✓ | ✓ faq present | — |
| edit 3: “Use a warmer palette.” | 99/100/100/100 | 0 | ✓ | ✓ hue 175→17, sat 0.73→0.61 | — |
| edit 4: “Nova cena za dry needling kot dodatek je 38 €.” | 98/100/100/100 | 0 | ✓ | ✓ "38" found | — |
| edit 5: “Krajši uvod na domači strani.” | 99/100/100/100 | 0 | ✓ | ? needs a human look (see screenshot) | — |

### frizerstvo-lana

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 853 | 21 | 0 | 0 | 0.0008 | 1.0 s |
| brief | 1 | 2276 | 1555 | 919 | 0 | 0.0174 | 9.9 s |
| design | 1 | 274 | 203 | 4169 | 0 | 0.0029 | 2.5 s |
| altText | 1 | 3009 | 355 | 573 | 0 | 0.0083 | 5.6 s |
| content | 1 | 2455 | 1569 | 16082 | 0 | 0.0205 | 9.8 s |
| critique | 2 | 17806 | 1387 | 32586 | 0 | 0.0482 | 15.6 s |
| edit | 5 | 16722 | 895 | 92130 | 0 | 0.0523 | 13.6 s |
| **total** | | | | | | **0.1505** | |

Stage wall times: classify 1.0 s, brief 10.2 s, design 2.5 s, images 18.6 s, content 9.8 s, check 65.3 s, critique 15.8 s.

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 99/100/100/100 | 0 | ✓ |  | — |
| edit 1: “Temnejša glava, prosim.” | 99/100/100/100 | 0 | ✓ | ✓ /chrome/header/tone = "inverse" | — |
| edit 2: “Use a warmer palette.” | 99/100/100/100 | 0 | ✓ | ✓ hue 351→17, sat 0.45→0.57 | — |
| edit 3: “Dodaj pogosta vprašanja. Naročanje je obvezno, barve so brez amoniaka, plačilo je možno tudi s kartico.” | 99/100/100/100 | 0 | ✓ | ✓ faq present | — |
| edit 4: “Change the phone number to 041 555 287.” | 99/100/100/100 | 0 | ✓ | ✓ /business/phone = "+38641555287" | — |
| edit 5: “Dodaj še podatke podjetja v nogo: Lana Vidmar s.p., matična številka 6612345000, davčna številka 51234567.” | 95/100/100/100 | 0 | ✓ | ✓ /business/provider/registrationNumber = "6612345000" | — |

### gostilna-zlata-zlica

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 906 | 18 | 0 | 0 | 0.0009 | 0.8 s |
| brief | 1 | 2358 | 1679 | 919 | 0 | 0.0187 | 10.4 s |
| design | 1 | 251 | 196 | 4169 | 0 | 0.0028 | 2.9 s |
| altText | 1 | 4803 | 539 | 573 | 0 | 0.0130 | 5.6 s |
| content | 1 | 2702 | 1371 | 16082 | 0 | 0.0192 | 8.5 s |
| critique | 2 | 17427 | 567 | 32586 | 0 | 0.0405 | 8.9 s |
| edit | 5 | 17570 | 665 | 92130 | 0 | 0.0518 | 10.8 s |
| **total** | | | | | | **0.1468** | |

Stage wall times: classify 0.8 s, brief 10.8 s, design 2.9 s, images 17.9 s, content 8.6 s, check 57.8 s, critique 9.1 s.

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 100/100/100/100 | 0 | ✓ |  | — |
| edit 1: “Remove the gallery.” | 99/100/100/100 | 0 | ✓ | ✓ 0 × gallery | — |
| edit 2: “Dodaj pogosta vprašanja: psi so dobrodošli na terasi, parkirišče je na Kapucinskem trgu, za skupine nad 10 oseb prosimo za rezervacijo.” | 99/100/100/100 | 0 | ✓ | ✓ faq present | — |
| edit 3: “Spremeni telefonsko številko v 04 555 98 76.” | 99/100/100/100 | 0 | ✓ | ✓ /business/phone = "+38645559876" | — |
| edit 4: “Make the homepage headline more direct and mention the Sunday lunch.” | 99/100/100/100 | 0 | ✓ | ✓ "nedeljsk" found | — |
| edit 5: “Na jedilni list dodaj še jagodne cmoke za 6,40 €.” | 99/100/100/100 | 0 | ✓ | ✓ "cmok" found | — |

### instalacije-rebernik

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 876 | 18 | 0 | 0 | 0.0008 | 0.9 s |
| brief | 1 | 2335 | 1410 | 919 | 0 | 0.0163 | 8.9 s |
| design | 1 | 231 | 195 | 4169 | 0 | 0.0028 | 2.6 s |
| content | 1 | 2098 | 1747 | 16082 | 0 | 0.0214 | 10.7 s |
| critique | 2 | 16554 | 839 | 32586 | 0 | 0.0413 | 10.6 s |
| edit | 5 | 15272 | 1057 | 92130 | 0 | 0.0512 | 15.6 s |
| **total** | | | | | | **0.1338** | |

Stage wall times: classify 0.9 s, brief 9.3 s, design 2.6 s, images 0.0 s, content 10.8 s, check 36.9 s, critique 10.8 s.

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 100/100/100/100 | 0 | ✓ |  | — |
| edit 1: “Dodaj pogosta vprašanja o subvencijah Eko sklada: pomagamo pri vlogi, subvencijo je treba oddati pred začetkom del.” | 100/100/100/100 | 0 | ✓ | ✓ faq present | — |
| edit 2: “Add a section listing the towns we cover.” | 100/100/100/100 | 0 | ✓ | ✓ service-area present | — |
| edit 3: “Barve naj bodo temnejše, bolj resne.” | 100/100/100/100 | 0 | ✓ | ✓ #0b5cab → #083d73 | — |
| edit 4: “I set up an email after all: matej@rebernik-instalacije.example” | 99/100/100/100 | 0 | ✓ | ✓ /business/email = "matej@rebernik-instalacije.example" | — |
| edit 5: “Dodaj, da imamo 24-urno intervencijo pri puščanju vode.” | 100/100/100/100 | 0 | ✓ | ✓ "intervencij" found | — |

### kmetija-grabnar

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 910 | 20 | 0 | 0 | 0.0009 | 1.0 s |
| brief | 1 | 2377 | 1703 | 919 | 0 | 0.0189 | 11.8 s |
| design | 1 | 266 | 200 | 4169 | 0 | 0.0029 | 2.6 s |
| altText | 1 | 4803 | 581 | 0 | 573 | 0.0145 | 6.5 s |
| content | 2 | 7448 | 4032 | 32164 | 0 | 0.0530 | 23.6 s |
| critique | 2 | 20978 | 1039 | 32586 | 0 | 0.0506 | 12.4 s |
| edit | 5 | 19120 | 823 | 92130 | 0 | 0.0558 | 12.8 s |
| **total** | | | | | | **0.1966** | |

Stage wall times: classify 1.0 s, brief 12.1 s, design 2.6 s, images 21.3 s, content 23.6 s, check 67.5 s, critique 12.8 s.

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 99/100/100/100 | 0 | ✓ |  | — |
| edit 1: “Uporabi toplejše barve, bolj lesene.” | 99/100/100/100 | 0 | ✓ | ✓ hue 89→27, sat 0.35→0.45 | — |
| edit 2: “Remove the gallery, the photos in the other sections are enough.” | 99/100/100/100 | 0 | ✓ | ✓ 0 × gallery | — |
| edit 3: “Dodaj pogosta vprašanja: hišni ljubljenčki žal niso dovoljeni, prihod je od 14.00, odhod do 10.00.” | 99/100/100/100 | 0 | ✓ | ✓ faq present | — |
| edit 4: “Change the email to info@grabnar-luce.example” | 99/100/100/100 | 0 | ✓ | ✓ /business/email = "info@grabnar-luce.example" | — |
| edit 5: “Krajši uvod na domači strani.” | 99/100/100/100 | 0 | ✓ | ? needs a human look (see screenshot) | — |

### pekarna-kvas

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 911 | 19 | 0 | 0 | 0.0009 | 1.1 s |
| brief | 1 | 2344 | 1493 | 919 | 0 | 0.0170 | 9.7 s |
| design | 1 | 274 | 218 | 4169 | 0 | 0.0031 | 3.1 s |
| altText | 1 | 1813 | 222 | 573 | 0 | 0.0051 | 2.7 s |
| content | 1 | 2305 | 1609 | 16082 | 0 | 0.0206 | 10.2 s |
| critique | 2 | 17643 | 1380 | 32586 | 0 | 0.0478 | 15.9 s |
| edit | 5 | 14943 | 1251 | 92130 | 0 | 0.0523 | 16.4 s |
| **total** | | | | | | **0.1468** | |

Stage wall times: classify 1.1 s, brief 10.1 s, design 3.1 s, images 9.8 s, content 10.2 s, check 63.6 s, critique 16.2 s.

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 100/100/100/100 | 0 | ✓ |  | — |
| edit 1: “Temnejša glava prosim, zdaj je preveč bleda.” | 100/100/100/100 | 0 | ✓ | ✓ /chrome/header/tone = "inverse" | — |
| edit 2: “Add an FAQ: potica for Sunday can be ordered until Thursday; we don't bake gluten-free bread.” | 99/100/100/100 | 0 | ✓ | ✓ faq present | — |
| edit 3: “Toplejše barve, kot skorja kruha.” | 99/100/100/100 | 0 | ✓ | ✓ hue 29→26, sat 0.66→0.73 | — |
| edit 4: “Change the Saturday hours to 6.30–13.00.” | 99/100/100/100 | 0 | ✓ | ✓ "13.00" found | — |
| edit 5: “Odstrani galerijo, slik je dovolj drugod.” | 99/100/100/100 | 0 | ✓ | ✓ 0 × gallery | — |

### racunovodstvo-seliskar

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 875 | 16 | 0 | 0 | 0.0008 | 1.4 s |
| brief | 1 | 2324 | 1293 | 919 | 0 | 0.0153 | 8.5 s |
| design | 1 | 187 | 188 | 4169 | 0 | 0.0027 | 2.2 s |
| content | 1 | 1974 | 1755 | 16082 | 0 | 0.0213 | 11.0 s |
| critique | 2 | 18070 | 1582 | 32586 | 0 | 0.0503 | 16.7 s |
| edit | 5 | 14618 | 836 | 92130 | 0 | 0.0482 | 11.6 s |
| **total** | | | | | | **0.1385** | |

Stage wall times: classify 1.4 s, brief 8.8 s, design 2.2 s, images 0.0 s, content 11.0 s, check 71.2 s, critique 16.9 s.

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 99/100/100/100 | 0 | ✓ |  | — |
| edit 1: “Dodaj uradne ure: od ponedeljka do četrtka od 8.00 do 16.00, v petek od 8.00 do 13.00.” | 99/100/100/100 | 0 | ✓ | ✓ "16.00" found | — |
| edit 2: “Add a short FAQ: yes, we work with sole traders; yes, documents can be sent by email.” | 99/100/100/100 | 0 | ✓ | ✓ faq present | — |
| edit 3: “Temnejša glava.” | 97/100/100/100 | 0 | ✓ | ✓ /chrome/header/tone = "inverse" | — |
| edit 4: “Change the phone number to 02 555 47 99.” | 91/100/100/100 | 0 | ✓ | ✓ /business/phone = "+38625554799" | — |
| edit 5: “Na domači strani dodaj poziv, naj nas pokličejo za brezplačen prvi posvet.” | 99/100/100/100 | 0 | ✓ | ✓ "brezplač" found | — |

### trgovina-oljka-in-sol

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 883 | 18 | 0 | 0 | 0.0008 | 1.2 s |
| brief | 1 | 2325 | 1471 | 919 | 0 | 0.0168 | 9.7 s |
| design | 1 | 225 | 194 | 4169 | 0 | 0.0028 | 2.6 s |
| altText | 1 | 3009 | 366 | 0 | 573 | 0.0096 | 3.9 s |
| content | 1 | 2369 | 1639 | 16082 | 0 | 0.0209 | 9.7 s |
| critique | 2 | 18770 | 943 | 32586 | 0 | 0.0460 | 13.6 s |
| edit | 5 | 14898 | 884 | 92130 | 0 | 0.0491 | 14.4 s |
| **total** | | | | | | **0.1460** | |

Stage wall times: classify 1.2 s, brief 10.0 s, design 2.6 s, images 14.1 s, content 9.7 s, check 65.1 s, critique 13.8 s.

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 99/100/100/100 | 0 | ✓ |  | — |
| edit 1: “Use a warmer palette, more olive and terracotta.” | 99/100/100/100 | 0 | ✓ | ✗ hue 30→66, sat 0.26→0.39 | — |
| edit 2: “Odstrani galerijo.” | 95/100/100/100 | 0 | ✓ | ✓ 0 × gallery | — |
| edit 3: “Add a products section with olive oil, Piran salt and the gift boxes.” | 99/100/100/100 | 0 | ✓ | ✓ products present | — |
| edit 4: “Spremeni telefonsko številko na 05 555 18 69.” | 99/100/100/100 | 0 | ✓ | ✓ /business/phone = "+38655551869" | — |
| edit 5: “Mention on the homepage that we now ship gift boxes across Slovenia, free shipping over 75 €.” | 99/100/100/100 | 0 | ✓ | ✓ "75" found | — |

### zobozdravstvo-lebar

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 892 | 18 | 0 | 0 | 0.0008 | 1.7 s |
| brief | 1 | 2343 | 1509 | 919 | 0 | 0.0172 | 9.9 s |
| design | 1 | 240 | 205 | 4169 | 0 | 0.0029 | 2.6 s |
| altText | 1 | 1813 | 245 | 573 | 0 | 0.0053 | 3.6 s |
| content | 1 | 2347 | 1664 | 16082 | 0 | 0.0211 | 10.4 s |
| critique | 2 | 18415 | 654 | 32586 | 0 | 0.0429 | 9.1 s |
| edit | 5 | 16054 | 814 | 92130 | 0 | 0.0505 | 12.4 s |
| **total** | | | | | | **0.1407** | |

Stage wall times: classify 1.7 s, brief 10.5 s, design 2.6 s, images 9.1 s, content 10.4 s, check 37.5 s, critique 9.3 s.

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 100/100/100/100 | 0 | ✓ |  | — |
| edit 1: “Naslov na domači strani naj bo bolj neposreden.” | 100/100/100/100 | 0 | ✓ | ? needs a human look (see screenshot) | — |
| edit 2: “We decided to publish two prices after all: check-up 45 €, teeth whitening 250 €.” | 100/100/100/100 | 0 | ✓ | ✓ "250" found | — |
| edit 3: “Dodaj predstavitev ekipe: dr. Lebar in asistentka Maja.” | 100/100/100/100 | 0 | ✓ | ✓ team present | — |
| edit 4: “Use a darker primary colour, it looks too light.” | 100/100/100/100 | 0 | ✓ | ✓ #3f6e8c → #274f6b | — |
| edit 5: “Ob petkih smo po novem odprti do 15.00.” | 100/100/100/100 | 0 | ✓ | ✓ "15.00" found | — |
