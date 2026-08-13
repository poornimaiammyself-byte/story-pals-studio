import {
  Output,
  Mp4OutputFormat,
  WebMOutputFormat,
  BufferTarget,
  CanvasSource,
  AudioBufferSource,
  QUALITY_MEDIUM,
  getFirstEncodableVideoCodec,
  getFirstEncodableAudioCodec,
  type VideoCodec,
  type AudioCodec,
} from "mediabunny";

export type RenderScene = {
  index: number;
  imageUrl: string | null;
  videoUrl: string | null;
  duration: number;
  location: string;
  captions: { start: number; end: number; text: string; speaker: string }[];
  audio: { url: string | null; start: number; duration: number }[];
};

export type RenderInput = {
  title: string;
  aspectRatio: string;
  scenes: RenderScene[];
  musicUrl: string | null;
  musicVolume: number;
  intro: { title: string; line: string; imageUrl: string | null };
  outro: { lines: string[]; imageUrl: string | null };
  onProgress?: (pct: number, label: string) => void;
};

export type RenderOutput = {
  blob: Blob;
  duration: number;
  width: number;
  height: number;
};

const FPS = 24;

function dimensions(aspect: string) {
  if (aspect === "9:16") return { width: 720, height: 1280 };
  if (aspect === "1:1") return { width: 960, height: 960 };
  return { width: 1280, height: 720 };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load a scene image."));
    img.src = url;
  });
}

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.preload = "auto";
    video.onloadeddata = () => resolve(video);
    video.onerror = () => reject(new Error("Could not load a scene animation."));
    video.src = url;
  });
}

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener("seeked", done);
      resolve();
    };
    video.addEventListener("seeked", done);
    video.currentTime = Math.min(time, Math.max(0, (video.duration || 0) - 0.05));
  });
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  media: CanvasImageSource,
  mw: number,
  mh: number,
  w: number,
  h: number,
  zoom: number,
  pan: number,
) {
  const scale = Math.max(w / mw, h / mh) * zoom;
  const dw = mw * scale;
  const dh = mh * scale;
  ctx.drawImage(media, (w - dw) / 2 + pan, (h - dh) / 2, dw, dh);
}

function drawCaption(ctx: CanvasRenderingContext2D, w: number, h: number, speaker: string, text: string) {
  const fontSize = Math.round(h * 0.045);
  ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const maxWidth = w * 0.86;
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else current = candidate;
  }
  if (current) lines.push(current);

  const lineHeight = fontSize * 1.3;
  const boxHeight = lines.length * lineHeight + fontSize * 0.9;
  const boxTop = h - boxHeight - h * 0.05;
  ctx.fillStyle = "rgba(20, 16, 40, 0.68)";
  const radius = fontSize * 0.5;
  const boxLeft = w * 0.05;
  const boxWidth = w * 0.9;
  ctx.beginPath();
  ctx.roundRect(boxLeft, boxTop, boxWidth, boxHeight, radius);
  ctx.fill();

  lines.forEach((line, i) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillText(line, w / 2, boxTop + fontSize * 0.45 + lineHeight * (i + 0.5));
  });

  if (speaker && speaker !== "Narrator") {
    ctx.font = `700 ${Math.round(fontSize * 0.6)}px system-ui, sans-serif`;
    ctx.fillStyle = "#ffd166";
    ctx.textAlign = "left";
    ctx.fillText(speaker.toUpperCase(), boxLeft + radius, boxTop - fontSize * 0.5);
    ctx.textAlign = "center";
  }
}

