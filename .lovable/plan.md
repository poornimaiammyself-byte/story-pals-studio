# Fix "This page didn't load" on mobile

## What I confirmed

- The screen in your screenshot is the app's own crash screen (the root error boundary in `src/routes/__root.tsx`), not the Lovable preview shell failing. So something is throwing inside the app on your phone.
- The server side is healthy: the dev server serves `/` and `/auth` with 200, and there are no server errors in the logs.
- Loading the app in a phone-sized browser here renders the sign-in screen with no console errors — so the crash is specific to your device/browser (most likely iOS Safari inside the Lovable app), not to every client.
- The crash screen currently prints nothing about the error, and the browser error report never reached the logs, so the exact cause is still unknown.

## Plan

### 1. Make the crash screen tell us what broke (diagnosis first)

Show the actual error message and a copyable detail block on the fallback screen, and make sure the error is reported even when the reporting call itself fails. Right now the screen is a dead end: it says "something went wrong" and swallows the reason. With the message visible, one screenshot from your phone identifies the cause immediately.

### 2. Stop the video renderer from loading on page open

The production page statically imports the browser video encoder (`mediabunny`). That means the encoder module is parsed as soon as the app loads, even on the sign-in screen and even on phones that can't encode video at all. This is the most likely source of a device-specific crash.

- Load the renderer only at the moment "Render video" runs, via a dynamic import.
- Check for encoder support (WebCodecs) before loading it, and show a clear message like "Video rendering isn't supported in this browser — open the project on a desktop browser to render" instead of crashing.

### 3. Make rendering failures recoverable, not fatal

Render errors should surface as an in-page message on the production timeline with a "Retry render" action, rather than bubbling up to the root error boundary and blanking the whole app.

### 4. Re-verify on a phone viewport

After the changes, load the app at phone size, sign in, open an existing project, and confirm no crash screen and no console errors.

## Note on mobile rendering

Even after this fix, actually assembling the MP4 on an iPhone will likely stay unsupported — Safari's video encoding support is limited and a 2-minute render is heavy for a phone. The app will keep generating everything (script, art, voices, music, captions) on any device; final rendering will show a clear "use a desktop browser" message where it isn't supported. If you'd rather have rendering work on phones too, that needs a server-side render service, which is a separate, larger piece of work.

## Technical details

- `src/routes/__root.tsx`: error boundary displays `error.message` (plus stack in a collapsed details block) and reports it defensively.
- `src/routes/project.$projectId.tsx`: replace the top-level `import { renderProjectVideo } from "@/lib/render/renderVideo"` with `await import(...)` inside the render handler; add a capability check (`typeof VideoEncoder !== "undefined"`); catch render errors into local state instead of throwing.
- `src/lib/render/renderVideo.ts`: unchanged logic; only its load timing changes.
