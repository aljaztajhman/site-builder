import { renderPage } from "@sb/render";
import type { SiteSpec } from "@sb/spec";

/** Tags inside a line of text: dropped, so a sentence with a bold word stays one sentence. Any other tag ends a block. */
const INLINE_TAG = /<\/?(span|strong|em|b|i|small|mark|abbr|sup|sub|time|data|q|cite|wbr|bdi|bdo|s|u)\b[^>]*>/gi;

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/**
 * The text a rendered page shows, roughly as a visitor reads it: the body's text without scripts, styles, templates
 * and link or button labels (actions repeat by design; the browser check skips them too), one block of text per line
 * (inline tags kept within it), entities decoded. For counting sentences (repairRepeatedSentences), not for display.
 */
export function visibleText(html: string): string {
  return html
    .replace(/<head\b[\s\S]*?<\/head>/gi, "\n")
    .replace(/<(script|style|template|noscript)\b[\s\S]*?<\/\1>/gi, "\n")
    .replace(/<(a|button)\b[\s\S]*?<\/\1>/gi, "\n")
    .replace(/<br\b[^>]*>/gi, " ")
    .replace(INLINE_TAG, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
      e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (NAMED[e.toLowerCase()] ?? m),
    );
}

/** A page of the spec, rendered, as visible text (the PageText repairRepeatedSentences counts sentences in). */
export const renderedPageText = (spec: SiteSpec, pageIndex: number): string => visibleText(renderPage(spec, spec.pages[pageIndex]!));
