import { isSiteLocale, type SiteLocale } from "./common.ts";
import type { SiteSpec } from "./site.ts";

/**
 * A stored spec with a locale sites can no longer use (de, hr, it: no UI strings, so they rendered English
 * buttons under lang="de") read as one that only has sl/en. Not a schema change, so no version bump: the
 * schema still accepts those locales and this runs where specs are read (Repo.getSpec).
 *
 * - default not available: "sl" (generated content is Slovene)
 * - enabled: the available ones, default first
 * - translations: only for the enabled locales (an overlay for de is dropped with de)
 *
 * Returns the same object when there is nothing to change.
 */
export function withSiteLocales(spec: SiteSpec): SiteSpec {
  const { locales, translations } = spec;
  // Not a whole spec (tests store fragments): nothing to read.
  if (!locales || !Array.isArray(locales.enabled)) return spec;
  const keys = Object.keys(translations ?? {});
  if (isSiteLocale(locales.default) && locales.enabled.every(isSiteLocale) && keys.every(isSiteLocale)) return spec;
  const def: SiteLocale = isSiteLocale(locales.default) ? locales.default : "sl";
  const enabled = [...new Set([def, ...locales.enabled.filter(isSiteLocale)])];
  const kept = Object.fromEntries(Object.entries(translations ?? {}).filter(([l]) => isSiteLocale(l) && enabled.includes(l)));
  const next: SiteSpec = { ...spec, locales: { default: def, enabled } };
  if (translations === undefined) return next;
  return { ...next, translations: kept };
}
