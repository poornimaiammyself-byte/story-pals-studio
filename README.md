# Story Pals Studio

URGENT: COMPLETE THE EXISTING APPLICATION END-TO-END IN THIS TURN.

Do NOT start over. Do NOT redesign the existing architecture. Do NOT spend time on cosmetic improvements. Do NOT ask me clarifying questions unless something is technically impossible without an answer.

Use everything that has already been implemented and finish the application into a genuinely functional MVP.

PROJECT:

Little Wonders Studio / StoryPals Studio

PURPOSE:

This application is an automated AI children's video production studio.

The user should be able to enter a simple concept such as:

"Teach children the colors red, blue, yellow and green with Leo and Little One."

Then click ONE button:

"CREATE COMPLETE VIDEO"

The system should automatically create the complete children's video from beginning to end.

==================================================

EXISTING BACKEND — DO NOT REBUILD

==================================================

The following already exists and must be reused:

- storyboard schema fields:

  location

  action

  image_path

  captions

  audio_duration

  animation_mode

- story pipeline state:

  music_*

  final_video_path

  render_status

  pipeline

  last_error

- scene_audio table with RLS

- provider abstraction:

  src/lib/providers/

- image provider abstraction

  character-reference-consistent keyframes

- voice provider abstraction

  per-line TTS

  measured MP3 duration

  ElevenLabs-ready

- music provider abstraction

  instrumental music

  no-vocals fallback

- animation provider abstraction

  lip-sync video

  still-frame fallback

- src/lib/pipeline.server.ts

- retryable one-unit-per-call pipeline:

  script

  storyboard

  images

  voices

  animation

  music

  captions

  rendering

- existing server functions:

  startPipeline

  advanceStoryPipeline

  getStoryBundle

  regenerateScenePart

  updateScene

  saveRenderedVideo

All API keys must remain server-side.

DO NOT replace working backend components.

==================================================

PRIMARY OBJECTIVE

==================================================

FINISH THE FUNCTIONAL MVP.

The application must provide this real workflow:

USER IDEA

↓

SCRIPT

↓

STORYBOARD

↓

CHARACTER-CONSISTENT SCENE IMAGES

↓

CHARACTER VOICES

↓

LIP-SYNC / ANIMATION

↓

BACKGROUND MUSIC

↓

CAPTIONS

↓

VIDEO ASSEMBLY

↓

REAL MP4

↓

VIDEO PREVIEW

↓

EXPORT

Do not create fake buttons or simulated progress.

Every completed stage must correspond to real generated/stored data.

==================================================

1. CREATE PROJECT UI

==================================================

Create a simple project creation screen.

Fields:

- Project title

- Story concept

- Target age

- Language

- Video duration

- Video aspect ratio

- Characters

- Educational objective

- Visual style

Default example:

Title:

Colors Adventure

Concept:

Teach children red, blue, yellow and green through a fun adventure with Leo and Little One.

Age:

2–5

Language:

English

Duration:

60 seconds

Aspect ratio:

16:9

Characters:

Leo

Little One

Add one primary button:

CREATE COMPLETE VIDEO

==================================================

2. CHARACTER LIBRARY

==================================================

Create/reuse a character library.

Each character must contain:

- name

- description

- personality

- appearance

- clothing

- reference images

- persistent voice

- role

Characters must be reusable across projects.

The system must pass character references into image and animation generation to maintain visual consistency.

Example:

LEO:

Friendly young lion.

Golden fur.

Brown fluffy mane.

Blue shirt.

Red-orange overalls.

Friendly teacher and guide.

Patient, playful and encouraging.

LITTLE ONE:

Small young child.

Yellow striped shirt.

Blue shorts.

Curious and energetic.

Learns together with the audience.

==================================================

3. SCRIPT GENERATION

==================================================

When CREATE COMPLETE VIDEO is clicked:

Generate an age-appropriate original educational script.

Generate:

- title

- learning objective

- narration

- character dialogue

- scene breakdown

- ending

Each dialogue line must identify its speaker.

Example:

Leo:

"Hello, little friends!"

Little One:

"Hi, Leo!"

Do not write dialogue as generic lyrics.

==================================================

4. STORYBOARD

==================================================

Automatically create scene cards.

Each scene card must display:

- scene number

- image

- location

- action

- characters

- dialogue

- narration

- duration

- caption status

- voice status

- animation status

- generation status

Allow individual scene regeneration.

Do not require the user to manually move files between applications.

==================================================

5. IMAGE GENERATION

==================================================

Use the existing image provider abstraction.

Generate a real visual for every scene.

Always use the character library references.

Maintain:

- same Leo

- same Little One

- same clothing

- consistent visual style

Store generated assets.

Allow regeneration of a single scene.

==================================================

6. VOICE GENERATION

==================================================

Use the existing voice provider abstraction.

Each character has a persistent voice.

Generate audio separately for each dialogue line.

Store:

- audio file

- speaker

- scene

- duration

Use ElevenLabs-compatible architecture where configured.

The system must also support narration.

==================================================

7. CHARACTER ANIMATION

==================================================

Use the existing animation provider abstraction.

For scenes containing dialogue:

Input:

- character reference/image

- dialogue audio

- character information

Generate:

- natural lip movement

- facial expression

- head movement

- body movement where supported

If animation fails:

automatically use the existing still-frame fallback with camera movement and voiceover.

A single animation failure must NOT stop the entire project.

==================================================

8. MUSIC

==================================================

Generate or use an instrumental children's background track.

Requirements:

