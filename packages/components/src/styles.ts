/** Order in which style files are concatenated into the one shared stylesheet. */
export const STYLE_FILES = [
  "base.css",
  "imagery.css",
  "chrome.css",
  "heroes.css",
  "content.css",
  "business.css",
  "structure.css",
  "motifs.css",
  // Last: a site's own skeleton (spec v15) overrides the shared frame and the motifs' forced dark footer.
  "skeleton.css",
] as const;
