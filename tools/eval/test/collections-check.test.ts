import { describe, expect, it } from "vitest";
import { loadConfig } from "@sb/config";
import { checkSite } from "@sb/engine";
import { siteFiles } from "@sb/render";
import { withCollections } from "../../../packages/render/test/collections-fixture.ts";

/**
 * The site checks (axe, phone checklist, banned visual patterns) on collection pages: a list page and a
 * post's, an event's and a service's own page, as a site with collections publishes them.
 */
describe("collection pages in the site checks", () => {
  it("pass axe, fit 360 px, have no small body text or tap targets and no over-long lines", async () => {
    const spec = withCollections();
    spec.collections!.services = { page: "p_novice", items: [{ name: "Peka po naročilu", summary: "Torte in pecivo.", body: ["Naročila sprejemamo tri dni prej."], price: { amount: 25, from: true } }] };
    spec.pages[1]!.sections.push({ id: "s_svc", type: "collection", variant: "list", props: { kind: "services", title: "Storitve" } });
    const pages = ["index.html", "novice.html", "novice/kvasni-tecaj-za-zacetnike.html", "dogodki/dan-odprtih-vrat.html", "storitve/peka-po-narocilu.html"];
    const r = await checkSite(spec, siteFiles(spec, new Map()), { config: loadConfig(), corpus: "", pages });
    expect(r.pages.map((p) => p.file)).toEqual(pages);
    for (const p of r.pages) {
      expect(p.axe.map((a) => a.id), p.file).toEqual([]);
      expect([p.mobile.horizontalScroll, p.desktop.horizontalScroll], p.file).toEqual([false, false]);
      expect(p.mobile.smallText, p.file).toEqual([]);
      expect([...p.mobile.tinyTargets, ...p.mobile.smallPrimaryTargets, ...p.mobile.crowdedTargets], p.file).toEqual([]);
      expect(p.desktop.lineLengths.filter((n) => n > 75), p.file).toEqual([]);
      expect([...p.mobile.banned, ...p.desktop.banned], p.file).toEqual([]);
    }
  }, 180_000);
});
