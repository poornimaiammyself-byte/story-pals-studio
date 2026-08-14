// Server-only provider abstraction. API keys remain server-side.
//
// Provider selection is automatic:
//  - OpenAI is used when OPENAI_API_KEY is configured, otherwise the built-in
//    managed AI service handles script, artwork and speech.
//  - Replicate is used when REPLICATE_API_TOKEN is configured, otherwise the
//    built-in managed video model animates the scene artwork.
// This keeps the studio fully functional out of the box.

export class ProviderError extends Error {
  constructor(message: string, public readonly kind: "config" | "provider" = "provider") {
    super(message);
  }
}

export type GeneratedBinary = { bytes: Uint8Array; contentType: string };

const OPENAI_API = "https://api.openai.com/v1";
const REPLICATE_API = "https://api.replicate.com/v1";
const GATEWAY_API = "https://ai.gateway.lovable.dev/v1";

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

/** Resolves the text/image/voice backend: direct OpenAI, else managed gateway. */
function textStack() {
  const openai = env("OPENAI_API_KEY");
  if (openai) {
    return {
      base: OPENAI_API,
      headers: { Authorization: `Bearer ${openai}`, "Content-Type": "application/json" },
      textModel: env("OPENAI_TEXT_MODEL") || "gpt-5-mini",
      imageModel: env("OPENAI_IMAGE_MODEL") || "gpt-image-1",
      ttsModel: env("OPENAI_TTS_MODEL") || "gpt-4o-mini-tts",
    };
  }
  const managed = env("LOVABLE_API_KEY");
  if (!managed) {
    throw new ProviderError(
      "No AI provider is configured. Add an OPENAI_API_KEY or enable the built-in AI service.",
      "config",
    );
  }
  return {
    base: GATEWAY_API,
    headers: { Authorization: `Bearer ${managed}`, "Content-Type": "application/json" },
    textModel: env("OPENAI_TEXT_MODEL") || "google/gemini-3.5-flash",
    imageModel: env("OPENAI_IMAGE_MODEL") || "google/gemini-3.1-flash-image",
    ttsModel: env("OPENAI_TTS_MODEL") || "openai/gpt-4o-mini-tts",
  };
}

function replicateHeaders() {
  const token = env("REPLICATE_API_TOKEN");
  if (!token) throw new ProviderError("Missing credential REPLICATE_API_TOKEN.", "config");
  return { Authorization: `Bearer ${token}` };
}

async function providerError(res: Response, what: string): Promise<never> {
  const body = await res.text();
  if (res.status === 429) throw new ProviderError(`${what}: rate limited. Please retry.`);
  if (res.status === 402) throw new ProviderError(`${what}: AI credits are exhausted.`);
  throw new ProviderError(`${what} failed [${res.status}]: ${body.slice(0, 500)}`);
}

/* ---------------------------------- text ---------------------------------- */

