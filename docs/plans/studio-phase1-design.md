# Design studio Phase 1: composition language v2 and the inventory batches

Architect's design for F1b (spec v20) and batches I3–I7, I9, I10 of `docs/plans/design-studio.md` §4, §7, §11. Builders build against this file. Where it and the plan differ, this file wins for Phase 1. Base: `origin/main` at e916a0c (spec v19, F1–F5 merged; I1, I2, I8 open).

## 0. Key decisions

1. **Extend before adding.** §7.2's 14 rows become **7 new kinds** (`photos`, `wordmark`, `ribbon`, `sticker`, `map`, `iconFacts`, `quote`) plus extensions of `fact`, `heading`, `list`, `prices`, `decor`. 10 → 17 kinds.
2. **Inventory names are data, not schema.** Fields that name an inventory asset (mask, treatment, texture, edge, fact object, type treatment, motion, wordmark style, drawing) are vocabulary strings, checked by a guard against append-only lists in `packages/spec/src/composition/vocab.ts`. Batches add names without touching the schema, so there's no spec bump per batch and parallel batches don't collide on `SPEC_VERSION`. In Phase 2 the engine injects the approved shortlist names as enums into the model-facing JSON schema.
3. **One asset id scheme** owned by `@sb/spec` (`packages/spec/src/assets.ts`). The inventory kind `shape` becomes `mask`. A spec field holds the id's name part. Drawings hold the full id, because one field spans two kinds.
4. **Contrast over photos is checked against the worst case.** A scrim must pass over both a black and a white pixel. A guard enforces it and the repair raises the scrim. No photo analysis is needed.
5. **Per-site composed sheet.** `composed.css` stays the only source. Each site ships its own filtered `composed-<sha10>.css` in `RenderedSite.files`, containing only the families it uses. Sites without composed sections or studio features keep exactly today's bytes.
6. **Motion (owner decision D2: allow).** A ribbon may loop as a marquee, with a visible pause control; a `counter` preset counts a fact up to a number the client gave. Every animation runs under reduced-motion and `@supports` guards, and the final state is the default: the counter's final value is in the HTML from the start, and reduced motion or no JS shows the still ribbon and the final number.
7. **F1b ships the mechanisms plus 1–3 starter names per vocabulary.** The batches fill them. Drawings are path data (one `Drawing` format), so asset makers can start now.

## 1. Composition language v2 (spec v20)

### 1.1 Vocabularies (`packages/spec/src/composition/vocab.ts`, new)

Each list is `readonly string[]`, **append-only** (a snapshot test fails on removal or rename). The guard checks membership. A name's asset id is `<prefix>/<name>` (§4). F1b ships the starters below and batches append.

| List | F1b starters | Filled by | Used by field |
|---|---|---|---|
| `MASKS` | none, arch, circle, cut, stamp, ticket | I4 → 30 | `image.mask`, `photos.mask` |
| `IMAGE_TREATMENTS` | none, duotone, tint, grain | I4 → 16 | `image.treatment`, `photos.treatment`, photo layer |
| `TEXTURES` | none, grain, lines | I4 → 12 (+none) | `surface.texture` |
| `EDGES` | straight, rule, cut, torn, drawing | I5 → 20 | `top.edge` |
| `FACT_OBJECTS` | numeral, plate, stamp, ticket, seal, tag | I6 → 20 | `fact.treatment` |
| `TYPE_TREATMENTS` | none, stacked, knockout | I6 → 15 | `heading.treatment` |
| `MOTIONS` (+ `MOTION_META`) | reveal, unmask | I7 → 20 | section `motion` |
| `WORDMARK_STYLES` | plain | I9 | `design.wordmark.style` |
| `DRAWINGS` (+ `REPEATABLE`) | 2 sample drawings | I5 | `decor.drawing`, drawing layer, list marker, ribbon separator, edge drawing |
| `PRACTICAL_FACTS` (fixed 40) | parking, free-parking, bike-parking, ev-charging, public-transport, wheelchair, step-free, accessible-toilet, lift, card, contactless, cash-only, invoice, gift-voucher, wifi, toilets, baby-change, kids-welcome, play-corner, pets-welcome, no-pets, terrace, garden, air-con, takeaway, delivery, home-visits, pickup-service, emergency, appointment-only, walk-ins, online-booking, phone-booking, vegetarian, vegan, gluten-free, local-produce, english, german, italian | I9 icons | `iconFacts`, `business.amenities` |

`MOTION_META[name] = { kind: "entrance" | "scroll", targets: ElementKind[], safeAtLoad: boolean, js: boolean, minLevel: "calm" | "lively" }`.

```ts
const Name = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const Vocab = (list: VocabKey) => z.string().regex(Name).max(40).meta({ "x-vocab": list });
export const DrawingId = z.string().regex(/^(motif|ornament)\/[a-z0-9-]+(\/[a-z0-9-]+)?$/).meta({ "x-vocab": "drawings" });
```

v19's closed enums (`image.mask`, `image.treatment`, `fact.treatment`, `surface.texture`) become `Vocab(...)`. Every v19 value stays valid, so the migration is identity. `decor.motif` stays `z.enum(MOTIFS)` (the legacy code-drawn motifs). Consumers of the old enum options (inventory `sources.ts` IMAGE_MASKS / IMAGE_TREATMENTS / FACT_TREATMENTS, I8 `deck.ts`) read the vocab lists instead.

### 1.2 Shared additions

```ts
Place += {
  tilt:   z.number().int().min(-8).max(8).optional(),        // degrees, desktop only (G10)
  bleedX: z.enum(["start", "end", "both"]).optional(),       // to the page edge; image, photos, decor (G11)
  bleedY: z.enum(["top", "bottom"]).optional(),              // past the section edge, ≤ its padding; decor, ribbon, sticker (G11)
};
PhonePlace.span: z.enum(["full", "inset", "half", "bleed"]);  // bleed: edge to edge; image, photos, decor (G12)

const Paint = { color: ColorRole.optional(), fill: ColorRole.optional() }; // text colour / own ground (G9)
const Scrim = z.strictObject({ role: ColorRole, strength: z.number().int().min(1).max(4) }); // opacity .35 .5 .65 .8
```

`Paint` goes on heading, text, list, fact, prices, hours, contact, quote, sticker, ribbon, iconFacts. `map` and `wordmark` take `color` only. Action styles stay token-driven.

### 1.3 Section level (`ComposedProps` additions, all optional)

