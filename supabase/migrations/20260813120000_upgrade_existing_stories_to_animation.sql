-- Upgrade stories created before real image-to-video animation was enabled.
-- Existing still scenes are queued for animation on the next production run.
UPDATE public.scenes
SET animation_mode = 'video'
WHERE animation_mode = 'still'
  AND image_path IS NOT NULL
  AND video_path IS NULL;

-- Re-queue only projects that are already marked complete but contain scenes
-- that now need real animation. This makes the existing project immediately
-- eligible for the normal production runner instead of leaving it on the
-- old slideshow render.
UPDATE public.projects p
SET
  final_video_path = NULL,
  render_status = 'pending',
  last_error = NULL,
  pipeline = jsonb_build_object(
    'stage', 'animation',
    'progress', 72,
    'message', 'Upgrading scenes to real image-to-video animation…'
  )
WHERE p.pipeline->>'stage' = 'complete'
  AND EXISTS (
    SELECT 1
    FROM public.scenes s
    WHERE s.project_id = p.id
      AND s.animation_mode = 'video'
      AND s.image_path IS NOT NULL
      AND s.video_path IS NULL
  );
