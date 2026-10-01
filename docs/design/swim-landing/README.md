# Landing page directions: Šola plavanja Mladi Val

Four design sketches for the same homepage, made because the generated site for this swimming school looked like a default template (owner, 2026-10-01). They are design targets, not engine output: plain HTML and CSS written by hand. Implementing them in the engine is a separate task.

- Canvas with all eight artboards (desktop 1440 px and phone 390 px per direction): https://claude.ai/artifact/GBMesX76huidKKUswuk1i5 (private to the owner)
- Same pages in this folder, responsive, no JavaScript: `a-globina.html`, `b-proge.html`, `c-val.html`, `d-mirno.html`
- First screens side by side: `first-screens.jpg`

## What was wrong with the generated page

Small headline in a half-empty split, a pale lavender ground that belongs to no one, one photo in an arch, two fact-free lines of copy, a header with a single link. Nothing on the screen could only be this business.

## What all four directions share

- **The one hard fact is the visual hook.** The owner gave one concrete fact: vadba vsak popoldan ob 17.00. Every direction turns it into the largest or most coloured object on the first screen (tile, giant numerals, sticker, serif figure) instead of leaving it in the paragraph.
- **Display type at 90–136 px on desktop and 46–56 px on a phone**, tight leading (0.9–0.98). The generated page had about 46 px on desktop.
- **A motif taken from the trade**, drawn in code, not a stock ornament: lane rope, lane T-lines, wave edge, kickboard shapes, water line.
- **Colour comes from the pool and the school's own equipment**, never the lavender default.
- **Elements overlap section edges** (tile, photo, print) so sections stop reading as stacked boxes.
- **One primary action per screen**; the second action is a text link. Phones get the call bar.
- Same content in all four, so they can be compared on design alone: hero, facts (when, where, who, phone), approach, first visit in three steps, parents' questions, contact, footer.

## Facts and placeholders

Only what the owner's input contained is stated: the name, Celje, children, every afternoon at 17.00, "varno in sproščeno". Everything else is a marked placeholder (yellow, dashed): pool address, age range, phone, e-mail, lesson length, what to bring, provider data. Times use the Slovene form `17.00`.

## Photos

Seven pictures in `img/`, generated with GPT Image 2.5 through fal (config model `gpt-image-2.5`), about €0.48 in total at config prices. No people, no lettering. Every one carries the "Ustvarjeno z UI" badge. They stand in for the owner's photos; with real lesson photos each direction gets stronger, none depends on a specific picture except A (needs one dark, calm photo for the hero).

| File | Used in |
| --- | --- |
| `underwater.jpg` | A hero |
| `lanes.jpg` | B hero |
| `kickboards.jpg` | C hero |
| `hall.jpg` | D hero |
| `goggles.jpg` | B approach, C approach, D hero print |
| `ladder.jpg` | A approach, D approach |
| `water.jpg` | A, C, D contact |

## A · Globina (immersive)

Full-bleed underwater photo behind a white 136 px headline; the page starts dark and opens up below.

- Type: Archivo 800 display, DM Sans text.
- Colour: navy `#06283d` / `#052436`, pale aqua surface `#ecf7fa`, sun yellow `#ffd23f` for the action and the hour, light aqua `#8fdcf0` for labels on dark.
- Hero: photo with one flat navy overlay at 46 % (no gradient), header on the photo, headline at the bottom left, one yellow button.
- Signature: the yellow hour tile hangs out of the hero's bottom edge into the fact band and takes the fourth column of the fact grid, so "when" is a thing, not a row.
- Below: fact band on navy, tall photo beside a 72 px statement, three steps under a lane rope, questions as a two-column list, contact panel on a full-bleed water photo.
- Phone: same photo hero at 660 px, tile overlaps the edge at 172 px wide, fact band stacks.
- Risk: lives or dies with the hero photo; needs a dark, low-detail image for white text to hold 4.5:1.

## B · Proge (type-led poster)

White page, cobalt and lane-rope red. The headline is one sentence with the hour blown up to 310 px: "Vsak popoldan ob 17.00 učimo otroke plavati."

