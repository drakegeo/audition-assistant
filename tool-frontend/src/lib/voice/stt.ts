export type TranscriptCallback = (transcript: string, isFinal: boolean) => void;
export type ErrorCallback = (error: string) => void;

export interface STTHandle {
  start: () => void;
  stop: () => void;
}

export function createSTT(
  onTranscript: TranscriptCallback,
  onError: ErrorCallback
): STTHandle | null {
  if (typeof window === "undefined") return null;

  // [voice-loop.md] Safari uses webkitSpeechRecognition
  const SpeechRec = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (!SpeechRec) return null;

  const rec = new SpeechRec();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = "en-US";

  let active = false;

  rec.onresult = (event: SpeechRecognitionEvent) => {
    // Build the full session transcript by concatenating ALL results so far.
    // event.results[last] alone is only the latest segment — previous segments
    // are in results[0..n-2] and must be included for coverage checks to work.
    let fullText = "";
    for (let i = 0; i < event.results.length; i++) {
      fullText += (i > 0 ? " " : "") + event.results[i][0].transcript;
    }
    const lastResult = event.results[event.results.length - 1];
    onTranscript(fullText.trim(), lastResult.isFinal);
  };

  rec.onerror = (event: SpeechRecognitionErrorEvent) => {
    onError(event.error);
  };

  // [voice-loop.md] Chrome stops recognition after silence — restart from onend
  rec.onend = () => {
    if (active) {
      try { rec.start(); } catch { /* already starting */ }
    }
  };

  return {
    start: () => {
      active = true;
      try { rec.start(); } catch { /* already running */ }
    },
    stop: () => {
      active = false;
      try { rec.stop(); } catch { /* already stopped */ }
    },
  };
}
