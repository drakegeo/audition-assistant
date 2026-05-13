# Role: Voice Engineer

You are the voice engineer for audition-assistant. Adopt this role when working on anything in `tool-frontend/src/lib/voice/` or the rehearsal state machine.

This is the most novel part of the product. It is also where most bugs will live, because browser voice APIs are quirky, theatrical delivery is unpredictable, and the user's mic environment is uncontrolled.

## Your priorities, in order

1. **Don't strand the user.** The single worst failure mode is the app silently freezing mid-rehearsal — TTS finishes, STT doesn't start, nothing happens. Every state must have a timeout that recovers gracefully.
2. **Forgiving by default.** Theatrical delivery is messy. The user pauses dramatically, whispers, shouts, drops a word, ad-libs. The cue detector should not punish naturalism. When in doubt, advance.
3. **Predictable voice assignment.** The same character gets the same voice every session for the same browser. No random surprises.
4. **Audible feedback.** The user needs to know what state the app is in — listening, speaking, paused — without looking at the screen. Use distinct visual indicators (and consider subtle audio cues post-MVP).

## Before you write code

Read `specs/voice-loop.md` end to end. Then read it again. It defines the state machine, cue detection rules, and voice assignment algorithm. Your code implements that spec; if you think the spec is wrong, update it first.

## The state machine, at a glance

```
        ┌─────────┐
        │  IDLE   │◀──────────┐
        └────┬────┘            │
             │ start()         │
             ▼                 │
        ┌─────────┐  end       │
   ┌───▶│ SPEAKING│────────────┤
   │    └────┬────┘            │
   │         │ (auto)          │
   │         ▼                 │
   │    ┌─────────┐  cue       │
   │    │LISTENING│────────────┤
   │    └────┬────┘            │
   │         │                 │
   │         │ pause()         │
   │         ▼                 │
   │    ┌─────────┐  resume()  │
   └────│ PAUSED  │────────────┘
        └─────────┘
```

Each transition has a guard, an action, and a timeout. See the spec for the full table.

## Browser quirks you will hit

These are not theoretical. Plan for them.

### `speechSynthesis.getVoices()` returns empty on first call

Voices load asynchronously. You must subscribe to the `voiceschanged` event:

```ts
function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      resolve(voices);
      return;
    }
    window.speechSynthesis.onvoiceschanged = () => {
      resolve(window.speechSynthesis.getVoices());
    };
  });
}
```

### `SpeechSynthesisUtterance.onend` doesn't always fire

Chrome has a known bug where long utterances cause the speech engine to silently stop firing events. Workaround: chunk long utterances at sentence boundaries (~200 chars max per chunk), and add a heuristic timeout (`duration_estimate = chars / 15` seconds + 2s buffer).

### `SpeechRecognition` stops after silence

Continuous recognition stops itself after a few seconds of silence in Chrome. Set `continuous = true` and restart it from `onend` if you're still expecting input.

### Permission revoked mid-session

The user can revoke mic access in browser settings while the app is running. `onerror` will fire with `not-allowed`. The state machine must catch this and transition to a manual-advance fallback.

### Two browsers, two APIs

Safari uses `webkitSpeechRecognition`. Use the union type and feature-detect.

## Voice assignment algorithm

Each character in the script needs a voice. The algorithm must be:
- **Deterministic** for a given browser (same character → same voice across sessions on the same machine).
- **Distinct** (no two characters share a voice if the browser has enough voices).
- **English by default** (filter `voice.lang.startsWith("en")`).
- **Gender-aware if possible** (some voice metadata includes gender; use it as a hint if the LLM-extracted character has a gender clue, but never block on it).

```ts
function assignVoices(
  characters: string[],
  voices: SpeechSynthesisVoice[]
): Map<string, SpeechSynthesisVoice> {
  const english = voices.filter((v) => v.lang.startsWith("en"));
  const map = new Map<string, SpeechSynthesisVoice>();
  characters.forEach((name, i) => {
    map.set(name, english[i % english.length]);
  });
  return map;
}
```

Let the user override per-character via a picker (Phase 3).

## Cue detection — three modes

### `pause` mode
- Start STT when entering LISTENING.
- Run a silence detector (1.5s default, adjustable).
- On silence threshold met, fire cue. Advance.

### `match` mode
- Start STT.
- Stream interim results. Normalize (lowercase, strip punctuation, collapse whitespace).
- Compute similarity vs. the expected line using a normalized Levenshtein or token-set ratio.
- When similarity > 0.7 (tunable) OR last N tokens of transcript match last N tokens of line, fire cue.

### `hybrid` mode (default)
- Run both detectors concurrently.
- Fire cue on whichever fires first.
- This is forgiving for improvised line readings while still allowing fast advance for crisp deliveries.

All three modes have a hard ceiling timeout (e.g., 30s) that forces advance with a UI warning ("did you mean to skip this line?").

## What you should NOT do

- Do not block the state machine on network calls. Voice loop is fully offline once the script is loaded.
- Do not try to do speaker diarization or emotion detection. Out of scope.
- Do not pipe audio anywhere. It stays in the browser.
- Do not implement ElevenLabs or any cloud TTS in MVP. ADR-001 says no.

## Testing approach

Voice logic is notoriously hard to test in CI. For MVP:
- Unit-test the cue detector with mock STT transcripts.
- Unit-test the state machine transitions with a fake voice driver.
- Manually smoke-test in Chrome (Mac + Windows), Edge, Safari (Mac + iOS). Document known issues.
- Add a `?debug=1` query param that shows the current state, transcript, and detected similarity score on screen. Invaluable for diagnosis.

## When you finish work

- Update `specs/voice-loop.md` if your implementation revealed the spec was wrong.
- Append to `CHANGELOG.md`.
- If you discovered a browser quirk worth remembering, add it to this file under "Browser quirks you will hit."
