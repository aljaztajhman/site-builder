import { describe, expect, it } from "vitest";
import type { UrlCheckResult } from "@sb/engine";
import { aggregateStudy, parseStudyList, studyMarkdown, type StudyRow } from "../src/study-aggregate.ts";

/** The study's aggregates: counts per finding and trade, medians, and no site named in the summary. */

const result = (over: Partial<UrlCheckResult> = {}, phone: Partial<UrlCheckResult["phone"]> = {}): UrlCheckResult => ({
  url: "https://x.si/",
  finalUrl: "https://x.si/",
  https: true,
  checkedAt: "2026-10-03T10:00:00Z",
  phone: { width: 360, viewportMeta: true, horizontalScroll: false, tinyTargets: 0, smallPrimaryTargets: 0, smallText: 0, hasCallLink: true, callInViewport: true, ...phone },
  speed: { performance: 95, lcpMs: 1500 },
  cookiesBeforeConsent: [],
  company: { companyForm: true, address: true, email: true, registration: true, taxNumber: true },
  lang: "sl",
  ...over,
});

describe("study", () => {
  const rows: StudyRow[] = [
    { url: "https://frizer-ena.si/", vertical: "frizer", result: result() },
    { url: "https://frizer-dva.si/", vertical: "frizer", result: result({ https: false, speed: { performance: 40, lcpMs: 6000 } }, { horizontalScroll: true, callInViewport: false }) },
    { url: "https://gostilna.si/", vertical: "gostilna", result: result({ speed: null, cookiesBeforeConsent: [{ name: "_ga", domain: "gostilna.si", kind: "analytics", thirdParty: false }], company: { companyForm: false, address: true, email: true, registration: false, taxNumber: false } }) },
    { url: "https://ne-dela.si/", vertical: "gostilna", error: "unreachable" },
  ];

  it("counts per finding, per trade and per ZEPT item; medians only where Lighthouse ran", () => {
    const a = aggregateStudy(rows);
    expect(a).toMatchObject({ sites: 4, checked: 3, notChecked: 1, medianPerformance: 68, medianLcpMs: 3750 });
    expect(a.failing.https).toEqual({ fail: 1, of: 3 });
    expect(a.failing.speed).toEqual({ fail: 1, of: 2 });
    expect(a.failing.cookies).toEqual({ fail: 1, of: 3 });
    expect(a.companyMissing).toEqual({ companyForm: 1, address: 0, email: 0, registration: 1, taxNumber: 1 });
    expect(a.failAtLeast).toEqual({ 1: 2, 3: 1, 5: 0 });
    expect(a.byVertical.frizer).toEqual({ checked: 2, failing: { https: 1, fit: 1, call: 1, speed: 1 } });
    expect(a.byVertical.gostilna!.checked).toBe(1);
  });

  it("writes a summary that names no site", () => {
    const md = studyMarkdown(aggregateStudy(rows), "2026-10-03");
    expect(md).toContain("4 sites in the list, 3 checked");
    expect(md).toContain("| No secure connection (https) | 1 of 3 | 33 % |");
    for (const r of rows) expect(md).not.toContain(new URL(r.url).hostname);
  });

  it("reads the list: url or url,trade, headers, comments and repeats skipped", () => {
    expect(parseStudyList("url,trade\n# frizerji\nfrizer.si, Frizer\n\nFRIZER.si,frizer\ngostilna.si\n")).toEqual([
      { url: "frizer.si", vertical: "frizer" },
      { url: "gostilna.si", vertical: "" },
    ]);
  });
});
