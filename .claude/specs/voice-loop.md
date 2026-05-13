# Voice Loop

The state machine and rules that drive the rehearsal session. Lives entirely in the browser. No backend involvement.

## States

| State        | Meaning                                                              |
|--------------|----------------------------------------------------------------------|
| `IDLE`       | Session not started. Or finished.                                    |
| `SPEAKING`   | App is reading a non-user line via TTS.                              |
| `LISTENING`  | App is waiting for the user to deliver their line.                   |
| `PAUSED`     | User explicitly paused. Resumes to whatever state was active.        |
| `ERROR`      | Unrecoverable error (e.g., voice support lost mid-session).          |

## Events

| Event                    | Source                                                       |
|--------------------------|--------------------------------------------------------------|
| `start()`                | User clicks "Start Rehearsal"                                |
| `tts_ended`              | `SpeechSynthesisUtterance.onend` (or timeout fallback)       |
| `cue_detected`           | Cue detector fires (pause, match, or hybrid)                 |
| `pause()`                | User clicks pause / hits Space                               |
| `resume()`               | User clicks resume / hits Space                              |
| `restart_line()`         | User clicks restart current line / hits R                    |
| `skip_line()`            | User clicks skip / hits → arrow                              |
| `stt_error`              | `SpeechRecognition.onerror` (e.g., permission revoked)       |
| `end_of_script`          | Cursor advanced past last line                               |

## Transitions

```
IDLE
  start() → SPEAKING (if next line is non-user) OR LISTENING (if next line is user)

SPEAKING
  tts_ended → SPEAKING (if next line is non-user) OR LISTENING (if next line is user) OR IDLE (end_of_script)
  pause() → PAUSED
  skip_line() → SPEAKING/LISTENING (advance cursor, re-enter)
  stt_error → ERROR  // shouldn't happen here but treat defensively

LISTENING
  cue_detected → SPEAKING/LISTENING (advance cursor) OR IDLE (end_of_script)
  pause() → PAUSED
  restart_line() → LISTENING (reset STT)
  skip_line() → SPEAKING/LISTENING (advance cursor)
  stt_error → fallback to manual-advance mode (stay in LISTENING with a "tap to continue" button)

PAUSED
  resume() → previous state

ERROR
  (terminal — show user a message + restart button that returns to IDLE)
```

## Timeouts (every state has one)

| State        | Timeout       | Action on timeout                                                        |
|--------------|---------------|--------------------------------------------------------------------------|
| `SPEAKING`   | `duration_estimate(line) + 3s` | Force `tts_ended`. Logs a warning.                          |
| `LISTENING`  | 30s after STT start | Show "did you mean to skip this line?" prompt. User decides.        |
| `PAUSED`     | None          | Stays paused indefinitely.                                               |
| `ERROR`      | None          | Stays in error until user acknowledges and restarts.                     |

`duration_estimate(line)` ≈ `line.text.length / 15` seconds, capped at 60s. This is the recovery for the known `onend` bug.

## Cue detection — three modes

The user picks the mode at session start. Default: `hybrid`.

### Mode: `pause`

Detect end-of-line by silence.

```ts
class PauseCueDetector {
  private silenceMs = 0;
  private threshold = 1500; // configurable per session
  private timer: number | null = null;

  onTranscript(_: string) {
    this.silenceMs = 0;
    if (this.timer) clearInterval(this.timer);
    this.timer = window.setInterval(() => {
      this.silenceMs += 100;
      if (this.silenceMs >= this.threshold) this.fire();
    }, 100);
  }

  private fire() { /* emit cue_detected */ }
}
```

Tuning: 1.5s default. The session UI exposes a slider (1s–3s).

### Mode: `match`

Compare what the user said against the expected line text.

```ts
function similarity(transcript: string, expected: string): number {
  const t = normalize(transcript);
  const e = normalize(expected);
  // Token-set ratio: |intersection| / |union| of token sets
  const tTokens = new Set(t.split(/\s+/));
  const eTokens = new Set(e.split(/\s+/));
  const intersection = [...tTokens].filter(x => eTokens.has(x)).length;
  const union = new Set([...tTokens, ...eTokens]).size;
  return intersection / union;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, "") // strip parenthetical stage directions
    .replace(/[^\w\s]/g, "")    // strip punctuation
    .replace(/\s+/g, " ")
    .trim();
}
```

Fire cue when similarity > 0.7. Tuning: similarity threshold exposed as a slider (0.5–0.9).

### Mode: `hybrid` (default)

Both detectors run in parallel. First to fire wins. Pause timeout is also raised slightly (2.0s) since we trust match-based advance to be quick when the user is on-script.

## Voice assignment

Same algorithm specified in the voice-engineer role file, repeated here for completeness because this is the spec.

```ts
function assignVoices(
  characters: string[],
  allVoices: SpeechSynthesisVoice[]
): Map<string, SpeechSynthesisVoice> {
  const english = allVoices.filter(v => v.lang.toLowerCase().startsWith("en"));
  if (english.length === 0) {
    // No English voices — fall back to all available
    return new Map(characters.map((c, i) => [c, allVoices[i % allVoices.length]]));
  }
  return new Map(characters.map((c, i) => [c, english[i % english.length]]));
}
```

Notes:
- Sort characters by `display_order` from the backend before assigning, so character → voice is consistent.
- The user's own character does NOT get a voice assigned (we never speak it).
- Post-MVP: a per-character voice picker UI lets the user override.

## Skipping stage directions and scene headers

By default in MVP, the rehearsal loop:
- **Reads scene headers aloud** in the same voice as a "narrator" voice (pick voice 0 from the English list, distinct from any character).
- **Reads stage directions aloud** only if the user toggles "narrate stage directions" on. Default: off (they're not part of performance practice).

Both are configurable in the session settings panel.

## State machine implementation

Use a typed reducer pattern. The state lives in a `useReducer` hook in the rehearsal page; effects (calling `tts.speak`, starting `stt`) are triggered by `useEffect` watching the state.

```ts
type State =
  | { kind: "idle" }
  | { kind: "speaking"; lineIndex: number }
  | { kind: "listening"; lineIndex: number }
  | { kind: "paused"; previous: State }
  | { kind: "error"; message: string };

type Event =
  | { type: "start" }
  | { type: "tts_ended" }
  | { type: "cue_detected" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "restart_line" }
  | { type: "skip_line" }
  | { type: "stt_error"; message: string }
  | { type: "end_of_script" };

function reduce(state: State, event: Event, script: Script, userCharacterId: string): State {
  // implementation in src/lib/voice/session.ts
}
```

## Telemetry

In MVP, log only to the browser console with a `[voice]` prefix when `?debug=1` is in the URL. No backend telemetry yet. Post-MVP, send anonymized cue-detection accuracy stats.

## Known issues to track in code comments

When you hit one of these in implementation, add a code comment referencing this section.

1. **Chrome `onend` doesn't fire reliably for long utterances.** Mitigated by chunking + timeout.
2. **`getVoices()` is async.** Use the `voiceschanged` event.
3. **Safari STT requires user gesture to start.** First `start()` must be in a direct event handler from a click, not from a `useEffect`.
4. **Firefox doesn't support STT.** Detect and offer manual-advance mode.
5. **iOS Safari TTS pauses when the screen locks.** Out of scope for MVP — show a "keep screen on" hint to mobile users.
