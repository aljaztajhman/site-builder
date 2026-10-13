/**
 * Prompt capture for `pnpm studio:poc`: wraps the model transport and the image transport so every request the studio
 * sends is kept as readable text (eval/runs/studio-poc/<id>.prompts.json). Pictures are never written out: an image part
 * becomes `[image: <media type>, <n> KB]`. Works under --replay too, since the requests are built by the code each time
 * and only the answers come from the recordings.
 */
import type { AppConfig, ModelStageName } from "@sb/config";
import type { ImageGenModelConfig, ImageTransport, ModelRequest, ModelResponse, ModelTransport } from "@sb/engine";

export interface CapturedMessage {
  role: string;
  text: string;
}

export interface CapturedCall {
  stage: string;
  model: string;
  system: string;
  messages: CapturedMessage[];
  /** The answer: parsed JSON for a structured request, the tool calls when there are some, else the text. */
  response: unknown;
}

export interface CapturedMockup {
  prompt: string;
  /** Reference images sent with the prompt (the client's photos and logo). */
  references: number;
  image: string;
}

export interface PromptsFile {
  fixture: string;
  at: string;
  calls: CapturedCall[];
  mockup: CapturedMockup | null;
}

/** KB of a base64 string's decoded bytes, rounded. */
const kbOfBase64 = (b64: string): number => Math.round((b64.replace(/=+$/, "").length * 3) / 4 / 1024);

/** `[image: image/jpeg, 120 KB]` for a base64 source, `[image: <url>]` for a URL source (a data: URL is measured, not printed). */
function imageLabel(kind: string, source: unknown): string {
  const s = (source ?? {}) as { type?: string; media_type?: string; data?: string; url?: string };
  if (s.type === "base64" && typeof s.data === "string") return `[${kind}: ${s.media_type ?? "unknown"}, ${kbOfBase64(s.data)} KB]`;
  if (typeof s.url === "string") {
    const m = /^data:([^;,]+)[^,]*,(.*)$/s.exec(s.url);
    return m ? `[${kind}: ${m[1]}, ${kbOfBase64(m[2]!)} KB]` : `[${kind}: ${s.url}]`;
  }
  return `[${kind}]`;
}

/** One content block as text: text verbatim, pictures and documents as a label, tool calls and results inline. */
function blockText(block: unknown): string {
  if (typeof block === "string") return block;
  if (!block || typeof block !== "object") return "";
  const b = block as Record<string, unknown>;
  switch (b.type) {
    case "text":
      return typeof b.text === "string" ? b.text : "";
    case "image":
      return imageLabel("image", b.source);
    case "document":
      return imageLabel("document", b.source);
    case "tool_use":
    case "server_tool_use":
      return `[tool_use ${String(b.name)}: ${JSON.stringify(b.input)}]`;
    case "tool_result": {
      const inner = typeof b.content === "string" ? b.content : Array.isArray(b.content) ? b.content.map(blockText).join("\n") : "";
      return `[tool_result${b.is_error ? " (error)" : ""}]\n${inner}`;
    }
    case "thinking":
    case "redacted_thinking":
      return "";
    default:
      return `[${String(b.type)}]`;
  }
}

/** A message's content as one text: its parts joined by blank lines. */
export function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map(blockText)
    .filter((t) => t !== "")
    .join("\n\n");
}

/** The answer as kept: the tool calls when the model made some, else the text parsed as JSON when it is JSON (also in a ```json fence), else the text. */
export function responseOf(res: ModelResponse): unknown {
  if (res.toolUses?.length) return { text: res.text, toolUses: res.toolUses.map((t) => ({ name: t.name, input: t.input })) };
  const t = res.text.trim();
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/.exec(t)?.[1];
  for (const candidate of [t, fenced]) {
    if (candidate === undefined || !/^[[{]/.test(candidate.trim())) continue;
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // not JSON after all: kept as text
    }
  }
  return res.text;
}

/** One request and its answer as captured. */
export function captureCall(req: ModelRequest, model: string, res: ModelResponse): CapturedCall {
  return {
    stage: req.stage,
    model,
    system: req.system.join("\n\n"),
    messages: req.messages.map((m) => ({ role: m.role, text: messageText(m.content) })),
    response: responseOf(res),
  };
}

/** Passes every call to `inner` and keeps the request and its answer, in call order. */
export class CaptureTransport implements ModelTransport {
  readonly calls: CapturedCall[] = [];
  constructor(private readonly inner: ModelTransport) {}
  async send(req: ModelRequest, stage: AppConfig["models"][ModelStageName]): Promise<ModelResponse> {
    const res = await this.inner.send(req, stage);
    this.calls.push(captureCall(req, stage.model, res));
    return res;
  }
}

/** Passes every picture request to `inner` and keeps the last one's prompt and how many reference images it carried. */
export class CaptureImageTransport implements ImageTransport {
  last: { prompt: string; references: number } | null = null;
  constructor(private readonly inner: ImageTransport) {}
  async generate(model: ImageGenModelConfig, body: Record<string, unknown>): Promise<Uint8Array> {
    this.last = { prompt: String(body.prompt ?? ""), references: Array.isArray(body.image_urls) ? body.image_urls.length : 0 };
    return this.inner.generate(model, body);
  }
}
