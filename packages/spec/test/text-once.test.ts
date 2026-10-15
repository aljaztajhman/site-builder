import { describe, expect, it } from "vitest";
import { sentenceKey, sentences, withoutShown } from "../src/index.ts";

/** Sentences compared the way the repeated-sentence repair, the hours section and the browser check compare them. */
describe("sentences compared", () => {
  it("splits after a stop, a question or exclamation mark or an ellipsis", () => {
    expect(sentences("Odprto vsak dan. Kje smo? Pridite! Pa še to… Konec")).toEqual(["Odprto vsak dan.", "Kje smo?", "Pridite!", "Pa še to…", "Konec"]);
  });

  it("ignores case, spacing, quotes and the closing stop", () => {
    expect(sentenceKey("  „Brez naročila  težko pridete na vrsto.“ ")).toBe(sentenceKey("brez naročila težko pridete na vrsto"));
  });

  it("withoutShown leaves out the sentences already said, keeps the rest", () => {
    const hours = "Brez naročila težko pridete na vrsto, zato raje pokličite.";
    expect(withoutShown(hours, [hours])).toBeUndefined();
    expect(withoutShown(`${hours} Radi vam najdemo čas, tudi ob sobotah.`, [hours])).toBe("Radi vam najdemo čas, tudi ob sobotah.");
    expect(withoutShown("Zaključene družbe. Rezervacija je obvezna.", ["V ponedeljek zaprto. Rezervacija je obvezna."])).toBe("Zaključene družbe.");
    expect(withoutShown(hours, [undefined])).toBe(hours);
  });
});
