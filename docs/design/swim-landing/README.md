# Landing page directions: Šola plavanja Mladi Val

Nine design sketches for the same homepage, made because the generated site for this swimming school looked like a default template (owner, 2026-10-01). They are design targets, not engine output: plain HTML and CSS written by hand. Implementing them in the engine is a separate task.

- Canvas with all eighteen artboards (desktop 1440 px and phone 390 px per direction): https://claude.ai/artifact/GBMesX76huidKKUswuk1i5 (private to the owner)
- Same pages in this folder, responsive, no JavaScript: `a-globina.html`, `b-proge.html`, `c-val.html`, `d-mirno.html` (round one), `e-gladina.html`, `f-lido.html`, `g-crke.html`, `h-deska.html`, `i-popoldan.html` (round two)
- First screens side by side: `first-screens.jpg` (A to D), `first-screens-2.jpg` (E to I)

## Owner's feedback so far

After round one (2026-10-01): A and C fit a swimming school best, C "has character" and suits a site for children; B and D are usable. The owner asked for more variations and more boldness. Round two (E to I) answers that: every direction has one device a visitor would describe to someone else, and four of them move (CSS only, switched off under `prefers-reduced-motion`).

## What was wrong with the generated page

Small headline in a half-empty split, a pale lavender ground that belongs to no one, one photo in an arch, two fact-free lines of copy, a header with a single link. Nothing on the screen could only be this business.

## What all nine directions share

- **The one hard fact is the visual hook.** The owner gave one concrete fact: vadba vsak popoldan ob 17.00. Every direction turns it into the largest or most coloured object on the first screen (tile, giant numerals, sticker, serif figure, buoy, turning ring, water-filled letters, kickboard, low sun) instead of leaving it in the paragraph.
- **Display type at 90–136 px on desktop and 46–56 px on a phone**, tight leading (0.9–0.98). The generated page had about 46 px on desktop.
- **A motif taken from the trade**, drawn in code, not a stock ornament: lane rope, lane T-lines, wave edge, kickboard shapes, water line.
- **Colour comes from the pool and the school's own equipment**, never the lavender default.
- **Elements overlap section edges** (tile, photo, print) so sections stop reading as stacked boxes.
- **One primary action per screen**; the second action is a text link. Phones get the call bar.
- Same content in all nine, so they can be compared on design alone: hero, facts (when, where, who, phone), approach, first visit in three steps, parents' questions, contact, footer.

## Facts and placeholders

Only what the owner's input contained is stated: the name, Celje, children, every afternoon at 17.00, "varno in sproščeno". Everything else is a marked placeholder (yellow, dashed): pool address, age range, phone, e-mail, lesson length, what to bring, provider data. Times use the Slovene form `17.00`.

## Photos

Seven pictures in `img/`, generated with GPT Image 2.5 through fal (config model `gpt-image-2.5`), about €0.48 in total at config prices. No people, no lettering. Every one carries the "Ustvarjeno z UI" badge. They stand in for the owner's photos; with real lesson photos each direction gets stronger. A needs one dark, calm photo for the hero and I needs one wide, well-lit photo; E works with none in the hero. Round two reuses the same seven pictures (no new spend).

| File | Used in |
| --- | --- |
| `underwater.jpg` | A hero, E goggles, G photo band |
| `lanes.jpg` | B hero |
| `kickboards.jpg` | C hero, F swim ring |
| `hall.jpg` | D hero, F postcard, I hero |
| `goggles.jpg` | B approach, C approach, D hero print, H approach, I approach |
| `ladder.jpg` | A approach, D approach, E goggles, G approach |
| `water.jpg` | A, C, D, E contact; G letter fill; H hero and contact (the pool surface) |

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

## E · Gladina (the waterline)

The page is the pool. The headline stands in the water: its second line is cut by a moving waterline, navy on white above it, white on blue and shifted sideways below it. Every section after that is one step deeper.

- Type: Figtree 900 display and text.
- Colour: white above the water; five blues from `#0a78b5` down to `#042b4f`, one per section; yellow `#ffd43b` for the action and the hour.
- Hero: needs no photo. The effect is two copies of the same line: the dry one sits in the white block and is covered by the water block below it; the wet one sits inside the water block (hidden overflow) at the same position plus a 0.05 em shift. The wave is one inline SVG, twice the page width, sliding by half its length in a loop.
- Signature: the half-submerged line; a yellow buoy with the hour floating on the waterline, its lower half tinted by the water; bubbles; two photos seen through a pair of yellow swimming goggles; steps as buoys on a rope.
- Phone: same cut headline at 48 px; the buoy becomes a yellow bar with the hour.
- The strongest answer to "no photos": everything on the first screen is type, colour and one SVG path.

## F · Lido (summer-pool poster)

Striped awning, sun-yellow ground, a fat soft serif in pool blue, the photo inside a swim ring.

- Type: Fraunces 900 display (never italic), Karla text.
- Colour: yellow `#ffc928`, blue `#1746a2`, red `#d63a26`, ink `#14213d`, white. No cream.
- Hero: red and white scalloped awning under the header (an SVG pattern), headline at 124 px, one red button; on the right a red and white swim ring with the photo in its hole and the school's name, town and hour set on a circle that turns once in 70 s.
- Signature: facts as three entry tickets (coloured stub, perforation notches, slight tilt); the approach photo as a postcard with a "Celje" stamp; towel stripes between sections; small swim rings as step markers; the contact section on red under a scalloped edge with the hour in a yellow disc.
- Phone: awning, text, then the ring at 320 px; tickets stack.
- Closest relative of C, with a different voice: nostalgic rather than cartoon.

## G · Črke (letters made of water)

