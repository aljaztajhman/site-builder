# Eval fixtures

Ten fictional Slovenian small businesses, one per `BusinessType`. `pnpm eval` generates a site from each
brief and then applies the five scripted chat edits in order.

| id | type | town | photos | logo | missing |
|---|---|---|---|---|---|
| frizerstvo-lana | hairdresser | Celje | 5 | yes | legal |
| gostilna-zlata-zlica | restaurant | Škofja Loka | 8 | – | – |
| kmetija-grabnar | tourist-farm | Luče | 8 | – | legal |
| avtoservis-mrak | car-repair | Kranj | 3 | – | email, legal |
| zobozdravstvo-lebar | dental | Maribor | 3 | – | prices |
| fizioterapija-pregib | physio | Novo mesto | 1 | yes | – |
| racunovodstvo-seliskar | accountant | Murska Sobota | 0 | – | prices, hours, photos |
| instalacije-rebernik | builder | Ptuj | 0 | – | prices, hours, photos, email |
| trgovina-oljka-in-sol | shop | Koper | 5 | – | people |
| pekarna-kvas | bakery | Kamnik | 3 | yes | legal |

Everything is invented: business and person names, addresses (plausible streets, invented numbers),
matične and davčne številke. Phone numbers use the `555` block; emails use the reserved `.example` TLD.
`avtoservis-mrak` is typed without diacritics, `kmetija-grabnar` and `pekarna-kvas` have small typos,
`fizioterapija-pregib` and `trgovina-oljka-in-sol` mix in English words (dry needling, gift box, click & collect).

## Files

- `brief.json` — the intake: `description` (the client's own Slovene text, the only source of facts),
  `logo`, `photos` (file + Slovene subject), `facts` and `missing`.
  - `facts` is ground truth for the fact checker: every phone, email, URL, address, hour, price, person
    and legal number in the description, and nothing else. `other` holds further literal statements
    (years, features, service area) that the site may repeat.
  - `missing` lists exactly the fact groups that are absent. The site must show a marked placeholder for
    required ones (phone, email, address, legal) and must not invent the others.
- `edits.json` — five chat edits `{ message, lang, intent, check }`, applied in sequence. An edit may
  introduce new facts (a new phone number, prices, hours); from that edit on they count as client input.
- `logo.svg` — hand-drawn simple marks for three fixtures.
- `photos/NN.jpg` — generated stand-ins, not committed. Run `pnpm fixtures:photos` (add `--force` to
  regenerate, `--only <id>` for one fixture). Each is an SVG scene suggesting the subject with a caption
  "<subject> (nadomestna fotografija)", deterministic per fixture id and index; `02`, `05`, `08` are portrait.

`src/fixtures/schema.ts` is the schema, `src/fixtures/load.ts` loads and validates (`loadFixtures()`,
`loadFixture(id)`), `test/fixtures.test.ts` checks facts against descriptions.

## Edit checks

Evaluated on the spec after the edit (and, for text checks, on the rendered pages):

| kind | passes when |
|---|---|
| `equals` | the value at the JSON Pointer `path` deep-equals `value` |
| `hasSectionType` | a section of `type` exists on the home page (`page: "home"`) or on any page |
| `noSectionType` | no page has a section of `type` |
| `sectionCountDelta` | the count of `type` sections across pages changed by `delta` |
| `colorDarker` | the colour at `path` has lower WCAG relative luminance than before the edit |
| `colorWarmer` | the colour's hue moved toward red/orange/yellow, or its saturation rose while the hue is warm |
| `textContains` / `textAbsent` | the substring appears / does not appear, case-insensitive, in the visible text of the rendered pages (so prices and hours count in their rendered Slovene form, e.g. `15.00`, `250 €`) |
| `manual` | nothing machine-checkable fits; the report lists the edit for a human look (max one per fixture) |

Text checks use word stems (`nedeljsk`, `cmok`, `brezplač`) so Slovene inflection doesn't fail them.

### Decision: "temnejša glava" (darker header)

The spec has `chrome.header.tone` (`default` | `alt` | `inverse`), which re-maps the palette inside the header.
The four header edits (frizerstvo-lana, avtoservis-mrak, racunovodstvo-seliskar, pekarna-kvas) check
`equals` `/chrome/header/tone` = `"inverse"`. Colour-darkening that is about the palette
("darker primary colour", "temnejše, bolj resne barve") uses `colorDarker` on `/design/colors/primary`.
