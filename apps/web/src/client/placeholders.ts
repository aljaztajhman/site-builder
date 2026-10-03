/**
 * The spec path of a yellow placeholder tapped in the preview. The markup carries only its kind (preview equals
 * the published page, so no editor paths in it); the path comes from the site's placeholder list: the section's
 * own placeholders of that kind in page order (the nth mark of a kind is the nth such placeholder), else a
 * business fact of that kind (phone, address, hours, legal data), which any section may show.
 */
export function placeholderPath(placeholders: { path: string; kind: string }[], kind: string, sectionPrefix: string | null, nth: number): string | null {
  const own = sectionPrefix ? placeholders.filter((p) => p.kind === kind && p.path.startsWith(sectionPrefix)) : [];
  if (own.length) return (own[nth] ?? own[0]!).path;
  return placeholders.find((p) => p.kind === kind && !p.path.startsWith("/pages/") && !p.path.startsWith("/translations/"))?.path ?? null;
}
