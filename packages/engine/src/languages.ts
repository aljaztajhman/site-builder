import type { Operation } from "fast-json-patch";
import { isSiteLocale, type SiteSpec } from "@sb/spec";

/** "angleščina": a language as the owner reads it in a sentence. */
const LANGUAGE: Record<string, string> = { sl: "slovenščina", en: "angleščina" };
const capital = (s: string): string => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;

/**
 * The operations that switch a site's second language on or off (it-editor-languages; Strani › Jeziki). They go
 * through the direct editor like any edit (validated, held to the plan's languages by limitBreach, saved as a
 * version, so undo and the version list bring it back). Switching on writes no translation: the owner types each
 * one, and the site can't be published while a text of its pages has none (publishChecklist). Switching off drops
 * the language's translations with it (a version keeps them).
 */
export function localeOps(spec: SiteSpec, locale: string, on: boolean): Operation[] | { error: string } {
  if (!isSiteLocale(locale)) return { error: "Tega jezika ni mogoče dodati." };
  const name = LANGUAGE[locale] ?? locale;
  if (locale === spec.locales.default) return { error: `${capital(name)} je glavni jezik strani.` };
  const enabled = spec.locales.enabled;
  if (on) {
    if (enabled.includes(locale)) return { error: `${capital(name)} je že vklopljena.` };
    return [{ op: "add", path: "/locales/enabled/-", value: locale }];
  }
  if (!enabled.includes(locale)) return { error: `${capital(name)} ni vklopljena.` };
  const ops: Operation[] = [{ op: "replace", path: "/locales/enabled", value: enabled.filter((l) => l !== locale) }];
  const translations = spec.translations ?? {};
  if (locale in translations) {
    ops.push(Object.keys(translations).length === 1 ? { op: "remove", path: "/translations" } : { op: "remove", path: `/translations/${locale}` });
  }
  return ops;
}