export async function chatJson<T>(_model: string, system: string, user: string): Promise<T> {
  const stack = textStack();
  const res = await fetch(`${stack.base}/chat/completions`, {
    method: "POST",
    headers: stack.headers,
    body: JSON.stringify({
      model: stack.textModel,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) await providerError(res, "Script generation");
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = data.choices?.[0]?.message?.content ?? "";
  try {
    return JSON.parse(raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()) as T;
  } catch {
    throw new ProviderError("Script generation returned invalid JSON.");
  }
}

/* --------------------------------- images --------------------------------- */

function base64ToBinary(b64: string, contentType = "image/png"): GeneratedBinary {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, contentType };
}

export const IMAGE_MODEL = env("OPENAI_IMAGE_MODEL") || "gemini/openai image model";

/**
 * The full character/style description travels in the prompt so scene artwork
 * stays consistent across the series regardless of which backend is active.
 */
export async function generateSceneImage(opts: { prompt: string; referenceImages: string[] }): Promise<GeneratedBinary> {
  const stack = textStack();
  const body: Record<string, unknown> = {
    model: stack.imageModel,
    prompt: `${opts.prompt}\nMaintain consistent characters, clothing, colors and art style across the series.`,
    size: "1024x1024",
  };
  if (stack.base === OPENAI_API) {
    body['quality'] = "medium";
    body['output_format'] = "png";
  }
  const res = await fetch(`${stack.base}/images/generations`, {
    method: "POST",
    headers: stack.headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) await providerError(res, "Image generation");
  const data = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
  const entry = data.data?.[0];
  if (entry?.b64_json) return base64ToBinary(entry.b64_json);
  if (entry?.url) {
    const img = await fetch(entry.url);
    if (!img.ok) throw new ProviderError("Image download failed.");
    return { bytes: new Uint8Array(await img.arrayBuffer()), contentType: img.headers.get("content-type") || "image/png" };
  }
  throw new ProviderError("Image provider returned no image.");
}

/* ---------------------------------- voice ---------------------------------- */

export const VOICE_MODEL = env("OPENAI_TTS_MODEL") || "gpt-4o-mini-tts";

export async function generateSpeech(opts: { text: string; voiceId: string; instructions?: string }): Promise<GeneratedBinary> {
  const stack = textStack();
  const allowed = new Set(["alloy", "ash", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer"]);
  const voice = allowed.has(opts.voiceId) ? opts.voiceId : "shimmer";
  const res = await fetch(`${stack.base}/audio/speech`, {
    method: "POST",
    headers: stack.headers,
    body: JSON.stringify({
      model: stack.ttsModel,
      input: opts.text,
      voice,
      response_format: "mp3",
      ...(opts.instructions ? { instructions: opts.instructions } : {}),
    }),
  });
  if (!res.ok) await providerError(res, "Voice generation");
  return { bytes: new Uint8Array(await res.arrayBuffer()), contentType: "audio/mpeg" };
}

/* ------------------------------- animation -------------------------------- */

async function replicateFileUrl(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith("data:")) return dataUrl;
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) throw new ProviderError("Animation input image is invalid.");
  const binary = atob(match[2]!);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const form = new FormData();
  form.append("content", new Blob([bytes], { type: match[1] ?? "image/png" }), "scene.png");
  const upload = await fetch(`${REPLICATE_API}/files`, { method: "POST", headers: replicateHeaders(), body: form });
  if (!upload.ok) await providerError(upload, "Animation image upload");
  const file = (await upload.json()) as { urls?: { get?: string } };
  if (!file.urls?.get) throw new ProviderError("Animation image upload returned no URL.");
  return file.urls.get;
}

async function replicateAnimation(opts: { imageDataUrl: string; prompt: string; seconds: 4 | 6 | 8 }): Promise<GeneratedBinary> {
  const image = await replicateFileUrl(opts.imageDataUrl);
  const create = await fetch(`${REPLICATE_API}/models/prunaai/p-video/predictions`, {
    method: "POST",
    headers: { ...replicateHeaders(), "Content-Type": "application/json", Prefer: "wait=60" },
    body: JSON.stringify({
      input: {
        image,
        prompt: opts.prompt,
        duration: opts.seconds,
        resolution: "720p",
        fps: 24,
        draft: false,
        prompt_upsampling: true,
        save_audio: true,
      },
    }),
  });
  if (!create.ok) await providerError(create, "Animation generation");
  let prediction = (await create.json()) as { id?: string; status?: string; output?: string; error?: string };
  for (let i = 0; i < 30 && prediction.status !== "succeeded"; i++) {
    if (prediction.status === "failed" || prediction.status === "canceled") {
      throw new ProviderError(prediction.error || "Animation generation failed.");
    }
    if (!prediction.id) throw new ProviderError("Animation provider returned no prediction id.");
    await new Promise((resolve) => setTimeout(resolve, 4000));
    const poll = await fetch(`${REPLICATE_API}/predictions/${prediction.id}`, { headers: replicateHeaders() });
    if (!poll.ok) await providerError(poll, "Animation polling");
    prediction = (await poll.json()) as typeof prediction;
  }
  if (prediction.status !== "succeeded" || !prediction.output) throw new ProviderError("Animation timed out.");
  const video = await fetch(prediction.output);
  if (!video.ok) throw new ProviderError("Animation video download failed.");
  return { bytes: new Uint8Array(await video.arrayBuffer()), contentType: "video/mp4" };
}

/** Managed image-to-video animation (Veo) used when Replicate is not configured. */
async function managedAnimation(opts: { imageDataUrl: string; prompt: string; seconds: 4 | 6 | 8 }): Promise<GeneratedBinary> {
  const key = env("LOVABLE_API_KEY");
  if (!key) throw new ProviderError("No animation provider is configured.", "config");
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const create = await fetch(`${GATEWAY_API}/videos`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "google/veo-3.1-lite",
      prompt: opts.prompt,
      seconds: String(opts.seconds === 4 ? 4 : opts.seconds === 6 ? 6 : 8),
      size: "1280x720",
      input_reference: opts.imageDataUrl,
    }),
  });
  if (!create.ok) await providerError(create, "Animation generation");
  let job = (await create.json()) as { id?: string; status?: string; error?: { message?: string } };
  if (!job.id) throw new ProviderError("Animation provider returned no job id.");
  for (let i = 0; i < 40 && job.status !== "completed"; i++) {
    if (job.status === "failed") throw new ProviderError(job.error?.message || "Animation generation failed.");
    await new Promise((resolve) => setTimeout(resolve, 6000));
    const poll = await fetch(`${GATEWAY_API}/videos/${job.id}`, { headers });
    if (!poll.ok) await providerError(poll, "Animation polling");
    job = (await poll.json()) as typeof job;
  }
  if (job.status !== "completed") throw new ProviderError("Animation timed out.");
  const content = await fetch(`${GATEWAY_API}/videos/${job.id}/content`, { headers: { Authorization: `Bearer ${key}` } });
  if (!content.ok) throw new ProviderError("Animation video download failed.");
  return { bytes: new Uint8Array(await content.arrayBuffer()), contentType: "video/mp4" };
}

