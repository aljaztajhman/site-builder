# Eval report

Mode: **live**, scope: **home**, started 2026-09-30T20:01:49.170Z, wall time 1925.3 s, total model spend €1.432.

## Summary

- Checkpoints passing every automated check: **60/60**
- Scripted edits: 46 pass, 1 fail, 3 manual
- Median generation cost €0.088 (target ≤ €0.300) ✓
- Median generation time 73.2 s (target ≤ 60 s) ✗
- Median time to first preview 23.4 s (first saved version; checks and critique continue after it)
- Median edit cost €0.011 per edit
- Homepages repeating the contact facts (2+ contact blocks): 0/10
- Homepage skeleton similarity across sites: 0.37 (0 = nothing shared, 1 = same section order)

## Sites

Lighthouse thresholds: performance ≥ 90, accessibility 100, best practices ≥ 95, SEO ≥ 95.

| Site | Type | Direction | LH P/A/BP/SEO | axe | 360 px width | Facts | Placeholders | Export offline | Gen cost | Gen time | First preview | Pass |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| avtoservis-mrak | car-repair | bold-local | 100/100/100/100 | 0 | 360 | 0 | 4 | ✓ 1.0 MB | €0.129 | 112.2 s | 24.5 s | ✓ |
| fizioterapija-pregib | physio | editorial | 100/100/100/100 | 0 | 360 | 0 | 0 | ✓ 0.8 MB | €0.054 | 42.5 s | 19.5 s | ✓ |
| frizerstvo-lana | hairdresser | soft-studio | 99/100/100/100 | 0 | 360 | 0 | 4 | ✓ 1.2 MB | €0.088 | 82.8 s | 22.2 s | ✓ |
| gostilna-zlata-zlica | restaurant | warm-craft | 100/100/100/100 | 0 | 360 | 0 | 2 | ✓ 1.3 MB | €0.074 | 44.4 s | 24.9 s | ✓ |
| instalacije-rebernik | builder | bold-local | 100/100/100/100 | 0 | 360 | 0 | 1 | ✓ 0.7 MB | €0.098 | 74.3 s | 28.8 s | ✓ |
| kmetija-grabnar | tourist-farm | alpine-nature | 99/100/100/100 | 0 | 360 | 0 | 4 | ✓ 1.4 MB | €0.104 | 74.7 s | 30.7 s | ✓ |
| pekarna-kvas | bakery | warm-craft | 100/100/100/100 | 0 | 360 | 0 | 6 | ✓ 1.0 MB | €0.064 | 43.5 s | 21.7 s | ✓ |
| racunovodstvo-seliskar | accountant | editorial | 100/100/100/100 | 0 | 360 | 0 | 2 | ✓ 0.7 MB | €0.057 | 43.7 s | 21.6 s | ✓ |
| trgovina-oljka-in-sol | shop | warm-craft | 100/100/100/100 | 0 | 360 | 0 | 2 | ✓ 1.1 MB | €0.088 | 80.2 s | 21.0 s | ✓ |
| zobozdravstvo-lebar | dental | clinical-calm | 100/100/100/100 | 0 | 360 | 0 | 0 | ✓ 0.9 MB | €0.094 | 72.1 s | 26.1 s | ✓ |

### avtoservis-mrak

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 818 | 20 | 0 | 0 | 0.0008 | 1.3 s |
| altText | 1 | 1813 | 238 | 0 | 573 | 0.0064 | 3.8 s |
| brief | 1 | 2237 | 1405 | 0 | 1031 | 0.0181 | 8.6 s |
| design | 1 | 220 | 200 | 0 | 4169 | 0.0111 | 3.2 s |
| content | 1 | 2231 | 1327 | 0 | 16629 | 0.0510 | 10.9 s |
| critique | 2 | 16956 | 503 | 32847 | 1067 | 0.0414 | 7.6 s |
| edit | 5 | 15400 | 991 | 92034 | 3146 | 0.0576 | 14.6 s |
| **total** | | | | | | **0.1864** | |

Stage wall times: classify 1.3 s, images 9.2 s, brief 9.0 s, design 3.2 s, content 10.9 s, check 80.0 s, critique 7.7 s.