```ts
background: z.array(z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.enum(["field"]), role: ColorRole,
    cols: z.strictObject({ from: Col, to: Col }).optional(),            // default 1–12; touching 1 or 12 bleeds to the page edge
    rows: z.strictObject({ from: Row, to: Row }).optional() }),
  z.strictObject({ kind: z.enum(["photo"]), image: ImageRef, treatment: Vocab("IMAGE_TREATMENTS").optional(),
    scrim: Scrim, phone: z.enum(["band", "cover"]).optional() }),       // phones: band (default) = photo above the content
  z.strictObject({ kind: z.enum(["drawing"]), drawing: DrawingId, scale: z.number().int().min(1).max(4),
    anchor: z.enum(["start", "center", "end"]), color: ColorRole.optional() }), // 4 = larger than the section, cropped
])).min(1).max(2).optional(),
top: z.strictObject({ edge: Vocab("EDGES"), drawing: DrawingId.optional(),     // drawing iff edge "drawing"
  rise: z.number().int().min(0).max(2).optional() }).optional(),             // overlap: rises over the previous section
motion: Vocab("MOTIONS").optional(),
pin: z.strictObject({ col: Col, span: Col }).optional(),                    // desktop sticky column
headerOver: z.boolean().optional(),                                         // first section only: the header sits over it
surface.texture: Vocab("TEXTURES")                                          // was enum
```

`Col` is an int 1–12 and `Row` an int 1–`MAX_ROWS`. The rest of `surface` is unchanged: `surface.divider` (bottom) keeps none|rule|motif.

### 1.4 Extended kinds

```ts
heading  += { treatment: Vocab("TYPE_TREATMENTS").optional(), fillImage: ImageRef.optional() /* photo-fill only */, ...Paint }
text     += { dropCap: z.boolean().optional(), ...Paint }
list     : items: z.array(z.union([text(120), z.strictObject({ lead: text(24), text: text(120) })])).min(1).max(8)
           marker: z.enum(["none", "rule", "dot", "dash", "line", "drawing"]).optional()   // line = timeline rail
           += { drawing: DrawingId.optional() /* iff marker drawing */, weight: z.enum(["regular", "medium", "bold"]).optional(),
                size: z.number().int().min(0).max(2).optional(), ...Paint }
fact     : treatment: Vocab("FACT_OBJECTS")
           += { link: LinkTarget.optional() /* the whole object is the link */, labelAt: z.enum(["after", "before"]).optional(),
                plateCode: z.boolean().optional(), ...Paint }
image    : mask, treatment → Vocab; += { scrim: Scrim.optional() }
prices   : style: z.enum(["rows", "plates", "tags", "leaders", "board", "docket", "sheet"])
           += { phoneColumns: z.number().int().min(1).max(2).optional(), size: z.number().int().min(0).max(2).optional(),
                plateCode: z.boolean().optional(), ...Paint }
decor    += { drawing: DrawingId.optional() /* exactly one of motif | drawing | svg */, color: ColorRole.optional(),
              fit: z.enum(["cell", "fixed"]).optional(), size: z.number().int().min(1).max(10).optional() /* fixed: size × 2 rem */,
              repeat: z.enum(["x"]).optional() /* a strip; REPEATABLE drawings only */ }
```

### 1.5 New kinds (discriminators as one-value `z.enum`)

```ts
photos    { kind:["photos"], images: z.array(ImageRef).min(2).max(12),
            arrangement: z.enum(["fan", "stack", "offset-pair", "strip", "before-after"]),
            mask?: Vocab("MASKS"), treatment?: Vocab("IMAGE_TREATMENTS"), captions?: z.array(text(80)).max(12) }
wordmark  { kind:["wordmark"], size: z.number().int().min(2).max(8), color? }
ribbon    { kind:["ribbon"], items: z.array(text(40)).min(1).max(6), separator?: DrawingId,
            move?: z.enum(["still", "drift"]), ...Paint }
sticker   { kind:["sticker"], text: text(32), shape: z.enum(["round", "oval", "rect", "tag"]), ...Paint }
map       { kind:["map"], style: z.enum(["street", "corner", "pin"]), cross?: text(40), note?: text(80), color? }
iconFacts { kind:["iconFacts"], items: z.array(z.strictObject({ fact: Vocab("PRACTICAL_FACTS"), note: text(60).optional() })).min(1).max(8),
            icons?: z.enum(["line", "solid", "cut"]), ...Paint }
quote     { kind:["quote"], text: text(400), by?: text(60), size?: z.number().int().min(0).max(4), ...Paint }
```

How each §7.2 row is expressed:

