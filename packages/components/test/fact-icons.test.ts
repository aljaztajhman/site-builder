import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PRACTICAL_FACTS } from "@sb/spec";
import { FactIcon } from "../src/groups/composed/kinds/icon-facts.tsx";
import { ICON_STROKE, LINE_ICONS, factIconPath, factIconSvg } from "../src/groups/composed/kinds/icons.ts";

/**
 * The practical-fact line icons (batch I9-p, docs/plans/studio-phase1-design.md §5): one per PRACTICAL_FACTS key, ≤ 1 KiB,
 * a 1.5–2 px stroke at 24 px, the geometry inside the 24 grid's 2–22 live area at a consistent optical size.
 */
type Pt = [number, number];

/** Points along a path (curves and arcs sampled), enough for a bounding box; supports M L H V C S Q A Z, absolute and relative. */
function samplePath(d: string): Pt[] {
  const toks = d.match(/[a-zA-Z]|-?(?:\d*\.\d+|\d+)/g) ?? [];
  const ARGS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, A: 7, Z: 0 };
  const out: Pt[] = [];
  let i = 0;
  let cmd = "";
  let cur: Pt = [0, 0];
  let start: Pt = [0, 0];
  let lastCtrl: Pt | null = null;
  const cubic = (p0: Pt, p1: Pt, p2: Pt, p3: Pt) => {
    for (let k = 1; k <= 16; k++) {
      const t = k / 16;
      const u = 1 - t;
      out.push([u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0], u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1]]);
    }
  };
  const arc = (p0: Pt, rx: number, ry: number, phiDeg: number, large: number, sweep: number, p1: Pt) => {
    // SVG 1.1 F.6.5: endpoint to centre parameterisation.
    const phi = (phiDeg * Math.PI) / 180;
    const [cos, sin] = [Math.cos(phi), Math.sin(phi)];
    const dx = (p0[0] - p1[0]) / 2;
    const dy = (p0[1] - p1[1]) / 2;
    const x1 = cos * dx + sin * dy;
    const y1 = -sin * dx + cos * dy;
    const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
    if (lambda > 1) [rx, ry] = [rx * Math.sqrt(lambda), ry * Math.sqrt(lambda)];
    const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
    const co = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / (rx * rx * y1 * y1 + ry * ry * x1 * x1)));
    const cx1 = (co * rx * y1) / ry;
    const cy1 = (-co * ry * x1) / rx;
    const cx = cos * cx1 - sin * cy1 + (p0[0] + p1[0]) / 2;
    const cy = sin * cx1 + cos * cy1 + (p0[1] + p1[1]) / 2;
    const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    const t1 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
    let dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
    if (!sweep && dt > 0) dt -= 2 * Math.PI;
    if (sweep && dt < 0) dt += 2 * Math.PI;
    for (let k = 1; k <= 32; k++) {
      const t = t1 + (dt * k) / 32;
      out.push([cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos]);
    }
  };
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i]!)) cmd = toks[i++]!;
    const U = cmd.toUpperCase();
    const rel = cmd !== U;
    if (!(U in ARGS)) throw new Error(`unsupported command ${cmd}`);
    if (U === "Z") {
      cur = start;
      out.push(cur);
      lastCtrl = null;
      continue;
    }
    const a = toks.slice(i, i + ARGS[U]!).map(Number);
    i += ARGS[U]!;
    const abs = (x: number, y: number): Pt => (rel ? [cur[0] + x, cur[1] + y] : [x, y]);
    let ctrl: Pt | null = null;
    if (U === "M") {
      cur = start = abs(a[0]!, a[1]!);
      out.push(cur);
      cmd = rel ? "l" : "L";
    } else if (U === "L") cur = abs(a[0]!, a[1]!);
    else if (U === "H") cur = [rel ? cur[0] + a[0]! : a[0]!, cur[1]];
    else if (U === "V") cur = [cur[0], rel ? cur[1] + a[0]! : a[0]!];
    else if (U === "C" || U === "S") {
      const c1: Pt = U === "C" ? abs(a[0]!, a[1]!) : lastCtrl ? [2 * cur[0] - lastCtrl[0], 2 * cur[1] - lastCtrl[1]] : cur;
      const rest = U === "C" ? a.slice(2) : a;
      const c2 = abs(rest[0]!, rest[1]!);
      const end = abs(rest[2]!, rest[3]!);
      cubic(cur, c1, c2, end);
      ctrl = c2;
      cur = end;
    } else if (U === "Q") {
      const c = abs(a[0]!, a[1]!);
      const end = abs(a[2]!, a[3]!);
      cubic(cur, [cur[0] + (2 / 3) * (c[0] - cur[0]), cur[1] + (2 / 3) * (c[1] - cur[1])], [end[0] + (2 / 3) * (c[0] - end[0]), end[1] + (2 / 3) * (c[1] - end[1])], end);
      cur = end;
    } else if (U === "A") {
      const end = abs(a[5]!, a[6]!);
      arc(cur, a[0]!, a[1]!, a[2]!, a[3]!, a[4]!, end);
      cur = end;
    }
    lastCtrl = ctrl;
    out.push(cur);
  }
  return out;
}

