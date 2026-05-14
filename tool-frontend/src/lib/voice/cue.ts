import type { CueMode } from "@/types/script";

export type CueCallback = () => void;

const PAUSE_THRESHOLD_MS = 1500;
const HYBRID_PAUSE_THRESHOLD_MS = 2000;
const MATCH_THRESHOLD = 0.7;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(transcript: string, expected: string): number {
  const tTokens = new Set(normalize(transcript).split(/\s+/).filter(Boolean));
  const eTokens = new Set(normalize(expected).split(/\s+/).filter(Boolean));
  if (tTokens.size === 0 || eTokens.size === 0) return 0;
  const intersection = [...tTokens].filter((x) => eTokens.has(x)).length;
  const union = new Set([...tTokens, ...eTokens]).size;
  return intersection / union;
}

export function createCueDetector(
  mode: CueMode,
  expectedText: string,
  onCue: CueCallback
): (transcript: string) => void {
  const pauseMs =
    mode === "hybrid" ? HYBRID_PAUSE_THRESHOLD_MS : PAUSE_THRESHOLD_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let fired = false;

  function fire() {
    if (fired) return;
    fired = true;
    if (timer) { clearTimeout(timer); timer = null; }
    onCue();
  }

  function resetPauseTimer() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fire, pauseMs);
  }

  return function onTranscript(transcript: string) {
    if (fired) return;

    if (mode === "pause") {
      resetPauseTimer();
      return;
    }

    if (mode === "match") {
      if (similarity(transcript, expectedText) >= MATCH_THRESHOLD) fire();
      return;
    }

    // hybrid: both run, first wins
    resetPauseTimer();
    if (similarity(transcript, expectedText) >= MATCH_THRESHOLD) fire();
  };
}
