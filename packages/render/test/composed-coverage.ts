import { COMPOSED_SHEETS, sharedBundle, type ComposedSheet } from "../src/index.ts";

/** A selector list split at its top-level commas (not those inside :is(), :where(), :has(), :not()). */
function splitSelectors(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < list.length; i++) {
    if (list[i] === "(") depth++;
    else if (list[i] === ")") depth--;
    else if (list[i] === "," && depth === 0) {
      out.push(list.slice(from, i));
      from = i + 1;
    }
  }
  return [...out, list.slice(from)];
}

/** Drops every parenthesised part (functional pseudo-classes): the classes in it are alternatives or exclusions, not requirements. */
const outsideParens = (selector: string): string => {
  let out = "";
  let depth = 0;
  for (const ch of selector) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (depth === 0) out += ch;
  }
  return out;
};

/**
 * Every selector of a minified sheet's style rules (inside at-rules too) that sets more than custom properties (a rule
 * of only custom properties does nothing unless a rule reading them applies, and that rule is checked itself), with the
 * classes it requires.
 */
function selectorClasses(css: string): { selector: string; classes: string[]; anyOf: string[][] }[] {
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ prelude: m[1]!.trim(), body: m[2]! })).filter((r) => !r.prelude.startsWith("@") && !r.prelude.startsWith("from") && !r.prelude.startsWith("to"));
  return rules
    .filter((r) => r.body.split(";").some((d) => d.trim() !== "" && !d.trim().startsWith("--")))
    .flatMap((r) =>
      splitSelectors(r.prelude).map((selector) => ({
        selector,
        classes: [...outsideParens(selector).matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]!),
        anyOf: [...selector.matchAll(/:(?:is|where)\(([^()]*)\)/g)].map((m) => splitSelectors(m[1]!).flatMap((alt) => [...alt.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((x) => x[1]!))),
      })),
    );
}

/**
 * The rules of composed sheets a page doesn't link that could apply to it: a selector of an unlinked sheet (core or a v2
 * region, read from the page's <link>s) whose classes are all on the page and at least one of them a composed class
 * (cx-*). Empty when the page links every sheet its markup needs. Over-approximates (an attribute or a combinator can
 * still keep a rule from matching), which is the safe side.
 */
export function uncoveredClasses(html: string): string[] {
  const bundle = sharedBundle();
  const keys = Object.keys(COMPOSED_SHEETS) as ComposedSheet[];
  const linked = keys.filter((k) => html.includes(`/${bundle.hash}/${COMPOSED_SHEETS[k]().name}"`));
  const used = new Set([...html.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1]!.split(/\s+/).filter(Boolean)));
  const out = new Set<string>();
  for (const k of keys.filter((x) => !linked.includes(x))) {
    for (const { selector, classes, anyOf } of selectorClasses(COMPOSED_SHEETS[k]().css)) {
      const could = classes.every((c) => used.has(c)) && anyOf.every((alts) => alts.length === 0 || alts.some((c) => used.has(c)));
      if (could && [...classes, ...anyOf.flat()].some((c) => c.startsWith("cx"))) out.add(`${selector} (in ${k})`);
    }
  }
  return [...out];
}