/** Real image-to-video animation so characters actually move and lip-sync. */
export async function generateSceneAnimation(opts: {
  imageDataUrl: string;
  prompt: string;
  seconds: 4 | 6 | 8;
}): Promise<GeneratedBinary | null> {
  if (env("REPLICATE_API_TOKEN")) return replicateAnimation(opts);
  return managedAnimation(opts);
}

/* ---------------------------------- music ---------------------------------- */

function writeWavHeader(view: DataView, samples: number, sampleRate: number) {
  const write = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  write(0, "RIFF"); view.setUint32(4, 36 + samples * 2, true); write(8, "WAVEfmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true);
  view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, samples * 2, true);
}

export async function generateMusic(opts: { seconds: number; seed?: number }): Promise<GeneratedBinary> {
  const url = env("MUSIC_API_URL");
  const key = env("MUSIC_API_KEY");
  if (url && key) {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "cheerful gentle instrumental children's music, no vocals", duration: opts.seconds }),
    });
    if (!res.ok) await providerError(res, "Music generation");
    return { bytes: new Uint8Array(await res.arrayBuffer()), contentType: "audio/mpeg" };
  }
  const sampleRate = 22050;
  const total = Math.max(8, Math.ceil(opts.seconds)) * sampleRate;
  const buffer = new ArrayBuffer(44 + total * 2);
  const view = new DataView(buffer); writeWavHeader(view, total, sampleRate);
  const scale = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25];
  const chords = [[261.63,329.63,392.0],[349.23,440.0,523.25],[220.0,261.63,329.63],[392.0,493.88,587.33]];
  const beat = 0.5;
  for (let i = 0; i < total; i++) {
    const t = i / sampleRate; const beatIndex = Math.floor(t / beat); const chord = chords[Math.floor(beatIndex / 4) % chords.length]!;
    let sample = 0;
    for (const f of chord) sample += 0.12 * Math.sin(2 * Math.PI * f * t);
    const note = scale[(beatIndex * 3) % scale.length]! * 2; const env2 = Math.exp(-6 * (t - beatIndex * beat));
    sample += 0.22 * env2 * Math.sin(2 * Math.PI * note * t);
    const fade = Math.min(1, t / 1.5, (total / sampleRate - t) / 2);
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample * Math.max(0, fade) * 0.7)) * 32767, true);
  }
  return { bytes: new Uint8Array(buffer), contentType: "audio/wav" };
}

/* ------------------------------ mp3 duration ------------------------------ */

const BITRATES_V1_L3 = [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320,0];
const BITRATES_V2_L3 = [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160,0];
const RATES_V1 = [44100,48000,32000,0];
const RATES_V2 = [22050,24000,16000,0];

export function measureMp3Duration(bytes: Uint8Array): number {
  let i = 0;
  if (bytes.length > 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const size = ((bytes[6]! & 0x7f) << 21) | ((bytes[7]! & 0x7f) << 14) | ((bytes[8]! & 0x7f) << 7) | (bytes[9]! & 0x7f);
    i = 10 + size;
  }
  let duration = 0; let guard = 0;
  while (i + 4 < bytes.length && guard++ < 500000) {
    if (bytes[i] !== 0xff || (bytes[i + 1]! & 0xe0) !== 0xe0) { i++; continue; }
    const versionBits = (bytes[i + 1]! >> 3) & 3; const bitrateIndex = (bytes[i + 2]! >> 4) & 15; const rateIndex = (bytes[i + 2]! >> 2) & 3;
    const padding = (bytes[i + 2]! >> 1) & 1; const isV1 = versionBits === 3;
    const bitrate = ((isV1 ? BITRATES_V1_L3 : BITRATES_V2_L3)[bitrateIndex] ?? 0) * 1000;
    const sampleRate = (isV1 ? RATES_V1 : RATES_V2)[rateIndex] ?? 0;
    if (!bitrate || !sampleRate) { i++; continue; }
    const samplesPerFrame = isV1 ? 1152 : 576; const frameLength = Math.floor((samplesPerFrame / 8) * (bitrate / sampleRate)) + padding;
    if (frameLength < 4) { i++; continue; }
    duration += samplesPerFrame / sampleRate; i += frameLength;
  }
  return Math.round(duration * 100) / 100;
}

export function measureWavDuration(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sampleRate = view.getUint32(24, true); const dataSize = view.getUint32(40, true);
  return sampleRate ? Math.round((dataSize / 2 / sampleRate) * 100) / 100 : 0;
}
