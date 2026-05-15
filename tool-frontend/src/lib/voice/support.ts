export interface VoiceSupport {
  tts: boolean;
  stt: boolean;
  voices: number;
}

export function detectVoiceSupport(): VoiceSupport {
  if (typeof window === "undefined") return { tts: false, stt: false, voices: 0 };
  const tts = "speechSynthesis" in window;
  const stt = "SpeechRecognition" in window || "webkitSpeechRecognition" in window;
  const voices = tts ? window.speechSynthesis.getVoices().length : 0;
  return { tts, stt, voices };
}

export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    // [voice-loop.md] getVoices() returns empty on first call — must await voiceschanged
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) { resolve(voices); return; }
    window.speechSynthesis.onvoiceschanged = () =>
      resolve(window.speechSynthesis.getVoices());
  });
}

/** Score a voice by quality. Higher = better. */
function voiceQuality(v: SpeechSynthesisVoice): number {
  const n = v.name.toLowerCase();
  if (n.includes("natural") || n.includes("neural")) return 4;
  if (n.includes("premium") || n.includes("enhanced")) return 3;
  if (!v.localService) return 2; // online/cloud voices are generally higher quality
  if (n.includes("google") || n.includes("microsoft")) return 1;
  return 0;
}

export function assignVoices(
  characters: string[],
  allVoices: SpeechSynthesisVoice[]
): Map<string, SpeechSynthesisVoice> {
  const english = allVoices.filter((v) =>
    v.lang.toLowerCase().startsWith("en")
  );
  const pool = english.length > 0 ? english : allVoices;
  // Sort best voices first so character 0 gets the highest-quality voice
  const ranked = [...pool].sort((a, b) => voiceQuality(b) - voiceQuality(a));
  return new Map(characters.map((name, i) => [name, ranked[i % ranked.length]]));
}
