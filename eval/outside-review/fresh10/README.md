# Fresh 10: businesses the pipeline had never seen (2026-10-15)

Ten new businesses in `tools/eval/fresh/`: trades and towns no fixture, twin, hard case or reference used, no photos
given (two AI pictures per page), written in the owner's voice (watchmaker in Idrija, dog groomer in Kočevje, bike
service in Tolmin, winery on Bizeljsko, dance school in Slovenj Gradec, glazier in Ajdovščina, optician in Postojna,
cheese dairy near Radovljica, craft brewery in Trbovlje, architect in Ormož). Generated with PR #216's code
(`pnpm eval --fresh --record-missing --recordings tools/eval/recordings-fresh10 --scope home --no-edits --no-judge
--no-lighthouse`), then scored with `pnpm outside-review --record-missing eval/outside-review/recordings-fresh10`.

- Generation: 10 of 10 homepages, no automated check failure, €2.50 (€0.23–0.28 a page, two pictures each).
- Scoring: €0.86. Claude Fable scored all 10; Gemini and GPT scored 4 each, then OpenRouter refused the rest (HTTP 402,
  the account's credit ran out; refused calls cost nothing). After a top-up the same command pays only the 12 missing
  calls (≈ €0.30); the 18 answers already paid replay for €0.

| Page | Gemini | GPT | Fable | Blockers |
|---|---|---|---|---|
| atelje-bergant (architect) | 3.58 | 2.83 | 3.25 | none |
| kolesarski-servis-ovinek (bike service) | 3.75 | 3.25 | 3.67 | none |
| optika-jasna (optician) | 4.17 | 3.50 | 3.42 | none |
| pasji-salon-kodra (dog groomer) | 4.08 | 3.25 | 3.08 | none |
| pivovarna-rov (brewery) | – | – | 3.42 | Fable: the fixed phone bar nearly covers "Kako do nas"; the opening-hours bars have no hour labels |
| plesna-sola-takt (dance school) | – | – | 3.08 | Fable: the "Ustvarjeno z UI" label is clipped at the image's right edge |
| sirarna-pr-simnu (cheese dairy) | – | – | 3.75 | Fable: the arched hero photo is cut off at the phone's right edge |
| steklarstvo-vrhovnik (glazier) | – | – | 2.92 | none |
| urarstvo-tic (watchmaker) | – | – | 3.75 | none |
| vinarstvo-pinteric (winery) | – | – | 3.58 | none |

Means where scored: Gemini 3.90 (4 pages), GPT 3.21 (4), Fable 3.39 (10; on the 50 known pages after the fixes 3.32).
Fable passes 7 of 10. The three blockers are known kinds: the arched photo cut at the phone edge (also on frizerstvo-lana
and zobozdravstvo-lebar after the fixes), the AI label in a non-round crop, and the week chart without hour labels.
