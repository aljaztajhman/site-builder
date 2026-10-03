import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { migrateSpec, type SiteSpec } from "@sb/spec";
import { renderPage } from "../src/index.ts";

const golden = () => migrateSpec(JSON.parse(readFileSync(new URL("../../../tools/eval/golden/pekarna-kvas.json", import.meta.url), "utf8"))) as SiteSpec;
const NBSP = "\u00a0";

function dated(): SiteSpec {
  const spec = golden();
  spec.chrome.footer.year = 2026;
  const s = spec.pages.find((p) => p.kind === "accessibility")!.sections[0]!;
  if (s.type === "legal") s.props.date = "2026-10-02";
  return spec;
}
const statement = (spec: SiteSpec) => renderPage(spec, spec.pages.find((p) => p.kind === "accessibility")!);

afterEach(() => {
  vi.useRealTimers();
});

describe("dates on the page", () => {
  it("come from the spec: the same page today and next year (preview, publish and export agree)", () => {
    const spec = dated();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-02T10:00:00Z"));
    const now = statement(spec);
    vi.setSystemTime(new Date("2027-03-15T10:00:00Z"));
    expect(statement(spec)).toBe(now);
    expect(now).toContain(`Izjava je bila pripravljena 2.${NBSP}10.${NBSP}2026.`);
    expect(now).toContain("© 2026 ");
  });

  it("fall back to the day of rendering for a site made before v11", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-03-15T10:00:00Z"));
    const html = statement(golden());
    expect(html).toContain(`Izjava je bila pripravljena 15.${NBSP}3.${NBSP}2027.`);
    expect(html).toContain("© 2027 ");
  });
});
