import type { CueMode, Line } from "@/types/script";

export type SessionState =
  | { kind: "idle" }
  | { kind: "speaking"; lineIndex: number }
  | { kind: "listening"; lineIndex: number }
  | { kind: "paused"; previous: SessionState }
  | { kind: "error"; message: string };

export type SessionEvent =
  | { type: "start" }
  | { type: "tts_ended" }
  | { type: "cue_detected" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "restart_line" }
  | { type: "skip_line" }
  | { type: "stt_error"; message: string };

function nextState(
  fromIndex: number,
  lines: Line[],
  userCharacterId: string
): SessionState {
  const nextIndex = fromIndex + 1;
  if (nextIndex >= lines.length) return { kind: "idle" };
  const line = lines[nextIndex];
  const isUserLine =
    line.kind === "dialogue" && line.character_id === userCharacterId;
  return isUserLine
    ? { kind: "listening", lineIndex: nextIndex }
    : { kind: "speaking", lineIndex: nextIndex };
}

export function reduce(
  state: SessionState,
  event: SessionEvent,
  lines: Line[],
  userCharacterId: string
): SessionState {
  switch (state.kind) {
    case "idle":
      if (event.type === "start") return nextState(-1, lines, userCharacterId);
      return state;

    case "speaking":
      switch (event.type) {
        case "tts_ended":
        case "skip_line":
          return nextState(state.lineIndex, lines, userCharacterId);
        case "pause":
          return { kind: "paused", previous: state };
        default:
          return state;
      }

    case "listening":
      switch (event.type) {
        case "cue_detected":
        case "skip_line":
          return nextState(state.lineIndex, lines, userCharacterId);
        case "pause":
          return { kind: "paused", previous: state };
        case "restart_line":
          // Return a new object so useEffect deps change and STT restarts
          return { kind: "listening", lineIndex: state.lineIndex };
        case "stt_error":
          return { kind: "error", message: event.message };
        default:
          return state;
      }

    case "paused":
      if (event.type === "resume") return state.previous;
      return state;

    case "error":
      if (event.type === "start") return { kind: "idle" };
      return state;
  }
}

export { CueMode };
