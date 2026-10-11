# Edge fixtures (studio 0.5)

Hand-written businesses outside the ten trades the eval fixtures cover, for the design studio's "any business" check
(docs/plans/studio-0.5.md). Same `brief.json` format as `tools/eval/fixtures` (FixtureBrief, tools/eval/src/fixtures/schema.ts),
kept apart so the eval suite and its recordings stay as they are.

**Fixture data only.** The businesses, names, addresses, phone numbers (041 555 …), emails (`.example`) and prices are
invented for testing. They are not real businesses.

- `cvetlicarna-zvoncek`: a florist in Škofja Loka, no photos, no logo (classifies as a shop; florist is a shop subtype).
- `tattoo-crnilo`: a tattoo studio in Celje, no photos, no logo; a trade none of the ten types fits (the business type is a
  stand-in, as the classifier would guess).

No recordings and no golden spec yet: the next step records them once the director composes pages itself.