- instrumental

- no vocals

- cheerful

- gentle

- appropriate for children

- original/licensed

Automatically mix music below dialogue.

Allow music volume adjustment.

==================================================

9. CAPTIONS

==================================================

Automatically generate synchronized captions.

Captions must be based on the actual generated dialogue/audio.

Store caption timing.

Add a simple caption editor.

==================================================

10. PRODUCTION TIMELINE

==================================================

Create a simple production timeline.

Show:

1. Planning

2. Script

3. Storyboard

4. Images

5. Voices

6. Animation

7. Music

8. Captions

9. Rendering

10. Complete

Show real status:

Pending

Processing

Completed

Failed

Show percentage progress.

The UI must update while the pipeline runs.

==================================================

11. CREATE COMPLETE VIDEO

==================================================

The CREATE COMPLETE VIDEO button must:

1. create/start the project

2. call startPipeline

3. repeatedly advance the existing pipeline

4. continue until:

   complete

   OR

   error

Do not require the user to manually advance stages.

If the browser is refreshed, the pipeline state must remain stored.

If a stage fails:

- show the error

- allow retry

- continue from the failed stage

- do not restart everything

==================================================

12. FINAL VIDEO RENDERING

==================================================

THIS IS CRITICAL.

Implement actual video assembly.

Do NOT create a fake export button.

Combine:

- generated scene videos

- still-frame fallback scenes

- character dialogue

- narration

- background music

- sound effects if available

- captions

- transitions

- intro

- outro

Produce an actual MP4 file.

Use a reliable server-side rendering/compositing approach such as FFmpeg or another suitable server-side renderer available in the environment.

Do NOT depend exclusively on a browser-only compositor for the final production render.

The rendered MP4 must be stored and associated with the project.

==================================================

13. VIDEO PREVIEW

==================================================

When rendering is complete:

Show:

- video player

- duration

- resolution

- project name

- export/download action

The preview must use the actual generated MP4.

==================================================

14. INTRO / OUTRO

==================================================

Create reusable Little Wonders branding.

INTRO:

Leo and Little One together.

"Hello, little friends! Welcome to Little Wonders!"

OUTRO:

"Great job, little friends!"

"See you in our next adventure!"

Use the project's characters.

==================================================

15. EDITING

==================================================

Provide a simple editor, not a complicated professional editor.

Allow:

- preview scene

- regenerate image

- regenerate voice

- regenerate animation

- edit dialogue

- edit captions

- change duration

- reorder scenes

- adjust music volume

- replace scene

Changes to one scene should not require regenerating unrelated scenes.

==================================================

16. ASSET STORAGE

==================================================

Store generated:

- images

- audio

- animation clips

- music

- captions

- final videos

Associate every asset with its project and scene.

Respect existing RLS/security.

==================================================

17. SECURITY

==================================================

NEVER expose provider API keys in frontend code.

All provider API calls must remain server-side.

Use secure environment secrets.

Users must only access their own projects and assets.

==================================================

18. PROVIDER ABSTRACTION

==================================================

Keep the existing provider architecture.

Do not hard-code the application to one vendor.

Providers should be replaceable for:

- image

- voice

- music

- animation

- rendering

If credentials are missing:

show a clear configuration message.

Do not pretend the generation succeeded.

==================================================

19. ERROR HANDLING

==================================================

Every generation stage needs:

- timeout

- error handling

- retry

- stored error state

- user-friendly error message

Example:

"Scene 3 animation failed. Retry animation."

Do not regenerate the entire project unnecessarily.

==================================================

20. COST CONTROL

==================================================

Do not repeatedly regenerate assets automatically.

Use one generation attempt, then retry only when necessary.

Do not create unnecessary AI calls.

Reuse existing generated assets whenever possible.

==================================================

21. MVP PRIORITY

==================================================

PRIORITY ORDER:

1. COMPLETE VIDEO BUTTON

2. PIPELINE EXECUTION

3. REAL SCENE GENERATION

4. REAL VOICE GENERATION

5. REAL ANIMATION

6. REAL MUSIC

7. REAL CAPTIONS

8. REAL MP4 RENDERING

9. VIDEO PREVIEW

10. BASIC SCENE EDITING

Do NOT spend this build cycle on:

- unnecessary animations in the UI

- decorative effects

- marketing pages

- complex settings

- unnecessary dashboards

- cosmetic redesign

Functional video generation is more important than visual polish.

==================================================

22. NO PLACEHOLDERS

==================================================

Do not use mock AI responses.

Do not use fake progress.

Do not create fake MP4 files.

Do not create a download button that downloads nothing.

Do not mark stages complete without actual output.

If an external API cannot be used because credentials are unavailable, clearly identify the missing credential and keep the integration ready.

==================================================

23. FINAL ACCEPTANCE TEST

==================================================

After implementation, the application must be capable of this test:

Input:

"Teach children about red, blue, yellow and green using Leo and Little One."

The system should automatically:

- write the story

- create scenes

- generate visuals

- generate dialogue

- generate character voices

- animate talking characters where the provider is available

- generate background music

- generate captions

- assemble the scenes

- render a real MP4

- display the finished video

Do not stop after creating the UI.

Do not stop after creating the storyboard.

Do not stop after creating the backend.

FINISH THE COMPLETE FUNCTIONAL MVP USING THE EXISTING CODEBASE.

Before finishing, test the complete pipeline and fix any compile/runtime errors you encounter.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/8a229e02-c7a3-4a16-99ed-463a61ee4f1e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
