/**
 * Composition presets (kind `composition`, docs/plans/studio-phase1-design.md §5, I3): one file per preset under
 * `<intent>/<name>.ts`, each a `definePreset({ … })` default export (format and slots: @sb/spec composition/preset.ts
 * and slots.ts). New presets register as drafts; the owner's gallery decisions (decisions.json) approve them.
 */
import { parsePresetId, type CompositionPreset } from "@sb/spec";
import type { Asset, AssetTags } from "../schema.ts";
import contactDetailsHours from "./contact/details-hours.ts";
import heroSplitPhoto from "./hero/split-photo.ts";
import servicesListBeside from "./services/list-beside.ts";

/** Every preset, in a fixed order (by intent, then name). */
export const COMPOSITION_PRESETS: readonly CompositionPreset[] = [contactDetailsHours, heroSplitPhoto, servicesListBeside];

/** A preset by id. */
export const compositionPreset = (id: string): CompositionPreset | undefined => COMPOSITION_PRESETS.find((p) => p.id === id);

/** The presets as inventory assets: drafts until the owner approves them; a preset adds no bytes of its own (the composed sheet does). */
export function compositionAssets(): Asset[] {
  return COMPOSITION_PRESETS.map((p) => {
    const intent = parsePresetId(p.id)?.intent;
    const tags: AssetTags = {
      trades: [...(p.tags?.trades ?? [])],
      stances: [...(p.tags?.stances ?? [])],
      intents: intent ? [intent as AssetTags["intents"][number]] : [],
      mood: [...(p.tags?.mood ?? [])],
      ground: ["dark", "tint", "white"],
      density: ["airy", "compact", "regular"],
    };
    return { id: p.id, kind: "composition", tags, phone: "ok", bytes: 0, license: "own", status: "draft", ...(p.note ? { note: p.note } : {}) } satisfies Asset;
  });
}
