
CREATE TABLE public.characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  personality TEXT NOT NULL DEFAULT '',
  appearance TEXT NOT NULL DEFAULT '',
  clothing TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'character',
  voice_id TEXT NOT NULL DEFAULT 'alloy',
  reference_image_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.characters TO authenticated;
GRANT ALL ON public.characters TO service_role;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own characters" ON public.characters FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  concept TEXT NOT NULL DEFAULT '',
  age_range TEXT NOT NULL DEFAULT '2-5',
  language TEXT NOT NULL DEFAULT 'English',
  duration_seconds INT NOT NULL DEFAULT 60,
  aspect_ratio TEXT NOT NULL DEFAULT '16:9',
  visual_style TEXT NOT NULL DEFAULT 'soft 3d cartoon, bright colors, storybook lighting',
  objective TEXT NOT NULL DEFAULT '',
  character_ids UUID[] NOT NULL DEFAULT '{}',
  script JSONB,
  music_prompt TEXT,
  music_path TEXT,
  music_volume REAL NOT NULL DEFAULT 0.18,
  music_status TEXT NOT NULL DEFAULT 'pending',
  final_video_path TEXT,
  render_status TEXT NOT NULL DEFAULT 'pending',
  pipeline JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own projects" ON public.projects FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  scene_index INT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '',
  narration TEXT NOT NULL DEFAULT '',
  dialogue JSONB NOT NULL DEFAULT '[]'::jsonb,
  characters TEXT[] NOT NULL DEFAULT '{}',
  image_prompt TEXT NOT NULL DEFAULT '',
  image_path TEXT,
  captions JSONB NOT NULL DEFAULT '[]'::jsonb,
  audio_duration REAL NOT NULL DEFAULT 0,
  animation_mode TEXT NOT NULL DEFAULT 'still',
  video_path TEXT,
  status JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scenes TO authenticated;
GRANT ALL ON public.scenes TO service_role;
ALTER TABLE public.scenes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own scenes" ON public.scenes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX scenes_project_idx ON public.scenes(project_id, scene_index);

CREATE TABLE public.scene_audio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id UUID NOT NULL REFERENCES public.scenes(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  line_index INT NOT NULL,
  speaker TEXT NOT NULL,
  text TEXT NOT NULL,
  audio_path TEXT,
  duration REAL NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scene_audio TO authenticated;
GRANT ALL ON public.scene_audio TO service_role;
ALTER TABLE public.scene_audio ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own scene audio" ON public.scene_audio FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX scene_audio_scene_idx ON public.scene_audio(scene_id, line_index);

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER projects_touch BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY "own media read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'studio-media' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own media insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'studio-media' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own media update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'studio-media' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own media delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'studio-media' AND (storage.foldername(name))[1] = auth.uid()::text);