function drawCard(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  img: HTMLImageElement | null,
  heading: string,
  sub: string,
  t: number,
) {
  ctx.fillStyle = "#1b1240";
  ctx.fillRect(0, 0, w, h);
  if (img) {
    ctx.globalAlpha = 0.5;
    drawCover(ctx, img, img.naturalWidth, img.naturalHeight, w, h, 1.05 + t * 0.02, 0);
    ctx.globalAlpha = 1;
  }
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "rgba(27,18,64,0.35)");
  grad.addColorStop(1, "rgba(27,18,64,0.9)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffd166";
  ctx.font = `800 ${Math.round(h * 0.055)}px system-ui, sans-serif`;
  ctx.fillText("LITTLE WONDERS", w / 2, h * 0.36);
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${Math.round(h * 0.075)}px system-ui, sans-serif`;
  ctx.fillText(heading, w / 2, h * 0.5);
  ctx.font = `500 ${Math.round(h * 0.042)}px system-ui, sans-serif`;
  ctx.fillText(sub, w / 2, h * 0.62);
}

async function mixAudio(
  input: RenderInput,
  timeline: { sceneStart: number; scene: RenderScene }[],
  totalDuration: number,
  introDuration: number,
): Promise<AudioBuffer> {
  const sampleRate = 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil(totalDuration * sampleRate), sampleRate);

  const fetchBuffer = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Could not load generated audio.");
    return ctx.decodeAudioData(await res.arrayBuffer());
  };

  for (const { sceneStart, scene } of timeline) {
    for (const line of scene.audio) {
      if (!line.url) continue;
      try {
        const buffer = await fetchBuffer(line.url);
        const node = ctx.createBufferSource();
        node.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.value = 1;
        node.connect(gain).connect(ctx.destination);
        node.start(sceneStart + line.start);
      } catch {
        // A missing line must not break the whole render.
      }
    }
  }

  if (input.musicUrl) {
    try {
      const music = await fetchBuffer(input.musicUrl);
      let t = 0;
      while (t < totalDuration) {
        const node = ctx.createBufferSource();
        node.buffer = music;
        const gain = ctx.createGain();
        gain.gain.value = input.musicVolume;
        node.connect(gain).connect(ctx.destination);
        node.start(t);
        t += music.duration;
      }
    } catch {
      // Music is optional in the mix.
    }
  }
  void introDuration;
  return ctx.startRendering();
}

export async function renderProjectVideo(input: RenderInput): Promise<RenderOutput> {
  if (typeof window === "undefined") throw new Error("Rendering must run in the browser.");
  const { width, height } = dimensions(input.aspectRatio);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas is unavailable in this browser.");

  // Pick codecs this browser can actually encode; MP4 is preferred, WebM is the fallback.
  const mp4 = new Mp4OutputFormat();
  const webm = new WebMOutputFormat();
  const videoOpts = { width, height, bitrate: QUALITY_MEDIUM };
  let format: Mp4OutputFormat | WebMOutputFormat = mp4;
  let videoCodec = await getFirstEncodableVideoCodec(mp4.getSupportedVideoCodecs(), videoOpts);
  if (!videoCodec) {
    videoCodec = await getFirstEncodableVideoCodec(webm.getSupportedVideoCodecs(), videoOpts);
    format = webm;
  }
  if (!videoCodec) throw new Error("This browser cannot encode video. Try Chrome or Edge on desktop.");

  const audioCodec = await getFirstEncodableAudioCodec(
    (format as Mp4OutputFormat).getSupportedAudioCodecs(),
    { numberOfChannels: 2, sampleRate: 44100 },
  );

  const output = new Output({ format, target: new BufferTarget() });
  const videoSource = new CanvasSource(canvas, {
    codec: videoCodec as VideoCodec,
    bitrate: QUALITY_MEDIUM,
  });
  const audioSource = audioCodec
    ? new AudioBufferSource({ codec: audioCodec as AudioCodec, bitrate: QUALITY_MEDIUM })
    : null;
  output.addVideoTrack(videoSource, { frameRate: FPS });
  if (audioSource) output.addAudioTrack(audioSource);
  await output.start();


  const INTRO = 3;
  const OUTRO = 3;
  const timeline: { sceneStart: number; scene: RenderScene }[] = [];
  let cursor = INTRO;
  for (const scene of input.scenes) {
    timeline.push({ sceneStart: cursor, scene });
    cursor += Math.max(2, scene.duration);
  }
  const totalDuration = cursor + OUTRO;

  input.onProgress?.(5, "Mixing audio");
  const mixed = await mixAudio(input, timeline, totalDuration, INTRO);

  const introImg = input.intro.imageUrl ? await loadImage(input.intro.imageUrl).catch(() => null) : null;
  const outroImg = input.outro.imageUrl ? await loadImage(input.outro.imageUrl).catch(() => null) : null;

  let frame = 0;
  const addFrame = async (draw: (t: number) => void) => {
    const t = frame / FPS;
    draw(t);
    await videoSource.add(t, 1 / FPS);
    frame++;
  };

  // Intro
  for (let i = 0; i < INTRO * FPS; i++) {
    await addFrame((t) => drawCard(ctx, width, height, introImg, input.intro.title, input.intro.line, t));
  }
  input.onProgress?.(12, "Rendering scenes");

  // Scenes
  for (let s = 0; s < timeline.length; s++) {
    const { scene, sceneStart } = timeline[s]!;
    const sceneDuration = Math.max(2, scene.duration);
    const frames = Math.round(sceneDuration * FPS);
    const img = scene.imageUrl ? await loadImage(scene.imageUrl).catch(() => null) : null;
    const video = scene.videoUrl ? await loadVideo(scene.videoUrl).catch(() => null) : null;

    for (let f = 0; f < frames; f++) {
      const local = f / FPS;
      if (video) await seek(video, Math.min(local, video.duration || local));
      await addFrame(() => {
        ctx.fillStyle = "#0d0a1f";
        ctx.fillRect(0, 0, width, height);
        const zoom = 1.04 + (local / sceneDuration) * 0.08; // camera push-in
        const pan = Math.sin((local / sceneDuration) * Math.PI) * width * 0.01;
        if (video) drawCover(ctx, video, video.videoWidth, video.videoHeight, width, height, 1, 0);
        else if (img) drawCover(ctx, img, img.naturalWidth, img.naturalHeight, width, height, zoom, pan);
        const caption = scene.captions.find((c) => local >= c.start && local <= c.end + 0.25);
        if (caption) drawCaption(ctx, width, height, caption.speaker, caption.text);
      });
    }
    input.onProgress?.(12 + Math.round(((s + 1) / timeline.length) * 80), `Rendered scene ${s + 1}`);
    void sceneStart;
  }

  // Outro
  for (let i = 0; i < OUTRO * FPS; i++) {
    await addFrame((t) =>
      drawCard(ctx, width, height, outroImg, input.outro.lines[0] ?? "Great job, little friends!", input.outro.lines[1] ?? "See you in our next adventure!", t),
    );
  }

  input.onProgress?.(94, "Encoding audio");
  await audioSource.add(mixed);
  audioSource.close();
  videoSource.close();
  input.onProgress?.(97, "Finalizing MP4");
  await output.finalize();

  const buffer = (output.target as BufferTarget).buffer;
  if (!buffer) throw new Error("Video encoding produced no data.");
  return {
    blob: new Blob([buffer], { type: "video/mp4" }),
    duration: totalDuration,
    width,
    height,
  };
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