| §7.2 | v20 | Why |
|---|---|---|
| collage, galleryStrip, beforeAfter | `photos` arrangements | Same data (a set of the client's photos) and the same fact rule. A single unit keeps its own phone layout and LCP. |
| wordmark | `wordmark` (new) | No text field: the name comes from `business` and the style from `design.wordmark`. |
| factObject | `fact.treatment` grows to 20 | Already the fact-object slot. A new kind would duplicate value, label and size. |
| typeTreatment | `heading.treatment`, `text.dropCap` | They are still headings, so h1 and order rules apply unchanged. |
| marquee, ribbon | `ribbon` (+ motion preset `drift`, scroll-linked, or `loop`, a marquee with a pause control) | Structure is a kind and movement is a motion preset. One kind. |
| sticker | `sticker` (new) | Short copy on its own ground, not a fact (no value). Needs the rating/award ban. |
| map | `map` (new) | A drawn object built from the address. Contact lines can't carry its geometry or phone layout. |
| timeline | `list` items with `lead` + `marker: "line"` | Dated steps are a list. checkFacts already checks numbers in leads. |
| menuBoard | `prices.style` leaders, board, docket, sheet | Same items. Only the presentation differs. |
| iconFacts | `iconFacts` (new) | Keys from a closed list with icons chosen by code, so it can't be a feature-card row. |
| quote | `quote` (new) | Needs the verbatim rule and is never translated. |

The engine's `COMPOSED_LAYOUT_KEYS` (skipped by facts and translation) adds `arrangement, edge, rise, motion, pin, headerOver, kind, role, cols, rows, scale, anchor, strength, fit, repeat, labelAt, plateCode, phoneColumns, marker, weight, shape, move, icons, color, fill, bleedX, bleedY, tilt, treatment, mask, drawing, separator, style, fact` (with `fact` only under `iconFacts.items`). The builder checks each key against the existing list.

### 1.6 Outside the section (all optional, never in model requests with the designer off)

- `design.motion?: z.enum(["still", "calm", "lively"])`. Absent counts as calm.
- `design.wordmark?: z.strictObject({ style: Vocab("WORDMARK_STYLES"), role: z.enum(["display", "text"]).optional() })`. A typographic wordmark only, never a drawn symbol (§6.5).
- `business.amenities?: z.array(Vocab("PRACTICAL_FACTS")).max(20)`. Comes only from the client's input or the owner. F1b adds the field. Filling it from the brief is a Phase 2 change behind `designer.agent`, because the brief schema is part of model requests.
- `LANGUAGE_VERSION = 2` (exported). I8's `needs: "f1b"` cards are dealt when it is ≥ 2.

### 1.7 The 15 F1b gaps

| Gap | Expressed by |
|---|---|
| fact as a tap target | `fact.link` (LinkTarget); counts in the one-call rule (G14) |
| flat photo scrim at a chosen opacity | `image.scrim`, photo layer `scrim` (G3) |
| full bleed; drawings past the cell or section | `desk.bleedX`, `desk.bleedY`, `phone.span: "bleed"`, drawing layer `scale: 4` |
| header over a composed opener | `headerOver` (G4) |
| per-element colour roles | `Paint` (`color`, `fill`) (G9) |
| fact label above the value | `fact.labelAt: "before"` |
| list bullets and weights | `list.marker` dash/line/drawing, `list.weight`, `list.size` |
| bigger price plates, 2 per row on phones, plate town code | `prices.size`, `prices.phoneColumns`, `plateCode` (code-derived, §1.8) |
| tilt for seals and facts | `desk.tilt` (G10) |
| dividers at the section's top edge | `top.edge` (+ `rise`, `drawing`) (G5) |
| honest quote | `quote` (verbatim, F-rule) |
| dotted-leader price rows | `prices.style: "leaders"` |
| texts narrower than 4 columns side by side | TEXT_SPAN relaxation (G13) |
| fixed-size drawings | `decor.fit: "fixed"` + `size` |
| repeating pattern strips | `decor.repeat: "x"` with a REPEATABLE drawing (G19) |

### 1.8 Fact rules (engine `checkFacts`, `packages/engine/src/facts.ts`)

| Element | Values may come only from | Check |
|---|---|---|
| `photos` | the client's photos (`origin: "client"`) for strip and before-after; collage the same | reject if any image is `generated`. before-after also needs both photos' client captions or notes to say which is before (prej/potem, before/after); the labels are UI strings |
| `wordmark` | `business.name` / `business.logo` | no text field |
| `ribbon`, `sticker` | the copy or the client's facts | numbers via checkFacts; banned-copy list; sticker and ribbon never a rating, award, certificate or superlative (★, /5, ocena, nagrad, priznanj, certifik, najboljš, št. 1, #1) unless verbatim in the input |
| `map` | `business.address` | `cross` and `note` verbatim from the input (normalised whitespace and quotes). The drawing is schematic: no landmarks, no scale |
| `iconFacts` | `business.amenities` | every `fact` key is in amenities; `note` via checkFacts |
| `quote` | the client's input, verbatim | `text` and `by` are normalised substrings of the input corpus, else reject. Never translated (other locales render it with `lang` of the source) |
| `list` leads | client dates and numbers | checkFacts on every lead; NUMBERED_LABEL on leads |
| `fact.plateCode`, `prices.plateCode` | code: town → registration area (LJ MB CE KR NM KP GO PO MS KK SG), a fixed table in `@sb/spec` | unknown town → no code; the model never writes it |
| `heading` giant numeral | client facts | checkFacts (unchanged) |

### 1.9 Migration 19 → 20

`SPEC_VERSION = 20`. `migrate.ts` adds an identity step (everything is additive or widening). Test: every golden, `tools/eval/composed/{m,s,j}.json` and a v19 spec with every v19 enum value migrate to deep-equal objects with `version: 20`. Vocabulary growth after v20 is not a schema change (the zod structure is unchanged, stored specs stay valid), so it needs no bump. The append-only snapshot is its test.

## 2. Guards (`packages/spec/src/composition/guards.ts`)

`CompositionContext` gains `colors?: Colors` (from `design.colors`), `business?: { phone, email, address, town, amenities, bookingUrl }`, `images?: Map<id, { origin }>`, `motionLevel?`, `approved?: ReadonlySet<AssetId>` (passed by the engine from the inventory; publish-time validation omits it) and `prev?: Section`. Contrast uses `contrast()` in `packages/spec/src/color.ts` plus a new `mix(hexA, hexB, alpha)`. "Large" means a heading of size ≥ 3, a fact value of size ≥ 4 or a sticker. Large text needs 3:1 and everything else 4.5:1. The ground comes from the tone (default→background, alt→surface, inverse→inverse, band→band ?? primary) or from a field layer covering the element. The default text role comes from `onRole(ground)`.

| # | Rule | Enforces | On failure |
|---|---|---|---|
| G1 | background ≤ 2 layers, ≤ 1 photo, ≤ 1 drawing; the photo exists and counts toward ≤ 2 uses per page | page weight, photo reuse | repair: drop extra layers |
| G2 | a text-bearing element lies wholly inside or wholly outside each field rect, unless it has its own `fill` | one ground per text | reject |
| G3 | text over a photo (layer, or overlapping an image with `scrim`): contrast of fg against `mix(scrim, #000, α)` and `mix(scrim, #fff, α)` ≥ threshold | contrast over any photo | repair: raise `strength` to the lowest that passes; at 4 still failing, drop `scrim` so the renderer's solid `.cx-over` panel applies |
| G4 | `headerOver` only on the page's first section with a field or photo layer; header text passes G3 or G9 at 360 and 1280 (on phones against the band photo, or the field) | legible header | repair: drop `headerOver` |
| G5 | `top`: not on the first section; `rise` only when this ground differs from the previous section's and that section has no `surface.divider`; `drawing` iff edge "drawing"; one divider per boundary | honest overlaps, no double dividers | repair: rise → 0; drop this `top` when the previous has a divider |
| G6 | `pin`: pinned elements lie wholly inside its columns, are contiguous in reading order, ≤ 4 elements, no image taller than 4:5, rows ≥ 3, and something outside the pin spans more rows | sticky column that fits a screen; DOM = phone order | repair: drop `pin` |
| G7 | motion: preset in MOTIONS and allowed at the level (still: none; calm: ≤ 3 sections per page, entrance only; lively: ≤ 5, scroll allowed); section 0 only `safeAtLoad` presets; ≤ 1 moving ribbon per page; `loop` only on a ribbon, which then renders a pause control; `counter` only on a fact whose value is a client number (checkFacts) | motion budget, LCP | repair: drop `motion` / `move` |
| G8 | every vocab name is in its list; with `ctx.approved`, its asset is approved | only real, approved assets | repair: mask, treatment, texture → "none"; type treatment → none; unknown edge → drop `top`; unknown motion → drop; fact object → "numeral"; drawing → drop the decor element or layer |
| G9 | `color`/`fill`: fg against its effective ground (own fill > field > tone) ≥ threshold; a background drawing is quiet (ink vs ground ≤ 1.6:1) and every text role in the section vs its ink ≥ threshold | per-element colours stay legible | repair: drop `color`/`fill`; drawing ink → `border` if that passes, else drop the layer |
| G10 | `tilt` only on fact (not numeral), sticker, image, photos, decor | no tilted running text | repair: drop `tilt` |
| G11 | `bleedX` only on image, photos, decor, and only toward a grid edge it touches (col 1 / col+span−1 = 12); `bleedY` only on decor, ribbon, sticker | no stray bleed, no horizontal scroll | repair: drop |
| G12 | `phone.span: "bleed"` only on image, photos, decor; `half` never on text, list, quote, prices | phone line length | repair: bleed → full, half → full |
| G13 | TEXT_SPAN: `text` spans 4–8, or 3 when size 0, one paragraph ≤ 140 characters, width wide or full, another text-bearing element of span 3–4 shares a desktop row, and it isn't part of a cardRow | short columns side by side, never a sliver | repair: clamp to 4 (as today) |
| G14 | `fact.link` resolves (call needs a phone, directions an address, booking a bookingUrl); a call link counts with action calls (≤ 1 per section) | tap targets that work; one call | repair: drop `link` |
| G15 | `plateCode` only on fact `plate` or prices `plates` | — | repair: drop |
| G16 | list: `marker: "line"` needs a `lead` on every item; `drawing` iff marker "drawing"; leads never match NUMBERED_LABEL | honest timeline; no "01/02" | reject (drawing mismatch: drop marker) |
| G17 | prices `phoneColumns: 2` only for plates/tags with names ≤ 24 characters | 360 px fit | repair → 1 |
| G18 | decor: exactly one of motif, drawing, svg; `size` iff `fit: "fixed"` | — | reject |
| G19 | `repeat` only with a REPEATABLE drawing (never svg); REPEATABLE assets pass the dot/grid detector (INV-1) and the owner's gallery | banned dot/grid patterns | repair: drop `repeat` |
| G20 | heading.treatment limits: `vertical` size ≥ 4; `circle` ≤ 40 characters, size ≥ 2; `photo-fill` size ≥ 6, needs `fillImage` and a duotone/tint photo whose two roles each reach 3:1 against the ground; `knockout` only over a photo or field and passes G3; `stacked` ≤ 4 lines; UPPERCASE_MIN still applies | legible display type; no italic accent words or tracked caps (no field can express them) | repair: drop `treatment` |
| G21 | photos: fan/stack/offset-pair 2–4 images, strip 3–12, before-after exactly 2; each image counts toward ≤ 2 uses | — | reject |
| G22 | sticker ≤ 1 per section, ≤ 2 per page; wordmark ≤ 1 per page outside the header; quote ≤ 1 per section | restraint | repair: drop the extras (sticker, wordmark); reject (quote) |
| G23 | TEXT_KINDS += photos captions, ribbon, sticker, map, iconFacts, quote, wordmark: never hidden on phones, never overlap text | words always shown | existing repair (unhide) |
| G24 | display sizes count `quote` size 4 and giant-numeral headings | 1 per section, 2 per page | reject (as today) |
| G25 | cardRows treats iconFacts, sticker and fact (any treatment) as the icon block | no three-card row | reject (as today) |

**Banned-pattern enforcement in code:**
- No gradients, blur or `backdrop-filter`: the existing sheet grep test covers `composed.css`.
- Scrims and fills are flat opaque roles, and `.cx-over` stays at least 0.92 opaque. There is no glassmorphism path.
- No accent single-side border: a components test greps `composed.css` for `border-(left|right|inline-start|inline-end)` in primary or accent roles, and the quote renders without a bar.
- No dot or grid patterns: G19, the INV-1 detector on textures and repeatable drawings, and no `svg` repeats.
- No numbered labels: G16.

**Phone behaviour:**

| Feature | Phones (< 64 rem) |
|---|---|
| field layer | A band spanning the phone rows of the elements inside it. Those must be contiguous in reading order (part of G2). Full bleed. |
| photo layer | `band` (default): the photo above the content at 4:3, header and scrim on the band. `cover`: behind the content, G3 checked. |
| drawing layer | Cropped by the section, at most 100vw. It may be hidden (decor). |
| top edge, rise | Edge depth halved, rise × 0.75 rem instead of 1.5 rem. |
| pin, tilt, bleedY, heading rotate/vertical | Off: a static stack, no rotation, nothing past the section. |
| motion | lively runs as calm, distances halved; reduced motion: none. |
| photos | fan/stack/offset-pair in a fixed 4:5 box at preset offsets; strip: an inner scroll-snap row (80 % items, `tabindex=0`, `role=region`, labelled), never page scroll; before-after stacked, labelled. |
| ribbon | Wraps when still; drift clipped to its own box. `loop`: a pause/play button (≥ 44 px, `aria-pressed`, Slovene label) in the ribbon's box; the loop also pauses off-screen and on hover/focus, never runs under reduced motion, and the moving copy is `aria-hidden` next to a static copy for screen readers (WCAG 2.2.2). |
| map | Full width, height ≤ 60 vh, directions link ≥ 44 × 44. |
| fact.link | The whole object is a ≥ 44 × 44 target. |
| iconFacts | One column; two per row when every label ≤ 16 characters. |
| prices phoneColumns 2 | Two plates per row from 360 px. |
| decor fixed | width `min(size × 2rem, 40vw)`. |
| circle text | Circle at `min(60vw, 14rem)`, real heading text visually hidden, SVG `aria-hidden`. |

### 2.1 Director's notes after the guards and facts scout (2026-10-11)

- **G23 photos captions:** a `photos` element whose arrangement shows captions counts as text-bearing: it can't be hidden on phones and its box never overlaps other text. Without captions it is an image (the second-photo hiding rule applies).
- **G24:** there is no "giant numeral" heading field. Display sizes count `heading` at size ≥ 4 (as today), `fact` (as today) and `quote` at size 4; no other kind.
- **CompositionContext** (`guards.ts:23-32`, built by `compositionContext` at :35-42, called from `validate.ts:99`) gains the optional fields §2 names: `colors`, `business` (for amenities and plate codes), `images` (origin, for before-after), `motionLevel`, `approved` (asset ids allowed at runtime; absent = vocab membership only), `prev` (the previous section, for top/rise). F1b-2a defines the type and the builder; 2b fills the checks.
- **Not wired yet:** the engine never calls `repairComposition` or `composedFallback` (only tests do). With the designer off this is fine; Phase 2 (S-units) wires repair → validate → fallback. F1b does not.
- **Owner amenities survive regeneration:** `packages/engine/src/owner-facts.ts:10` `FACTS` gains `amenities` (F1b-3).
- **Plate codes** already exist (`packages/spec/src/format.ts:67-82`, `PLATE_CODES`, `plateCode()`); F1b-3 reuses them.
- **Loop and counter (D2) in the schema:** the marquee is `ribbon.move: "loop"` (beside still and drift) and the counter is `fact.count: boolean` (both layout keys). G7: `loop` needs level lively and renders a pause control (R2); `count` only on a fact whose value is a plain whole number found in the client facts (checked by guards when `ctx.business` is given, and by F1b-3/I7). Their guard tests are written in I7.
- **G4 header contrast** is not a guard (the context has no header tone); R1’s `composed-v2.css` makes the header over the opener follow section 0’s tone, and F1b-A checks it in the browser at 360/1280.
- **G24 heading size:** today’s code counts headings from size 6 and facts from 7; that stays (the design’s “≥ 4” was a misreading).
- **Quotes are never translated:** `isCopy` (`packages/spec/src/translatable.ts:58-62`) gains the quote case (F1b-3).

## 3. Renderer

### 3.1 Hooks

| Feature | Where |
|---|---|
| background layers, `pin` wrapper, `top` edge/rise classes, `motion` class, `headerOver` | `groups/composed/index.tsx` `Composed`. Layers are first children (`.cx-bg-field`, `.cx-bg-photo` + `.cx-scrim-<n>`, `.cx-bg-art`, all `aria-hidden` except the photo's `alt`). Pin is `.cx-pin` (display: contents below 64 rem). The section gets `cx-edge-<e>`, `cx-rise-<n>`, `cx-mo-<m>`. |
| header over | `packages/render/src/site.tsx` page shell: `data-hdr="over"` on `<body>` only when section 0 has `headerOver`. Header markup is unchanged and its rules are in `composed.css`. |
| LCP | `composedLcp`: section 0's photo layer first, then the first image or photos image. `firstImage` learns `photos`. |
| tilt, bleed, phone bleed, Paint | `elements.tsx` `placement()`: `--tilt` (number), classes `cx-bx-*`, `cx-by-*`, `cx-ps-bleed`, `cx-fg-<role>`, `cx-bg-<role>` (role → var from `layout.ts` ROLE_VAR). No inline colour or size. |
| extensions | `Heading` (`cx-tt-<t>`; circle = inline SVG textPath), `TextBlock` (drop cap), `ListBlock` (leads, markers), `FactBlock` (`<a>` around the object, label order, plate code), `PricesFact` (`facts.tsx`, styles, columns, plate code), `DecorDrawing` (`decor.tsx`: drawing ids, fixed size, repeat as an SVG `<pattern>` inside the inline SVG) |
| new kinds | new files `groups/composed/kinds/{photos,wordmark,ribbon,sticker,map,icon-facts,quote}.tsx`, cases appended to `ElementView` |
| drawings | `packages/components/src/drawings/Drawing.tsx` renders `Drawing` data (`drawings/data/<kind>/<name>.ts`). Line style uses `vector-effect: non-scaling-stroke`, ≥ 1.5 px. Colours are roles only. Schema `Drawing` in `@sb/spec`: `{ id, style: line\|solid\|cut, viewBox: [w, h] (8–400), paths: DecorPath[1–24], repeat?: { axis: "x", gap } }`. |
| contrast panel | `layout.ts` `overPhoto()`: no panel when the element's scrim passes G3, its own `fill` is set, or it sits on a field layer. |
| JS | Only `motion` presets with `js: true` and the photos strip's optional buttons. Islands in `packages/components/islands/`, added to the shared bundle **after the hash** (as `composedStylesheet` is) and linked only on pages that use them. |

### 3.2 CSS strategy

- `packages/components/styles/composed.css` is the only CSS source for composed sections, wordmarks and motion. It has fixed regions with marker comments: **core** (today's grid, placement, base elements), **v2 section**, **v2 kinds**, **v2 extensions**, **vocab** (one block per name: `cx-mask-*`, `cx-tr-*`, `cx-tex-*`, `cx-edge-*`, `cx-fact--*`, `cx-tt-*`, `cx-mo-*`, `wm-*`). Parallel builders edit only their own region.
- **Per-site sheet.** `composedSheetFor(spec)` (`packages/render/src/shared.ts`, replacing the single `composedStylesheet()`) minifies once, then keeps core plus the selectors whose feature classes (`cx-el--<kind>` for new kinds, and the vocab families) the site uses. This is the same selector-level filter as `stylesheetFor`. The used set is `composedFeatures(spec)` (components). It also drops `--shape-*` declarations no kept rule references. The output is `composed-<sha10>.css` in `RenderedSite.files`, linked with the page's relative depth from pages with a composed section or (header/footer) `design.wordmark`. The preview route serves `RenderedSite.files` for the draft. A test renders all fixtures plus a fuzz over every vocab name and asserts every `cx-` class in the HTML has its rules in that site's sheet.
- **clip-path** only as `var(--shape-*)` (the existing components test). New masks and edges add tokens to the token block. Edge tokens are `--shape-edge-<name>`, rem-based, halved on phones via a second token.
- **Motion.** `@keyframes` live only in the vocab motion blocks. Start states and animations sit inside `@media (prefers-reduced-motion: no-preference)`, scroll-driven ones also inside `@supports (animation-timeline: view())`. No `infinite`. Only transform, opacity and clip-path (via tokens) are animated. A CSS test parses the sheet and fails on any violation.
- **Budgets** (minified):

| What | Budget |
|---|---|
| core | ≤ 16 KiB (today the whole sheet is ≈ 12.9 KB) |
| any site's sheet, measured on the kitchen-sink fixture | ≤ 24 KiB |
| mask | ≤ 2 KiB |
| treatment | ≤ 2 KiB |
| texture (data-URI tile) | ≤ 2 KiB |
| edge | ≤ 2 KiB |
| fact object | ≤ 2 KiB |
| type treatment | ≤ 1.5 KiB |
| motion | ≤ 1 KiB CSS; JS presets share one island ≤ 3 KiB gzip |
| motif drawing | ≤ 6 KiB |
| ornament | ≤ 8 KiB |
| icon | ≤ 1 KiB |
| wordmark style | ≤ 1.5 KiB |

  `COMPOSED_SHEET_BUDGET` becomes `COMPOSED_CORE_BUDGET` + `COMPOSED_SITE_BUDGET` in `packages/inventory/src/checks.ts`.

### 3.3 What stays byte-identical, and preview = published

With `designer.agent` off, nothing may change:
- `packages/render/test/composed-goldens.test.ts`: every golden page's HTML, every shared CSS file and the bundle hash.
- Engine request snapshots: composed is `designerOnly`, and the new `design`/`business` fields are never in the model's schema.
- No new rule in base, chrome or site sheets.
- Nothing new in the shared bundle before the hash.

The m/s/j composed fixtures change on purpose (the sheet becomes a site file).

**Proposed test** `apps/web/test/composed-preview.test.ts`. For m, s, j and the kitchen-sink v20 fixture:
1. Create the site in the test app, publish, and fetch every page from `/s/<slug>/` and from `/preview/<id>/`. The HTML must be byte-equal.
2. Follow each page's composed sheet link in both. The bytes must be equal, and equal to `composedSheetFor(spec).css`.
3. Every `cx-` class in the HTML must be covered by that sheet.
4. Once, in Playwright at 360 and 1280, compare preview and published screenshots pixel for pixel. Also assert no horizontal scroll at 360 and that every link and button box is ≥ 44 × 44 except text links in running text.

### 3.4 Director's amendments after the renderer scout (2026-10-11)

The code differs from §3.1–3.3 in six places. These rules replace the matching parts of §3.1–3.3 and §1.3, and the renderer units build to them.

1. **Two shared sheets instead of a per-site sheet.** `composed.css` today ships in the shared bundle (`packages/render/src/shared.ts:185`, after the hash). The preview serves only HTML and `/preview/_shared/:hash/*` (`apps/web/src/app.ts:976, 999`), so a sheet in `RenderedSite.files` would 404 in the preview. Instead:
   - `composed.css` stays as it is: the **core** sheet (v19 features), byte-identical, linked exactly as today.
   - A new `composed-v2.css` holds every v20 addition (section background/top/motion/pin/headerOver, the 7 kinds, the extensions, vocab assets). It is minified and content-addressed like the core sheet (`composed-v2-<sha10>.css`), added to the bundle **after** the hash, and linked only on pages that use a v20 feature. One helper decides both links: `composedSheets(doc, page) → ("core" | "v2")[]`, extensible for `design.wordmark` (I9a).
   - Budgets: core ≤ 16 KiB minified (today 12.5 KiB), v2 ≤ 16 KiB, the pair ≤ 28 KiB. The inventory's `COMPOSED_SHEET_BUDGET` checks each sheet.
   - §3.3's preview = published test compares the HTML and both sheets' bytes as fetched from preview and published routes. No new preview route.
2. **New islands go after the hash.** Islands are read into the bundle **before** the hash (`shared.ts:169-172`), so a new island would change every golden. Composed JS (motion presets that need JS, the marquee pause and the counter) lives in `islands/composed/*.js`, added after the hash like the sheets, and is linked only on pages that use it.
3. **Animation guards.** Scroll-driven presets use `@supports (animation-timeline: view())` (entrance on view) or `scroll()` (scroll-linked drift), and `@media (prefers-reduced-motion: no-preference)`. Only `transform`, `opacity` and `clip-path` (through `--shape-*` tokens) animate; never `visibility`, layout properties or colour. The default (unsupported, reduced motion) is the final, still state.
4. **headerOver positioning.** The default header is static (`chrome.css:9-13`); skeleton families can be sticky (`skeleton.css:36-40`); `.site-header--overlay` is already used by the hero-photo family (`skeleton.ts:111-126`) and must not be reused. `headerOver` sets `data-hdr="over"` on `<body>` and the rules live in `composed-v2.css`: a static header becomes absolute over section 0 with a transparent background and the composed opener gets top padding equal to the header height; a sticky header stays sticky, section 0 is pulled up under it (negative margin of the header height) and the header turns solid once scrolled (scroll-driven, `@supports`), solid without support. Text colour over the opener follows section 0's tone so contrast holds (G-rule on contrast applies to the header too). Both header kinds get a test at 360 and 1280.
5. **Regions in the sheets.** `composed.css` has no region markers. The core sheet is frozen (no edits except bug fixes). `composed-v2.css` starts with marker comments `/* region: section */`, `/* region: kinds */`, `/* region: extensions */`, `/* region: vocab */`; R1 owns `section`, R2 `kinds`, R3 `extensions`, the batches `vocab`.
6. **LCP.** `firstImage` (`layout.ts:69-71`) only looks at `image`; R1 extends LCP to a background photo layer and R2 to `photos`.

## 4. Asset ids

One table in `packages/spec/src/assets.ts` (new): `ASSET_KINDS`, `KIND_PREFIX`, `AssetId`, `assetId(kind, name)`, `parseAssetId(id) → { kind, name }`. The inventory re-exports it and I8 imports it.

| Kind | Prefix | Spec field holds | Example |
|---|---|---|---|
| font, pairing, palette | font, pairing, palette | — | `pairing/archivo-source` |
| section, composition | section, composition | — (presets) | `composition/prices/receipt-column` (intent from spec INTENTS) |
| mask (**renamed from shape**) | mask | name | `image.mask: "arch"` ↔ `mask/arch` |
| treatment (also site imagery) | treatment | name | `treatment/duotone` |
| texture, divider | texture, divider | name (`surface.texture`, `top.edge`, `surface.divider`) | `divider/torn` |
| motif, submotif, ornament | motif, submotif, ornament | full id in `drawing` fields; name in v19 `decor.motif` | `motif/bakery/peel-line`, `ornament/beehive-panel` |
| typeTreatment | type-treatment | name | `type-treatment/stacked` |
| factObject | fact | name | `fact/plate` |
| icon | icon | — (code picks `icon/<style>/<fact>`) | `icon/line/parking` |
| motion | motion | name | `motion/reveal` |
| wordmark (new kind) | wordmark | name | `wordmark/stamp` |
| header, footer, stance, constraint, reference | same as kind | — | `stance/workshop-docket` |

Drawing names end in their style: `motif/<trade>/<subject>-<line|solid|cut>`, with a matching `tags.mood` entry (test). Tests:
- Every vocab name has a registered asset of its kind (draft or approved), and every registered asset of a vocab kind is in the list.
- Every asset in a sheet renders.
- `KIND_PREFIX` exists only in `@sb/spec`.

**I8 must change before it merges** (after F1b-0):
1. Drop its own `ASSET_KINDS`/`AssetId` and import from `@sb/spec`.
2. Rewrite `imagery/x` → `treatment/x` and `typeTreatment/x` → `type-treatment/x`. `mask/x` resolves after the rename. Move the 4 `shape/x` refs (genome shapes) out of `signatures` into `axes.shape`.
3. Composition refs use spec intents (`hero`, not `opener`).
4. Replace `assetKnownToday` with `resolveSignature(id, registry) → "resolved" | "pending" | "unknown"`. Pending means the kind's batch hasn't merged (`KIND_COMPLETE` in inventory grows per batch). A test fails on any `unknown`. The 8 absent motifs either change to existing names or go on I5's must-draw list.
5. Read fact and mask names from vocab, not schema enums.
6. Deal `needs: "f1b"` cards when `LANGUAGE_VERSION >= 2`.

Signatures stay hints: the shortlist boosts them and nothing at runtime requires them.

## 5. Inventory batches

**Common flow per asset unit:**
1. An asset maker (Opus, high effort) draws or writes the drafts, with a one-line provenance note for ornaments.
2. A Haiku mechanic registers them (`sources.ts`, vocab line, status `draft`) and runs `pnpm inventory:sheet --kind <k>`: 360 and 1280 px, three grounds, two palettes.
3. CI runs the per-asset checks: render, axe, no horizontal scroll, banned, contrast in every tagged palette, byte budget, licence.
4. The director verifies the sheet and the checks and opens the PR. Drafts never reach the runtime, so merging is safe.
5. The director updates the gallery artifact and the owner approves or rejects, or approves everything.
6. The director exports the gallery rows. A mechanic writes `packages/inventory/src/decisions.json` (`id → status, at, reason`) and `sources.ts` reads statuses from it.
7. Rejections stay registered as `rejected` (taste data).

**Pilot gate:** motifs, ornaments and icons start with a pilot of 10–12 that the owner rates. The family proceeds when at least 70 % are approved. Otherwise the style brief is revised first. Targets are ceilings.

| Batch | Units (→ §8) | Needs F1b? | Checks beyond the common flow | Gallery |
|---|---|---|---|---|
| **I3** compositions wave 1, 120 = today's 81 variants re-expressed + 39 new from the 19 references and v2 | I3-0 format, I3a 81, I3b 39 | I3-0 and I3a: no (v19 features); I3b: yes | Each preset, filled by `fillPreset` from 3 fixtures (pekarna-kvas, avtoservis-mrak, instalacije-rebernik), passes the guards with 0 issues, renders at 360/1280, axe-clean. No slot marker survives filling (engine guard rejects `\{[a-z][a-z0-9.\[\]]*\}` in composed strings). I3a: a side-by-side sheet (variant vs preset). Coverage: hero 22, page-head 4, story 10, services 8, products/rooms 4, prices 8, menu 6, highlights 10, contact/area 10, hours 6, team 6, gallery 8, steps 6, faq 4, call/booking 8. | filled presets, one sheet per intent |
| **I4** imagery | I4a masks +25 (to 30), I4b composed treatments +13 (to 16), I4c textures 12 | the vocab list (F1b-1), not the renderer | Masks: clip-path via tokens, 3 ratios. Treatments: roles only, no gradient or blur. Textures: data-URI tile, dot/grid detector, contrast at the texture's max alpha. | photo set × 3 grounds |
| **I5** drawings | I5-p pilot, I5a ≈ 50 line, I5b solid and cut where they read (≤ 100), I5c ornaments 24, I5d edges +15 (to 20) | I5-p, I5a–c: no (Drawing format, INV-1 sheet); I5d: F1b-R1 | `Drawing` schema, ≤ 24 paths, budgets, stroke ≥ 1.5 px at the smallest size, REPEATABLE pass the detector, 8 must-draw motifs from I8 | per trade; edges between two sections |
| **I6** type and facts | I6a type treatments +13 (to 15), I6b fact objects +14 (to 20) | yes (F1b merged) | I6a: G20 limits as tests, real heading text in circle/vertical, banned (italic accent, tracked caps). I6b: values only from fixture facts, linked object ≥ 44 px, seal/badge never reads as an award (owner sheet). | each at sizes 2/5/8 |
| **I7** motion | I7a harness, MOTION_META tests, presets to 6 (F1b ships reveal, unmask); I7b 14 presets (≤ 2 JS on `@sb/morph`, e.g. decode headline with `aria-label`) | F1b-R1 | CSS-guard test (§3.2). Playwright at 360/1280 with 4× CPU throttle: CLS = 0, LCP Δ ≤ 100 ms against motion off. Reduced-motion screenshots equal static. JS ≤ 3 KiB gzip. `counter` (JS on `@sb/morph`): counts from 0 to the client's value once, on first view, ≤ 1.2 s; the element's text and `aria-label` hold the final value from the start (intermediate numbers are `aria-hidden`); only plain integers (a value with other characters stays still). `loop`: pause control test (keyboard, 44 px, reduced motion = still). | 3-frame strips (start/mid/end) |
| **I9** wordmarks and icons | I9a generator, I9-p 40 line icons, I9c solid + cut (80) | I9a: F1b-R2; icons: no | I9a: deterministic per name and seed; č š ž ć đ glyph check; 40-character names fit the 360 header; contrast; header/footer use only the site sheet; goldens unchanged. Icons ≤ 1 KiB, legible at 24 px, practical facts only. | 20 real Slovene business names × styles |
| **I10** references, 40 | I10a format and harness, I10b–e 4 × 10 | yes, and better after I4/I6 | Written as v20 site specs plus a fixture brief (decision D3). 0 guard issues, 0 invented facts, 360/1280, a gap note per reference (what the language couldn't say). Okus round-1 export. | Okus |

## 6. Order and parallelism

```
F1b-0 ─┬─────────────────────────────────────────────── I8-fix
       └─ INV-1 ─┬─ I5-p ─(owner pilot)─ I5a ─ I5b ; I5c ; I9-p ─(pilot)─ I9c
                 └─ I3-0 ─ I3a
F1b-1 ─┬─ F1b-2a ─ F1b-2b ─────────────┐
       ├─ F1b-3 ───────────────────────┤
       ├─ F1b-R1 ─┬─ F1b-R2 ───────────┼─ F1b-A ─ F1b-V ─ (owner merges F1b)
       │          ├─ F1b-R3 ───────────┘     │
       │          ├─ I7a ─ I7b               ├─ I10a ─ I10b..e
       │          └─ I5d                     └─ I9a (after R2)
       └─ I4a, I4b, I4c (vocab only)
F1b merged ─ I3b, I6a, I6b
```

The schedule has at most 3 building agents locally (builders, implementers, mechanics, asset makers; scouts and the reviewer don't count) and one overnight plan per night. F1b units branch from and merge into `claude/studio-f1b`, and one PR goes to main, as F1 did.

| Wave | Local (≤ 3) | Overnight (free) |
|---|---|---|
| 1 | F1b-0 (S), F1b-1 (M), INV-1 (M) | N1: I5-p + I9-p pilots (drawing format only) |
| 2 | F1b-2a (M), F1b-3 (M), F1b-R1 (L) | N2: I3a (81 re-expressions, v19) |
| 3 | F1b-2b (L), F1b-R2 (L), F1b-R3 (M) | N3: I4a–c (on the F1b branch's vocab) |
| 4 | F1b-A (M), I7a (M), I3-0 (S) → I8-fix (S) | N4: I5a (if the pilot passed) |
| 5 | F1b-V review; I5d (M), I9a (M) | N5: I5c ornaments |
| 6 (F1b merged) | I6a (M), I6b (M), I7b (M) | N6: I3b (mode W candidate: one worker per intent) |
| 7 | I10a (S), I9c (M), gallery fixes | N7: I5b; N8–N11: I10b–e (W candidate) |

Overnight sessions before F1b merges branch from `claude/studio-f1b` (or main for I3a and pilots) and touch only data files, sheets and the vocab region of `composed.css`.

## 7. Risks

- **The per-site sheet touches publish and preview.** Covered by the §3.3 test and the class-coverage fuzz. Fallback: ship the unfiltered sheet (one switch in render).
- **Catalogue growth raises Phase 2 cost.** F1b-1 reports the composed catalogue's token count before and after (expect ≈ +40 %). Vocab fields stay strings, and Phase 2 injects shortlist enums per call.
- **Worst-case scrims are heavy on desktop.** Phones default to `band`. Phase 2's photo analyst can store measured luminance per image later, and G3 may then use it. Not in Phase 1.
- **`headerOver` with a sticky header.** At the top the header is absolute over section 0. When stuck it turns solid via a scroll-driven animation, and stays solid without support. R1 must test both.
- **Scroll-driven animation support.** No polyfill: browsers without it show the final state.
- **composed.css merge conflicts.** Mitigated by the region rule, with R2 and R3 in disjoint regions and functions. The director merges them sequentially.
- **Quantity over taste.** Pilot gates, ceilings and the gallery. The asset maker may stop below target with a note.
- **Ornament provenance and legal.** Ornaments are drawn new, each with a provenance note, and the owner approves them.
- **Stance signatures name assets that never get approved.** Signatures are hints, and `resolveSignature` keeps unknowns at 0.
- **A new shared-bundle file before the hash changes every golden.** All new islands go after the hash, and the goldens test catches mistakes.

## Decisions for the owner

- **D1. Inventory names grow without a spec version bump. Decided: yes (owner, 2026-10-10).** New masks, fact objects, motions and so on are added to an append-only list checked by a guard, instead of v21, v22… per batch. Stored sites stay valid and a test forbids removals. *Recommendation: yes.* Otherwise every batch bumps the version and batches can't run in parallel.
- **D2. Motion: endless marquee and counter. Decided by the owner (2026-10-10): allow**, a looping marquee with a pause control and a number counter. Built with the rules in §0.6, G7, §3 (ribbon) and I7: pause control, reduced motion = still, final value in the HTML, counter only to a client number. Still ≤ 2 JS presets (counter is one of them).
- **D3. The 40 new references are made in the composition language. Decided: yes (owner, 2026-10-10).** (v20 site specs rendered by our renderer), not as free HTML like the 19 old ones. Each comes with a note on what the language couldn't say. *Recommendation: yes.* The director should be shown pages the studio can actually make, and the notes feed Phase 4 (scoped CSS).
- **D4. Pilot gates. Decided: yes (owner, 2026-10-10).** You rate a pilot of 10–12 (≈ 5 minutes each) before motifs, ornaments and icons are drawn in bulk. *Recommendation: yes.* If not, the director curates and you sample the gallery later.

## Units table

Sizes are agent time: S ≤ 1 h, M 1–3 h, L 3–6 h (real runs have been about half). Roles: builder = Opus medium (code); asset maker = Opus high (taste); implementer = Sonnet medium (fixed interface, tests given); mechanic = Haiku medium (exact list); reviewer = Opus.

| Id | Title | Depends on | Role / model | Size | Checks |
|---|---|---|---|---|---|
| F1b-0 | Asset id scheme in `@sb/spec`; inventory `shape` → `mask`; `wordmark` kind | — | implementer / Sonnet | S | every registered id parses; kind ↔ prefix round trip; no prefix table outside spec; inventory and spec tests green |
| F1b-1 | Schema v20, vocab lists, Drawing schema, `design`/`business` fields, migration 19 → 20, `LANGUAGE_VERSION` | — | builder / Opus | M | identity migration on goldens and m/s/j; a parse test per new field and kind, out-of-range rejects; vocab append-only snapshot; designer-off request snapshots unchanged; catalogue tokens reported |
| F1b-2a | Failing tests for G1–G25 and repairs | F1b-1 | builder / Opus | M | one positive, one negative and one repair test per rule, all red |
| F1b-2b | Guards and repairs | F1b-2a | implementer / Sonnet | L | F1b-2a green, no test edited; existing guard tests green |
| F1b-3 | Engine: fact rules (§1.8), plate-code table, layout keys, untranslated quotes | F1b-1 | builder / Opus | M | facts tests (quote verbatim ±, attribution, sticker ratings, before-after origin, amenities, leads); translation skips layout keys and quotes |
| F1b-R1 | Renderer section level, per-site sheet, preview serving, header over, LCP, motion hook with starters reveal and unmask | F1b-1 | builder / Opus | L | render tests per feature; sheet filter unit tests; composed-goldens unchanged; preview and published serve the sheet; sticky-header test |
| F1b-R2 | Renderer: 7 new kinds, `Drawing`, kinds region of the sheet | F1b-R1 | builder / Opus | L | render test per kind; axe; Playwright 360/1280 no horizontal scroll; strip keyboard and inner scroll; 44 px targets |
| F1b-R3 | Renderer: extensions (Paint, tilt, bleed, scrim, fact, list, prices, decor, heading hook) | F1b-R1 | builder / Opus | M | render tests; tilt and bleedY off below 64 rem; bleed without horizontal scroll; `overPhoto` cases |
| F1b-A | Acceptance: m/s/j in v2 closing all 15 gaps, kitchen-sink fixture, preview = published test, budgets | 2b, 3, R2, R3 | builder / Opus | M | gap checklist with screenshots 360/1280; §3.3 test; site sheet ≤ 24 KiB; core ≤ 16 KiB; full spec/components/render/web suites in CI |
| F1b-V | Review of the F1b diff | F1b-A | reviewer / Opus | M | report; blocking items fixed |
| INV-1 | Sheets for drawings, compositions, motion strips, icons, wordmarks; `decisions.json` sync; dot/grid detector | F1b-0 | implementer / Sonnet | M | sheet tests per kind; status flips from decisions; detector catches dot and grid tiles, passes lines and lace fixtures |
| I8-fix | I8 rebase per §4 | F1b-0, F1b-1 | mechanic / Haiku (exact list) | S | deck tests; `resolveSignature`: 0 unknown |
| I3-0 | Preset format, `fillPreset`, slot-marker guard | F1b-1 | builder / Opus | S | fill tests on 3 fixtures; marker leak rejected |
| I3a | 81 variants as compositions (v19 features) | I3-0, INV-1 | asset maker / Opus | L | presets pass guards after filling; 360/1280; side-by-side sheet |
| I3b | 39 new presets (v2, reference parts), coverage table | F1b merged, I3-0 | asset maker / Opus (W candidate) | L | same; coverage met |
| I4a | Masks and frames to 30 | F1b-1, INV-1 | asset maker / Opus | M | tokens only; ≤ 2 KiB; 3 ratios |
| I4b | Treatments to 16 | F1b-1, INV-1 | asset maker / Opus | S | roles only; no gradient or blur; 2 palettes |
| I4c | Textures 12 | F1b-1, INV-1 | asset maker / Opus | M | ≤ 2 KiB; detector; contrast at max alpha |
| I5-p | Drawing pilot (12 motifs, 6 ornaments) | INV-1 | asset maker / Opus | M | Drawing schema, budgets; owner ≥ 70 % |
| I5a | ≈ 50 motifs, line style | I5-p approved | asset maker / Opus | L | same |
| I5b | Solid and cut-paper styles (≤ 100) | I5a in gallery | asset maker / Opus | L | same |
| I5c | Ornaments to 24 | I5-p | asset maker / Opus | L | provenance notes; REPEATABLE pass detector |
| I5d | Edges and dividers to 20 | F1b-R1 | asset maker / Opus | M | tokens; phones halved; sheet between two sections |
| I6a | Type treatments to 15 | F1b merged | builder / Opus | M | G20 tests; a11y of circle and vertical; banned |
| I6b | Fact objects to 20 | F1b merged | asset maker / Opus | M | ≤ 2 KiB; values from fixture facts; 44 px linked |
| I7a | Motion harness, MOTION_META tests, presets to 6 | F1b-R1 | builder / Opus | M | CSS-guard test; CLS 0, LCP Δ ≤ 100 ms; reduced-motion = static |
| I7b | 14 more presets (≤ 2 JS) | I7a | asset maker / Opus | M | same harness; JS ≤ 3 KiB gzip |
| I9a | Wordmark generator and styles | F1b-R2 | builder / Opus | M | deterministic; glyphs; 360 fit; goldens unchanged |
| I9-p | 40 practical-fact icons, line style | INV-1 | asset maker / Opus | M | ≤ 1 KiB; 24 px; owner pilot |
| I9c | Icons solid and cut (80) | I9-p approved | asset maker / Opus | M | same |
| I10a | Reference format and harness, Okus export | F1b-A | builder / Opus | S | a reference validates, renders and exports |
| I10b–e | 4 × 10 references | I10a, I4, I6 | asset maker / Opus (W candidate) | L each | 0 guard issues; 0 invented facts; 360/1280; gap notes |

**35 units.**