- Type: Space Grotesk 700 display, IBM Plex Sans text.
- Colour: white, ink `#0b1a4a`, cobalt `#1238d6`, red `#e5352b` only in the rope, pale blue surface `#e8f3fc`.
- Hero: seven columns of type, a tall photo bleeding to the top right edge, a lane rope across the full width as the hero's bottom edge.
- Signature: pool markings as the layout system. Facts are a timetable board (label, 56 px value, detail per row); the three steps are lanes with T-lines; the approach is a solid cobalt block with the photo hanging out of it; the page ends on "Se vidimo ob 17.00" at 160 px.
- Phone: hour at 132 px, photo becomes a strip under the text, rows stack.
- Works with zero photos: drop the hero photo and the type still carries the screen. The safest direction for owners who send nothing.

## C · Val (playful colour blocks)

Pool-aqua hero, navy type, photo in a porthole with kickboard shapes behind it and a yellow "vsak popoldan ob 17.00" sticker on it. Every section edge is a wave (the school is called Val).

- Type: Bricolage Grotesque 800 display, Nunito Sans text.
- Colour: pool `#2fcfdc`, navy `#0a2540`, yellow `#ffd43b`, coral `#ff6f61`, foam `#eefbfc`. The four colours are the kickboards and noodles in the school's own photo.
- Hero: text left, round photo right with a 12 px white ring, three flat kickboard shapes behind it, wave into the next section.
- Signature: wave edges between all sections, facts as three unequal colour blocks (5/4/3 columns), step cards stepping down like a staircase on yellow, contact on navy with a round water photo.
- Phone: text first, porthole below with the sticker, blocks stack full width.
- Closest to the audience (parents of small children) and to the name.

## D · Mirno (editorial, calm)

White page, deep teal ink, serif at magazine scale, photos layered like prints. Speaks to the parent rather than the child.

- Type: Newsreader 500 display (never italic), Figtree text.
- Colour: white, ink `#0f2a2e`, teal `#0b6e75`, mist surface `#eaf5f5`. No cream.
- Header: nav left, centred serif wordmark, call link right, hairline under it.
- Hero: the owner's full sentence at 92 px over three lines, lead and button to the right at the baseline, then a 2:1 photo bleeding off the right edge with a small square print overlapping its bottom-left corner and the hour as a 100 px serif figure beside it.
- Below: fact row on a hairline, the approach as a 72 px statement with a tall photo, steps and questions as ruled lists, contact as a dark block with a photo half.
- Phone: headline at 46 px, photo full width, print overlaps, hour below.
- Needs at least two decent photos; the weakest of the four with none.

## Where the sketches step outside rules I know of

Checked against docs/PRODUCT.md and docs/design/ideas.html, not against the component library or the stylesheet test.

- No gradients, glass, emoji, italics, numbered labels, monospace, pill buttons, uppercase eyebrows or centred sections in any of them. The lane rope and waves are inline SVG; A's photo overlay is one flat colour.
- Radius: ideas.html says the radius token is capped at 12 px. C uses 20–24 px on colour blocks and cards, a round photo, and a shaped photo (120/24 px corners). Buttons stay at 12 px or less everywhere.
- Generated pictures are allowed only in hero-split, hero-image, image-text and page-header (PRODUCT.md). A, C and D also put one in the contact section; with generated pictures only, that slot needs another answer (flat colour block, or the motif).
- Picture count: the pipeline makes up to 2 for a homepage preview and 3 for a full site. A, B and C use 2–3; D uses 4.
- C's sticker is a round badge on the photo, not a pill above the headline (give-away 12), but it is close to it.
- D's centred wordmark is the one listed exception to "everything centred".
- CSS `text-wrap: balance` and `aspect-ratio` are used; both degrade safely.

## Checked

Rendered in Chromium at 1440 × 900 and 390 × 844 (plain HTML, and the canvas artboards through the canvas's own runtime): no horizontal scroll at either width, all requests load, on the phone every button, bar link and menu link is at least 44 px tall. Contrast computed for the 27 text and background colour pairs: lowest 4.72:1 (C's eyebrow on white), all others 5.2:1 or more. White text on A's hero photo is an estimate (about 7.9:1 against the photo's mid blue under the overlay), not a measurement of every pixel. Not checked: axe, Lighthouse, other browsers.
