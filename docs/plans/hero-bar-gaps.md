# Hero bar: gaps in the composition language

Found while building the eight hero-bar first screens (HQ sb-studio-quality-first, option hero-bar; sheet:
docs/design/hero-bar/sheet.jpg, script: tools/eval/src/hero-bar.ts). Each one is something a design needed that the
language can't say today, and what adding it would unlock. Nothing here was worked around with hand-written HTML.

## Fixed in this branch (small renderer fixes, each with a test)

- **Bleed fell 32 px short in wide sections.** `--cx-be` assumed 2 rem of container padding, but a wide section's
  container pads to the header's content edge (`max(2rem, min(50%, 45rem) - 36rem)`, 64 px at 1280). Photos and art with
  `bleedX` stopped short of the page edge. composed-v2.css now sets `--cx-pad` for `.cx-w-wide` on desktop
  (render/test/composed-extensions.test.ts).
- **Two calls on the first screen.** The plain header kept its call button when a composed opener already carried the call
  (a call button, a plate or a number that calls), so a desktop first screen had two. Header.tsx now leaves it out when
  `composedActions(opener)` holds the header's action (components/test/chrome.test.tsx).
- **A white panel behind hang tags over a photo.** Prices as `tags` or `plates` are objects on their own ground, like a
  plate fact, so they no longer get the `.cx-over` backing panel (components/test/composed-section.test.ts).

## Gaps (not fixed: each is a language or composer change)

1. **No slot for the opening time.** J Skorja's best object is the disc "pon–sob odprto od 6.30"; a fact's value must come
   from a slot and only `business.hours.note` exists. A slot such as `{business.hours.opens}` (the earliest opening of the
   week, formatted) would allow the hours as a sticker, a seal or a timetable fact (design B wanted it).
2. **Photos only by index.** B needs the photo of the work in hand (portrait); A needs the product. `{images[n]}` can't ask
   for orientation or subject, so a preset that wants "the portrait photo" only works when the client's order happens to fit.
   Slots by orientation or by the brief's photo subject (`{photos.portrait[0]}`, `{photos.work[0]}`) would make the
   photo-led presets safe for any client.
3. **No tilt on prices.** Hang tags read as tags when a little askew; the guard drops `tilt` on a prices element (A wanted
   −4°). Allowing tilt on `tags` and `plates` styles (desktop only, as for facts) would unlock it.
4. **One headline for every design.** The content stage writes one `copy.headline` per intent; Inštalacije Rebernik's is 55
   characters, so the poster designs (G, H) had to drop to size 5. A short display line (`copy.display`, ≤ 24 characters,
   the client's own words) would let poster and type-led heroes run at sizes 7–8.
5. **Hero art is capped at 24 paths and stroke width 8.** The linocut (C) needed gouge texture and the poster (G) thick pipes:
   the pipes had to become filled outlines and the texture is sparser than a real print. A hero-art tier (more paths, still
   under the 25 KB budget) would let the art carry more of the medium.
6. **A drawing can't be larger than its cell.** `fit: "cell"` sizes a drawing to its columns, and `bleedY` only reaches past
   the section's padding, so a poster can't be drawn taller than the screen and cropped by the fold or the section's edges.
   A `fit: "cover"` (fill the cell's height, crop the overflow) would allow the big cropped art the owner liked in S Cevi.
7. **The call as a solid block.** `fill` on a numeral fact paints only behind the number; S Cevi's red call block (label and
   number on one padded ground) needs a fact treatment such as `call-block`.
8. **The composer can put a second call on the hero's screen.** When the opener's fact object owns the call, the next
   section may still bring a call button (D on phones: the plate and the notice card's "Pokličite" on one screen; G and H at
   400–800 px). The composer's `addsNoIssue` checks the spec's semantic issues, which don't model screens. A composer rule
   (no call action in the section after an opener that carries the call) would close it.
9. **The preset sheet ignores a preset's tone.** pages-v2 renders every preset on paper, alt and ink, so a preset designed
   for one ground must spell its colours out (`onInverse` on text over a scrim, a full `background` field behind a coloured
   headline). Rendering a toned preset on its own tone only would keep presets simpler.
10. **`headerOver` needs a layer.** A dark opener without a photo needs a full-section field just so the header may sit on
    it (B, C, E, H). Allowing `headerOver` on a toned section would drop the extra layer.