A night-blue page where the type is the pool: "Plavamo ob 17.00" at 286 px, cut out of a slowly moving photo of the water surface. Section titles use the same fill. The page ends by flipping to solid yellow with "Pokličite nas" at 196 px.

- Type: Libre Franklin 900 display, 400 to 700 text.
- Colour: night `#04162b`, aqua `#8fe0f4` for labels and rules, yellow `#ffd23f`.
- Hero: label, the two-line headline, then lead and action on one row; a full-bleed underwater photo band closes the first screen.
- Signature: `background-clip: text` with the water photo and a 40 s background drift; falls back to plain aqua text where clipping is unsupported.
- Phone: headline at 76 px, same fill.
- Uses one photo twice (as texture and as band); the texture can be any close-up of the owner's water, wood, bread, cloth: the device carries over to other trades.

## H · Deska (the pool from above)

The first screen is the water surface seen from above, and the content floats on it: the headline rides a giant yellow kickboard, the hour is on a smaller blue one, a swim ring and a coral board bob beside them. The header is a white bar at the pool's edge.

- Type: Nunito Sans 1000 display, 400 to 900 text.
- Colour: taken from the school's kickboards and noodles: yellow `#ffd43b`, coral `#ff6f61`, blue `#1e4fd0`, green `#2fae6b`, navy `#0a2540`.
- Hero: full-bleed water photo that swells slowly (scale 1 to 1.05 over 26 s); kickboard panel tilted 2.5 degrees with two grip holes that show the water; flat offset shadow, no blur; lane rope as the bottom edge.
- Signature: the kickboard as the content container. Facts are three more boards (coral, blue, green); the steps sit under a lane rope with a small board gliding along it; contact is a navy board on the same water.
- Phone: the board fills the width, ring and hour board sit under it.
- The most playful of the nine, and the one children would point at.

## I · Popoldan (golden hour)

A full-width photo of the hall in late light, a deep-blue wave rising over it with the headline, and the hour as a low sun sitting on the wave. 17.00 is late afternoon; the picture says it.

- Type: Manrope 800 display, 500 to 700 text.
- Colour: night `#0c2238`, sun `#ffb938`, mist `#eef4f8`. The warmth comes from the photo, not from a cream page.
- Hero: photo in the top 78 %, one SVG wave path in night blue over it, headline at 108 px on the wave, sun disc 230 px half behind the crest.
- Signature: the wave and the sun; the wave returns as the top edge of the contact section, the sun as its closing mark.
- Phone: photo on top with the sun over it, wave below, text on the wave.
- The photographic sibling of A, warm where A is cold. Needs one wide photo with light in it.

## Where the sketches step outside rules I know of

Checked against docs/PRODUCT.md and docs/design/ideas.html, not against the component library or the stylesheet test.

- No gradients, glass, emoji, italics, numbered labels, monospace, pill buttons, uppercase eyebrows or centred sections in any of them. The lane rope and waves are inline SVG; A's photo overlay is one flat colour.
- Radius: ideas.html says the radius token is capped at 12 px. C uses 20–24 px on colour blocks and cards, a round photo, and a shaped photo (120/24 px corners). Buttons stay at 12 px or less everywhere.
- Generated pictures are allowed only in hero-split, hero-image, image-text and page-header (PRODUCT.md). A, C and D also put one in the contact section; with generated pictures only, that slot needs another answer (flat colour block, or the motif).
- Picture count: the pipeline makes up to 2 for a homepage preview and 3 for a full site. A, B and C use 2–3; D uses 4.
- C's sticker is a round badge on the photo, not a pill above the headline (give-away 12), but it is close to it.
- D's centred wordmark is the one listed exception to "everything centred".
- CSS `text-wrap: balance` and `aspect-ratio` are used; both degrade safely.
- Motion (E wave, buoy and bubbles; F turning ring; G drifting letter fill; H swelling water, bobbing floats, gliding board): CSS keyframes only, no JavaScript, all stopped by `prefers-reduced-motion`. ideas.html lists "scroll and hover animation on every card" and "marquee or ticker bars" as give-aways; these are one ambient movement per screen, not entrance effects, but F's turning text ring is the nearest to a ticker.
- F's ring text is uppercase with wide spacing (give-away 15 is about eyebrows; this is a badge, used once).
- G fills text with a photo (`background-clip: text`). It is not a gradient, but a stylesheet test that only knows plain colours may reject it. Its headline has no client noun besides the hour.
- H tilts the main content panel (2.5 degrees) and uses radii up to 190 px; E's goggles and C's porthole use round and shaped photo masks; F tilts tickets and the postcard.
- Generated pictures outside the allowed sections: E and I put one in the contact or goggles device; G uses one as a letter fill; H uses one as a full-bleed hero background (hero-image is allowed) and again behind the contact.
- E's hero duplicates the second headline line for the effect; the copy is `aria-hidden`.

## Checked

Rendered in Chromium at 1440 × 900 and 390 × 844 (plain HTML, and the canvas artboards through the canvas's own runtime), all nine: no horizontal scroll at either width, all requests load, on the phone every button, bar link and menu link is at least 44 px tall. Contrast computed for 65 text and background colour pairs (27 in A to D, 38 in E to I): lowest among plain colours 4.67:1 (F's white on red), 4.72:1 (C's eyebrow on white), 4.81:1 (E's white on the first water blue). Two estimates rather than measurements: white text on A's hero photo (about 7.9:1 against the photo's mid blue under the overlay) and G's water-filled letters (about 4.2:1 for the darkest tone of the photo against the night ground; the letters are 56 px and larger, where 3:1 applies). Not checked: axe, Lighthouse, other browsers, the animations on a real phone.
