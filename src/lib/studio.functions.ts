import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runNextUnit, signedUrl } from "./pipeline.server";
import { generateSceneImage, generateSpeech, measureMp3Duration } from "./providers/index.server";
import type { Caption, DialogueLine } from "./providers/types";

const DEFAULT_CHARACTERS = [
  {
    name: "Leo",
    description: "Friendly young lion who guides the show",
    personality: "Patient, playful and encouraging",
    appearance: "Golden fur, brown fluffy mane, big warm eyes",
    clothing: "Blue shirt with red-orange overalls",
    role: "Friendly teacher and guide",
    voice_id: "onyx",
  },
  {
    name: "Little One",
    description: "Small young child who learns with the audience",
    personality: "Curious and energetic",
    appearance: "Small child with rosy cheeks and short dark hair",
    clothing: "Yellow striped shirt and blue shorts",
    role: "Learner",
    voice_id: "shimmer",
  },
];

export const ensureCharacterLibrary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase.from("characters").select("*").order("created_at");
    if (existing && existing.length) return existing;
    const { data, error } = await supabase
      .from("characters")
      .insert(DEFAULT_CHARACTERS.map((c) => ({ ...c, user_id: userId })))
      .select();
    if (error) throw new Error(error.message);
    return data;
  });

export const listCharacters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("characters").select("*").order("created_at");
    return await Promise.all(
      (data ?? []).map(async (c) => ({
        ...c,
        reference_url: await signedUrl(context.supabase, c.reference_image_path),
      })),
    );
  });

export const saveCharacter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1),
        description: z.string().default(""),
        personality: z.string().default(""),
        appearance: z.string().default(""),
        clothing: z.string().default(""),
        role: z.string().default("character"),
        voice_id: z.string().default("shimmer"),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    if (data.id) {
      const { error } = await supabase.from("characters").update(data as never).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabase
      .from("characters")
      .insert({ ...data, user_id: userId } as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("projects")
      .select("id,title,concept,pipeline,render_status,final_video_path,created_at")
      .order("created_at", { ascending: false });
    return data ?? [];
  });

/** Creates the project and immediately starts the pipeline. */
export const startPipeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        title: z.string().min(1),
        concept: z.string().min(1),
        age_range: z.string().default("2-5"),
        language: z.string().default("English"),
        duration_seconds: z.number().int().min(20).max(180).default(60),
        aspect_ratio: z.string().default("16:9"),
        visual_style: z.string().default("soft 3d cartoon, bright colors, storybook lighting"),
        objective: z.string().default(""),
        character_ids: z.array(z.string().uuid()).default([]),
        animate: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { animate, ...fields } = data;
    const { data: project, error } = await supabase
      .from("projects")
      .insert({
        ...fields,
        user_id: userId,
        pipeline: { stage: "planning", progress: 2, message: "Planning the video…" },
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { projectId: project.id, animate };
  });

export const advanceStoryPipeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    return await runNextUnit(context.supabase, context.userId, data.projectId);
  });

export const retryStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await context.supabase.from("projects").update({ last_error: null }).eq("id", data.projectId);
    return await runNextUnit(context.supabase, context.userId, data.projectId);
  });

export const getStoryBundle = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: project } = await supabase
      .from("projects")
      .select("*")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!project) throw new Error("Project not found");
    const { data: scenes } = await supabase
      .from("scenes")
      .select("*")
      .eq("project_id", data.projectId)
      .order("scene_index");
    const { data: audio } = await supabase
      .from("scene_audio")
      .select("*")
      .eq("project_id", data.projectId)
      .order("line_index");
    const characters = await supabase
      .from("characters")
      .select("*")
      .in("id", project.character_ids ?? []);

    const audioWithUrls = await Promise.all(
      (audio ?? []).map(async (a) => ({ ...a, url: await signedUrl(supabase, a.audio_path) })),
    );

    return {
      project: {
        ...project,
        music_url: await signedUrl(supabase, project.music_path),
        final_video_url: await signedUrl(supabase, project.final_video_path),
      },
      characters: characters.data ?? [],
      scenes: await Promise.all(
        (scenes ?? []).map(async (s) => ({
          ...s,
          image_url: await signedUrl(supabase, s.image_path),
          video_url: await signedUrl(supabase, s.video_path),
          audio: audioWithUrls.filter((a) => a.scene_id === s.id),
        })),
      ),
    };
  });

