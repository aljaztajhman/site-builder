/**
 * pnpm promo:cut <edit.json> [--assets <dir>] [--out <file.mp4>]
 *
 * Renders a promo edit list (docs/plans/promo-video.md, step 3) to an H.264/AAC MP4 and a review strip image
 * (<out>.strip.jpg). Offline and deterministic: ffmpeg from @ffmpeg-installer/ffmpeg (4.1: no xfade, no drawtext,
 * amix without normalize), captions and cards rendered to PNG with Playwright's chromium. No model or network calls.
 *
 * The pure core is parseEditList, timeline, missingSources and buildFfmpegArgs; PNG rendering and running ffmpeg are
 * thin functions around it.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

// ---------- types ----------

export type CaptionPos = "top" | "center" | "bottom";
export type AudioRole = "vo" | "music";

export interface CardSpec {
  title: string;
  line?: string;
  note?: string;
}

export type Shot =
  | { src: string; dur: number; in?: number; move?: "push" | "none"; fps?: number }
  | { card: CardSpec; dur: number };

export interface Caption {
  at: number;
  dur: number;
  text: string;
  pos?: CaptionPos;
}

export interface AudioTrack {
  src: string;
  at: number;
  gain?: number;
  role?: AudioRole;
  duckTo?: number;
}

export interface EditList {
  size?: [number, number];
  fps?: number;
  shots: Shot[];
  captions?: Caption[];
  audio?: AudioTrack[];
  fadeOut?: number;
}

export type Resolved = {
  size: [number, number];
  fps: number;
  shots: Shot[];
  captions: Caption[];
  audio: AudioTrack[];
  fadeOut: number;
};

/** A shot after the file system was looked at: what ffmpeg input it becomes. */
export type ResolvedShot =
  | { kind: "video"; path: string }
  | { kind: "image"; path: string }
  | { kind: "frames"; list: string };

export interface RenderPlan {
  edit: Resolved;
  shots: ResolvedShot[];
  /** One transparent full-frame PNG per caption, in caption order. */
  captionPngs: string[];
  /** Audio file per audio entry, and its duration in seconds (for the duck windows). */
  audioPaths: string[];
  audioDurations: number[];
}

export const DEFAULT_SIZE: [number, number] = [1080, 1920];
export const DEFAULT_FPS = 30;
export const PUSH_END_ZOOM = 1.06;
/** Seconds the music takes to dip and to come back around a voice-over. */
export const DUCK_RAMP = 0.15;
export const STRIP_STEP = 1.5;
/** Target loudness of the mix: -14 LUFS integrated, true peak under -1.5 dBTP (what the short-video feeds play at). */
export const LOUDNORM = "loudnorm=I=-14:TP=-1.5:LRA=11";

const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv"]);
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

