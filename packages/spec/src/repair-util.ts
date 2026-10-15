import { validateSite } from "./validate.ts";
import type { SiteSpec } from "./site.ts";
import { getAt, parsePointer } from "./pointer.ts";

// Shared by the safe in-place repairs (images-once.ts, text-once.ts); not exported from the package.

export const issueKeys = (spec: SiteSpec): Set<string> => {
  const v = validateSite(spec);
  return new Set(v.ok ? [] : v.issues.map((i) => `${i.path} ${i.message}`));
};

/** Every issue of `after` was already there before (the change made nothing invalid). */
export const noNewIssues = (before: Set<string>, after: Set<string>) => [...after].every((k) => before.has(k));

/** Removes the value at `at` inside props: the key of an object, or the item of an array. */
export function removeAt(props: unknown, at: string): void {
  const keys = parsePointer(at);
  const last = keys.pop()!;
  const parentAt = keys.length ? `/${keys.map((k) => k.replace(/~/g, "~0").replace(/\//g, "~1")).join("/")}` : "";
  const parent = parentAt ? getAt(props, parentAt) : props;
  if (Array.isArray(parent)) parent.splice(Number(last), 1);
  else if (parent && typeof parent === "object") delete (parent as Record<string, unknown>)[last];
}
