-- Story Pals Studio: make real animation the default and repair old slideshow scenes.
-- This migration is intentionally idempotent so it is safe to apply once in Supabase.

ALTER TABLE public.scenes
  ALTER COLUMN animation_mode SET DEFAULT 'video';

-- Any scene that was created by the earlier MVP with no animation choice should
-- be eligible for the real image-to-video stage.
UPDATE public.scenes
SET animation_mode = 'video'
WHERE animation_mode IS NULL OR animation_mode = 'still';

-- A project that was marked complete without a final video must be allowed to
-- resume from animation instead of being presented as finished.
UPDATE public.projects p
SET
  render_status = 'pending',
  last_error = NULL,
  pipeline = jsonb_build_object(
    'stage', 'animation',
    'progress', 72,
    'message', 'Animation repair queued — generating real scene video clips.'
  )
WHERE p.final_video_path IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.scenes s
    WHERE s.project_id = p.id
      AND s.animation_mode = 'video'
      AND s.image_path IS NOT NULL
  );
