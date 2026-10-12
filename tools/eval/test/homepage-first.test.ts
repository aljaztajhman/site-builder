import { describe, expect, it } from "vitest";
import { costEur, loadConfig } from "@sb/config";
import { Brief, ModelClient, generateContent, type CallRecord, type ContentInput } from "@sb/engine";
import { renderPage } from "@sb/render";
import { validateSite, type SiteSpec } from "@sb/spec";
import { loadFixture } from "../src/fixtures/load.ts";
import { syntheticRecordings } from "../src/synthetic.ts";
import { USAGE, goldenContent, goldenOf, textOf } from "./homepage-first-content.ts";

const config = loadConfig();

async function contentInput(id: string, scope: "home" | "full" = "full"): Promise<{ input: ContentInput; golden: SiteSpec }> {
  const fixture = loadFixture(id);
  const golden = await goldenOf(id);
  const brief = Brief.parse(JSON.parse(syntheticRecordings(fixture, golden).find((r) => r.stage === "brief")!.response.text));
  return {
    golden,
    input: { slug: id, brief, design: golden.design, assets: golden.assets, scope, heroImageIds: [], structuredOutput: false, retries: config.limits.contentRetries, corpus: fixture.brief.description },
  };
}

describe("content stage, homepage first (pipeline.homepageFirst)", () => {
  for (const id of ["fizioterapija-pregib", "gostilna-zlata-zlica", "racunovodstvo-seliskar"]) {
    it(`${id}: the homepage, then each page in its own call, merged into the same spec as one call`, async () => {
      const { input, golden } = await contentInput(id);
      const one = goldenContent(golden);
      const records: CallRecord[] = [];
      // Switch off: one call, and nothing is handed on before the whole answer.
      let heardOff = 0;
      const single = await generateContent(new ModelClient({ config, transport: one.transport, spentToday: async () => 0, onCall: async () => undefined }), { ...input, onHomepage: () => void heardOff++ });
      expect(heardOff).toBe(0);
      const split = goldenContent(golden);
      let homepage = 0;
      let draft: SiteSpec | undefined;
      const r = await generateContent(new ModelClient({ config, transport: split.transport, spentToday: async () => 0, onCall: async (c) => void records.push(c) }), {
        ...input,
        homepageFirst: true,
        onHomepage: (h) => {
          homepage = Date.now();
          draft = h.spec;
        },
      });
      // The homepage the editor shows is the merged site's homepage; the pages still to come are empty stand-ins
      // (the brief's slug and nav label) so its nav and links render; it isn't valid on its own.
      expect(draft!.pages[0]).toEqual(r.spec.pages[0]);
      expect(draft!.chrome).toEqual(r.spec.chrome);
      const planned = input.brief.pages.filter((p) => p.kind !== "home");
      expect(draft!.pages.slice(1, 1 + planned.length)).toEqual(planned.map((p) => expect.objectContaining({ id: `p_${p.slug}`, kind: "standard", slug: p.slug, nav: { label: p.navLabel, show: true }, sections: [] })));
      expect(validateSite(draft!).ok).toBe(false);
      // It renders with the same renderer exactly as the saved homepage (the pages kept the brief's nav labels here),
      // but for the head's structured data: its offer catalogue also lists the other pages' services, not written yet.
      const visible = (html: string) => html.replace(/<script type="application\/ld\+json">.*?<\/script>/g, "");
      expect(r.spec.pages.filter((p) => p.kind === "standard").map((p) => p.nav)).toEqual(planned.map((b) => ({ label: b.navLabel, show: true })));
      expect(visible(renderPage(draft!, draft!.pages[0]!))).toBe(visible(renderPage(r.spec, r.spec.pages[0]!)));
      const others = golden.pages.filter((p) => p.kind === "standard").length;
      expect(one.seen).toHaveLength(1);
      expect(split.seen).toHaveLength(1 + others);
      expect(r.issues).toEqual([]);
      expect(validateSite(r.spec).ok).toBe(true);
      expect(r.spec.pages).toEqual(single.spec.pages);
      expect(r.spec.chrome).toEqual(single.spec.chrome);
      expect(r.attempts).toBe(1 + others);
      expect(r.parts).toEqual(["homepage: 1 call(s)", ...golden.pages.filter((p) => p.kind === "standard").map((p) => `${p.id}: 1 call(s)`)]);
      // The homepage is answered (and reported) before any page is asked; the pages are asked side by side.
      const [home, ...pages] = split.seen;
      expect(homepage).toBeGreaterThanOrEqual(home!.done!);
      for (const p of pages) expect(p.at).toBeGreaterThanOrEqual(homepage);
      // Every part sends the same cached system blocks, and every page carries the homepage as written.
      for (const p of split.seen) expect(p.req.system).toEqual(one.seen[0]!.req.system);
      for (const p of pages) expect(textOf(p.req)).toContain(`"page":${JSON.stringify(golden.pages[0]).slice(0, 60)}`);
      // One cost record per call, each priced from config.
      expect(records).toHaveLength(1 + others);
      for (const c of records) {
        expect(c.stage).toBe("content");
        expect(c.costEur).toBeCloseTo(costEur(config, config.models.content.model, USAGE), 10);
      }
    });
  }

  it("retries only the page whose answer fails validation, with the issue's path in that page's own answer", async () => {
    const { input, golden } = await contentInput("fizioterapija-pregib");
    const cenik = golden.pages.find((p) => p.id === "p_cenik")!;
    const long = structuredClone(cenik);
    (long.sections[0]!.props as { title: string }).title = "Cenik ".repeat(20);
    const split = goldenContent(golden, (id, n) => (id === "p_cenik" && n === 1 ? { pages: [long] } : undefined));
    const r = await generateContent(new ModelClient({ config, transport: split.transport, spentToday: async () => 0, onCall: async () => undefined }), { ...input, homepageFirst: true });
    expect(Object.fromEntries(split.asked)).toEqual({ home: 1, p_cenik: 2, p_kontakt: 1 });
    const retry = split.seen.filter((s) => /\(page id p_cenik,/.test(textOf(s.req)))[1]!.req.messages;
    expect(retry).toHaveLength(3);
    expect(retry[2]!.content).toMatch(/- \/pages\/0\/sections\/0\/props\/title: Too big/);
    expect(r.issues).toEqual([]);
    expect(r.parts).toContain("p_cenik: 2 call(s)");
  });

  it("a page that keeps an invented fact leaves the merged spec with its issue, as a one-call answer would", async () => {
    const { input, golden } = await contentInput("fizioterapija-pregib");
    const kontakt = structuredClone(golden.pages.find((p) => p.id === "p_kontakt")!);
    (kontakt.sections[0]!.props as { intro?: string }).intro = "Pokličite nas na 040 123 987, odgovorimo isti dan.";
    const split = goldenContent(golden, (id) => (id === "p_kontakt" ? { pages: [kontakt] } : undefined));
    const r = await generateContent(new ModelClient({ config, transport: split.transport, spentToday: async () => 0, onCall: async () => undefined }), { ...input, homepageFirst: true });
    expect(split.asked.get("p_kontakt")).toBe(1 + config.limits.contentRetries);
    expect(r.issues.join(" ")).toMatch(/\/pages\/2\/sections\/0\/props\/intro: phone/);
    expect(r.parts).toContain(`p_kontakt: ${1 + config.limits.contentRetries} call(s), 1 issue(s) left`);
  });

  it("one call as before for a homepage-only job, a one-page site, or with structured output", async () => {
    for (const [id, scope, structured] of [
      ["fizioterapija-pregib", "home", false],
      ["pekarna-kvas", "full", false],
      ["fizioterapija-pregib", "full", true],
    ] as const) {
      const { input, golden } = await contentInput(id, scope);
      const c = goldenContent(golden, (part) => (scope === "home" && part === "site" ? { chrome: golden.chrome, pages: [{ ...golden.pages[0]!, sections: golden.pages[0]!.sections.slice(0, 1) }] } : undefined));
      await generateContent(new ModelClient({ config, transport: c.transport, spentToday: async () => 0, onCall: async () => undefined }), { ...input, structuredOutput: structured, homepageFirst: true });
      expect([...c.asked.keys()], `${id} ${scope} ${structured}`).toEqual(["site"]);
    }
  });
});
