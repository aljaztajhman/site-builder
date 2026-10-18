# Final 10

Ten businesses for the M1 final check: never generated, never tested. None of their ids or trades appears in the
fixtures, twins, hard, fresh or review50 sets, and none of their towns in those sets (Sevnica, Litija, Brežice, Slovenske
Konjice, Logatec, Kobarid, Ravne na Koroškem, Ribnica, Sežana, Ilirska Bistrica). A separate group like `fresh`: not
loaded by `loadFixtures()`, `pnpm eval --offline` or CI.

| id | type | trade | town | photos | logo | notes |
|---|---|---|---|---|---|---|
| tapetnistvo-lesjak | builder | tapetnik | Sevnica | 3 | – | no legal |
| dimnikarstvo-vidmar | builder | dimnikar | Litija | 0 | yes | no prices, hours, email |
| klavirji-urbanc | shop | klavirji | Brežice | 0 | – | few facts: name, phone, "Brežice in okolica" |
| slascicarna-pri-zofki | bakery | slaščičarna | Slovenske Konjice | 3 | yes | no legal |
| pralnica-cisto | shop | pralnica | Logatec | 0 | – | no email, people, legal |
| kamp-soska | tourist-farm | kamp | Kobarid | 3 | – | 5 prices, season |
| pedikura-nogica | hairdresser | pedikura | Ravne na Koroškem | 0 | – | long name (51 characters), "od 20 €" price, no email |
| zeliscarna-pri-lipi | shop | zeliščarstvo | Ribnica | 3 | yes | no legal |
| knjigoveznica-kras | shop | knjigoveznica | Sežana | 3 | – | no prices, no phone |
| servis-aparatov-rebec | builder | servis aparatov | Ilirska Bistrica | 0 | – | "od 60 €" price, no legal |

Same rules as the fixtures (tools/eval/fixtures/README.md) and the hard ones: everything is invented (people, business
names, house numbers, matične and davčne številke; streets are plausible ones in real towns), phones use the `555` block and
emails the `.example` TLD, and `facts` lists every fact of the description and nothing else. Descriptions are written the
way owners write. `test/final10-fixtures.test.ts` checks each brief against its description.

## Running them

```
pnpm eval --fresh --fresh-dir tools/eval/final10 --only <id> ...   (live, --record or --record-missing; never --offline)
```

`--fresh-dir` points `--fresh` at this folder instead of tools/eval/fresh. A run stops while a selected business's photos
are missing.

## Photos: not generated yet

`photo-prompts.json` is the shot list, 15 pictures (5 businesses, 3 each). Paid, about €0.068 each, ≈ €1.02 for all 15:

```
pnpm fixtures:ai-photos generate --model gpt-image-2.5 --dir tools/eval/final10 --max-eur 2
```

It writes `<id>/photos/NN.jpg` (≤ 1600 px) and `photo-manifest.json` here. Look at each picture before committing it (no
legible lettering). Until the photos exist `test/final10-fixtures.test.ts` skips the file-exists check; it turns on by
itself once all 15 files are there (`FINAL10_PHOTOS_EXIST` in the test).
