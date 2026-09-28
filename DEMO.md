# EyeSight — 3-Minute Judge Demo (voice only)

> The presenter keeps their **eyes closed** the whole time. Everything is done
> by voice; the screen is never looked at. Have ready: a printed A4 page, a
> chair, and a room with a door plus one obstacle in the path.

**Setup:** phone unlocked, EyeSight open, internet on, VLM key configured.

---

### 0:00 — Launch (5s)
App speaks: *"EyeSight ready. Say a command, or double-tap to talk."* then the
one-time reminder: *"I assist your white cane or guide dog. I do not replace
them."*

> Say **"help"** → it lists the commands. (Shows discoverability.)

### 0:20 — Feature 1: Document Reader
- Double-tap → **"read this."**
- Hold the phone over the printed page. It guides framing: *"Move closer",
  "Hold steady", "Page detected. Reading now."*
- It reads the page aloud in sentences.
- Say **"pause."** → stops. Say **"repeat."** → re-reads the last sentence.
- Say **"continue."** → resumes from where it stopped.
- Say **"stop."**

**Acceptance shown:** reads an A4 page with no duplicated lines; pause, repeat,
resume all work by voice.

### 1:10 — Feature 2: Obstacle Detection
- Say **"start obstacle detection."** → *"Obstacle detection on."*
- Point at a chair ~1.5 m ahead → *"Chair, 1.5 meters, ahead."*
- Walk toward it → at under 1 m it escalates: *"Stop! Chair ahead"* + strong
  haptic pulse + rising beep.
- Say **"what's in front of me?"** for a one-shot answer.

**Acceptance shown:** correct distance + direction, and escalation on approach.

### 1:50 — Feature 4: Scene Summary + follow-up
- Say **"describe this"** aimed at a busy desk/street.
- It speaks a 4–6 sentence summary with left/right/near/far positions.
- Ask a grounded follow-up: **"how many people?"** or **"what does the sign
  say?"** → answered from the same photo. Try **"shorter."**

**Acceptance shown:** accurate positional summary + correct follow-up.

### 2:20 — Feature 5: Live Mode
- Say **"start live."** → narrates changes as you pan the camera (only what
  changed, every 2–3 s).
- Interrupt: **"what is that in front of me?"** → answered from the current
  frame.
- Say **"stop live."**

### 2:40 — Feature 3: Path Guidance
- Say **"find the way out"** (or **"take me to the door"**).
- It asks you to turn slowly, finds the door, then gives turn-by-turn steps —
  *"Turn slightly right", "Walk forward 3 meters", "Door ahead, 2 meters", "You
  have arrived"* — while obstacle alerts still interrupt for the placed
  obstacle.

**Acceptance shown:** finds the door and guides around an obstacle.

### 2:58 — Close
- Say **"speak Hindi"** / **"speak Tamil"** to show multilingual switching.
- End: *"EyeSight — the screen was never needed."*

---

## Known limitations
- **Native build required.** OCR (ML Kit), object detection (TFLite) and depth
  (ARCore/MiDaS) run in native frame processors, so a real demo needs an Expo
  **dev build** on a physical Android device, not Expo Go. The app runs
  voice-only where those modules are absent and says "camera not ready".
- **Depth is approximate without ARCore.** On devices without the ARCore depth
  API we fall back to MiDaS-small, then to a bounding-box-size heuristic, and
  announce *"distance is approximate."* Absolute metres can be off by ~20–40%.
- **Internet-dependent features.** Scene summary, live mode and path reasoning
  call a vision-language model; they degrade with a spoken notice when offline
  or without an API key. Reader and obstacle detection are fully on-device.
- **Path guidance is visual, not GPS.** It guides to a visible or discoverable
  target within a room/building, not map-based navigation. The occupancy grid
  is room-scale and resets per session; no persistent mapping/SLAM.
- **Live-mode cost/latency.** Frame sampling is capped and near-identical
  frames are skipped, but narration still has a 2–3 s cadence and API latency.
- **Wake word.** "Hey Eye" needs a Porcupine key; without it, double-tap is the
  reliable trigger.
- **STT language coverage** depends on the device's on-board recognizer for
  Hindi/Tamil.
- **Video summary** samples 6–8 frames; fast motion between samples may be
  missed.

## What is fully implemented and unit-tested
- Priority speech queue + interruption (VoiceController)
- Fuzzy intent router (synonyms + Hinglish/Tanglish)
- Obstacle alert engine: urgency tiers, dedupe, rate-limit, danger priority
- Reader text stitching (cross-frame de-duplication + reading order) and the
  pause/repeat/skip/back reading buffer
- Occupancy-grid next-step routing and framing assistant logic

Run `npm test` to see the acceptance-criteria tests pass (27 tests).
