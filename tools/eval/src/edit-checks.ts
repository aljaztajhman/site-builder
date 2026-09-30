import { getAt, hexToHsl, luminance, type SiteSpec } from "@sb/spec";
import type { EditCheck } from "./fixtures/schema.ts";

export interface EditCheckResult {
  pass: boolean | null;
  detail: string;
}

/** Visible-ish text of rendered pages: tags stripped, entities decoded, whitespace collapsed. */
export function pagesText(pages: Iterable<string>): string {
  return [...pages]
    .map((html) =>
      html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;|&#160;|\u00a0/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#x27;|&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">"),
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

const countType = (spec: SiteSpec, type: string) => spec.pages.reduce((n, p) => n + p.sections.filter((s) => s.type === type).length, 0);

const WARM = (h: number) => h <= 60 || h >= 330;

export function evaluateEditCheck(check: EditCheck, before: SiteSpec, after: SiteSpec, renderedText: string): EditCheckResult {
  switch (check.kind) {
    case "equals": {
      const v = getAt(after, check.path);
      const pass = JSON.stringify(v) === JSON.stringify(check.value);
      return { pass, detail: `${check.path} = ${JSON.stringify(v)}` };
    }
    case "hasSectionType": {
      const pages = check.page === "home" ? after.pages.filter((p) => p.kind === "home") : after.pages;
      const pass = pages.some((p) => p.sections.some((s) => s.type === check.type));
      return { pass, detail: `${check.type} ${pass ? "present" : "missing"}` };
    }
    case "noSectionType": {
      const n = countType(after, check.type);
      return { pass: n === 0, detail: `${n} × ${check.type}` };
    }
    case "sectionCountDelta": {
      const d = countType(after, check.type) - countType(before, check.type);
      return { pass: d === check.delta, detail: `delta ${d}` };
    }
    case "colorDarker": {
      const a = getAt(before, check.path) as string;
      const b = getAt(after, check.path) as string;
      return { pass: luminance(b) < luminance(a), detail: `${a} → ${b}` };
    }
    case "colorWarmer": {
      const a = hexToHsl(getAt(before, check.path) as string);
      const b = hexToHsl(getAt(after, check.path) as string);
      const dist = (h: number) => Math.min(Math.abs(h - 30), 360 - Math.abs(h - 30));
      const pass = dist(b.h) < dist(a.h) - 5 || (WARM(b.h) && WARM(a.h) && b.s > a.s + 0.05);
      return { pass, detail: `hue ${a.h.toFixed(0)}→${b.h.toFixed(0)}, sat ${a.s.toFixed(2)}→${b.s.toFixed(2)}` };
    }
    case "colorHueIn": {
      const b = hexToHsl(getAt(after, check.path) as string);
      const inRange = check.from <= check.to ? b.h >= check.from && b.h <= check.to : b.h >= check.from || b.h <= check.to;
      return { pass: inRange && b.s >= check.minSaturation, detail: `${check.name}: hue ${b.h.toFixed(0)} (${check.from}–${check.to}), sat ${b.s.toFixed(2)}` };
    }
    case "textContains": {
      const pass = renderedText.includes(check.text.toLowerCase());
      return { pass, detail: `"${check.text}" ${pass ? "found" : "not found"}` };
    }
    case "textAbsent": {
      const pass = !renderedText.includes(check.text.toLowerCase());
      return { pass, detail: `"${check.text}" ${pass ? "absent" : "still present"}` };
    }
    case "manual":
      return { pass: null, detail: "needs a human look (see screenshot)" };
  }
}
