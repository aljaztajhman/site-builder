import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildFfmpegArgs,
  captionHtml,
  cardHtml,
  missingSources,
  parseEditList,
  resolveDefaults,
  timeline,
  totalDuration,
  type EditList,
  type RenderPlan,
  type ResolvedShot,
} from "../cut.ts";

const base = (): EditList => ({
  shots: [
    { src: "clips/1a.mp4", dur: 3, in: 0.5 },
    { src: "stills/1b.jpg", dur: 2.5, move: "push" },
    { src: "frames/reel", dur: 4, fps: 12 },
    { card: { title: "postavi.si", line: "Spletna stran v minuti.", note: "Vizualije ustvarjene z AI." }, dur: 3 },
  ],
  captions: [
    { at: 0.2, dur: 2.6, text: "Še vedno brez spletne strani?", pos: "top" },
    { at: 5, dur: 2, text: "Pripravljeno." },
  ],
  audio: [
    { src: "audio/vo-1.mp3", at: 3.2, gain: 1, role: "vo" },
    { src: "audio/vo-2.mp3", at: 8, role: "vo" },
    { src: "audio/music.mp3", at: 0, gain: 0.25, role: "music", duckTo: 0.45 },
  ],
  fadeOut: 0.6,
});

function plan(edit: EditList): RenderPlan {
  const r = resolveDefaults(edit);
  const shots: ResolvedShot[] = r.shots.map((s, i) => {
    if ("card" in s) return { kind: "image", path: `/tmp/card-${i}.png` };
    if (s.src.endsWith(".mp4")) return { kind: "video", path: `/a/${s.src}` };
    if (s.src.endsWith(".jpg")) return { kind: "image", path: `/a/${s.src}` };
    return { kind: "frames", list: `/tmp/frames-${i}.txt` };
  });
  return {
    edit: r,
    shots,
    captionPngs: r.captions.map((_, i) => `/tmp/caption-${i}.png`),
    audioPaths: r.audio.map((a) => `/a/${a.src}`),
    audioDurations: r.audio.map((_, i) => [2, 1.5, 12][i]!),
  };
}

const graph = (args: string[]) => args[args.indexOf("-filter_complex") + 1]!;

describe("parseEditList", () => {
  it("accepts a full edit list", () => {
    expect(parseEditList(base()).shots).toHaveLength(4);
  });

  it("accepts a minimal one", () => {
    expect(() => parseEditList({ shots: [{ src: "a.jpg", dur: 1 }] })).not.toThrow();
  });

  it("rejects missing and malformed fields, naming each", () => {
    expect(() => parseEditList({})).toThrow(/shots must be a non-empty array/);
    expect(() => parseEditList({ shots: [{ src: "a.jpg" }] })).toThrow(/shots\[0\]\.dur must be a positive number/);
    expect(() => parseEditList({ shots: [{ src: "a.jpg", dur: -1 }] })).toThrow(/shots\[0\]\.dur/);
    expect(() => parseEditList({ shots: [{ dur: 1 }] })).toThrow(/exactly one of "src" or "card"/);
    expect(() => parseEditList({ shots: [{ src: "a", card: { title: "x" }, dur: 1 }] })).toThrow(/exactly one/);
    expect(() => parseEditList({ shots: [{ card: {}, dur: 1 }] })).toThrow(/card needs a non-empty title/);
    expect(() => parseEditList({ shots: [{ src: "a.jpg", dur: 1, move: "spin" }] })).toThrow(/move/);
    expect(() => parseEditList({ shots: [{ src: "a.jpg", dur: 1 }], captions: [{ at: 0, dur: 1, text: "x", pos: "left" }] })).toThrow(/captions\[0\]\.pos/);
    expect(() => parseEditList({ shots: [{ src: "a.jpg", dur: 1 }], captions: [{ at: 0, dur: 0, text: "x" }] })).toThrow(/captions\[0\]\.dur/);
    expect(() => parseEditList({ shots: [{ src: "a.jpg", dur: 1 }], captions: [{ at: -1, dur: 1, text: "" }] })).toThrow(/at.*text|text.*at/s);
    expect(() => parseEditList({ shots: [{ src: "a.jpg", dur: 1 }], audio: [{ src: "a.mp3", at: 0, duckTo: 2 }] })).toThrow(/duckTo/);
    expect(() => parseEditList({ shots: [{ src: "a.jpg", dur: 1 }], audio: [{ src: "a.mp3", at: 0, role: "sfx" }] })).toThrow(/role/);
    expect(() => parseEditList({ shots: [{ src: "a.jpg", dur: 1 }], size: [1081, 1920] })).toThrow(/size/);
    expect(() => parseEditList({ shots: [{ src: "a.jpg", dur: 1 }], fadeOut: 5 })).toThrow(/longer than the video/);
  });
});

describe("timeline", () => {
  it("lays shots end to end", () => {
    const e = base();
    expect(timeline(e)).toEqual([
      { start: 0, end: 3 },
      { start: 3, end: 5.5 },
      { start: 5.5, end: 9.5 },
      { start: 9.5, end: 12.5 },
    ]);
    expect(totalDuration(e)).toBe(12.5);
  });
});

describe("missingSources", () => {
  it("lists every shot and audio source that does not exist, relative as written", () => {
    const have = new Set([path.resolve("/a", "clips/1a.mp4"), path.resolve("/a", "audio/music.mp3")]);
    const missing = missingSources(base(), "/a", (p) => have.has(p));
    expect(missing).toEqual(["stills/1b.jpg", "frames/reel", "audio/vo-1.mp3", "audio/vo-2.mp3"]);
  });
});

