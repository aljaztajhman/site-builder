# Outside design reviewers

10 pages, 19 calls, €0.8600 spent.

All items count: agreement is measured on every page that has both scores, with no held-out split (nothing is tuned on these scores).

## Reviewers against each other

| Pair | Pages | Pairwise agreement | Spearman ρ |
|---|---|---|---|
| gemini vs gpt | 4 | 92 % (6 pairs) | 0.95 |
| gemini vs claude | 4 | 50 % (6 pairs) | 0.00 |
| gpt vs claude | 4 | 60 % (5 pairs) | 0.32 |

## Filter

4 of 10 pages pass all reviewers (every reviewer answered, none named a blocker). 3 are held by any reviewer, 3 not reviewed by every reviewer.

Held by the filter (at least 2 of 3 reviewers name a blocker): 0 of 10 pages. Passed it: 4. Open because a reviewer failed: 6.

| Page | Filter | gemini: blockers | gpt: blockers | claude: blockers |
|---|---|---|---|---|
| pivovarna-rov | not held |  |  | Phone, hero: the 'Kako do nas' button is nearly covered by the fixed bottom bar. · Phone, opening hours: the timeline bars have no hour labels, so the chart is unreadable. |
| plesna-sola-takt | not held |  |  | Phone hero and second photo: the 'Ustvarjeno' generated label is clipped at the right edge of the image, cutting the word. |
| sirarna-pr-simnu | not held |  |  | Phone hero: the arched cheese photo is cut off at the right edge of the screen, leaving only a partial arch visible. |

## Scores and top fix per page

| Page | Owner | gemini | gemini: top fix | gpt | gpt: top fix | claude | claude: top fix |
|---|---|---|---|---|---|---|---|
| atelje-bergant | – | 3.58 | On phone, remove the awkward staggered phone and directions links from the top header and replace them with the standard fixed bottom call/directions bar. | 2.83 | Compress the phone header to one row, move call/directions into the required fixed bottom bar, and place a short location line beside the hero introduction instead of using a separate contact band. | 3.25 | Remove the phone number and directions link from the phone header (the fixed bar already carries them) so the hero photo and headline start higher on the first screen. |
| kolesarski-servis-ovinek | – | 3.75 | Include the location (Tolmin) in the hero section or header so visitors immediately know where the shop is without scrolling. | 3.25 | Put Tolmin and a compact address line directly beneath the hero headline so visitors understand the service and location before choosing directions. | 3.67 | Rebalance the price grid: five items in a 4-column (desktop) / 2-column (phone) grid leaves a stray '8 €' item; use a 5-column row or a vertical price list with rules. |
| optika-jasna | – | 4.17 | Include the location (Postojna) in the hero section or header so visitors immediately know where the business is. | 3.5 | Tighten the hero’s vertical gaps, place Postojna alongside the business introduction, and establish one prominent contact action so the service, location and next step read together. | 3.42 | Fill the right half of 'Kdo vas sprejme' with a portrait or team photo and tighten the dead band under the services list. |
| pasji-salon-kodra | – | 4.08 | Add the town name (Kočevje) as an eyebrow or in the subheadline of the hero section so visitors immediately know where the salon is. | 3.25 | Bring Kočevje into the hero near the business introduction so visitors see the service, location and contact action together. | 3.08 | Replace the hairbrush/comb mood picture with a photo of a groomed dog or the salon table; the current image says hairdresser, not pasji salon. |
| pivovarna-rov | – | – |  | – |  | 3.42 | Move the hero card up on phone so address, headline and CTA all sit in the first screen; on desktop pull the card up so 'Kako do nas' is fully visible above the fold. |
| plesna-sola-takt | – | – |  | – |  | 3.08 | Make 'Pišite nam' a real primary button and demote 'Poglejte cene'; the underlined text links are hard to notice as actions on both viewports. |
| sirarna-pr-simnu | – | – |  | – |  | 3.75 | Give the three product cards real photos of the cheeses instead of the same branch ornament, and tighten the gap between name and price so the cards don't look half-empty. |
| steklarstvo-vrhovnik | – | – |  | – |  | 2.92 | Collapse the five identical opening-hours bars into one line ('Pon–Pet 7.00–15.00') so the services and location come up sooner on both screens. |
| urarstvo-tic | – | – |  | – |  | 3.75 | On phone, shrink the hero card (smaller description, remove the ornament) so the workshop photo arch is visible in the first screen. |
| vinarstvo-pinteric | – | – |  | – |  | 3.58 | Desktop: shorten the hero card or lift it so headline and subtitle are visible above the fold; give the opening hours a two-column layout with map/address instead of a half-empty band. |

Failed (gemini, no score given): pivovarna-rov, plesna-sola-takt, sirarna-pr-simnu, steklarstvo-vrhovnik, urarstvo-tic, vinarstvo-pinteric

Failed (gpt, no score given): pivovarna-rov, plesna-sola-takt, sirarna-pr-simnu, steklarstvo-vrhovnik, urarstvo-tic, vinarstvo-pinteric