export const updateScene = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        sceneId: z.string().uuid(),
        patch: z.object({
          narration: z.string().optional(),
          dialogue: z.array(z.object({ speaker: z.string(), text: z.string() })).optional(),
          location: z.string().optional(),
          action: z.string().optional(),
          audio_duration: z.number().optional(),
          scene_index: z.number().int().optional(),
          animation_mode: z.enum(["still", "video"]).optional(),
          captions: z
            .array(
              z.object({
                start: z.number(),
                end: z.number(),
                text: z.string(),
                speaker: z.string(),
              }),
            )
            .optional(),
        }),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("scenes")
      .update(data.patch as never)
      .eq("id", data.sceneId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        patch: z.object({
          music_volume: z.number().min(0).max(1).optional(),
          title: z.string().optional(),
        }),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("projects")
      .update(data.patch as never)
      .eq("id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Regenerates exactly one part of one scene — nothing else is touched. */
export const regenerateScenePart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        sceneId: z.string().uuid(),
        part: z.enum(["image", "voice", "animation", "captions"]),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: scene } = await supabase.from("scenes").select("*").eq("id", data.sceneId).single();
    if (!scene) throw new Error("Scene not found");
    const { data: project } = await supabase
      .from("projects")
      .select("*")
      .eq("id", scene.project_id)
      .single();
    if (!project) throw new Error("Project not found");
    const { data: characters } = await supabase
      .from("characters")
      .select("*")
      .in("id", project.character_ids ?? []);

    if (data.part === "image") {
      const refs: string[] = [];
      for (const c of characters ?? []) {
        if (!c.reference_image_path) continue;
        const { data: file } = await supabase.storage.from("studio-media").download(c.reference_image_path);
        if (!file) continue;
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000)
          binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        refs.push(`data:${file.type || "image/png"};base64,${btoa(binary)}`);
      }
      const img = await generateSceneImage({
        prompt: `Children's cartoon scene illustration, no text. Style: ${project.visual_style}. Keep attached reference characters exactly consistent.
Location: ${scene.location}. Action: ${scene.action}. ${scene.image_prompt}`,
        referenceImages: refs,
      });
      const path = `${userId}/projects/${project.id}/scene-${scene.scene_index}-${Date.now()}.png`;
      const { error } = await supabase.storage
        .from("studio-media")
        .upload(path, new Blob([img.bytes as BlobPart], { type: img.contentType }), {
          contentType: img.contentType,
          upsert: true,
        });
      if (error) throw new Error(error.message);
      await supabase.from("scenes").update({ image_path: path }).eq("id", scene.id);
      return { ok: true, url: await signedUrl(supabase, path) };
    }

    if (data.part === "voice") {
      await supabase.from("scene_audio").delete().eq("scene_id", scene.id);
      const dialogue = (scene.dialogue as DialogueLine[] | null) ?? [];
      const lines: DialogueLine[] = [];
      if (scene.narration?.trim()) lines.push({ speaker: "Narrator", text: scene.narration.trim() });
      for (const l of dialogue) if (l.text?.trim()) lines.push(l);
      let total = 0;
      const captions: Caption[] = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        const character = (characters ?? []).find(
          (c) => c.name.toLowerCase() === line.speaker.toLowerCase(),
        );
        const audio = await generateSpeech({
          text: line.text,
          voiceId: character?.voice_id ?? "shimmer",
          instructions:
            line.speaker === "Narrator"
              ? "Warm, gentle storyteller for young children."
              : `Speak as ${line.speaker}. Friendly children's television character voice.`,
        });
        const path = `${userId}/projects/${project.id}/audio/${scene.scene_index}-${i}-${Date.now()}.mp3`;
        const { error } = await supabase.storage
          .from("studio-media")
          .upload(path, new Blob([audio.bytes as BlobPart], { type: "audio/mpeg" }), {
            contentType: "audio/mpeg",
            upsert: true,
          });
        if (error) throw new Error(error.message);
        const duration = measureMp3Duration(audio.bytes) || 2;
        captions.push({ start: total, end: total + duration, text: line.text, speaker: line.speaker });
        total += duration + 0.4;
        await supabase.from("scene_audio").insert({
          scene_id: scene.id,
          project_id: project.id,
          user_id: userId,
          line_index: i,
          speaker: line.speaker,
          text: line.text,
          audio_path: path,
          duration,
        });
      }
      await supabase
        .from("scenes")
        .update({
          captions: captions as never,
          audio_duration: Math.max(3, Math.round(total * 100) / 100),
        })
        .eq("id", scene.id);
      return { ok: true };
    }

    if (data.part === "animation") {
      await supabase
        .from("scenes")
        .update({ animation_mode: "video", video_path: null })
        .eq("id", scene.id);
      await supabase
        .from("projects")
        .update({
          pipeline: { stage: "animation", progress: 72, message: "Animating scene…" },
          final_video_path: null,
        })
        .eq("id", project.id);
      return { ok: true, restarted: "animation" };
    }

    // captions: recompute timings from the stored audio durations
    const { data: audio } = await supabase
      .from("scene_audio")
      .select("*")
      .eq("scene_id", scene.id)
      .order("line_index");
    let t = 0;
    const captions: Caption[] = (audio ?? []).map((a) => {
      const start = t;
      t += (a.duration ?? 0) + 0.4;
      return { start, end: start + (a.duration ?? 0), text: a.text, speaker: a.speaker };
    });
    await supabase.from("scenes").update({ captions: captions as never }).eq("id", scene.id);
    return { ok: true };
  });

/** Stores the rendered MP4 produced by the renderer and completes the project. */
export const saveRenderedVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        base64: z.string().min(100),
        durationSeconds: z.number(),
        width: z.number(),
        height: z.number(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const binary = atob(data.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const path = `${userId}/projects/${data.projectId}/final-${Date.now()}.mp4`;
    const { error } = await supabase.storage
      .from("studio-media")
      .upload(path, new Blob([bytes as BlobPart], { type: "video/mp4" }), {
        contentType: "video/mp4",
        upsert: true,
      });
    if (error) throw new Error(error.message);
    await supabase
      .from("projects")
      .update({
        final_video_path: path,
        render_status: "completed",
        last_error: null,
        pipeline: {
          stage: "complete",
          progress: 100,
          message: `Video complete — ${data.width}x${data.height}, ${Math.round(data.durationSeconds)}s`,
        },
      })
      .eq("id", data.projectId);
    return { ok: true, url: await signedUrl(supabase, path) };
  });

export const reportRenderFailure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ projectId: z.string().uuid(), message: z.string() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await context.supabase
      .from("projects")
      .update({
        render_status: "failed",
        last_error: data.message,
        pipeline: { stage: "render", progress: 95, message: `Failed: ${data.message}` },
      })
      .eq("id", data.projectId);
    return { ok: true };
  });
