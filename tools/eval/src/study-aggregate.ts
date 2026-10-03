import { urlCheckFindings, type Finding, type UrlCheckResult } from "@sb/engine";

/**
 * "Spletne strani slovenskih malih podjetij" (GO-TO-MARKET.md): the checker's results over many public
 * sites, reduced to aggregates. No site is named in the output; the per-site rows stay in eval/runs/.
 */

export interface StudyRow {
  url: string;
  /** The trade from the input list (frizer, gostilna, …), or "" when not given. */
  vertical: string;
  result?: UrlCheckResult;
  /** Why the site couldn't be checked (unreachable, refused, …). */
  error?: string;
}

export interface StudyAggregate {
  sites: number;
  checked: number;
  notChecked: number;
  /** Per finding: how many checked sites fail it, of how many it applies to (speed only where Lighthouse ran). */
  failing: Record<Finding["id"], { fail: number; of: number }>;
  /** Missing ZEPT details, per item. */
  companyMissing: Record<"companyForm" | "address" | "email" | "registration" | "taxNumber", number>;
  /** Medians over sites where Lighthouse ran. */
  medianPerformance: number | null;
  medianLcpMs: number | null;
  /** Sites that fail at least `n` findings. */
  failAtLeast: Record<1 | 3 | 5, number>;
  byVertical: Record<string, { checked: number; failing: Partial<Record<Finding["id"], number>> }>;
}

const IDS: Finding["id"][] = ["https", "fit", "targets", "text", "call", "speed", "cookies", "company"];

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
}

export function aggregateStudy(rows: StudyRow[]): StudyAggregate {
  const checked = rows.filter((r): r is StudyRow & { result: UrlCheckResult } => !!r.result);
  const failing = Object.fromEntries(IDS.map((id) => [id, { fail: 0, of: 0 }])) as StudyAggregate["failing"];
  const companyMissing = { companyForm: 0, address: 0, email: 0, registration: 0, taxNumber: 0 };
  const failAtLeast = { 1: 0, 3: 0, 5: 0 };
  const byVertical: StudyAggregate["byVertical"] = {};
  for (const r of checked) {
    const findings = urlCheckFindings(r.result);
    const v = (byVertical[r.vertical || "drugo"] ??= { checked: 0, failing: {} });
    v.checked++;
    let fails = 0;
    for (const f of findings) {
      failing[f.id].of++;
      if (!f.ok) {
        failing[f.id].fail++;
        v.failing[f.id] = (v.failing[f.id] ?? 0) + 1;
        fails++;
      }
    }
    for (const k of Object.keys(companyMissing) as (keyof typeof companyMissing)[]) if (!r.result.company[k]) companyMissing[k]++;
    for (const n of [1, 3, 5] as const) if (fails >= n) failAtLeast[n]++;
  }
  const speeds = checked.flatMap((r) => (r.result.speed ? [r.result.speed] : []));
  return {
    sites: rows.length,
    checked: checked.length,
    notChecked: rows.length - checked.length,
    failing,
    companyMissing,
    medianPerformance: median(speeds.map((s) => s.performance)),
    medianLcpMs: median(speeds.map((s) => s.lcpMs)),
    failAtLeast,
    byVertical,
  };
}

const LABEL: Record<Finding["id"], string> = {
  https: "No secure connection (https)",
  fit: "Doesn't fit a phone screen",
  targets: "Buttons or links too small for a finger",
  text: "Text under 16 px",
  call: "No tap-to-call on the first phone screen",
  speed: "Lighthouse mobile performance under 90",
  cookies: "Tracking cookies before consent",
  company: "ZEPT company details missing on the first page",
};

const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)} %` : "–");

/** The aggregate as Markdown, for the owner to read before anything is published. No site names. */
export function studyMarkdown(a: StudyAggregate, date: string): string {
  const lines = [
    `# Small-business websites study (${date})`,
    "",
    `${a.sites} sites in the list, ${a.checked} checked on a phone (360×800), ${a.notChecked} couldn't be checked. First page only; automated, no model calls. Aggregates only, no site is named.`,
    "",
    "| Finding | Sites | Share |",
    "|---|---|---|",
    ...(Object.keys(LABEL) as Finding["id"][]).map((id) => `| ${LABEL[id]} | ${a.failing[id].fail} of ${a.failing[id].of} | ${pct(a.failing[id].fail, a.failing[id].of)} |`),
    "",
    `- At least 1 problem: ${pct(a.failAtLeast[1], a.checked)}; at least 3: ${pct(a.failAtLeast[3], a.checked)}; at least 5: ${pct(a.failAtLeast[5], a.checked)}.`,
    `- Median Lighthouse mobile performance: ${a.medianPerformance ?? "–"}; median largest contentful paint: ${a.medianLcpMs === null ? "–" : `${(a.medianLcpMs / 1000).toFixed(1)} s`}.`,
    `- ZEPT details not found on the first page: company form ${pct(a.companyMissing.companyForm, a.checked)}, address ${pct(a.companyMissing.address, a.checked)}, email ${pct(a.companyMissing.email, a.checked)}, registration number ${pct(a.companyMissing.registration, a.checked)}, tax number ${pct(a.companyMissing.taxNumber, a.checked)}.`,
    "",
    "## By trade",
    "",
    `| Trade | Checked | ${(Object.keys(LABEL) as Finding["id"][]).join(" | ")} |`,
    `|---|---|${(Object.keys(LABEL) as Finding["id"][]).map(() => "---").join("|")}|`,
    ...Object.entries(a.byVertical)
      .sort((x, y) => y[1].checked - x[1].checked)
      .map(([v, s]) => `| ${v} | ${s.checked} | ${(Object.keys(LABEL) as Finding["id"][]).map((id) => pct(s.failing[id] ?? 0, s.checked)).join(" | ")} |`),
    "",
  ];
  return lines.join("\n");
}

/** One input line: "url" or "url,trade" (a header line starting with "url" and # comments are skipped). */
export function parseStudyList(text: string): { url: string; vertical: string }[] {
  const out: { url: string; vertical: string }[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || /^url\s*(,|$)/i.test(line)) continue;
    const [url, vertical = ""] = line.split(",").map((s) => s.trim());
    if (!url || seen.has(url.toLowerCase())) continue;
    seen.add(url.toLowerCase());
    out.push({ url, vertical: vertical.toLowerCase() });
  }
  return out;
}
