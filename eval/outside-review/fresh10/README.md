4.08 | 3.50 |4.08 | 3.58 |4.17 | 3.17 |4.25 | 3.75 |3.42 | 3.08 |4.33 | 3.50 |# Fresh 10: businesses the pipeline had never seen (2026-10-15)

Ten new businesses in `tools/eval/fresh/`: trades and towns no fixture, twin, hard case or reference used, no photos
given (two AI pictures per page), written in the owner's voice (watchmaker in Idrija, dog groomer in Kočevje, bike
service in Tolmin, winery on Bizeljsko, dance school in Slovenj Gradec, glazier in Ajdovščina, optician in Postojna,
cheese dairy near Radovljica, craft brewery in Trbovlje, architect in Ormož). Generated with PR #216's code
(`pnpm eval --fresh --record-missing --recordings tools/eval/recordings-fresh10 --scope home --no-edits --no-judge
--no-lighthouse`), then scored with `pnpm outside-review --record-missing eval/outside-review/recordings-fresh10`.

- Generation: 10 of 10 homepages, no automated check failure, €2.50 (€0.23–0.28 a page, two pictures each).
- Scoring: €1.14 (€0.86, then €0.28 after an OpenRouter top-up for the 12 answers refused at first; the paid answers replayed for €0). All three reviewers scored all 10.

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

Means: Gemini 3.99, GPT 3.34, Fable 3.39 (on the 50 known pages after the fixes: 3.95, 3.45, 3.32). All three pass 7 of
10; the two-of-three filter passes 8 (holds plesna-sola-takt and sirarna-pr-simnu). The blockers are known kinds: the AI label
clipped by an arched crop (all three reviewers), an arched photo cut at the phone's edge, a caron touching the line above
in the footer wordmark, the phone bar over a hero link, and a week chart without hour labels. Report page:
eval/outside-review/scores.html.
