import type { CueMode } from "@/types/script";

export type CueCallback = () => void;

const PAUSE_THRESHOLD_MS = 1000;
const HYBRID_PAUSE_THRESHOLD_MS = 1500;

const MIN_WORD_COVERAGE = 0.6;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, "") // strip inline stage directions
    .replace(/[^\w\s]/g, "")   // strip punctuation
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(s: string): Set<string> {
  return new Set(normalize(s).split(/\s+/).filter(Boolean));
}

/** Fraction of the expected line's words present in the transcript. */
function wordCoverage(transcript: string, expected: string): number {
  const t = tokenSet(transcript);
  const e = tokenSet(expected);
  if (e.size === 0) return 1;
  return [...e].filter((w) => t.has(w)).length / e.size;
}

/** True when the user has said ≥60% of the expected line's words. */
function lineComplete(transcript: string, expected: string): boolean {
  return wordCoverage(transcript, expected) >= MIN_WORD_COVERAGE;
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

    const complete = lineComplete(transcript, expectedText);

    if (mode === "pause") {
      // Silence timer only starts once coverage + last word conditions are met.
      if (complete) resetPauseTimer();
      return;
    }

    if (mode === "match") {
      if (complete) fire();
      return;
    }

    // hybrid: fire after silence once 60% coverage is reached.
    if (complete) resetPauseTimer();
  };
}
