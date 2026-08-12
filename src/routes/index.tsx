import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  ensureCharacterLibrary,
  listCharacters,
  listProjects,
  startPipeline,
} from "@/lib/studio.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Little Wonders Studio — AI children's video production" },
      {
        name: "description",
        content:
          "Turn one idea into a complete children's video: script, storyboard, character-consistent art, voices, music, captions and a real MP4.",
      },
      { property: "og:title", content: "Little Wonders Studio — AI children's video production" },
      {
        property: "og:description",
        content:
          "Turn one idea into a complete children's video: script, storyboard, art, voices, music, captions and a real MP4.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  if (loading || !session) {
    return <main className="grid min-h-screen place-items-center text-muted-foreground">Loading…</main>;
  }
  return <Studio />;
}

function Studio() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const characters = useQuery({
    queryKey: ["characters"],
    queryFn: async () => {
      await ensureCharacterLibrary();
      return listCharacters();
    },
  });
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });

  const [form, setForm] = useState({
    title: "Colors Adventure",
    concept:
      "Teach children red, blue, yellow and green through a fun adventure with Leo and Little One.",
    objective: "Recognise and name the colors red, blue, yellow and green.",
    age_range: "2-5",
    language: "English",
    duration_seconds: 60,
    aspect_ratio: "16:9",
    visual_style: "soft 3d cartoon, bright colors, storybook lighting",
    animate: false,
  });
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (characters.data && !selected.length) setSelected(characters.data.map((c) => c.id));
  }, [characters.data, selected.length]);

  const create = useMutation({
    mutationFn: async () => {
      const result = await startPipeline({
        data: { ...form, character_ids: selected },
      });
      return result;
    },
    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      navigate({ to: "/project/$projectId", params: { projectId }, search: { auto: true } });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Little Wonders Studio</h1>
          <p className="text-muted-foreground">One idea in. A finished children's video out.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/characters">Character library</Link>
          </Button>
          <Button variant="ghost" onClick={() => supabase.auth.signOut()}>
            Sign out
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>New video project</CardTitle>
          <CardDescription>Everything below is generated for real — no placeholders.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="title">Project title</Label>
              <Input id="title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="objective">Educational objective</Label>
              <Input
                id="objective"
                value={form.objective}
                onChange={(e) => setForm({ ...form, objective: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="concept">Story concept</Label>
            <Textarea
              id="concept"
              rows={3}
              value={form.concept}
              onChange={(e) => setForm({ ...form, concept: e.target.value })}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor="age">Target age</Label>
              <Input id="age" value={form.age_range} onChange={(e) => setForm({ ...form, age_range: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="language">Language</Label>
              <Input
                id="language"
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="duration">Duration (seconds)</Label>
              <Input
                id="duration"
                type="number"
                min={20}
                max={180}
                value={form.duration_seconds}
                onChange={(e) => setForm({ ...form, duration_seconds: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1">
              <Label>Aspect ratio</Label>
              <Select
                value={form.aspect_ratio}
                onValueChange={(value) => setForm({ ...form, aspect_ratio: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="16:9">16:9 widescreen</SelectItem>
                  <SelectItem value="9:16">9:16 vertical</SelectItem>
                  <SelectItem value="1:1">1:1 square</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="style">Visual style</Label>
            <Input
              id="style"
              value={form.visual_style}
              onChange={(e) => setForm({ ...form, visual_style: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>Characters</Label>
            <div className="flex flex-wrap gap-3">
              {(characters.data ?? []).map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <Checkbox
                    checked={selected.includes(c.id)}
                    onCheckedChange={(checked) =>
                      setSelected(checked ? [...selected, c.id] : selected.filter((id) => id !== c.id))
                    }
                  />
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted-foreground">{c.role}</span>
                </label>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.animate}
              onCheckedChange={(checked) => setForm({ ...form, animate: Boolean(checked) })}
            />
            Generate AI lip-sync animation clips (slower and much more expensive; still frames with camera
            movement are used otherwise)
          </label>

          <Button
            size="lg"
            className="w-full text-base"
            disabled={create.isPending || !selected.length}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Starting production…" : "CREATE COMPLETE VIDEO"}
          </Button>
        </CardContent>
      </Card>

      <section className="mt-10">
        <h2 className="mb-3 text-xl font-semibold">Your productions</h2>
        <div className="grid gap-3">
          {(projects.data ?? []).map((p) => {
            const pipeline = (p.pipeline ?? {}) as { stage?: string; progress?: number };
            return (
              <Link
                key={p.id}
                to="/project/$projectId"
                params={{ projectId: p.id }}
                search={{ auto: false }}
                className="flex items-center justify-between rounded-lg border border-border px-4 py-3 hover:bg-accent"
              >
                <div>
                  <div className="font-medium">{p.title}</div>
                  <div className="line-clamp-1 text-sm text-muted-foreground">{p.concept}</div>
                </div>
                <Badge variant={p.final_video_path ? "default" : "secondary"}>
                  {p.final_video_path ? "Complete" : (pipeline.stage ?? "pending")}
                </Badge>
              </Link>
            );
          })}
          {!projects.data?.length && (
            <p className="text-sm text-muted-foreground">No productions yet.</p>
          )}
        </div>
      </section>
    </main>
  );
}