Homepage: hero-type:with-facts › services-cards:compact › image-text:image-left › steps:horizontal › service-area:inline › cta:band (1 contact block).

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
| classify | 1 | 859 | 19 | 0 | 0 | 0.0008 | 0.8 s |
| altText | 1 | 617 | 98 | 573 | 0 | 0.0020 | 2.4 s |
| brief | 1 | 2289 | 1271 | 1031 | 0 | 0.0150 | 8.5 s |
| design | 1 | 261 | 192 | 4169 | 0 | 0.0028 | 2.2 s |
| content | 1 | 1984 | 1123 | 16629 | 0 | 0.0159 | 7.6 s |
| critique | 1 | 8048 | 113 | 16957 | 0 | 0.0177 | 3.3 s |
| edit | 5 | 14554 | 1451 | 95180 | 0 | 0.0539 | 18.4 s |
| **total** | | | | | | **0.1082** | |

Stage wall times: classify 0.8 s, images 3.6 s, brief 8.9 s, design 2.2 s, content 7.6 s, check 19.6 s, critique 3.4 s.

Homepage: hero-type:with-facts › text:two-column › image-text:image-right › services-list:rows › cta:band (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 100/100/100/100 | 0 | ✓ |  | — |
| edit 1: “Make the booking button more prominent: add a booking section on the homepage.” | 100/100/100/100 | 0 | ✓ | ✓ booking present | — |
| edit 2: “Dodaj pogosta vprašanja: napotnica ni potrebna, s seboj prinesite izvide, oblecite se udobno.” | 100/100/100/100 | 0 | ✓ | ✓ faq present | — |
| edit 3: “Use a warmer palette.” | 100/100/100/100 | 0 | ✓ | ✓ hue 175→15, sat 0.73→0.61 | — |
| edit 4: “Nova cena za dry needling kot dodatek je 38 €.” | 100/100/100/100 | 0 | ✓ | ✓ "38" found | — |
| edit 5: “Krajši uvod na domači strani.” | 100/100/100/100 | 0 | ✓ | ? needs a human look (see screenshot) | — |

### frizerstvo-lana

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 853 | 21 | 0 | 0 | 0.0008 | 1.1 s |
| brief | 1 | 2276 | 1458 | 1031 | 0 | 0.0166 | 8.5 s |
| design | 1 | 272 | 205 | 4169 | 0 | 0.0029 | 2.6 s |
| altText | 1 | 3009 | 398 | 573 | 0 | 0.0087 | 4.7 s |
| content | 1 | 2387 | 1340 | 16629 | 0 | 0.0185 | 8.0 s |
| critique | 2 | 18149 | 360 | 33914 | 0 | 0.0401 | 6.6 s |
| edit | 5 | 17091 | 1218 | 95180 | 0 | 0.0562 | 16.2 s |
| **total** | | | | | | **0.1440** | |

Stage wall times: classify 1.1 s, brief 8.9 s, design 2.6 s, images 14.2 s, content 8.0 s, check 53.8 s, critique 6.8 s.

Homepage: hero-split:image-left › contact-strip:cards › services-list:rows › image-text:image-right › gallery:grid › team:grid › booking:simple (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 99/100/100/100 | 0 | ✓ |  | — |
| edit 1: “Temnejša glava, prosim.” | 99/100/100/100 | 0 | ✓ | ✓ /chrome/header/tone = "inverse" | — |
| edit 2: “Use a warmer palette.” | 99/100/100/100 | 0 | ✓ | ✓ hue 351→14, sat 0.45→0.60 | — |
| edit 3: “Dodaj pogosta vprašanja. Naročanje je obvezno, barve so brez amoniaka, plačilo je možno tudi s kartico.” | 99/100/100/100 | 0 | ✓ | ✓ faq present | — |
| edit 4: “Change the phone number to 041 555 287.” | 99/100/100/100 | 0 | ✓ | ✓ /business/phone = "+38641555287" | — |
| edit 5: “Dodaj še podatke podjetja v nogo: Lana Vidmar s.p., matična številka 6612345000, davčna številka 51234567.” | 99/100/100/100 | 0 | ✓ | ✓ /business/provider/registrationNumber = "6612345000" | — |

### gostilna-zlata-zlica

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 906 | 18 | 0 | 0 | 0.0009 | 0.8 s |
| brief | 1 | 2358 | 1628 | 1031 | 0 | 0.0182 | 9.7 s |
| design | 1 | 268 | 197 | 4169 | 0 | 0.0029 | 2.3 s |
| altText | 1 | 4803 | 536 | 573 | 0 | 0.0130 | 5.1 s |
| content | 1 | 2650 | 1476 | 16629 | 0 | 0.0201 | 9.1 s |
| critique | 1 | 9503 | 16 | 16957 | 0 | 0.0194 | 2.1 s |
| edit | 5 | 19270 | 1183 | 95180 | 0 | 0.0597 | 13.8 s |
| **total** | | | | | | **0.1341** | |

Stage wall times: classify 0.8 s, brief 10.1 s, design 2.3 s, images 15.8 s, content 9.1 s, check 17.4 s, critique 2.1 s.

Homepage: hero-split:image-left › contact-strip:bar › about:image-side › menu:classic › services-list:rows › image-text:image-left › cta:band (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 100/100/100/100 | 0 | ✓ |  | — |
| edit 1: “Remove the gallery.” | 100/100/100/100 | 0 | ✓ | ✓ 0 × gallery | — |
| edit 2: “Dodaj pogosta vprašanja: psi so dobrodošli na terasi, parkirišče je na Kapucinskem trgu, za skupine nad 10 oseb prosimo za rezervacijo.” | 99/100/100/100 | 0 | ✓ | ✓ faq present | — |
| edit 3: “Spremeni telefonsko številko v 04 555 98 76.” | 99/100/100/100 | 0 | ✓ | ✓ /business/phone = "+38645559876" | — |
| edit 4: “Make the homepage headline more direct and mention the Sunday lunch.” | 100/100/100/100 | 0 | ✓ | ✓ "nedeljsk" found | — |
| edit 5: “Na jedilni list dodaj še jagodne cmoke za 6,40 €.” | 99/100/100/100 | 0 | ✓ | ✓ "cmok" found | — |

### instalacije-rebernik

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 876 | 18 | 0 | 0 | 0.0008 | 1.2 s |
| brief | 1 | 2335 | 1301 | 1031 | 0 | 0.0154 | 7.9 s |
| design | 1 | 217 | 191 | 4169 | 0 | 0.0027 | 2.5 s |
| content | 2 | 5549 | 3013 | 33258 | 0 | 0.0412 | 16.9 s |
| critique | 2 | 16629 | 446 | 33914 | 0 | 0.0383 | 8.6 s |
| edit | 5 | 14994 | 1963 | 95180 | 0 | 0.0590 | 19.4 s |
| **total** | | | | | | **0.1574** | |

Stage wall times: images 0.0 s, classify 1.2 s, brief 8.2 s, design 2.5 s, content 16.9 s, check 36.8 s, critique 8.7 s.

Homepage: hero-type:with-facts › services-list:rows › steps:horizontal › about:text-only › service-area:inline › cta:band (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 100/100/100/100 | 0 | ✓ |  | — |
| edit 1: “Dodaj pogosta vprašanja o subvencijah Eko sklada: pomagamo pri vlogi, subvencijo je treba oddati pred začetkom del.” | 100/100/100/100 | 0 | ✓ | ✓ faq present | — |
| edit 2: “Add a section listing the towns we cover.” | 100/100/100/100 | 0 | ✓ | ✓ service-area present | — |
| edit 3: “Barve naj bodo temnejše, bolj resne.” | 100/100/100/100 | 0 | ✓ | ✓ #e8590c → #c2410c | — |
| edit 4: “I set up an email after all: matej@rebernik-instalacije.example” | 100/100/100/100 | 0 | ✓ | ✓ /business/email = "matej@rebernik-instalacije.example" | — |
| edit 5: “Dodaj, da imamo 24-urno intervencijo pri puščanju vode.” | 100/100/100/100 | 0 | ✓ | ✓ "intervencij" found | — |

### kmetija-grabnar

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 910 | 20 | 0 | 0 | 0.0009 | 0.8 s |
| brief | 1 | 2377 | 1579 | 1031 | 0 | 0.0178 | 16.3 s |
| altText | 1 | 4803 | 587 | 0 | 573 | 0.0145 | 6.4 s |
| design | 1 | 262 | 201 | 4169 | 0 | 0.0029 | 2.4 s |
| content | 1 | 2641 | 1698 | 16629 | 0 | 0.0220 | 10.9 s |
| critique | 2 | 20825 | 433 | 33914 | 0 | 0.0454 | 8.4 s |
| edit | 5 | 19369 | 965 | 95180 | 0 | 0.0580 | 13.6 s |
| **total** | | | | | | **0.1615** | |

Stage wall times: classify 0.8 s, brief 16.6 s, images 17.6 s, design 2.4 s, content 10.9 s, check 35.4 s, critique 8.6 s.

Homepage: hero-image:overlay-bottom › contact-strip:cards › rooms:cards › image-text:image-left › image-text:image-right › highlights:columns › gallery:mosaic › cta:band (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 99/100/100/100 | 0 | ✓ |  | — |
| edit 1: “Uporabi toplejše barve, bolj lesene.” | 99/100/100/100 | 0 | ✓ | ✓ hue 89→27, sat 0.35→0.46 | — |
| edit 2: “Remove the gallery, the photos in the other sections are enough.” | 99/100/100/100 | 0 | ✓ | ✓ 0 × gallery | — |
| edit 3: “Dodaj pogosta vprašanja: hišni ljubljenčki žal niso dovoljeni, prihod je od 14.00, odhod do 10.00.” | 99/100/100/100 | 0 | ✓ | ✓ faq present | — |
| edit 4: “Change the email to info@grabnar-luce.example” | 99/100/100/100 | 0 | ✓ | ✓ /business/email = "info@grabnar-luce.example" | — |
| edit 5: “Krajši uvod na domači strani.” | 99/100/100/100 | 0 | ✓ | ? needs a human look (see screenshot) | — |

### pekarna-kvas

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 911 | 19 | 0 | 0 | 0.0009 | 1.1 s |
| altText | 1 | 1813 | 217 | 573 | 0 | 0.0051 | 4.1 s |
| brief | 1 | 2344 | 1554 | 1031 | 0 | 0.0176 | 10.6 s |
| design | 1 | 287 | 204 | 4169 | 0 | 0.0030 | 2.6 s |
| content | 1 | 2362 | 1214 | 16629 | 0 | 0.0174 | 7.0 s |
| critique | 1 | 8332 | 381 | 16957 | 0 | 0.0205 | 5.3 s |
| edit | 5 | 15300 | 1203 | 95180 | 0 | 0.0530 | 18.1 s |
| **total** | | | | | | **0.1174** | |

Stage wall times: classify 1.1 s, images 8.6 s, brief 10.9 s, design 2.6 s, content 7.0 s, check 16.4 s, critique 5.4 s.

Homepage: hero-split:image-left › contact-strip:bar › image-text:image-left › menu:classic › cta:split (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 100/100/100/100 | 0 | ✓ |  | — |
| edit 1: “Temnejša glava prosim, zdaj je preveč bleda.” | 100/100/100/100 | 0 | ✓ | ✓ /chrome/header/tone = "inverse" | — |
| edit 2: “Add an FAQ: potica for Sunday can be ordered until Thursday; we don't bake gluten-free bread.” | 100/100/100/100 | 0 | ✓ | ✓ faq present | — |
| edit 3: “Toplejše barve, kot skorja kruha.” | 100/100/100/100 | 0 | ✓ | ✗ hue 29→29, sat 0.66→0.66 | — |
| edit 4: “Change the Saturday hours to 6.30–13.00.” | 100/100/100/100 | 0 | ✓ | ✓ "13.00" found | — |
| edit 5: “Odstrani galerijo, slik je dovolj drugod.” | 100/100/100/100 | 0 | ✓ | ✓ 0 × gallery | — |

### racunovodstvo-seliskar

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 875 | 19 | 0 | 0 | 0.0008 | 1.2 s |
| brief | 1 | 2324 | 1330 | 1031 | 0 | 0.0156 | 8.7 s |
| design | 1 | 189 | 178 | 4169 | 0 | 0.0026 | 2.1 s |
| content | 1 | 1977 | 1363 | 16629 | 0 | 0.0180 | 9.2 s |
| critique | 1 | 8333 | 348 | 16957 | 0 | 0.0202 | 5.2 s |
| edit | 6 | 20969 | 1914 | 114216 | 0 | 0.0722 | 22.8 s |
| **total** | | | | | | **0.1294** | |

Stage wall times: images 0.0 s, classify 1.2 s, brief 9.0 s, design 2.1 s, content 9.2 s, check 16.8 s, critique 5.2 s.

Homepage: hero-type:with-facts › services-list:rows › steps:vertical › text:two-column › cta:band (1 contact block).

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
| classify | 1 | 883 | 18 | 0 | 0 | 0.0008 | 1.1 s |
| brief | 1 | 2325 | 1575 | 1031 | 0 | 0.0177 | 9.5 s |
| altText | 1 | 3009 | 388 | 0 | 573 | 0.0097 | 4.4 s |
| design | 1 | 231 | 190 | 4169 | 0 | 0.0027 | 2.4 s |
| content | 1 | 2507 | 1219 | 16629 | 0 | 0.0177 | 7.6 s |
| critique | 2 | 17311 | 482 | 33914 | 0 | 0.0398 | 8.7 s |
| edit | 5 | 16046 | 1257 | 95180 | 0 | 0.0548 | 16.0 s |
| **total** | | | | | | **0.1432** | |

Stage wall times: classify 1.1 s, brief 9.9 s, images 11.5 s, design 2.4 s, content 7.7 s, check 50.3 s, critique 8.8 s.

Homepage: hero-split:image-left › contact-strip:bar › products:grid › image-text:image-left › text:narrow › cta:band (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 100/100/100/100 | 0 | ✓ |  | — |
| edit 1: “Use a warmer palette, more olive and terracotta.” | 100/100/100/100 | 0 | ✓ | ✓ terracotta: hue 14 (5–32), sat 0.51 | — |
| edit 2: “Odstrani galerijo.” | 100/100/100/100 | 0 | ✓ | ✓ 0 × gallery | — |
| edit 3: “Add a products section with olive oil, Piran salt and the gift boxes.” | 99/100/100/100 | 0 | ✓ | ✓ products present | — |
| edit 4: “Spremeni telefonsko številko na 05 555 18 69.” | 99/100/100/100 | 0 | ✓ | ✓ /business/phone = "+38655551869" | — |
| edit 5: “Mention on the homepage that we now ship gift boxes across Slovenia, free shipping over 75 €.” | 99/100/100/100 | 0 | ✓ | ✓ "75" found | — |

### zobozdravstvo-lebar

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 892 | 18 | 0 | 0 | 0.0008 | 0.8 s |
| altText | 1 | 1813 | 248 | 573 | 0 | 0.0053 | 3.8 s |
| brief | 1 | 2343 | 1487 | 1031 | 0 | 0.0170 | 9.9 s |
| design | 1 | 273 | 209 | 4169 | 0 | 0.0030 | 3.1 s |
| content | 1 | 2325 | 1624 | 16629 | 0 | 0.0208 | 11.9 s |
| critique | 2 | 19089 | 924 | 33914 | 0 | 0.0466 | 11.3 s |
| edit | 5 | 17075 | 1235 | 95180 | 0 | 0.0564 | 18.3 s |
| **total** | | | | | | **0.1500** | |

Stage wall times: classify 0.8 s, images 7.1 s, brief 10.3 s, design 3.1 s, content 11.9 s, check 34.5 s, critique 11.5 s.

Homepage: hero-split:image-right › opening-hours:table › services-list:two-column › image-text:image-left › team:list › highlights:list › booking:simple (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 100/100/100/100 | 0 | ✓ |  | — |
| edit 1: “Naslov na domači strani naj bo bolj neposreden.” | 100/100/100/100 | 0 | ✓ | ? needs a human look (see screenshot) | — |
| edit 2: “We decided to publish two prices after all: check-up 45 €, teeth whitening 250 €.” | 100/100/100/100 | 0 | ✓ | ✓ "250" found | — |
| edit 3: “Dodaj predstavitev ekipe: dr. Lebar in asistentka Maja.” | 100/100/100/100 | 0 | ✓ | ✓ team present | — |
| edit 4: “Use a darker primary colour, it looks too light.” | 100/100/100/100 | 0 | ✓ | ✓ #3f6f8f → #2c5270 | — |
| edit 5: “Ob petkih smo po novem odprti do 15.00.” | 100/100/100/100 | 0 | ✓ | ✓ "15.00" found | — |
