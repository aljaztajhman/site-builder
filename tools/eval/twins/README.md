# Twin fixtures

Twelve more fictional businesses of the fixtures' own trades, to measure how alike sites of one trade come out
(docs/plans/variety-engine.md, Step 0). `pnpm eval --twins` runs them beside the ten fixtures; the variety report
(`eval/variety-*.md`) then has look distances within each trade.

| id | type | trade | beside | town | photos | logo |
|---|---|---|---|---|---|---|
| vulkanizer-zorman | car-repair | gume | avtoservis-mrak | Ptuj | 0 | – |
| avto-kovac | car-repair | servis | avtoservis-mrak | Ljubljana | 2 | blue |
| karoserija-hribar | car-repair | karoserija | avtoservis-mrak | Celje | 1 | – |
| frizerski-salon-mia | hairdresser | | frizerstvo-lana | Ljubljana | 3 | – |
| brivnica-kos | hairdresser | brivnica | frizerstvo-lana | Maribor | 0 | – |
| salon-tina | hairdresser | | frizerstvo-lana | Kranj | 2 | – |
| gostilna-pri-mostu | restaurant | | gostilna-zlata-zlica | Kamnik | 3 | – |
| pizzeria-oljka | restaurant | pizzerija | gostilna-zlata-zlica | Izola | 0 | – |
| gostisce-na-gricu | restaurant | | gostilna-zlata-zlica | Ivanjkovci | 3 | – |
| elektro-zupan | builder | elektro | instalacije-rebernik | Velenje | 0 | – |
| mizarstvo-lesnik | builder | mizar | instalacije-rebernik | Škofja Loka | 0 | – |
| cvetlicarna-marjetica | shop | cvetličarna | trgovina-oljka-in-sol | Novo mesto | 0 | – |

Same rules as the fixtures (tools/eval/fixtures/README.md): everything is invented, phones use the `555` block and
emails the `.example` TLD, and `facts` lists every fact of the description and nothing else (`test/fixtures.test.ts`
checks the twins too). Differences: no `edits.json` (twins run with `--no-edits`), photos are the fixtures' own
committed ones named with `from` (no copies), and `trade` names the trade within the business type for the motif-fit
metric (the radiator belongs to plumbing, not to an electrician or a carpenter).
