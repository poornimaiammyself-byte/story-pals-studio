import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  advanceStoryPipeline,
  getStoryBundle,
  regenerateScenePart,
  reportRenderFailure,
  retryStage,
  saveRenderedVideo,
  updateProject,
  updateScene,
} from "@/lib/studio.functions";
import type { RenderScene } from "@/lib/render/renderVideo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

const STAGES = [
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
] as const;

export const Route = createFileRoute("/project/$projectId")({
  validateSearch: z.object({ auto: z.boolean().optional() }),
  head: () => ({
    meta: [
      { title: "Production timeline — Little Wonders Studio" },
      {
        name: "description",
        content:
          "Watch every production stage run automatically: script, storyboard, art, voices, music, captions and the final MP4.",
      },
      { property: "og:title", content: "Production timeline — Little Wonders Studio" },
      {
        property: "og:description",
        content: "Watch the full automated children's video production pipeline run end to end.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProjectPage,
});

type Bundle = Awaited<ReturnType<typeof getStoryBundle>>;

function ProjectPage() {
  const { projectId } = Route.useParams();
  const { auto } = Route.useSearch();
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [renderPct, setRenderPct] = useState<{ pct: number; label: string } | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const startedRef = useRef(false);

  const bundle = useQuery({
    queryKey: ["bundle", projectId],
    queryFn: () => getStoryBundle({ data: { projectId } }) as Promise<Bundle>,
  });

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["bundle", projectId] }),
    [queryClient, projectId],
  );

  const renderFinal = useCallback(async () => {
    // The browser video encoder is heavy and unsupported on several mobile
    // browsers, so it is only loaded when a render actually starts.
    if (typeof window === "undefined" || typeof (window as { VideoEncoder?: unknown }).VideoEncoder === "undefined") {
      throw new Error(
        "This browser can't assemble video (no WebCodecs support). Open the project in a desktop browser such as Chrome or Edge to render the MP4.",
      );
    }
    const { renderProjectVideo, blobToBase64 } = await import("@/lib/render/renderVideo");
    const fresh = (await getStoryBundle({ data: { projectId } })) as Bundle;
    const project = fresh.project;
    const scenes: RenderScene[] = fresh.scenes.map((s) => ({
      index: s.scene_index,
      imageUrl: s.image_url,
      videoUrl: s.animation_mode === "video" ? s.video_url : null,
      duration: s.audio_duration ?? 6,
      location: s.location ?? "",
      captions: ((s.captions as RenderScene["captions"] | null) ?? []).map((c) => ({ ...c })),
      audio: (s.audio ?? []).map((a, i, all) => ({
        url: a.url,
        start: all.slice(0, i).reduce((acc, x) => acc + (x.duration ?? 0) + 0.4, 0),
        duration: a.duration ?? 0,
      })),
    }));

    const result = await renderProjectVideo({
      title: project.title,
      aspectRatio: project.aspect_ratio ?? "16:9",
      scenes,
      musicUrl: project.music_url,
      musicVolume: project.music_volume ?? 0.18,
      intro: {
        title: project.title,
        line: project.objective || "A little story with a big lesson",
        imageUrl: fresh.scenes[0]?.image_url ?? null,
      },
      outro: {
        lines: ["Thanks for watching!", "See you in our next adventure!"],
        imageUrl: fresh.scenes[fresh.scenes.length - 1]?.image_url ?? null,
      },
      onProgress: (pct, label) => setRenderPct({ pct, label }),
    });

    const base64 = await blobToBase64(result.blob);
    await saveRenderedVideo({
      data: {
        projectId,
        base64,
        durationSeconds: result.duration,
        width: result.width,
        height: result.height,
        mimeType: result.blob.type || "video/mp4",
      },
    });
    setRenderPct(null);
  }, [projectId]);

  const runPipeline = useCallback(async () => {
    if (running) return;
    setRunning(true);
    try {
      for (let i = 0; i < 400; i++) {
        const step = await advanceStoryPipeline({ data: { projectId } });
        await refresh();
        if (step.needsClientRender) {
          await renderFinal();
          await refresh();
          break;
        }
        if (step.done) break;
      }
      toast.success("Production finished.");
    } catch (err) {
      setRenderPct(null);
      const message = (err as Error).message;
      await reportRenderFailure({ data: { projectId, message } }).catch(() => {});
      await refresh();
      toast.error(message);
    } finally {
      setRunning(false);
    }
  }, [projectId, refresh, renderFinal, running]);

  useEffect(() => {
    if (auto && !startedRef.current) {
      startedRef.current = true;
      void runPipeline();
    }
  }, [auto, runPipeline]);

  if (bundle.isLoading || !bundle.data) {
    return <main className="grid min-h-screen place-items-center text-muted-foreground">Loading project…</main>;
  }

  const { project, scenes } = bundle.data;
  const pipeline = (project.pipeline ?? {}) as { stage?: string; progress?: number; message?: string };
  const stage = pipeline.stage ?? "planning";
  const progress = renderPct?.pct ?? pipeline.progress ?? 0;
  const complete = Boolean(project.final_video_url);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/" className="text-sm text-muted-foreground hover:underline">
            ← All productions
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">{project.title}</h1>
          <p className="text-muted-foreground">{project.concept}</p>
        </div>
        <div className="flex gap-2">
          {!complete && (
            <Button onClick={() => void runPipeline()} disabled={running}>
              {running ? "Producing…" : "Run production"}
            </Button>
          )}
          {complete && (
            <Button
              variant="outline"
              onClick={async () => {
                setRunning(true);
                try {
                  await renderFinal();
                  await refresh();
                  toast.success("Video re-rendered.");
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setRunning(false);
                }
              }}
              disabled={running}
            >
              Re-render video
            </Button>
          )}
        </div>
      </header>

      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {renderPct?.label ?? pipeline.message ?? "Ready to produce"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={progress} />
          <ol className="flex flex-wrap gap-2">
            {STAGES.map((s) => {
              const done = STAGES.indexOf(s) < STAGES.indexOf(stage as (typeof STAGES)[number]);
              const active = s === stage;
              return (
                <li key={s}>
                  <Badge variant={active ? "default" : done ? "secondary" : "outline"} className="capitalize">
                    {s}
                  </Badge>
                </li>
              );
            })}
          </ol>
          {project.last_error && (
            <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
              <span>{project.last_error}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await retryStage({ data: { projectId } });
                  void runPipeline();
                }}
              >
                Retry
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue={complete ? "video" : "storyboard"}>
        <TabsList>
          <TabsTrigger value="video">Final video</TabsTrigger>
          <TabsTrigger value="storyboard">Storyboard</TabsTrigger>
          <TabsTrigger value="script">Script</TabsTrigger>
          <TabsTrigger value="settings">Audio &amp; edit</TabsTrigger>
        </TabsList>

        <TabsContent value="video" className="pt-4">
          {project.final_video_url ? (
            <div className="space-y-3">
              <video
                src={project.final_video_url}
                controls
                playsInline
                className="w-full rounded-lg border border-border bg-black"
              />
              <Button asChild variant="outline">
                <a href={project.final_video_url} download={`${project.title}.mp4`}>
                  Download MP4
                </a>
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              The finished MP4 appears here once the pipeline reaches the render stage.
            </p>
          )}
        </TabsContent>

        <TabsContent value="storyboard" className="grid gap-4 pt-4 md:grid-cols-2">
          {scenes.map((scene) => (
            <Card key={scene.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span>
                    Scene {scene.scene_index + 1} — {scene.location}
                  </span>
                  <Badge variant="outline">{Math.round(scene.audio_duration ?? 0)}s</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {scene.animation_mode === "video" && scene.video_url ? (
                  <video src={scene.video_url} controls className="w-full rounded-md border border-border" />
                ) : scene.image_url ? (
                  <img
                    src={scene.image_url}
                    alt={`Scene ${scene.scene_index + 1}: ${scene.action ?? scene.location ?? ""}`}
                    className="w-full rounded-md border border-border"
                    loading="lazy"
                  />
                ) : (
                  <div className="grid h-40 place-items-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
                    Awaiting artwork
                  </div>
                )}
                <p className="text-sm text-muted-foreground">{scene.narration}</p>
                <ul className="space-y-1 text-sm">
                  {((scene.dialogue as { speaker: string; text: string }[] | null) ?? []).map((d, i) => (
                    <li key={i}>
                      <span className="font-semibold">{d.speaker}:</span> {d.text}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  {(["image", "voice", "animation", "captions"] as const).map((part) => (
                    <Button
                      key={part}
                      size="sm"
                      variant="outline"
                      disabled={running}
                      onClick={async () => {
                        try {
                          await regenerateScenePart({ data: { sceneId: scene.id, part } });
                          await refresh();
                          toast.success(`Regenerated ${part}.`);
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      }}
                    >
                      Redo {part}
                    </Button>
                  ))}
                </div>
                {scene.audio?.length ? (
                  <div className="space-y-1">
                    {scene.audio.map((a) => (
                      <div key={a.id} className="flex items-center gap-2 text-xs">
                        <span className="w-20 shrink-0 font-medium">{a.speaker}</span>
                        {a.url && <audio src={a.url} controls className="h-8 w-full" />}
                      </div>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
          {!scenes.length && <p className="text-sm text-muted-foreground">The storyboard is being built.</p>}
        </TabsContent>

        <TabsContent value="script" className="space-y-4 pt-4">
          {scenes.map((scene) => (
            <SceneEditor key={scene.id} scene={scene} onSaved={refresh} disabled={running} />
          ))}
        </TabsContent>

        <TabsContent value="settings" className="space-y-6 pt-4">
          <div className="space-y-2">
            <h3 className="font-medium">Background music</h3>
            {project.music_url ? (
              <audio src={project.music_url} controls className="w-full" />
            ) : (
              <p className="text-sm text-muted-foreground">Music is generated during the music stage.</p>
            )}
            <MusicVolume projectId={projectId} initial={project.music_volume ?? 0.18} onSaved={refresh} />
          </div>
          <p className="text-sm text-muted-foreground">
            Every project starts with a branded intro card and ends with a goodbye outro card, both baked into
            the exported MP4.
          </p>
        </TabsContent>
      </Tabs>
    </main>
  );
}

function MusicVolume({
  projectId,
  initial,
  onSaved,
}: {
  projectId: string;
  initial: number;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div className="max-w-sm space-y-2">
      <label className="text-sm text-muted-foreground">Music volume: {Math.round(value * 100)}%</label>
      <Slider
        value={[value]}
        min={0}
        max={0.6}
        step={0.02}
        onValueChange={([v]) => setValue(v ?? 0)}
        onValueCommit={async ([v]) => {
          await updateProject({ data: { projectId, patch: { music_volume: v ?? 0 } } });
          onSaved();
        }}
      />
    </div>
  );
}

function SceneEditor({
  scene,
  onSaved,
  disabled,
}: {
  scene: Bundle["scenes"][number];
  onSaved: () => void;
  disabled: boolean;
}) {
  const initialDialogue = useMemo(
    () =>
      (((scene.dialogue as { speaker: string; text: string }[] | null) ?? [])
        .map((d) => `${d.speaker}: ${d.text}`)
        .join("\n")),
    [scene.dialogue],
  );
  const [narration, setNarration] = useState(scene.narration ?? "");
  const [dialogue, setDialogue] = useState(initialDialogue);
  const [saving, setSaving] = useState(false);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Scene {scene.scene_index + 1}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea rows={2} value={narration} onChange={(e) => setNarration(e.target.value)} />
        <Textarea
          rows={4}
          value={dialogue}
          onChange={(e) => setDialogue(e.target.value)}
          placeholder="Leo: Hello friends!"
        />
        <Button
          size="sm"
          disabled={disabled || saving}
          onClick={async () => {
            setSaving(true);
            try {
              const parsed = dialogue
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line) => {
                  const idx = line.indexOf(":");
                  return idx > 0
                    ? { speaker: line.slice(0, idx).trim(), text: line.slice(idx + 1).trim() }
                    : { speaker: "Narrator", text: line };
                });
              await updateScene({ data: { sceneId: scene.id, patch: { narration, dialogue: parsed } } });
              await regenerateScenePart({ data: { sceneId: scene.id, part: "voice" } });
              onSaved();
              toast.success("Scene updated and re-voiced.");
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setSaving(false);
            }
          }}
        >
          Save &amp; re-voice
        </Button>
      </CardContent>
    </Card>
  );
}
