// Client-safe shared types for the provider abstraction layer.

export type CharacterRef = {
  id?: string;
  name: string;
  description: string;
  personality: string;
  appearance: string;
  clothing: string;
  role: string;
  voice_id: string;
  reference_image_path?: string | null;
};

export type DialogueLine = { speaker: string; text: string };

export type Caption = { start: number; end: number; text: string; speaker: string };

export type ScriptScene = {
  location: string;
  action: string;
  narration: string;
  characters: string[];
  dialogue: DialogueLine[];
  image_prompt: string;
};

export type StoryScript = {
  title: string;
  objective: string;
  scenes: ScriptScene[];
  ending: string;
};

export type PipelineStage =
  | "planning"
  | "script"
  | "storyboard"
  | "images"
  | "voices"
  | "animation"
  | "music"
  | "captions"
  | "render"
  | "complete";

export const PIPELINE_STAGES: PipelineStage[] = [
  "planning",
  "script",
  "storyboard",
  "images",
  "voices",
  "animation",
  "music",
  "captions",
  "render",
  "complete",
];

export type PipelineState = {
  stage: PipelineStage;
  progress: number;
  message?: string;
  failedStage?: PipelineStage | null;
};

export type ProviderInfo = {
  image: string;
  voice: string;
  music: string;
  animation: string;
  render: string;
};
