import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@sb/config";
import { DIRECTIONS, directionFitsTrade } from "@sb/spec";
import { ModelClient, briefWords, chooseDesign, tradeFitDirection, type ModelResponse } from "../src/index.ts";

/**
 * The design step never gives a trade a template whose motif doesn't fit it (the outside review: a locksmith, filed
 * as a builder, drew the car-repair template's licence plates). Replayed from the recorded design answer, changed to
 * the plate template; no model call.
 */
const recordings = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../tools/eval/recordings");
const recordedDesign = JSON.parse(readFileSync(path.join(recordings, "kmetija-grabnar/002-design.json"), "utf8")) as { response: ModelResponse };
const plate = DIRECTIONS.find((d) => d.template?.motif === "plate")!;

const LOCKSMITH = { name: "Ključavničarstvo Hrovat", summary: "Ključavničar: odpiranje vrat, menjava ključavnic." };
const CAR_SERVICE = { name: "Avtoservis Hrovat", summary: "Servis osebnih vozil, menjava gum in olja." };
// M1 final check: the appliance repairer the classifier filed as car-repair (final10 servis-aparatov-rebec).
const APPLIANCES = { name: "Servis gospodinjskih aparatov Rebec", summary: "Popravilo pralnih in pomivalnih strojev, štedilnikov in hladilnikov na domu. Rezervni del, ki ga nimam v kombiju, naročim." };

async function choose(businessType: string, direction: string, words: { name: string; summary: string } = businessType === "car-repair" ? CAR_SERVICE : LOCKSMITH) {
  const answer = { ...JSON.parse(recordedDesign.response.text), direction };
  let calls = 0;
  const client = new ModelClient({
    config: loadConfig(),
    spentToday: async () => 0,
    onCall: async () => undefined,
    transport: { send: async () => (calls++ === 0 ? { ...recordedDesign.response, text: JSON.stringify(answer) } : Promise.reject(new Error("unexpected retry"))) },
  });
  const brief = { ...words, businessType, tone: "warm" } as never;
  return chooseDesign(client, { brief, swatches: [], photoCount: 2, generatedCount: 0 });
}

describe("the design step and trade motifs", () => {
  it("a builder (a locksmith) asked into the plate template gets a direction whose motif fits", async () => {
    const { design } = await choose("builder", plate.id);
    expect(design.direction).not.toBe(plate.id);
    expect(directionFitsTrade(design.direction, "builder")).toBe(true);
  });

  it("car repair keeps the plate template it chose", async () => {
    const { design } = await choose("car-repair", plate.id);
    expect(design.direction).toBe(plate.id);
  });

  it("an appliance repairer filed as car-repair, asked into the plate template, moves off it to a plain car-repair direction", async () => {
    const { design } = await choose("car-repair", plate.id, APPLIANCES);
    expect(design.direction).not.toBe(plate.id);
    const d = DIRECTIONS.find((x) => x.id === design.direction)!;
    expect(d.template).toBeUndefined();
    expect(d.bestFor).toContain("car-repair");
  });

  it("briefWords: the name, summary, offerings and highlights", () => {
    const words = briefWords({ name: "Gume Kos", summary: "Vulkanizer.", offerings: [{ group: "Pnevmatike", name: "Menjava", description: null, price: null }], highlights: ["Hitro"] });
    for (const w of ["Gume Kos", "Vulkanizer.", "Pnevmatike", "Menjava", "Hitro"]) expect(words).toContain(w);
  });

  it("tradeFitDirection: the trade's own template when the pictures allow it, else a plain direction made for the trade", () => {
    expect(tradeFitDirection(plate.id, "car-repair", 0)).toBe(plate.id);
    const builderTemplate = DIRECTIONS.find((d) => d.template?.firstFor.includes("builder"))!;
    expect(tradeFitDirection(plate.id, "builder", 99)).toBe(builderTemplate.id);
    const none = tradeFitDirection(plate.id, "builder", -1);
    expect(DIRECTIONS.find((d) => d.id === none)!.template).toBeUndefined();
    expect(directionFitsTrade(none, "builder")).toBe(true);
    // Any direction that fits stays as chosen.
    for (const d of DIRECTIONS.filter((x) => !x.template)) expect(tradeFitDirection(d.id, "builder", 3)).toBe(d.id);
  });
});