function bbox(d: string): { x0: number; y0: number; x1: number; y1: number } {
  const pts = samplePath(d);
  return {
    x0: Math.min(...pts.map((p) => p[0])),
    y0: Math.min(...pts.map((p) => p[1])),
    x1: Math.max(...pts.map((p) => p[0])),
    y1: Math.max(...pts.map((p) => p[1])),
  };
}

describe("practical-fact icons", () => {
  it("every PRACTICAL_FACTS key has its own line icon, and nothing else does", () => {
    expect(Object.keys(LINE_ICONS).sort()).toEqual([...PRACTICAL_FACTS].sort());
    expect(new Set(Object.values(LINE_ICONS)).size).toBe(PRACTICAL_FACTS.length);
    expect(factIconPath("sauna")).toBeUndefined();
    expect(factIconPath("toString")).toBeUndefined();
  });

  it("FactIcon writes exactly factIconSvg's markup, and nothing for an unknown fact (no fallback icon)", () => {
    for (const fact of PRACTICAL_FACTS) expect(renderToStaticMarkup(createElement(FactIcon, { fact })), fact).toBe(factIconSvg(fact));
    expect(renderToStaticMarkup(createElement(FactIcon, { fact: "sauna" }))).toBe("");
    expect(factIconSvg("sauna")).toBeNull();
  });

  it.each([...PRACTICAL_FACTS])("%s: ≤ 1 KiB, one stroked path in currentColor, 1.5–2 px at 24 px, no fill or transform", (fact) => {
    const svg = factIconSvg(fact)!;
    expect(Buffer.byteLength(svg)).toBeLessThanOrEqual(1024);
    expect(svg).toMatch(/^<svg class="cx-if__ic" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="([\d.]+)" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="[^"]+"><\/path><\/svg>$/);
    // viewBox 24 drawn at 24 px: one grid unit is one pixel, so the stroke is ICON_STROKE px.
    expect(ICON_STROKE).toBeGreaterThanOrEqual(1.5);
    expect(ICON_STROKE).toBeLessThanOrEqual(2);
    expect(svg).not.toMatch(/transform|vector-effect|<(?:rect|circle|ellipse|polygon|text|image|use)\b/);
    expect(LINE_ICONS[fact]).toMatch(/^M[\d. MLHVCSQAZmlhvcsqaz-]+$/);
  });

  it.each([...PRACTICAL_FACTS])("%s: geometry inside the 2–22 live area (the stroke never clips) and at least 15 units on its long side", (fact) => {
    const b = bbox(LINE_ICONS[fact]);
    const r = (v: number) => Math.round(v * 100) / 100;
    expect(r(b.x0), "left").toBeGreaterThanOrEqual(2);
    expect(r(b.y0), "top").toBeGreaterThanOrEqual(2);
    expect(r(b.x1), "right").toBeLessThanOrEqual(22);
    expect(r(b.y1), "bottom").toBeLessThanOrEqual(22);
    expect(Math.max(b.x1 - b.x0, b.y1 - b.y0), "optical size").toBeGreaterThanOrEqual(15);
  });

  it("samplePath measures a known circle and rounded rect", () => {
    expect(bbox("M2.5 12a9.5 9.5 0 1 0 19 0a9.5 9.5 0 1 0 -19 0")).toEqual({ x0: 2.5, y0: expect.closeTo(2.5, 2), x1: 21.5, y1: expect.closeTo(21.5, 2) });
    const rr = bbox("M7 2.5H17A2.5 2.5 0 0 1 19.5 5V12.5A2.5 2.5 0 0 1 17 15H7A2.5 2.5 0 0 1 4.5 12.5V5A2.5 2.5 0 0 1 7 2.5Z");
    expect([rr.x0, rr.y0, rr.x1, rr.y1].map((v) => Math.round(v * 100) / 100)).toEqual([4.5, 2.5, 19.5, 15]);
  });
});
