# EyeSight

A **voice-first assistive mobile app for blind and visually impaired users.**
Every input is a voice command, every output is spoken audio — the screen is
never required. EyeSight **assists a white cane or guide dog; it never replaces
them** (said once during onboarding).

Built for a 24-hour hackathon: React Native (Expo dev build) + TypeScript,
Android first.

---

## Features

1. **Live Document Reader** — continuous OCR with a framing assistant
   ("move left / closer / hold steady"), cross-frame de-duplication, and
   sentence-level reading with `pause / resume / repeat / repeat paragraph /
   skip / go back / faster / slower / stop`.
2. **Obstacle Detection + Alerts** — object detection + depth at 10+ FPS.
   Spoken alerts as `"<Object>, <distance> meters, <direction>"` with urgency
   tiers (silent > 3 m, normal 1–3 m, urgent < 1 m with haptics + rising beep),
   rate-limiting, and priority for stairs / drop-offs / vehicles.
3. **Path Guidance** — "find the way out" / "take me to the door". Scan phase
   (object detection + sign OCR + vision model) then ~1 Hz turn-by-turn
   guidance from a 2D occupancy grid, with drift correction. Obstacle alerts
   stay active and outrank guidance.
4. **Photo / Short-Video Summary** — "take a picture" / "record a video"
   (10 s). Sends media to a vision-language model, speaks a 4–6 sentence scene
   description, and answers grounded follow-ups ("how many people?", "shorter").
5. **Live Mode** — "start live" narrates only what *changed*, samples a frame
   every 2–3 s, and answers interrupting questions grounded in the current
   frame.

### Global voice system
- **VoiceController** owns the single shared audio channel: a **priority speech
  queue** (danger > navigation > answers > reading > narration) with
  interruption, and mic/speaker mutual exclusion (the mic never opens while TTS
  speaks).
- **Intent router** with fuzzy matching — synonyms and Hinglish/Tanglish
  phrasing (e.g. "padi", "aage kya hai").
- **Multilingual** STT + TTS: English, Hindi, Tamil, switchable by voice.
- **Wake word** "Hey Eye" (Porcupine), with **double-tap anywhere** as the
  fallback.
- **Offline**: Reader and Obstacle detection work offline; Summary, Live and
  Navigation reasoning need internet and say *"No internet, some features are
  limited."*

---

## Project structure

```
src/
  app/            AppController (intent -> feature dispatch), camera bridge, debug screen
  voice/          VoiceController, intentRouter, intents, fuzzy matching, VLM prompts
  features/
    reader/       textStitcher, readingBuffer, framingAssistant, ReaderController
    obstacle/     alertEngine, annotate (depth+direction), ObstacleController
    navigation/   occupancyGrid, NavigationController
    summary/      SummaryController
    live/         LiveController
  services/       camera, vision (Claude/Gemini), tts, stt, depth, haptics, connectivity
  state/          modeMachine (global state machine), debugLog
  config/         env, thresholds, shared types
__tests__/        unit tests for the core logic
```

---

## Setup

### Prerequisites
- Node 18+, the Expo CLI, Android Studio + an Android device/emulator.
- This app uses native modules (vision-camera, voice, TFLite/ML Kit), so it
  requires an **Expo dev build** — it will not run in Expo Go.

### Install & run
```bash
npm install
cp .env.example .env      # then fill in your keys (see below)
npm run prebuild          # generates the native android/ project
npm run android           # build & launch the dev client on a device
```

Run the tests (pure logic — no device needed):
```bash
npm test
```

### Environment variables (`.env`)
Expo inlines `EXPO_PUBLIC_*` variables at build time.

| Variable | Purpose | Required |
|---|---|---|
| `EXPO_PUBLIC_VLM_PROVIDER` | `claude` or `gemini` | for Summary/Live/Nav |
| `EXPO_PUBLIC_VLM_API_KEY` | API key for the chosen provider | for Summary/Live/Nav |
| `EXPO_PUBLIC_VLM_MODEL` | model id override | optional |
| `EXPO_PUBLIC_PORCUPINE_ACCESS_KEY` | wake-word "Hey Eye" | optional (double-tap works without it) |

Without a VLM key the on-device features (Reader, Obstacle detection) still
work fully; the internet-dependent features announce that they are limited.

---

## Permissions
Camera and microphone are requested at first use, with **spoken** guidance if a
permission is denied.

## Developer debug screen
**Long-press** anywhere to open a developer-only log of intents and errors.
Long-press again to close. It is never spoken and never required.

## Known limitations
See [`DEMO.md`](./DEMO.md) for the judge demo script and a full list of known
limitations.

---

## Speech priority order
1. Danger alerts → 2. Navigation guidance → 3. User-requested answers →
4. Reading text → 5. Live narration. Higher priority interrupts lower.
