import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ensureCharacterLibrary, listCharacters, saveCharacter } from "@/lib/studio.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/characters")({
  head: () => ({
    meta: [
      { title: "Character library — Little Wonders Studio" },
      {
        name: "description",
        content:
          "Manage the recurring cast that keeps every generated scene visually and vocally consistent across videos.",
      },
      { property: "og:title", content: "Character library — Little Wonders Studio" },
      {
        property: "og:description",
        content: "Manage the recurring cast that keeps every generated scene consistent.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CharactersPage,
});

const EMPTY = {
  name: "",
  description: "",
  personality: "",
  appearance: "",
  clothing: "",
  role: "character",
  voice_id: "shimmer",
};

function CharactersPage() {
  const characters = useQuery({
    queryKey: ["characters"],
    queryFn: async () => {
      await ensureCharacterLibrary();
      return listCharacters();
    },
  });
  const [draft, setDraft] = useState<typeof EMPTY & { id?: string }>(EMPTY);
  const [saving, setSaving] = useState(false);

  const fields: [keyof typeof EMPTY, string][] = [
    ["name", "Name"],
    ["role", "Role"],
    ["description", "Description"],
    ["personality", "Personality"],
    ["appearance", "Appearance"],
    ["clothing", "Clothing"],
    ["voice_id", "Voice id (OpenAI voice or ElevenLabs voice id)"],
  ];

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <Link to="/" className="text-sm text-muted-foreground hover:underline">
        ← Back to studio
      </Link>
      <h1 className="mb-1 mt-2 text-3xl font-bold tracking-tight">Character library</h1>
      <p className="mb-8 text-muted-foreground">
        These descriptions are attached to every image prompt so the cast stays consistent scene to scene.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {(characters.data ?? []).map((c) => (
          <Card key={c.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {c.name} <span className="text-muted-foreground">· {c.role}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>{c.description}</p>
              <p>
                <strong className="text-foreground">Looks:</strong> {c.appearance}
              </p>
              <p>
                <strong className="text-foreground">Wears:</strong> {c.clothing}
              </p>
              <p>
                <strong className="text-foreground">Voice:</strong> {c.voice_id}
              </p>
              <Button size="sm" variant="outline" onClick={() => setDraft({ ...EMPTY, ...c, id: c.id })}>
                Edit
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>{draft.id ? `Edit ${draft.name}` : "Add a character"}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {fields.map(([key, label]) => (
            <div key={key} className="space-y-1">
              <Label htmlFor={key}>{label}</Label>
              <Input
                id={key}
                value={draft[key]}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              />
            </div>
          ))}
          <div className="flex gap-2 md:col-span-2">
            <Button
              disabled={saving || !draft.name}
              onClick={async () => {
                setSaving(true);
                try {
                  await saveCharacter({ data: draft });
                  await characters.refetch();
                  setDraft(EMPTY);
                  toast.success("Character saved.");
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setSaving(false);
                }
              }}
            >
              Save character
            </Button>
            {draft.id && (
              <Button variant="ghost" onClick={() => setDraft(EMPTY)}>
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