// ---------- validation ----------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Validates an edit list read from JSON; throws one Error listing every problem found. */
export function parseEditList(raw: unknown): EditList {
  const errors: string[] = [];
  const bad = (where: string, msg: string) => errors.push(`${where} ${msg}`);
  if (!isObj(raw)) throw new Error("edit list must be a JSON object");

  if (raw.size !== undefined) {
    const s = raw.size;
    if (!Array.isArray(s) || s.length !== 2 || !s.every((n) => Number.isInteger(n) && n > 0 && n % 2 === 0)) bad("size", "must be [width, height], two positive even integers");
  }
  if (raw.fps !== undefined && !(isNum(raw.fps) && raw.fps > 0 && raw.fps <= 120)) bad("fps", "must be a number between 0 and 120");

  const shots = raw.shots;
  if (!Array.isArray(shots) || shots.length === 0) bad("shots", "must be a non-empty array");
  else {
    shots.forEach((s, i) => {
      const w = `shots[${i}]`;
      if (!isObj(s)) return bad(w, "must be an object");
      if (!(isNum(s.dur) && s.dur > 0)) bad(`${w}.dur`, "must be a positive number");
      const hasSrc = s.src !== undefined;
      const hasCard = s.card !== undefined;
      if (hasSrc === hasCard) bad(w, 'needs exactly one of "src" or "card"');
      if (hasSrc && (typeof s.src !== "string" || s.src === "")) bad(`${w}.src`, "must be a non-empty string");
      if (hasCard) {
        const c = s.card;
        if (!isObj(c) || typeof c.title !== "string" || c.title === "") bad(`${w}.card`, "needs a non-empty title");
        else for (const k of ["line", "note"]) if (c[k] !== undefined && typeof c[k] !== "string") bad(`${w}.card.${k}`, "must be a string");
      }
      if (s.in !== undefined && !(isNum(s.in) && s.in >= 0)) bad(`${w}.in`, "must be a number >= 0");
      if (s.move !== undefined && s.move !== "push" && s.move !== "none") bad(`${w}.move`, 'must be "push" or "none"');
      if (s.fps !== undefined && !(isNum(s.fps) && s.fps > 0 && s.fps <= 120)) bad(`${w}.fps`, "must be a number between 0 and 120");
    });
  }

  if (raw.captions !== undefined) {
    if (!Array.isArray(raw.captions)) bad("captions", "must be an array");
    else
      raw.captions.forEach((c, i) => {
        const w = `captions[${i}]`;
        if (!isObj(c)) return bad(w, "must be an object");
        if (!(isNum(c.at) && c.at >= 0)) bad(`${w}.at`, "must be a number >= 0");
        if (!(isNum(c.dur) && c.dur > 0)) bad(`${w}.dur`, "must be a positive number");
        if (typeof c.text !== "string" || c.text === "") bad(`${w}.text`, "must be a non-empty string");
        if (c.pos !== undefined && c.pos !== "top" && c.pos !== "center" && c.pos !== "bottom") bad(`${w}.pos`, 'must be "top", "center" or "bottom"');
      });
  }

  if (raw.audio !== undefined) {
    if (!Array.isArray(raw.audio)) bad("audio", "must be an array");
    else
      raw.audio.forEach((a, i) => {
        const w = `audio[${i}]`;
        if (!isObj(a)) return bad(w, "must be an object");
        if (typeof a.src !== "string" || a.src === "") bad(`${w}.src`, "must be a non-empty string");
        if (!(isNum(a.at) && a.at >= 0)) bad(`${w}.at`, "must be a number >= 0");
        if (a.gain !== undefined && !(isNum(a.gain) && a.gain >= 0)) bad(`${w}.gain`, "must be a number >= 0");
        if (a.role !== undefined && a.role !== "vo" && a.role !== "music") bad(`${w}.role`, 'must be "vo" or "music"');
        if (a.duckTo !== undefined && !(isNum(a.duckTo) && a.duckTo >= 0 && a.duckTo <= 1)) bad(`${w}.duckTo`, "must be a number between 0 and 1");
      });
  }

  if (raw.fadeOut !== undefined && !(isNum(raw.fadeOut) && raw.fadeOut >= 0)) bad("fadeOut", "must be a number >= 0");

  if (errors.length === 0 && isNum(raw.fadeOut)) {
    const total = (raw.shots as Array<{ dur: number }>).reduce((n, s) => n + s.dur, 0);
    if (raw.fadeOut > total) bad("fadeOut", `(${raw.fadeOut}) is longer than the video (${total})`);
  }

  if (errors.length) throw new Error(`Invalid edit list:\n- ${errors.join("\n- ")}`);
  return raw as unknown as EditList;
}

/** Defaults filled in. */
export function resolveDefaults(edit: EditList): Resolved {
  return {
    size: edit.size ?? DEFAULT_SIZE,
    fps: edit.fps ?? DEFAULT_FPS,
    shots: edit.shots,
    captions: (edit.captions ?? []).map((c) => ({ ...c, pos: c.pos ?? "bottom" })),
    audio: (edit.audio ?? []).map((a) => ({ ...a, gain: a.gain ?? 1, role: a.role ?? "vo" })),
    fadeOut: edit.fadeOut ?? 0,
  };
}

