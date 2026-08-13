# Independent AI providers

Story Pals Studio no longer requires Lovable AI credits for its core generation pipeline.

## Required server environment variables

```env
OPENAI_API_KEY=your_openai_api_key
REPLICATE_API_TOKEN=your_replicate_api_token
```

Optional:

```env
OPENAI_TEXT_MODEL=gpt-5-mini
OPENAI_IMAGE_MODEL=gpt-image-1
OPENAI_TTS_MODEL=gpt-4o-mini-tts
MUSIC_API_URL=
MUSIC_API_KEY=
```

Keep these variables server-side. Never put them in `VITE_*` variables or client code.

## What each provider does

- OpenAI: story/script JSON, scene artwork, and character/narrator speech.
- Replicate: image-to-video animation using `prunaai/p-video`.
- Built-in composer: royalty-free procedural background music when no music API is configured.

Replicate's animation provider uploads the generated scene image when necessary, so the pipeline can pass its existing data URL without exposing storage credentials.

The app still keeps the provider abstraction in `src/lib/providers/`, so providers can be swapped later without changing the storyboard or pipeline stages.
