# From a short description to a live site: what stands in between

Status: measured and cut 2026-10-04 (branch claude/zero-to-live, HQ `it-zero-to-live`, overnight plan `on-zero-to-live`). The domain part of the path is in [custom-domains.md](custom-domains.md).

## How it was measured

`pnpm zero-to-live` replays every fixture's recorded generation (tools/eval/recordings, no model call, stand-in pictures), stores the generated spec in `tools/eval/zero-to-live/specs/` and the pre-publish checklist in `tools/eval/zero-to-live/blockers.json`. `apps/web/test/zero-to-live-browser.test.ts` opens each generated site in Chromium at 375 and 1280 px, as the owner who watched it generate, and counts taps until it is published (typing is not counted; the first field is focused, moving to another field is one tap). CI runs three fixtures with budgets that only go down; `SB_Z2L_ALL=1` runs all ten.

"Before" is the same drive on main's editor (2026-10-04, `c4bed1b`): Objavi opens the checklist, each entry opens its field (a missing address or price first needs "Vnesi"), Objavi again.

## What stands between the generated site and publishing

Every one of the 56 checklist entries on the ten sites is a fact the client didn't give. Nothing else blocked publishing: no wording, photo description or validation entry on any fixture.

| Fixture | Missing facts | Taps before | Taps after |
|---|---|---|---|
| avtoservis-mrak | price, email, ZEPT ×3 | 8 | 5 |
| fizioterapija-pregib | address | 6 | 3 |
| frizerstvo-lana | price ×3, ZEPT ×3 | 9 | 6 |
| gostilna-zlata-zlica | price ×2 | 4 | 2 |
| instalacije-rebernik | email | 3 | 1 |
| kmetija-grabnar | price ×6, ZEPT ×3 | 13 | 9 |
| pekarna-kvas | price ×3, ZEPT ×3 | 8 | 6 |
| racunovodstvo-seliskar | price ×6, team member name ×3 | 17 | 9 |
| trgovina-oljka-in-sol | price ×8 | 18 | 8 |
| zobozdravstvo-lebar | price ×7 | not measured | 7 |
| **9 fixtures with both** | | **86** | **49 (−43 %)** |

Same numbers at both widths. zobozdravstvo-lebar's "before" wasn't measured: the drive of the old checklist didn't finish (an entry of its second price list stayed on the list after typing; not investigated further). After the change it takes 7 taps.

By kind: prices 37 of 56 (7 fixtures), ZEPT provider data (legal name, tax and registration number) 15 (5 fixtures), email 2, address 1, team member names 3.

## What changed

1. **"Še to potrebujemo"**: when a generation the owner watched finishes with facts missing, the editor opens one screen with every missing fact as an open field (no "Vnesi"), the first one focused, a price named by its item ("Cenik › Pramene") and read the way owners write it ("12,50", "od 30"). Objavi under it saves what was typed and publishes; if a fact is still empty it says so and publishes nothing. "Še N do objave" and the top bar's Objavi open the same screen while facts are missing; anything else on the checklist is one tap away ("Pokaži"). A later visit doesn't push the screen.
2. **Domain names asked while the site generates**: once the brief has named the business, the worker asks the registrar about the names (`warmDomainSuggestions`); the answer is kept on the site for `domains.suggestions.cacheMinutes` (60) and the domain step reuses it instead of asking again on every editor load (migration 20). A new business name asks again. Off with the rest of `domains` in config.
3. **Publishing is one confirmation once the facts are in**: Objavi under the form is the confirmation. With `domains.enabled` the domain step follows (measured in custom-domains.md: 2 taps).

## What remains and why

The remaining taps are one per fact we may not invent, plus Objavi. Cutting further needs a product decision, not code:

- **Prices** (37 of 56): a business that doesn't publish prices still gets a price list from the brief. Options: a "Cena po dogovoru" choice per item that renders as that text (not invented), or a generator rule that leaves prices out of sections when the description has none. HQ decision `sb-price-on-request`.
- **ZEPT data** (15): three fields for every company. Since 2026-10-07 (HQ `it-zept-lookup`) the typed tax number fills the legal name (and the address, if the site has none) from EU VIES, so two are typed; see "Zero to live 2" below. The matična številka isn't in VIES and stays typed.
- **Team member names** (racunovodstvo-seliskar): the generator made a team section with three unnamed members from "še dve računovodkinji". Since 2026-10-07 assembly leaves out members the client didn't name (a section left with nobody goes); "+ Dodaj člana" in the team's form adds one.

## Zero to live 2 (2026-10-07, branch claude/zero-to-live-2)

- **Tax number → legal name and address.** `POST /api/sites/:id/company-lookup` (apps/web/src/company-lookup.ts) checks the FURS check digit, then asks EU VIES (`POST https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number` with `{countryCode: "SI", vatNumber}`; answer fields `valid`, `name`, `address`, "---" when not given; verified by one call on 2026-10-07). The address reads "STREET 6, 8501 CITY" into street, postal code and city. Names and addresses come back as VIES writes them (capitals); the owner can change them. Only VAT-registered businesses are in VIES: a small s.p. outside the VAT system gets "Te davčne številke ni med zavezanci za DDV …" and types the facts. A timeout (config `companyLookup.timeoutMs`, 4 s), VIES down or an odd answer: "Registra zavezancev za DDV trenutno ni mogoče doseči. Podatke vpišite sami." The server stores and logs nothing of the answer; the editor puts it into the fields and saves it like typed text. Same access as the editor (owner or admin; anonymous previews can't edit), rate-limited per viewer and in total (config).
- **On "Še to potrebujemo"** the tax number comes before the name and address it can fill; typing it fills them on the screen (still editable, a note says where they came from). In Podatki the same happens in the facts form.
- **Team members without names** are left out at assembly (`withoutUnnamedTeam`, engine).

Taps to publish and facts typed (Chromium, 375 and 1280 px, the same at both widths; `SB_Z2L_ALL=1`, a fake VIES that knows every number; before = main at `fd853b3` the same day):

| Fixture | Taps before → after | Facts typed before → after |
|---|---|---|
| avtoservis-mrak | 5 → 4 | 5 → 4 |
| fizioterapija-pregib | 3 → 3 | 1 → 1 |
| frizerstvo-lana | 6 → 5 | 6 → 5 |
| gostilna-zlata-zlica | 2 → 2 | 2 → 2 |
| instalacije-rebernik | 1 → 1 | 1 → 1 |
| kmetija-grabnar | 9 → 8 | 9 → 8 |
| pekarna-kvas | 6 → 5 | 6 → 5 |
| racunovodstvo-seliskar | 9 → 6 | 9 → 6 |
| trgovina-oljka-in-sol | 8 → 8 | 8 → 8 |
| zobozdravstvo-lebar | 7 → 7 | 7 → 7 |
| **All ten** | **56 → 49** | **54 → 47** |

A business outside the VAT system (most small s.p.) isn't in VIES: for it the ZEPT fields stay three typed facts. Owner-task budgets unchanged (controls 14 / 24). What remains is prices (37 facts, decision `sb-price-on-request`) and one typed fact each for the rest.

## Not covered

The anonymous preview's path (Turnstile, sign-in to save) and the plan step are outside this count; publishing needs an allow-listed or paid account. Recordings are from 2026-10-01 and some prompts changed since (the eval re-record waits for API budget), so a live generation can leave other facts missing.
