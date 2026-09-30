/** What the landing page's prompt keeps across the login, in sessionStorage (same tab, never the URL). */
export const INTAKE_DRAFT_KEY = "sb-intake-draft";

export interface IntakeDraft {
  description: string;
  /** The visitor pressed "+ Fotografije" or "+ Logotip": focus that control after the login. */
  attach?: "photos" | "logo";
  scope?: "home" | "full";
}

/** Reads and removes the draft; null when there is none or storage is unavailable. */
export function takeIntakeDraft(): IntakeDraft | null {
  try {
    const raw = sessionStorage.getItem(INTAKE_DRAFT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(INTAKE_DRAFT_KEY);
    const v = JSON.parse(raw) as Partial<IntakeDraft>;
    return {
      description: typeof v.description === "string" ? v.description : "",
      attach: v.attach === "photos" || v.attach === "logo" ? v.attach : undefined,
      scope: v.scope === "full" ? "full" : v.scope === "home" ? "home" : undefined,
    };
  } catch {
    return null;
  }
}
