import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@sb/config";
import { Brief, ModelClient, generateContent } from "@sb/engine";
import { readList, type SiteSpec } from "@sb/spec";
import { loadFixture } from "../src/fixtures/load.ts";
import { syntheticRecordings } from "../src/synthetic.ts";

/**
 * "Cena po dogovoru" (spec v15, it-price-on-request) is the owner's choice, never the generator's: a content answer
 * that writes one gets a price placeholder there instead (the owner is asked), and the step says what it repaired.
 * A replayed answer, no model call.
 */
const here = path.dirname(fileURLToPath(import.meta.url));

describe("the generator can't write a price \"po dogovoru\"", () => {
  it("turns one in the content answer back into a price placeholder and says so", async () => {
    const fixture = loadFixture("frizerstvo-lana");
    const golden = JSON.parse(await readFile(path.join(here, "../golden/frizerstvo-lana.json"), "utf8")) as SiteSpec;
    const recs = syntheticRecordings(fixture, golden);
    const brief = Brief.parse(JSON.parse(recs.find((r) => r.stage === "brief")!.response.text));
    const content = recs.find((r) => r.stage === "content")!.response;
    // The model's answer with "po dogovoru" on Pramene (no price in the brief) and on Barvanje (the client's "od 45 €").
    const answer = JSON.parse(content.text) as { pages: SiteSpec["pages"] };
    const items = (answer.pages[1]!.sections[1]!.props as { groups: { items: { name: string; price: unknown }[] }[] }).groups[1]!.items;
    expect(items.map((i) => i.name).slice(0, 2)).toEqual(["Barvanje", "Pramene"]);
    items[0]!.price = { onRequest: true };
    items[1]!.price = { onRequest: true };
    const calls: number[] = [];
    const client = new ModelClient({
      config: loadConfig(),
      spentToday: async () => 0,
      onCall: async () => undefined,
      transport: {
        async send() {
          calls.push(1);
          return { ...content, text: JSON.stringify(answer) };
        },
      },
    });
    const r = await generateContent(client, {
      slug: "frizerstvo-lana",
      brief,
      design: golden.design,
      assets: golden.assets,
      scope: "full",
      heroImageIds: [],
      structuredOutput: true,
      retries: 0,
      corpus: fixture.brief.description,
    });
    expect(calls).toHaveLength(1);
    expect(r.issues).toEqual([]);
    const list = readList(r.spec, { page: 1, section: 1, id: "s_prices" })!;
    expect(list.groups[1]!.items.slice(0, 2).map((i) => i.price)).toEqual([{ $placeholder: "price" }, { $placeholder: "price" }]);
    expect(JSON.stringify(r.spec)).not.toContain("onRequest");
    expect(r.repairs.filter((x) => x.includes("on request"))).toEqual([
      "/pages/1/sections/1/props/groups/1/items/0/price: price \"on request\" is set by the owner only; made a price placeholder",
      "/pages/1/sections/1/props/groups/1/items/1/price: price \"on request\" is set by the owner only; made a price placeholder",
    ]);
  });
});
