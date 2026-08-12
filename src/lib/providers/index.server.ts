// Server-only provider abstraction. All API keys stay here.
// Providers are swappable: each export is a small interface implementation.
import type { CharacterRef } from "./types";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly kind: "config" | "provider" = "provider",
  ) {
    super(message);
  }
}

function apiKey(): string {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) {
    throw new ProviderError(
      "Missing credential LOVABLE_API_KEY. AI generation is not configured.",
      "config",
    );
  }
  return key;
}

function headers() {
  return {
    Authorization: `Bearer ${apiKey()}`,
    "Content-Type": "application/json",
  };
}

async function gatewayError(res: Response, what: string): Promise<never> {
  const body = await res.text();
  if (res.status === 429) throw new ProviderError(`${what}: rate limited, please retry in a moment.`);
  if (res.status === 402)
    throw new ProviderError(`${what}: AI credits exhausted. Add credits in Settings > Workspace > Usage.`);
  throw new ProviderError(`${what} failed [${res.status}]: ${body.slice(0, 400)}`);
}

/* ---------------------------------- text ---------------------------------- */

export async function chatJson<T>(model: string, system: string, user: string): Promise<T> {
  const res = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) await gatewayError(res, "Script generation");
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  const raw = data.choices?.[0]?.message?.content ?? "";
  const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new ProviderError("Script generation returned invalid JSON.");
  }
}

/* --------------------------------- images --------------------------------- */

export type GeneratedBinary = { bytes: Uint8Array; contentType: string };

function dataUrlToBytes(url: string): GeneratedBinary {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(url);
  if (!match) throw new ProviderError("Image provider returned an unreadable image.");
  const binary = atob(match[2]!);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, contentType: match[1]! };
}

export const IMAGE_MODEL = "google/gemini-3.1-flash-image";

/**
 * Character-reference-consistent keyframe generation.
 * Reference images (data URLs) are passed alongside the prompt so the same
 * characters, clothing and style are preserved across every scene.
 */
export async function generateSceneImage(opts: {
  prompt: string;
  referenceImages: string[];
}): Promise<GeneratedBinary> {
  const content: unknown[] = [{ type: "text", text: opts.prompt }];
  for (const url of opts.referenceImages.slice(0, 4)) {
    content.push({ type: "image_url", image_url: { url } });
  }
  const res = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model: IMAGE_MODEL,
      modalities: ["image", "text"],
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) await gatewayError(res, "Image generation");
  const data = (await res.json()) as {
    choices: { message: { images?: { image_url: { url: string } }[] } }[];
  };
  const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) throw new ProviderError("Image provider returned no image.");
  return dataUrlToBytes(url);
}

/* ---------------------------------- voice ---------------------------------- */

export const VOICE_MODEL = "openai/gpt-4o-mini-tts";

/**
 * Per-line TTS. If ELEVENLABS_API_KEY is configured the ElevenLabs provider is
 * used (persistent per-character voice ids); otherwise the Lovable AI voice
 * provider is used. Both return MP3 bytes.
 */
export async function generateSpeech(opts: {
  text: string;
  voiceId: string;
  instructions?: string;
}): Promise<GeneratedBinary> {
  const eleven = process.env["ELEVENLABS_API_KEY"];
  if (eleven && /^[A-Za-z0-9]{20}$/.test(opts.voiceId)) {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${opts.voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": eleven, "Content-Type": "application/json" },
        body: JSON.stringify({ text: opts.text, model_id: "eleven_multilingual_v2" }),
      },
    );
    if (!res.ok) await gatewayError(res, "Voice generation (ElevenLabs)");
    return { bytes: new Uint8Array(await res.arrayBuffer()), contentType: "audio/mpeg" };
  }

  const res = await fetch(`${GATEWAY}/audio/speech`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model: VOICE_MODEL,
      input: opts.text,
      voice: opts.voiceId,
      response_format: "mp3",
      ...(opts.instructions ? { instructions: opts.instructions } : {}),
    }),
  });
  if (!res.ok) await gatewayError(res, "Voice generation");
  return { bytes: new Uint8Array(await res.arrayBuffer()), contentType: "audio/mpeg" };
}

/* -------------------------------- animation -------------------------------- */

/**
 * Lip-sync / character animation provider (image-to-video).
 * Returns null when animation is unavailable so the caller can use the
 * still-frame + camera-move fallback instead of failing the project.
 */
export async function generateSceneAnimation(opts: {
  imageDataUrl: string;
  prompt: string;
  seconds: 4 | 6 | 8;
}): Promise<GeneratedBinary | null> {
  const create = await fetch(`${GATEWAY}/videos`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model: "google/veo-3.1-lite",
      prompt: opts.prompt,
      seconds: String(opts.seconds),
      size: "1280x720",
      input_reference: opts.imageDataUrl,
    }),
  });
  if (!create.ok) await gatewayError(create, "Animation generation");
  const job = (await create.json()) as { id: string };

  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 6000));
    const poll = await fetch(`${GATEWAY}/videos/${job.id}`, { headers: headers() });
    if (!poll.ok) await gatewayError(poll, "Animation polling");
    const state = (await poll.json()) as {
      status: string;
      error?: { message?: string };
    };
    if (state.status === "failed") {
      throw new ProviderError(state.error?.message ?? "Animation generation failed.");
    }
    if (state.status === "completed") {
      const content = await fetch(`${GATEWAY}/videos/${job.id}/content`, { headers: headers() });
      if (!content.ok) await gatewayError(content, "Animation download");
      return { bytes: new Uint8Array(await content.arrayBuffer()), contentType: "video/mp4" };
    }
  }
  throw new ProviderError("Animation timed out.");
}

