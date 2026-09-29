// Lighthouse is ~325 MB once loaded: imported on first use, so the web service (which never runs checks) stays small.

export interface LighthouseScores {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
  lcpMs: number;
  /** Failing audit ids per category, for the report. */
  failing: string[];
}

/** Lighthouse mobile (default form factor and simulated throttling) against a Chromium debugging port. */
export async function runLighthouse(url: string, port: number): Promise<LighthouseScores> {
  const { default: lighthouse } = await import("lighthouse");
  const result = await lighthouse(url, {
    port,
    output: "json",
    logLevel: "error",
    onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
  });
  if (!result) throw new Error("Lighthouse returned no result");
  const lhr = result.lhr;
  const score = (id: string) => Math.round((lhr.categories[id]?.score ?? 0) * 100);
  const failing: string[] = [];
  for (const [cat, c] of Object.entries(lhr.categories)) {
    for (const ref of c.auditRefs) {
      const a = lhr.audits[ref.id];
      if (ref.weight > 0 && a && a.score !== null && a.score < 0.9) failing.push(`${cat}:${ref.id}`);
    }
  }
  return {
    performance: score("performance"),
    accessibility: score("accessibility"),
    bestPractices: score("best-practices"),
    seo: score("seo"),
    lcpMs: Math.round(Number(lhr.audits["largest-contentful-paint"]?.numericValue ?? 0)),
    failing,
  };
}
