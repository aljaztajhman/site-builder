# Outside design reviewers

10 pages, 31 calls, €1.5777 spent.

All items count: agreement is measured on every page that has both scores, with no held-out split (nothing is tuned on these scores).

## Reviewers against each other

| Pair | Pages | Pairwise agreement | Spearman ρ |
|---|---|---|---|
| gemini vs gpt | 9 | 57 % (35 pairs) | 0.11 |
| gemini vs claude | 9 | 70 % (35 pairs) | 0.48 |
| gpt vs claude | 10 | 69 % (45 pairs) | 0.54 |

## Filter

6 of 10 pages pass all reviewers (every reviewer answered, none named a blocker). 4 are held by any reviewer.

Held by the filter (at least 2 of 3 reviewers name a blocker): 2 of 10 pages. Passed it: 8.

| Page | Filter | gemini: blockers | gpt: blockers | claude: blockers |
|---|---|---|---|---|
| optika-jasna | not held |  |  | Phone hero: the ZZZS callout box overlaps and hides the top of the glasses photo. |
| pivovarna-rov | held | On phone, the white hero card overlaps the 'Kdaj smo odprti' heading and timeline axis below it, leaving only the bottom tips of the letters visible. | Phone, opening-hours section: the hero card overlaps and obscures the “Kdaj smo odprti” heading. | Phone, hero/opening hours: the hero card covers the „Kdaj smo odprti |
| plesna-sola-takt | held |  | Phone, hero and first-meeting images: the arched masks cut off the image-label text. | Phone hero: the 'Ustvarjeno' label on the shoes photo is cut off by the arched crop, same on the landscape photo. · Both viewports: the 'Prvo srečanje' section uses a mountain-village landscape that is nonsensical for a dance school. |
| sirarna-pr-simnu | not held |  |  | Desktop footer: the giant 'Sirarna Pr' Šimnu' wordmark is clipped at the top by the section divider (Š caron cut off). · Phone hero: the arched cheese photo is cut off at the bottom and its arch starts behind the fixed call bar, reading as a broken crop. |

## Scores and top fix per page

| Page | Owner | gemini | gemini: top fix | gpt | gpt: top fix | claude | claude: top fix |
|---|---|---|---|---|---|---|---|
| atelje-bergant | – | 3.83 | On phone, align the phone number and 'Navodila za pot' link onto a single compact row or move them to a fixed bottom bar instead of staggering them across two lines in the header. | 2.75 | Compact the phone header into one brand/menu row and move its phone and directions links into the fixed bottom bar, giving the hero more room. | 3.33 | Collapse the phone header to one row (name + Meni) and drop the standalone phone/directions lines; the fixed bottom bar already covers calling and directions. |
| kolesarski-servis-ovinek | – | 3.67 | Merge the 'Kaj delamo' section with the pricing section or remove it, as its copy repeats the hero and pricing text word-for-word. | 3.33 | Bring Tolmin into the hero beside the service description; on phones, place a compact service-and-location introduction above a shallower photo. | 2.92 | Tame the giant footer wordmark on desktop and tighten the dead white band under the hero so the page has one consistent rhythm. |
| optika-jasna | – | 4.08 | Add the location (Postojna) to the hero section so visitors immediately know where the optician is. | 3.33 | Compress the phone opening-hours section into compact day-and-time rows instead of six oversized chart tracks. | 3.5 | On phone, move the photo directly under the headline and shrink it; place the ZZZS callout beside or below the circle instead of over the frames. |
| pasji-salon-kodra | – | 4 | Keep the solid terracotta button style for the primary 'Pokličite me' CTA in the mobile hero and the dark bottom banner so the main action stands out. | 2.92 | Compact the phone hero: place the salon introduction and Kočevje before a shorter image, and bring the call and pricing links together with clear primary/secondary styling. | 3 | Make the phone hero 'Pokličite me' a solid terracotta button like on desktop and demote 'Poglejte cene' to a quiet text link beside it. |
| pivovarna-rov | – | 3.75 | Fix the hero section height and card positioning on mobile so the white card does not overlap and hide the 'Kdaj smo odprti' heading and timeline header. | 3.08 | Keep the phone hero card in normal document flow so the opening-hours heading clears it, and condense the hours into compact day-and-time rows. | 3 | Give the overlapping hero card its own margin below so the opening-hours heading sits clear of it on both screens, and on phone drop the overlap entirely (card under the photo). |
| plesna-sola-takt | – | – |  | 3 | Move image labels outside the arched clipping masks so each label remains fully readable on phones. | 3.08 | Replace the sunset landscape photo in the 'Prvo srečanje' section with a picture of the dance hall or a couple dancing; it currently reads like a tourist-farm site. |
| sirarna-pr-simnu | – | 4.08 | Center the arched hero image on mobile and give it symmetric horizontal margins so it doesn't hug the right edge. | 3.42 | Compact the phone hero by shrinking the decorative sprig and reducing vertical padding and gaps, bringing a meaningful portion of the cheese photograph into the first screen. | 3.58 | On phone, shrink the hero card (drop the big ornament, tighten padding) or place a cropped cheese photo above/behind it so a product image is visible on the first screen. |
| steklarstvo-vrhovnik | – | 3.92 | Replace the five identical blue working-hours bars with a compact 'Ponedeljek–petek: 7.00–15.00' readout so they do not look like stacked buttons on mobile or waste a whole screen on desktop. | 2.83 | Replace the five large hours bars with a compact weekday schedule, and place the services immediately after the hero on both screens. | 3.08 | Replace the five-row hours bar chart with a compact single line (Pon–Pet 7.00–15.00) in a small panel; on phone it currently costs a full screen for one fact. |
| urarstvo-tic | – | 3.75 | Add proper horizontal padding (at least 16–24px) to the 'Paščki z idrijsko čipko' hero button and remove the text underline inside it. | 3.75 | Shorten the phone hero by reducing the botanical ornament, frame padding and introductory text footprint, bringing a meaningful portion of the watchmaking image into the first screen. | 3.75 | Replace the olive-branch ornament with a watch-related motif (gear, crown, balance wheel) or drop it; it is the one generic element in an otherwise trade-specific design. |
| vinarstvo-pinteric | – | 4.17 | Pull the overlapping hero text block higher up over the image on desktop so the subheadline and CTA buttons are visible in the first viewport. | 3.67 | Shorten the desktop hero photograph and move the green introduction panel upward so the headline, location and primary tasting action all fit within the first 800 pixels. | 3.67 | Shorten the hero image (both viewports) so headline and 'Poglejte degustacije' are visible on the first screen without scrolling. |

Failed (gemini, no score given): plesna-sola-takt

