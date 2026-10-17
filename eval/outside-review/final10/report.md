# Outside design reviewers

10 pages, 31 calls, €1.2094 spent.

All items count: agreement is measured on every page that has both scores, with no held-out split (nothing is tuned on these scores).

## Reviewers against each other

| Pair | Pages | Pairwise agreement | Spearman ρ |
|---|---|---|---|
| gemini vs gpt | 10 | 56 % (42 pairs) | 0.14 |
| gemini vs claude | 10 | 61 % (42 pairs) | 0.21 |
| gpt vs claude | 10 | 74 % (44 pairs) | 0.61 |

## Filter

6 of 10 pages pass all reviewers (every reviewer answered, none named a blocker). 4 are held by any reviewer.

Held by the filter (at least 2 of 3 reviewers name a blocker): 0 of 10 pages. Passed it: 10.

| Page | Filter | gemini: blockers | gpt: blockers | claude: blockers |
|---|---|---|---|---|
| kamp-soska | not held | On the desktop first screen, the hero text card extends past the bottom of the viewport, cutting off the descriptive copy and hiding the call-to-action link. |  |  |
| servis-aparatov-rebec | not held | On both phone and desktop, phone numbers and prices are styled as Slovenian car license plates ('SLO' blue strip), which makes no sense for a home appliance repair business. |  |  |
| slascicarna-pri-zofki | not held |  |  | Phone footer: the business name „Slaščičarna Pri Zofki |
| tapetnistvo-lesjak | not held |  |  | Desktop footer: the 'Tapetništvo Lesjak' wordmark is rendered at an absurd size, dominating the viewport and looking broken. |

## Scores and top fix per page

| Page | Owner | gemini | gemini: top fix | gpt | gpt: top fix | claude | claude: top fix |
|---|---|---|---|---|---|---|---|
| dimnikarstvo-vidmar | – | 4.17 | Replace the hero radiator vector with an illustration of a chimney, stove, or flue system to better match the chimney sweep trade. | 3.67 | Replace the dominant radiator with a chimney-and-brush illustration that retains the existing pipe-line style and more directly identifies the trade. | 3.58 | Swap the radiator for a chimney/roof illustration (or a real photo of the sweep at work) and on phone shrink it so it sits beside or just under the headline inside the first screen. |
| kamp-soska | – | 4.17 | Reduce the desktop hero image height or overlap the dark text card higher up so the full intro text and 'Poglejte cene' link fit inside the first screen. | 3.92 | Reduce the desktop hero height and move its text panel upward so the full introduction and price link are visible within the first 800 pixels. | 3.83 | Desktop hero: shift the text panel right or shorten the photo so the headline, intro and 'Poglejte cene' sit fully within the first screen and the orange tent is not covered. |
| klavirji-urbanc | – | 4.08 | Put the business name and a compact 'Pokličite' button on a single header row on mobile instead of stacking a full-width button at the very top. | 4 | Reduce desktop section padding, especially around the services list, working approach and credentials, to remove the repeated empty bands. | 3.42 | Tighten section padding on desktop: cut the empty bands below the hero, services table, Zakaj me pokličejo and Kje delam to a consistent rhythm. |
| knjigoveznica-kras | – | 4.42 | Center the arched hero image on mobile or make it span the full width of the text card above it so it doesn't hug the right edge. | 3.92 | Shorten the phone hero by reducing the decorative sprig and card padding, bringing a recognisable portion of the bound book above the fixed directions bar. | 3.75 | On phone, shorten the hero card (smaller leaf ornament, tighter padding) so the arched book photo appears in the first screen instead of a thin sliver under the fixed bar. |
| pedikura-nogica | – | 3.83 | Replace the second mood photo (mountain landscape) with an image relevant to foot care, hygiene, or a calm studio interior. | 3.08 | Compress the phone header into a compact brand-and-contact layout, and place the town beside the introductory text on both screens so visitors can immediately locate the business. | 3.33 | Replace the mountain landscape in 'Za stopala, ki potrebujejo več pozornosti' with a photo of the studio, tools or a treatment; it currently reads as a tourist-farm image. |
| pralnica-cisto | – | 4.17 | Add proper horizontal padding (e.g., 20px–24px) to the 'Poglejte cene' button and remove the text underline so it looks like a proper button. | 3.25 | Compress the phone hero by reducing the decorative sprig, internal padding and button spacing so a meaningful portion of the laundry photo appears above the fixed bar. | 3.5 | Replace the repeated olive-branch ornament on hero and price cards with laundry-specific icons (shirt, duvet, curtain) or drop it entirely. |
| servis-aparatov-rebec | – | 3.58 | Replace the car license plate styling (blue 'SLO' strip) on the phone number and price badges with a motif that fits appliance repair, such as an appliance rating label or clean industrial tag. | 3.42 | Reduce the desktop hero headline to roughly 64–72px and tighten its vertical spacing so the service area, complete call button and pricing link fit comfortably within the first screen. | 3.58 | Desktop hero: shrink the headline by about a third so the phone-number plate and the price link fit inside the first screen, and cut the empty photo band below it. |
| slascicarna-pri-zofki | – | 4.25 | Add proper horizontal padding (at least 24px) to the yellow 'Poglejte ponudbo' button, center its text on mobile, and remove the underline inside the button. | 3.75 | Compact the phone hero’s text and action spacing, and move the photograph higher so the pastry is clearly visible above the fixed contact bar. | 3.58 | Phone hero: move the kremšnita photo up (above or beside the buttons) and keep the hours badge inside the arch so the first screen shows the product, not an empty dark band. |
| tapetnistvo-lesjak | – | 4.08 | Add the phone number and workshop address (or a direct contact CTA) to the right side of the desktop header so desktop visitors don't have to scroll to the footer to call. | 4.08 | Add a clearly visible click-to-call link in the desktop header so visitors can contact the workshop without scrolling to the footer. | 3.67 | Shrink the footer wordmark on desktop to a normal heading size; it currently swallows the screen and looks like a rendering error. |
| zeliscarna-pri-lipi | – | 4.17 | Center the text inside the primary green CTA button ('Poglejte izbor izdelkov'), remove its underline, and add horizontal padding on desktop so the text doesn't touch the button edges. | 3.33 | Compact the phone hero by reducing decorative space and stacking fewer actions, bring the herb photograph clearly into the first screen, and add a short location line near the introduction on both ⇢. | 2.92 | Give the three products real photos and shrink the cards so icon, name and price sit together instead of floating in a tall empty box. |

