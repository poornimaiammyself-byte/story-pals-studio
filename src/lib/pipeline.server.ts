// Server-only pipeline. Executes exactly ONE retryable unit of work per call
// so long jobs never hit a request timeout and a failure never restarts
// the whole project.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { ProviderError, chatJson, generateMusic, generateSceneAnimation, generateSceneImage, generateSpeech, measureMp3Duration, measureWavDuration } from "./providers/index.server";
import type { Caption, CharacterRef, DialogueLine, PipelineStage, StoryScript } from "./providers/types";

export type StudioClient = SupabaseClient<Database>;
const BUCKET = "studio-media";
const SCRIPT_MODEL = "google/gemini-3.5-flash";
export type AdvanceResult = { stage: PipelineStage; progress: number; message: string; done: boolean; needsClientRender?: boolean };
const STAGE_PROGRESS: Record<PipelineStage, number> = { planning: 2, script: 8, storyboard: 16, images: 40, voices: 62, animation: 72, music: 80, captions: 88, render: 95, complete: 100 };

async function upload(supabase: StudioClient, userId: string, path: string, bytes: Uint8Array, contentType: string) {
  const full = `${userId}/${path}`;
  const { error } = await supabase.storage.from(BUCKET).upload(full, new Blob([bytes as BlobPart], { type: contentType }), { contentType, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return full;
}
export async function signedUrl(supabase: StudioClient, path: string | null | undefined) { if (!path) return null; const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 4); return data?.signedUrl ?? null; }
async function toDataUrl(supabase: StudioClient, path: string | null | undefined) { if (!path) return null; const { data, error } = await supabase.storage.from(BUCKET).download(path); if (error || !data) return null; const buf = new Uint8Array(await data.arrayBuffer()); let binary = ""; for (let i = 0; i < buf.length; i += 0x8000) binary += String.fromCharCode(...buf.subarray(i, i + 0x8000)); return `data:${data.type || "image/png"};base64,${btoa(binary)}`; }
async function setPipeline(supabase: StudioClient, projectId: string, stage: PipelineStage, message: string, error: string | null = null) { await supabase.from("projects").update({ pipeline: { stage, progress: STAGE_PROGRESS[stage], message }, last_error: error }).eq("id", projectId); }
function linesOf(scene: { narration: string; dialogue: unknown }): DialogueLine[] { const dialogue = (scene.dialogue as DialogueLine[] | null) ?? []; const lines: DialogueLine[] = []; if (scene.narration?.trim()) lines.push({ speaker: "Narrator", text: scene.narration.trim() }); for (const line of dialogue) if (line?.text?.trim()) lines.push({ speaker: line.speaker || "Narrator", text: line.text.trim() }); return lines; }
export function characterPromptBlock(characters: CharacterRef[]) { return characters.map((c) => `${c.name} (${c.role}): ${c.description}. Appearance: ${c.appearance}. Clothing: ${c.clothing}. Personality: ${c.personality}.`).join("\n"); }
async function projectCharacters(supabase: StudioClient, ids: string[]): Promise<CharacterRef[]> { if (!ids.length) return []; const { data } = await supabase.from("characters").select("*").in("id", ids); return (data ?? []) as unknown as CharacterRef[]; }
function voiceInstruction(c: CharacterRef | undefined, speaker: string) { if (speaker === "Narrator") return "Warm, gentle storyteller for young children. Clear and slow."; return c ? `Speak as ${c.name}, ${c.personality}. Friendly children's television character voice.` : "Friendly children's television character voice."; }

export async function runNextUnit(supabase: StudioClient, userId: string, projectId: string): Promise<AdvanceResult> {
  const { data: project, error } = await supabase.from("projects").select("*").eq("id", projectId).maybeSingle();
  if (error || !project) throw new Error("Project not found.");
  const pipeline = (project.pipeline ?? {}) as { stage?: PipelineStage };
  const stage: PipelineStage = pipeline.stage ?? "planning";
  const characters = await projectCharacters(supabase, project.character_ids ?? []);
  const finish = async (next: PipelineStage, message: string): Promise<AdvanceResult> => { await setPipeline(supabase, projectId, next, message); return { stage: next, progress: STAGE_PROGRESS[next], message, done: next === "complete", needsClientRender: next === "render" }; };

  try {
    switch (stage) {
      case "planning": return await finish("script", "Writing the story script…");
      case "script": {
        if (!project.script) {
          const script = await chatJson<StoryScript>(SCRIPT_MODEL, "You are a children's educational video writer. Always answer with strict JSON only.", `Write an original educational children's video script.\nTitle idea: ${project.title}\nConcept: ${project.concept}\nLearning objective: ${project.objective || "derive from the concept"}\nTarget age: ${project.age_range}\nLanguage: ${project.language}\nTotal video duration: about ${project.duration_seconds} seconds\nCharacters:\n${characterPromptBlock(characters)}\n\nRules:\n- ${Math.max(4, Math.round(project.duration_seconds / 10))} scenes, each about 8-12 seconds of speech.\n- Every dialogue line MUST name its speaker, using exactly the character names above.\n- Short sentences suitable for the target age. No song lyrics, real dialogue only.\n- Scene 1 is a welcome intro with all characters. The final scene is a warm goodbye.\n- image_prompt describes the illustration for that scene (setting, character poses, mood), never text overlays.\n\nReturn JSON exactly: {"title":string,"objective":string,"ending":string,"scenes":[{"location":string,"action":string,"narration":string,"characters":string[],"dialogue":[{"speaker":string,"text":string}],"image_prompt":string}]}`);
          if (!script?.scenes?.length) throw new Error("Script generation returned no scenes.");
          await supabase.from("projects").update({ script: script as never, title: script.title || project.title, objective: script.objective }).eq("id", projectId);
        }
        return await finish("storyboard", "Building the storyboard…");
      }
      case "storyboard": {
        const { count } = await supabase.from("scenes").select("id", { count: "exact", head: true }).eq("project_id", projectId);
        if (!count) {
          const script = project.script as unknown as StoryScript;
          const rows = script.scenes.map((s, i) => ({ project_id: projectId, user_id: userId, scene_index: i, location: s.location ?? "", action: s.action ?? "", narration: s.narration ?? "", dialogue: (s.dialogue ?? []) as never, characters: s.characters ?? [], image_prompt: s.image_prompt ?? "", animation_mode: "video", status: { image: "pending", voice: "pending", animation: "pending", captions: "pending" } as never }));
          const { error: insertError } = await supabase.from("scenes").insert(rows); if (insertError) throw new Error(insertError.message);
        }
        return await finish("images", "Generating scene artwork…");
      }
      case "images": {
        const missingRef = characters.find((c) => !c.reference_image_path);
        if (missingRef) {
          const img = await generateSceneImage({ prompt: `Character reference sheet for a children's cartoon. Single character on a plain soft background, full body, front view, friendly smile. Character: ${missingRef.name}. ${missingRef.description}. Appearance: ${missingRef.appearance}. Clothing: ${missingRef.clothing}. Style: ${project.visual_style}. No text, no watermarks.`, referenceImages: [] });
          const path = await upload(supabase, userId, `characters/${missingRef.id}.png`, img.bytes, img.contentType); await supabase.from("characters").update({ reference_image_path: path }).eq("id", missingRef.id!);
          return { stage: "images", progress: STAGE_PROGRESS.images, message: `Created reference art for ${missingRef.name}`, done: false };
        }
        const { data: scene } = await supabase.from("scenes").select("*").eq("project_id", projectId).is("image_path", null).order("scene_index").limit(1).maybeSingle();
        if (scene) {
          const refs = (await Promise.all(characters.filter((c) => !scene.characters?.length || scene.characters.includes(c.name)).map((c) => toDataUrl(supabase, c.reference_image_path)))).filter((v): v is string => Boolean(v));
          const aspect = project.aspect_ratio === "9:16" ? "vertical 9:16" : project.aspect_ratio === "1:1" ? "square 1:1" : "widescreen 16:9";
          const img = await generateSceneImage({ prompt: `Children's cartoon scene illustration, ${aspect} composition, no text or captions in the image. Style: ${project.visual_style}. Keep the attached reference characters EXACTLY consistent (same faces, same colors, same clothing). Characters in shot: ${scene.characters?.join(", ") || characters.map((c) => c.name).join(", ")}. Location: ${scene.location}. Action: ${scene.action}. Scene description: ${scene.image_prompt}`, referenceImages: refs });
          const path = await upload(supabase, userId, `projects/${projectId}/scene-${scene.scene_index}.png`, img.bytes, img.contentType); await supabase.from("scenes").update({ image_path: path, status: { ...(scene.status as object), image: "completed" } as never }).eq("id", scene.id);
          return { stage: "images", progress: STAGE_PROGRESS.images, message: `Scene ${scene.scene_index + 1} artwork ready`, done: false };
        }
        return await finish("voices", "Recording character voices…");
      }
      case "voices": {
        const { data: scenes } = await supabase.from("scenes").select("*").eq("project_id", projectId).order("scene_index");
        for (const scene of scenes ?? []) {
          const lines = linesOf(scene); const { data: existing } = await supabase.from("scene_audio").select("*").eq("scene_id", scene.id).order("line_index"); const done = new Set((existing ?? []).filter((a) => a.audio_path).map((a) => a.line_index)); const nextIndex = lines.findIndex((_, i) => !done.has(i));
          if (nextIndex >= 0) { const line = lines[nextIndex]!; const character = characters.find((c) => c.name.toLowerCase() === line.speaker.toLowerCase()); const audio = await generateSpeech({ text: line.text, voiceId: character?.voice_id ?? "shimmer", instructions: voiceInstruction(character, line.speaker) }); const path = await upload(supabase, userId, `projects/${projectId}/audio/${scene.scene_index}-${nextIndex}.mp3`, audio.bytes, audio.contentType); const duration = measureMp3Duration(audio.bytes) || 2; await supabase.from("scene_audio").delete().eq("scene_id", scene.id).eq("line_index", nextIndex); await supabase.from("scene_audio").insert([{ scene_id: scene.id, project_id: projectId, user_id: userId, line_index: nextIndex, speaker: line.speaker, text: line.text, audio_path: path, duration }]); return { stage: "voices", progress: STAGE_PROGRESS.voices, message: `Voiced ${line.speaker} in scene ${scene.scene_index + 1}`, done: false }; }
          const total = (existing ?? []).reduce((sum, a) => sum + (a.duration ?? 0), 0); const target = Math.max(3, Math.round((total + 0.8 * lines.length) * 100) / 100); if (Math.abs((scene.audio_duration ?? 0) - target) > 0.05) await supabase.from("scenes").update({ audio_duration: target, status: { ...(scene.status as object), voice: "completed" } as never }).eq("id", scene.id);
        }
        return await finish("animation", "Animating characters with image-to-video…");
      }
      case "animation": {
        const { data: scene } = await supabase.from("scenes").select("*").eq("project_id", projectId).eq("animation_mode", "video").is("video_path", null).order("scene_index").limit(1).maybeSingle();
        if (scene) {
          const imageUrl = await toDataUrl(supabase, scene.image_path); if (!imageUrl) throw new ProviderError("Scene image missing.");
          const seconds = scene.audio_duration > 6 ? 8 : scene.audio_duration > 4 ? 6 : 4;
          try {
            const clip = await generateSceneAnimation({ imageDataUrl: imageUrl, prompt: `Children's cartoon animation for an educational story. ${scene.action}. Animate the characters themselves: natural lip movement, blinking, eye movement, subtle head turns, arm/hand gestures, body movement and expressive facial reactions. Keep the exact character design, clothing, colors and setting from the reference image. Use gentle child-friendly camera movement. No text, no captions, no new characters.`, seconds: seconds as 4 | 6 | 8 });
            if (!clip) throw new ProviderError("Animation provider returned no clip.");
            const path = await upload(supabase, userId, `projects/${projectId}/anim-${scene.scene_index}.mp4`, clip.bytes, clip.contentType);
            await supabase.from("scenes").update({ video_path: path, animation_mode: "video", status: { ...(scene.status as object), animation: "completed" } as never }).eq("id", scene.id);
            return { stage: "animation", progress: STAGE_PROGRESS.animation, message: `Animated scene ${scene.scene_index + 1}`, done: false };
          } catch (animationError) {
            // Animation is an enhancement, not a reason to lose the whole production.
            // Preserve the real generated artwork + voice and let the renderer apply
            // a gentle camera move while recording the fallback in scene status.
            const reason = animationError instanceof Error ? animationError.message : "Animation unavailable";
            await supabase.from("scenes").update({ animation_mode: "still", video_path: null, status: { ...(scene.status as object), animation: "fallback" } as never }).eq("id", scene.id);
            return { stage: "animation", progress: STAGE_PROGRESS.animation, message: `Scene ${scene.scene_index + 1} uses still-frame fallback (${reason.slice(0, 120)})`, done: false };
          }
        }
        return await finish("music", "Creating background music…");
      }
      case "music": {
        if (!project.music_path) { const seconds = Math.max(20, project.duration_seconds + 8); const music = await generateMusic({ seconds, seed: project.id.length }); const path = await upload(supabase, userId, `projects/${projectId}/music.wav`, music.bytes, music.contentType); await supabase.from("projects").update({ music_path: path }).eq("id", projectId); return { stage: "music", progress: STAGE_PROGRESS.music, message: "Background music ready", done: false }; }
        return await finish("captions", "Finalizing captions…");
      }
      case "captions": {
        const { data: scenes } = await supabase.from("scenes").select("*").eq("project_id", projectId).order("scene_index");
        for (const scene of scenes ?? []) { const lines = linesOf(scene); const { data: audio } = await supabase.from("scene_audio").select("*").eq("scene_id", scene.id).order("line_index"); let cursor = 0; const captions: Caption[] = []; for (let i = 0; i < lines.length; i++) { const a = audio?.find((x) => x.line_index === i); const duration = a?.duration ?? 2; captions.push({ start: cursor, end: cursor + duration, text: lines[i]!.text, speaker: lines[i]!.speaker }); cursor += duration + 0.4; } await supabase.from("scenes").update({ captions: captions as never, status: { ...(scene.status as object), captions: "completed" } as never }).eq("id", scene.id); }
        return await finish("render", "Rendering the final MP4…");
      }
      case "render": return { stage: "render", progress: 95, message: "Rendering the final MP4…", done: false, needsClientRender: true };
      case "complete": return { stage: "complete", progress: 100, message: "Production complete", done: true };
      default: throw new Error(`Unknown pipeline stage: ${stage}`);
    }
  } catch (err) {
    const message = err instanceof ProviderError ? err.message : err instanceof Error ? err.message : "Unknown pipeline error.";
    await setPipeline(supabase, projectId, stage, `Stage failed: ${message}`, message);
    throw err;
  }
}