/* ---------------------------------- music ---------------------------------- */

function writeWavHeader(view: DataView, samples: number, sampleRate: number) {
  const write = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  write(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples * 2, true);
}

/**
 * Instrumental background music provider.
 * If a dedicated music API is configured (MUSIC_API_URL + MUSIC_API_KEY) it is
 * used; otherwise the built-in original royalty-free procedural composer
 * generates a cheerful, gentle, vocal-free children's track.
 */
export async function generateMusic(opts: {
  seconds: number;
  seed?: number;
}): Promise<GeneratedBinary> {
  const url = process.env["MUSIC_API_URL"];
  const key = process.env["MUSIC_API_KEY"];
  if (url && key) {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "cheerful gentle instrumental children's music, no vocals", duration: opts.seconds }),
    });
    if (!res.ok) await gatewayError(res, "Music generation");
    return { bytes: new Uint8Array(await res.arrayBuffer()), contentType: "audio/mpeg" };
  }

  const sampleRate = 22050;
  const total = Math.max(8, Math.ceil(opts.seconds)) * sampleRate;
  const buffer = new ArrayBuffer(44 + total * 2);
  const view = new DataView(buffer);
  writeWavHeader(view, total, sampleRate);

  // C major pentatonic lullaby-ish progression, gentle bells + soft pad.
  const scale = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25];
  const chords = [
    [261.63, 329.63, 392.0],
    [349.23, 440.0, 523.25],
    [220.0, 261.63, 329.63],
    [392.0, 493.88, 587.33],
  ];
  const beat = 0.5;
  for (let i = 0; i < total; i++) {
    const t = i / sampleRate;
    const beatIndex = Math.floor(t / beat);
    const bar = Math.floor(beatIndex / 4) % chords.length;
    const chord = chords[bar]!;
    let sample = 0;
    for (const f of chord) {
      sample += 0.12 * Math.sin(2 * Math.PI * f * t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 0.1 * t));
    }
    // Glockenspiel melody: one note per beat with a fast decay.
    const note = scale[(beatIndex * 3 + bar * 2) % scale.length]! * 2;
    const env = Math.exp(-6 * (t - beatIndex * beat));
    sample += 0.22 * env * Math.sin(2 * Math.PI * note * t);
    sample += 0.06 * env * Math.sin(4 * Math.PI * note * t);
    // Soft fade in / out.
    const fade = Math.min(1, t / 1.5, (total / sampleRate - t) / 2);
    sample *= Math.max(0, fade) * 0.7;
    const clipped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + i * 2, clipped * 32767, true);
  }
  return { bytes: new Uint8Array(buffer), contentType: "audio/wav" };
}

/* ------------------------------ mp3 duration ------------------------------ */

const BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
const RATES_V1 = [44100, 48000, 32000, 0];
const RATES_V2 = [22050, 24000, 16000, 0];

/** Measures real MP3 duration by walking frame headers. */
export function measureMp3Duration(bytes: Uint8Array): number {
  let i = 0;
  // Skip ID3v2 tag.
  if (bytes.length > 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const size =
      ((bytes[6]! & 0x7f) << 21) |
      ((bytes[7]! & 0x7f) << 14) |
      ((bytes[8]! & 0x7f) << 7) |
      (bytes[9]! & 0x7f);
    i = 10 + size;
  }
  let duration = 0;
  let guard = 0;
  while (i + 4 < bytes.length && guard++ < 500000) {
    if (bytes[i] !== 0xff || (bytes[i + 1] & 0xe0) !== 0xe0) {
      i++;
      continue;
    }
    const versionBits = (bytes[i + 1]! >> 3) & 0x03;
    const bitrateIndex = (bytes[i + 2]! >> 4) & 0x0f;
    const rateIndex = (bytes[i + 2]! >> 2) & 0x03;
    const padding = (bytes[i + 2]! >> 1) & 0x01;
    const isV1 = versionBits === 3;
    const bitrate = ((isV1 ? BITRATES_V1_L3 : BITRATES_V2_L3)[bitrateIndex] ?? 0) * 1000;
    const sampleRate = (isV1 ? RATES_V1 : RATES_V2)[rateIndex] ?? 0;
    if (!bitrate || !sampleRate) {
      i++;
      continue;
    }
    const samplesPerFrame = isV1 ? 1152 : 576;
    const frameLength = Math.floor((samplesPerFrame / 8) * (bitrate / sampleRate)) + padding;
    if (frameLength < 4) {
      i++;
      continue;
    }
    duration += samplesPerFrame / sampleRate;
    i += frameLength;
  }
  return Math.round(duration * 100) / 100;
}

export function measureWavDuration(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sampleRate = view.getUint32(24, true);
  const dataSize = view.getUint32(40, true);
  return sampleRate ? Math.round((dataSize / 2 / sampleRate) * 100) / 100 : 0;
}