describe("buildFfmpegArgs", () => {
  const args = buildFfmpegArgs(plan(base()), "out.mp4");
  const g = graph(args);

  it("cover-scales and centre-crops every shot to the frame, 30 fps, square pixels", () => {
    for (let i = 0; i < 4; i++) expect(g).toMatch(new RegExp(`\\[${i}:v\\][^\\[;]*crop=(1080:1920|2160:3840)[^;]*\\[v${i}\\]`));
    expect(g.match(/force_original_aspect_ratio=increase/g)).toHaveLength(4);
    expect(g.match(/setsar=1/g)!.length).toBeGreaterThanOrEqual(4);
    expect(g).toContain("fps=30");
    expect(g).toContain("concat=n=4:v=1:a=0[base]");
  });

  it("trims video from its in point for dur and holds a short clip", () => {
    const i = args.indexOf("clips/1a.mp4".replace("clips", "/a/clips"));
    expect(args.slice(i - 5, i + 1)).toEqual(["-ss", "0.5", "-t", "3", "-i", "/a/clips/1a.mp4"]);
    expect(g).toContain("tpad=stop_mode=clone");
  });

  it("zooms only the push shot, 1.00 to 1.06 over its frames", () => {
    expect(g.match(/zoompan/g)).toHaveLength(1);
    expect(g).toContain("z='1+0.06*on/75'");
  });

  it("plays frame directories through the concat demuxer", () => {
    expect(args.join(" ")).toContain("-f concat -safe 0 -i /tmp/frames-2.txt");
  });

  it("overlays each caption in its window", () => {
    expect(g).toContain("[base][4:v]overlay=0:0:enable='between(t,0.2,2.8)'[o0]");
    expect(g).toContain("[o0][5:v]overlay=0:0:enable='between(t,5,7)'[o1]");
  });

  it("fades the video to black and the audio to silence at the end", () => {
    expect(g).toContain("fade=t=out:st=11.9:d=0.6");
    expect(g).toContain("afade=t=out:st=11.9:d=0.6");
  });

  it("delays every audio track to its start, pads and trims to the video length", () => {
    expect(g).toContain("adelay=3200|3200");
    expect(g).toContain("adelay=8000|8000");
    expect(g).toContain("adelay=0|0");
    expect(g.match(/apad,atrim=end=12.5/g)).toHaveLength(3);
  });

  it("compensates amix's division and limits", () => {
    expect(g).toContain("amix=inputs=3:duration=first:dropout_transition=0,volume=3");
    expect(g).toContain("alimiter=limit=0.95");
  });

  it("ducks the music while either voice-over plays, and only the music", () => {
    // voice-overs: 3.2 .. 5.2 and 8 .. 9.5; ramps of 0.15 s either side
    const ducks = g.match(/volume='[^']*':eval=frame/g)!;
    expect(ducks).toHaveLength(1);
    expect(ducks[0]).toContain("1-0.55*max(");
    for (const edge of ["3.05", "5.35", "7.85", "9.65"]) expect(ducks[0]).toContain(edge);
    expect(g.split(";").find((l) => l.startsWith("[8:a]"))).toContain("eval=frame");
  });

  it("writes silent stereo audio when there are no audio entries", () => {
    const e = base();
    delete e.audio;
    const a = buildFfmpegArgs(plan(e), "out.mp4");
    expect(a.join(" ")).toContain("anullsrc=r=48000:cl=stereo");
    expect(graph(a)).toContain("[aout]");
  });

  it("encodes H.264 high yuv420p 30 fps cfr with AAC 192k 48 kHz stereo and faststart", () => {
    const s = args.join(" ");
    for (const part of ["-c:v libx264", "-crf 18", "-preset medium", "-pix_fmt yuv420p", "-profile:v high", "-r 30", "-c:a aac", "-b:a 192k", "-ar 48000", "-ac 2", "-movflags +faststart"]) expect(s).toContain(part);
    expect(args.at(-1)).toBe("out.mp4");
  });

  it("is deterministic and makes no network inputs", () => {
    expect(buildFfmpegArgs(plan(base()), "out.mp4")).toEqual(args);
    expect(args.some((a) => /^https?:/.test(a))).toBe(false);
  });
});

describe("caption and card HTML", () => {
  it("places captions at the three positions with Slovene text escaped", () => {
    expect(captionHtml({ at: 0, dur: 1, text: "A", pos: "top" })).toContain("top:300px");
    expect(captionHtml({ at: 0, dur: 1, text: "A", pos: "center" })).toContain("translateY(-50%)");
    expect(captionHtml({ at: 0, dur: 1, text: "A" })).toContain("bottom:480px");
    const html = captionHtml({ at: 0, dur: 1, text: "Še <vedno> „brez“ č š ž …", pos: "top" });
    expect(html).toContain("Še &lt;vedno&gt; „brez“ č š ž …");
    expect(html).toContain("font:800 76px/1.05");
  });

  it("colours .si in the card title teal and keeps note and line", () => {
    const html = cardHtml({ title: "postavi.si", line: "Linija", note: "Opomba" });
    expect(html).toContain('postavi<span class="si">.si</span>');
    expect(html).toContain("Linija");
    expect(html).toContain("Opomba");
    expect(cardHtml({ title: "Ime" })).not.toContain('class="si">');
  });
});
