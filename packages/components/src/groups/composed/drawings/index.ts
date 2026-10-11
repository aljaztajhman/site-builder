import type { Drawing } from "@sb/spec";
import { wheatEarLine } from "./motif-bakery-wheat-ear-line.ts";
import { ropeLine } from "./ornament-rope-line.ts";
import { peelLoafLine } from "./motif-bakery-peel-loaf-line.ts";
import { torqueWrenchLine } from "./motif-car-repair-torque-wrench-line.ts";
import { ballValveLine } from "./motif-plumbing-ball-valve-line.ts";
import { shearsCombLine } from "./motif-hairdresser-shears-comb-line.ts";
import { mirrorProbeLine } from "./motif-dental-mirror-probe-line.ts";
import { spineModelLine } from "./motif-physio-spine-model-line.ts";
import { milkCanLine } from "./motif-tourist-farm-milk-can-line.ts";
import { ladlePotLine } from "./motif-restaurant-ladle-pot-line.ts";
import { ledgerPenLine } from "./motif-accountant-ledger-pen-line.ts";
import { secateursStemLine } from "./motif-florist-secateurs-stem-line.ts";
import { oliveSaltLine } from "./motif-deli-olive-salt-line.ts";
import { cableCoilLine } from "./motif-electrical-cable-coil-line.ts";
import { beehivePanelLine } from "./ornament-beehive-panel-line.ts";
import { idrijaLaceLine } from "./ornament-idrija-lace-line.ts";
import { gorenjskaRosetteLine } from "./ornament-gorenjska-rosette-line.ts";
import { trailBlazeLine } from "./ornament-trail-blaze-line.ts";
import { pisanicaBandLine } from "./ornament-pisanica-band-line.ts";
import { prekmurjePotteryBandLine } from "./ornament-prekmurje-pottery-band-line.ts";
import { loafPoticaSceneSolid } from "./motif-bakery-loaf-potica-scene-solid.ts";
import { bouleLinocutSolid } from "./motif-bakery-boule-linocut-solid.ts";
import { sunLoafShapesCut } from "./motif-bakery-sun-loaf-shapes-cut.ts";

/**
 * The inventory's drawings as path data (spec Drawing format, docs/plans/studio-phase1-design.md §3.1), by their full
 * asset id (spec DRAWINGS). F1b ships the two samples; batch I5 adds one file per drawing and one line here (I5-p: the
 * pilot of 12 trade motifs and 6 ornaments). A spec that names a drawing missing here renders nothing in its place (the
 * guard G8 drops unknown names before that).
 */
export const DRAWING_DATA: Readonly<Record<string, Drawing>> = {
  [wheatEarLine.id]: wheatEarLine,
  [ropeLine.id]: ropeLine,
  [peelLoafLine.id]: peelLoafLine,
  [torqueWrenchLine.id]: torqueWrenchLine,
  [ballValveLine.id]: ballValveLine,
  [shearsCombLine.id]: shearsCombLine,
  [mirrorProbeLine.id]: mirrorProbeLine,
  [spineModelLine.id]: spineModelLine,
  [milkCanLine.id]: milkCanLine,
  [ladlePotLine.id]: ladlePotLine,
  [ledgerPenLine.id]: ledgerPenLine,
  [secateursStemLine.id]: secateursStemLine,
  [oliveSaltLine.id]: oliveSaltLine,
  [cableCoilLine.id]: cableCoilLine,
  [beehivePanelLine.id]: beehivePanelLine,
  [idrijaLaceLine.id]: idrijaLaceLine,
  [gorenjskaRosetteLine.id]: gorenjskaRosetteLine,
  [trailBlazeLine.id]: trailBlazeLine,
  [pisanicaBandLine.id]: pisanicaBandLine,
  [prekmurjePotteryBandLine.id]: prekmurjePotteryBandLine,
  // Hero style pilots: full-strength hero art in several palette roles (a decor element in its own roles, not as ink).
  [loafPoticaSceneSolid.id]: loafPoticaSceneSolid,
  [bouleLinocutSolid.id]: bouleLinocutSolid,
  [sunLoafShapesCut.id]: sunLoafShapesCut,
};

export function drawingData(id: string): Drawing | undefined {
  return Object.hasOwn(DRAWING_DATA, id) ? DRAWING_DATA[id] : undefined;
}
