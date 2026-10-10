# Hard fixtures

Eighteen fictional businesses for the cases where generated sites are weakest (docs/plans/design-studio.md §8, F6).
With the ten fixtures and the twelve twins they make the 40 the design studio is measured on. `hard` in each brief
names the cases it stands for; `test/fixtures.test.ts` checks every one against the brief.

| id | type | trade | town | case | photos | logo |
|---|---|---|---|---|---|---|
| keramika-zupancic | builder | keramičar | Novo mesto | no logo | 2 | – |
| siviljstvo-irena | shop | šivilja | Slovenj Gradec | no logo | 2 | – |
| okrepcevalnica-pri-jozi | restaurant | okrepčevalnica | Trbovlje | no logo | 2 | – |
| prevajanje-kolar | accountant | prevajanje | Ljubljana | no photos | 0 | yes |
| instrukcije-pia | accountant | inštrukcije | Maribor | no photos, new trade (tutor) | 0 | – |
| kljucavnicarstvo-hrovat | builder | ključavničar | Celje | no photos, new trade (locksmith) | 0 | – |
| kovastvo-jereb | builder | kovač | Idrija | dark phone photos | 2 | – |
| cistilni-servis-blesk | builder | čiščenje | Domžale | dark phone photos, new trade (cleaning) | 2 | – |
| cebelarstvo-medved | shop | čebelarstvo | Radovljica | one photo | 1 | – |
| masaze-sanja | physio | masaže | Nova Gorica | one photo | 1 | – |
| avtolicarstvo-gorenc | car-repair | karoserija | Krško | long name (48 characters) | 2 | yes |
| kozmeticni-studio-iris | hairdresser | kozmetika | Velenje | 20 priced services | 2 | – |
| apartmaji-pod-voglom | tourist-farm | apartmaji | Bohinj | tourism, English as a second language | 4 | – |
| cvetlicarna-zvoncek | shop | cvetličarna | Ptuj | new trade (florist) | 2 | yes |
| studio-dih | physio | joga | Ljubljana | new trade (yoga) | 2 | yes |
| foto-rozman | shop | fotograf | Murska Sobota | new trade (photographer) | 4 | yes |
| veterina-sapa | dental | veterina | Ajdovščina | new trade (vet) | 2 | yes |
| avtosola-volan | car-repair | avtošola | Jesenice | new trade (driving school) | 2 | yes |

Same rules as the fixtures (tools/eval/fixtures/README.md): everything is invented (people, business names, house
numbers, matične and davčne številke; streets are plausible ones in real towns), phones use the `555` block and emails
the `.example` TLD, and `facts` lists every fact of the description and nothing else. Descriptions are written the way
owners write: `keramika-zupancic`, `siviljstvo-irena` and `kovastvo-jereb` have colloquial spelling and a typo or two,
`apartmaji-pod-voglom` has a whole English paragraph, `studio-dih` gives a class timetable instead of opening hours.
The business types are the spec's ten; `trade` names the real trade (a vet is `dental`, a driving school `car-repair`).

## Not in CI until their photos and recordings exist

The hard fixtures are a separate group like the twins: `loadFixtures()` (and with it `pnpm eval --offline`, CI's
`eval-offline` job, the photo-prompt tests and every test that reads tools/eval/fixtures) never sees them. They have no
`edits.json`, no golden specs and no recordings.

- `pnpm eval --hard` (live, `--record` or `--record-missing`) adds them to a run; with `--offline` or `--replay` it
  stops with an error, as `--twins` does. It also stops while a selected one's photos are missing (the three without
  photos can run now with `--only`).
- Photos: none are committed yet. `photo-prompts.json` here is the shot list, 32 pictures. The four photos of
  `kovastvo-jereb` and `cistilni-servis-blesk` are listed under `poor` and get `poorStyle` (dark, noisy, soft phone
  shots) instead of `style`. `pnpm fixtures:ai-photos generate --model gpt-image-2.5 --hard` (paid, ≈ €0.068 each, about
  €2.2 for all 32) writes them to `<id>/photos/NN.jpg` (≤ 1600 px) and `photo-manifest.json` here; look at each one
  before committing (no legible lettering).
