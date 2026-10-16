import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@sb/config";
import { DIRECTIONS, directionFitsTrade } from "@sb/spec";
import { ModelClient, chooseDesign, tradeFitDirection, type ModelResponse } from "../src/index.ts";

/**
 * The design step never gives a trade a template whose motif doesn't fit it (the outside review: a locksmith, filed
 * as a builder, drew the car-repair template's licence plates). Replayed from the recorded design answer, changed to
 * the plate template; no model call.
 */
const recordings = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../tools/eval/recordings");
const recordedDesign = JSON.parse(readFileSync(path.join(recordings, "kmetija-grabnar/002-design.json"), "utf8")) as { response: ModelResponse };
const plate = DIRECTIONS.find((d) => d.template?.motif === "plate")!;

async function choose(businessType: string, direction: string) {
  const answer = { ...JSON.parse(recordedDesign.response.text), direction };
  let calls = 0;
  const client = new ModelClient({
    config: loadConfig(),
    spentToday: async () => 0,
    onCall: async () => undefined,
    transport: { send: async () => (calls++ === 0 ? { ...recordedDesign.response, text: JSON.stringify(answer) } : Promise.reject(new Error("unexpected retry"))) },
  });
  const brief = { name: "Ključavničarstvo Hrovat", businessType, tone: "warm", summary: "Ključavničar: odpiranje vrat, menjava ključavnic." } as never;
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