export interface Span {
  start: number;
  end: number;
}

/** Start and end second of every shot on the final timeline. */
export function timeline(edit: Pick<EditList, "shots">): Span[] {
  let t = 0;
  return edit.shots.map((s) => {
    const span = { start: t, end: t + s.dur };
    t = span.end;
    return span;
  });
}

export function totalDuration(edit: Pick<EditList, "shots">): number {
  return edit.shots.reduce((n, s) => n + s.dur, 0);
}

/** Every source path (relative, as written in the edit list) that does not exist under the assets folder. */
export function missingSources(edit: EditList, assetsDir: string, exists: (p: string) => boolean = existsSync): string[] {
  const srcs = [...edit.shots.flatMap((s) => ("src" in s ? [s.src] : [])), ...(edit.audio ?? []).map((a) => a.src)];
  return srcs.filter((s) => !exists(path.resolve(assetsDir, s)));
}

// ---------- ffmpeg arguments ----------

/** Seconds as ffmpeg expression text: short, no exponent notation. */
const n = (x: number): string => String(Math.round(x * 1000) / 1000);

function shotFilter(shot: Shot, r: ResolvedShot, input: number, index: number, size: [number, number], fps: number): string {
  const [w, h] = size;
  const cover = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1`;
  const frames = Math.max(1, Math.round(shot.dur * fps));
  const tail = `fps=${fps},trim=duration=${n(shot.dur)},setpts=PTS-STARTPTS,format=yuv420p`;
  const pad = `tpad=stop_mode=clone:stop_duration=${n(shot.dur)}`;
  let chain: string;
  if (r.kind === "image" && "move" in shot && shot.move === "push") {
    // Supersample 2x so the slow zoom does not stair-step, then zoompan down to the frame size.
    const z = `1+${n(PUSH_END_ZOOM - 1)}*on/${frames}`;
    chain = `scale=${w * 2}:${h * 2}:force_original_aspect_ratio=increase,crop=${w * 2}:${h * 2},zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${w}x${h}:fps=${fps},setsar=1,${tail}`;
  } else if (r.kind === "image") {
    chain = `${cover},${tail}`;
  } else if (r.kind === "frames") {
    // Frame folders come through the concat demuxer on a 1/25 time base, which snaps 1/30 s steps to 0.04 s
    // (a frame dropped and one doubled every few frames). Re-time them from their index at their own rate.
    const rate = ("fps" in shot ? shot.fps : undefined) ?? fps;
    chain = `settb=1/90000,setpts=N/${n(rate)}/TB,${cover},${pad},${tail}`;
  } else {
    chain = `${cover},${pad},${tail}`;
  }
  return `[${input}:v]${chain}[v${index}]`;
}

/** Volume expression: 1 outside the voice-over windows, duckTo inside, with short ramps either side. */
function duckExpr(duckTo: number, windows: Span[]): string {
  const r = n(DUCK_RAMP);
  const terms = windows.map((s) => `min(max((t-${n(s.start - DUCK_RAMP)})/${r},0),1)*min(max((${n(s.end + DUCK_RAMP)}-t)/${r},0),1)`);
  // ffmpeg's max() takes exactly two arguments: nest them for more windows.
  const env = terms.reduceRight((acc, term) => `max(${term},${acc})`);
  return `1-${n(1 - duckTo)}*${env}`;
}

/** Where voice-over plays on the final timeline. */
export function voWindows(edit: Resolved, durations: number[]): Span[] {
  return edit.audio.flatMap((a, i) => (a.role === "vo" ? [{ start: a.at, end: a.at + (durations[i] ?? 0) }] : []));
}

/** The whole ffmpeg argv (without the executable). */
export function buildFfmpegArgs(plan: RenderPlan, out: string): string[] {
  const { edit } = plan;
  const fps = edit.fps;
  const total = totalDuration(edit);
  const args: string[] = ["-y", "-hide_banner"];
  const filters: string[] = [];
  let inputs = 0;

  // visual inputs
  edit.shots.forEach((shot, i) => {
    const r = plan.shots[i]!;
    if (r.kind === "video") {
      const inPoint = "in" in shot ? (shot.in ?? 0) : 0;
      args.push("-ss", n(inPoint), "-t", n(shot.dur), "-i", r.path);
    } else if (r.kind === "image") {
      args.push("-loop", "1", "-framerate", String(fps), "-t", n(shot.dur), "-i", r.path);
    } else {
      args.push("-f", "concat", "-safe", "0", "-i", r.list);
    }
    filters.push(shotFilter(shot, r, inputs, i, edit.size, fps));
    inputs += 1;
  });
  filters.push(`${edit.shots.map((_, i) => `[v${i}]`).join("")}concat=n=${edit.shots.length}:v=1:a=0[base]`);

  // caption overlays
  let last = "base";
  edit.captions.forEach((c, i) => {
    args.push("-loop", "1", "-framerate", String(fps), "-t", n(total), "-i", plan.captionPngs[i]!);
    const out_ = `o${i}`;
    filters.push(`[${last}][${inputs}:v]overlay=0:0:enable='between(t,${n(c.at)},${n(c.at + c.dur)})'[${out_}]`);
    last = out_;
    inputs += 1;
  });
  const fade = edit.fadeOut > 0 ? `,fade=t=out:st=${n(total - edit.fadeOut)}:d=${n(edit.fadeOut)}` : "";
  filters.push(`[${last}]format=yuv420p${fade}[vout]`);

  // audio
  if (edit.audio.length === 0) {
    args.push("-f", "lavfi", "-t", n(total), "-i", "anullsrc=r=48000:cl=stereo");
    filters.push(`[${inputs}:a]anull${edit.fadeOut > 0 ? `,afade=t=out:st=${n(total - edit.fadeOut)}:d=${n(edit.fadeOut)}` : ""}[aout]`);
    inputs += 1;
  } else {
    const windows = voWindows(edit, plan.audioDurations);
    edit.audio.forEach((a, i) => {
      args.push("-i", plan.audioPaths[i]!);
      const ms = Math.round(a.at * 1000);
      const parts = [`aresample=48000`, `aformat=sample_fmts=fltp:channel_layouts=stereo`, `volume=${n(a.gain ?? 1)}`, `adelay=${ms}|${ms}`];
      if (a.duckTo !== undefined && windows.length > 0) parts.push(`volume='${duckExpr(a.duckTo, windows)}':eval=frame`);
      // pad every track to the full length so amix's 1/inputs scaling is constant, then trim to the video
      parts.push(`apad`, `atrim=end=${n(total)}`);
      filters.push(`[${inputs}:a]${parts.join(",")}[a${i}]`);
      inputs += 1;
    });
    const count = edit.audio.length;
    const labels = edit.audio.map((_, i) => `[a${i}]`).join("");
    // ffmpeg 4.1's amix divides by the input count and has no normalize option: multiply it back.
    const mix = count === 1 ? "anull" : `amix=inputs=${count}:duration=first:dropout_transition=0,volume=${count}`;
    const afade = edit.fadeOut > 0 ? `,afade=t=out:st=${n(total - edit.fadeOut)}:d=${n(edit.fadeOut)}` : "";
    // Loudness for social feeds (they play at about -14 LUFS); loudnorm resamples, so back to 48 kHz after it.
    filters.push(`${labels}${mix},alimiter=limit=0.95:level=disabled,${LOUDNORM},aresample=48000${afade}[aout]`);
  }

  args.push(
    "-filter_complex", filters.join(";"),
    "-map", "[vout]", "-map", "[aout]",
    "-t", n(total),
    "-r", String(fps), "-vsync", "cfr",
    "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", "-profile:v", "high",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
    "-movflags", "+faststart",
    out,
  );
  return args;
}

// ---------- caption, card and strip HTML ----------

const SITE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "infra", "coming-soon", "site");
const FONT_DISPLAY = pathToFileURL(path.join(SITE, "fonts", "bricolage-grotesque.woff2")).href;
const FONT_UI = pathToFileURL(path.join(SITE, "fonts", "figtree.woff2")).href;

// Brand colours: the CSS custom properties in infra/coming-soon/site/index.html.
export const BRAND = { canvas: "#eef3f4", ink: "#0f1f22", accent: "#0d7a84", note: "#53676c" };

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const FONT_FACES = `@font-face{font-family:"Bricolage Grotesque";src:url("${FONT_DISPLAY}") format("woff2");font-weight:200 800;font-style:normal}
@font-face{font-family:"Figtree";src:url("${FONT_UI}") format("woff2");font-weight:300 900;font-style:normal}`;

/** Transparent full-frame caption. Text block 800 px wide, centred, so it stays clear of the right 140 px UI strip. */
export function captionHtml(c: Caption, size: [number, number] = DEFAULT_SIZE): string {
  const [w, h] = size;
  const pos = c.pos ?? "bottom";
  // Positions are fractions of the height, tuned at 1920 (top 300 px, bottom edge at 1440 px).
  const place = pos === "top" ? `top:${Math.round(h * (300 / 1920))}px` : pos === "center" ? "top:50%;transform:translateY(-50%)" : `bottom:${Math.round(h * (480 / 1920))}px`;
  return `<!doctype html><html lang="sl"><meta charset="utf-8"><style>
${FONT_FACES}
html,body{margin:0;width:${w}px;height:${h}px;background:transparent;overflow:hidden}
.c{position:absolute;left:50%;margin-left:-400px;width:800px;${place};text-align:center;font:800 76px/1.05 "Bricolage Grotesque",system-ui,sans-serif;color:#fff;text-wrap:balance;text-shadow:0 2px 18px rgba(0,0,0,.55)}
</style><div class="c">${escapeHtml(c.text)}</div></html>`;
}

export function cardHtml(card: CardSpec, size: [number, number] = DEFAULT_SIZE): string {
  const [w, h] = size;
  const si = card.title.endsWith(".si");
  const title = si ? `${escapeHtml(card.title.slice(0, -3))}<span class="si">.si</span>` : escapeHtml(card.title);
  return `<!doctype html><html lang="sl"><meta charset="utf-8"><style>
${FONT_FACES}
html,body{margin:0;width:${w}px;height:${h}px;background:${BRAND.canvas};overflow:hidden}
.m{position:absolute;inset:0 0 ${Math.round(h * (420 / 1920))}px 0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 90px;color:${BRAND.ink}}
.t{font:800 120px/1 "Bricolage Grotesque",system-ui,sans-serif;letter-spacing:-.035em}
.si{color:${BRAND.accent}}
.l{margin-top:36px;font:500 56px/1.2 "Figtree",system-ui,sans-serif;text-wrap:balance}
.n{position:absolute;left:90px;right:90px;bottom:${Math.round(h * (420 / 1920))}px;text-align:center;font:400 30px/1.4 "Figtree",system-ui,sans-serif;color:${BRAND.note}}
</style><div class="m"><div class="t">${title}</div>${card.line ? `<div class="l">${escapeHtml(card.line)}</div>` : ""}</div>${card.note ? `<div class="n">${escapeHtml(card.note)}</div>` : ""}</html>`;
}

export interface StripFrame {
  file: string;
  t: number;
}

export function stripHtml(frames: StripFrame[], perRow = 6): string {
  const gap = 8;
  const width = perRow * 270 + (perRow + 1) * gap;
  const cells = frames.map((f) => `<figure><img src="${pathToFileURL(f.file).href}"><figcaption>${n(f.t)} s</figcaption></figure>`).join("");
  return `<!doctype html><meta charset="utf-8"><style>
body{margin:0;width:${width}px;background:#111;padding:${gap}px 0}
.g{display:grid;grid-template-columns:repeat(${perRow},270px);gap:${gap}px;padding:0 ${gap}px}
figure{margin:0}img{display:block;width:270px;height:480px}
figcaption{font:600 16px/24px system-ui,sans-serif;color:#cfd8da;text-align:center}
</style><div class="g">${cells}</div>`;
}

// ---------- thin I/O ----------

export function ffmpegPath(): string {
  const require = createRequire(import.meta.url);
  return (require("@ffmpeg-installer/ffmpeg") as { path: string }).path;
}

function runFfmpeg(args: string[], quiet = false): { stderr: string; status: number } {
  const r = spawnSync(ffmpegPath(), args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (r.error) throw r.error;
  if (!quiet && r.status !== 0) throw new Error(`ffmpeg failed (exit ${r.status}):\n${r.stderr.slice(-3000)}`);
  return { stderr: r.stderr ?? "", status: r.status ?? 1 };
}

/** Duration in seconds from `ffmpeg -i`'s banner. */
export function probeDuration(file: string): number {
  const { stderr } = runFfmpeg(["-hide_banner", "-i", file], true);
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  if (!m) throw new Error(`could not read the duration of ${file}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** The shot's ffmpeg input kind, from what is on disk; a frame directory also gets its concat list written to `tmp`. */
export function resolveShot(shot: Shot, assetsDir: string, tmp: string, index: number, fps: number, cardPng?: string): ResolvedShot {
  if ("card" in shot) return { kind: "image", path: cardPng! };
  const full = path.resolve(assetsDir, shot.src);
  if (statSync(full).isDirectory()) {
    const files = readdirSync(full)
      .filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()))
      .sort();
    if (files.length === 0) throw new Error(`no PNG/JPG frames in ${shot.src}`);
    const rate = shot.fps ?? fps;
    const q = (p: string) => p.replace(/\\/g, "/").replace(/'/g, "'\\''");
    const lines = files.map((f) => `file '${q(path.join(full, f))}'\nduration ${n(1 / rate)}`);
    // concat quirk: the last file needs repeating, without a duration, for its own duration to count
    lines.push(`file '${q(path.join(full, files[files.length - 1]!))}'`);
    const list = path.join(tmp, `frames-${index}.txt`);
    writeFileSync(list, lines.join("\n") + "\n");
    return { kind: "frames", list };
  }
  const ext = path.extname(full).toLowerCase();
  if (VIDEO_EXT.has(ext)) return { kind: "video", path: full };
  if (IMAGE_EXT.has(ext)) return { kind: "image", path: full };
  throw new Error(`unsupported source type "${ext}" for ${shot.src}`);
}

async function renderPages(pages: Array<{ html: string; png: string; size: [number, number]; transparent: boolean; type?: "png" | "jpeg" }>, tmp: string): Promise<void> {
  const browser = await chromium.launch();
  try {
    for (const [i, p] of pages.entries()) {
      const page = await browser.newPage({ viewport: { width: p.size[0], height: p.size[1] } });
      const htmlFile = path.join(tmp, `page-${i}.html`);
      writeFileSync(htmlFile, p.html);
      await page.goto(pathToFileURL(htmlFile).href);
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await page.screenshot({ path: p.png, omitBackground: p.transparent, type: p.type ?? "png", fullPage: p.type === "jpeg", ...(p.type === "jpeg" ? { quality: 88 } : {}) });
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

export interface CutOptions {
  assetsDir: string;
  out: string;
}

export interface CutResult {
  out: string;
  strip: string;
  duration: number;
  command: string;
}

export async function cut(editFile: string, opts: Partial<CutOptions> = {}): Promise<CutResult> {
  const editPath = path.resolve(editFile);
  const assetsDir = path.resolve(opts.assetsDir ?? path.dirname(editPath));
  const out = path.resolve(opts.out ?? path.join(path.dirname(editPath), `${path.basename(editPath, path.extname(editPath))}.mp4`));
  const edit = parseEditList(JSON.parse(readFileSync(editPath, "utf8")));
  const missing = missingSources(edit, assetsDir);
  if (missing.length) throw new Error(`Missing source file${missing.length > 1 ? "s" : ""} (looked under ${assetsDir}):\n- ${missing.join("\n- ")}`);

  const r = resolveDefaults(edit);
  mkdirSync(path.dirname(out), { recursive: true });
  const tmp = mkdtempSync(path.join(os.tmpdir(), "promo-cut-"));
  try {
    // captions and cards -> PNG
    const pages: Array<{ html: string; png: string; size: [number, number]; transparent: boolean }> = [];
    const captionPngs = r.captions.map((c, i) => {
      const png = path.join(tmp, `caption-${i}.png`);
      pages.push({ html: captionHtml(c, r.size), png, size: r.size, transparent: true });
      return png;
    });
    const cardPngs = new Map<number, string>();
    r.shots.forEach((s, i) => {
      if (!("card" in s)) return;
      const png = path.join(tmp, `card-${i}.png`);
      pages.push({ html: cardHtml(s.card, r.size), png, size: r.size, transparent: false });
      cardPngs.set(i, png);
    });
    if (pages.length) await renderPages(pages, tmp);

    const shots = r.shots.map((s, i) => resolveShot(s, assetsDir, tmp, i, r.fps, cardPngs.get(i)));
    const audioPaths = r.audio.map((a) => path.resolve(assetsDir, a.src));
    const audioDurations = audioPaths.map((p) => probeDuration(p));
    const args = buildFfmpegArgs({ edit: r, shots, captionPngs, audioPaths, audioDurations }, out);
    const command = `${ffmpegPath()} ${args.map((a) => (/[\s'"|;[\]()]/.test(a) ? JSON.stringify(a) : a)).join(" ")}`;
    console.log(command);
    runFfmpeg(args);

    const duration = probeDuration(out);
    const strip = `${out}.strip.jpg`;
    await renderStrip(out, strip, tmp, r.fps);
    return { out, strip, duration, command };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function renderStrip(video: string, strip: string, tmp: string, fps: number): Promise<void> {
  const dir = path.join(tmp, "strip");
  mkdirSync(dir);
  // Every Nth frame exactly (the fps filter at low rates picks the middle of each interval, so labels ran late).
  const every = Math.max(1, Math.round(STRIP_STEP * fps));
  runFfmpeg(["-y", "-hide_banner", "-i", video, "-vf", `select=not(mod(n\\,${every})),scale=270:480`, "-vsync", "vfr", "-q:v", "3", path.join(dir, "s%04d.jpg")]);
  const files = readdirSync(dir).filter((f) => f.endsWith(".jpg")).sort();
  const frames = files.map((f, i) => ({ file: path.join(dir, f), t: i * STRIP_STEP }));
  const probe = frames.length;
  const cols = 6;
  await renderPages([{ html: stripHtml(frames, cols), png: strip, size: [cols * 270 + (cols + 1) * 8, Math.max(1, Math.ceil(probe / cols)) * 512 + 16], transparent: false, type: "jpeg" }], tmp);
}

// ---------- CLI ----------

function arg(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const editFile = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1]!.startsWith("--")));
  if (!editFile) {
    console.error("usage: pnpm promo:cut <edit.json> [--assets <dir>] [--out <file.mp4>]");
    process.exit(2);
  }
  try {
    const res = await cut(editFile, { assetsDir: arg(args, "--assets"), out: arg(args, "--out") });
    console.log(`\nwrote ${res.out} (${res.duration.toFixed(2)} s)\nreview strip ${res.strip}`);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
