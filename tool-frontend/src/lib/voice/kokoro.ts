// Kokoro WASM TTS — singleton model, lazy-loaded on first use.
// ~80 MB download cached by browser; runs entirely client-side, no server cost.

export const KOKORO_VOICES = [
  "af_heart",  // American Female
  "am_adam",   // American Male
  "bf_emma",   // British Female
  "bm_george", // British Male
] as const;

export type KokoroVoice = (typeof KOKORO_VOICES)[number];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _tts: any = null;
let _initPromise: Promise<void> | null = null;

export async function loadKokoro(): Promise<void> {
  if (_tts) return;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const { KokoroTTS } = await import("kokoro-js");
    _tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0", { dtype: "q8" });
  })();
  return _initPromise;
}

export function isKokoroReady(): boolean {
  return _tts !== null;
}

export async function speakLineKokoro(
  text: string,
  voice: KokoroVoice,
  onEnd: () => void,
  throwOnError = false,
): Promise<() => void> {
  if (!_tts) {
    if (throwOnError) throw new Error("Kokoro not loaded");
    onEnd();
    return () => {};
  }
  // Create and resume AudioContext synchronously here, before the async generation.
  // This keeps it inside the user-gesture call stack so Chrome doesn't suspend it.
  const ctx = new AudioContext();
  void ctx.resume();
  try {
    const result: { audio: Float32Array<ArrayBufferLike>; sampling_rate: number } = await _tts.generate(text, { voice });
    const pcm = new Float32Array(result.audio);
    const buf = ctx.createBuffer(1, pcm.length, result.sampling_rate);
    buf.copyToChannel(pcm, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.onended = () => { void ctx.close(); onEnd(); };
    src.start();
    return () => {
      try { src.stop(); } catch { /* already stopped */ }
      void ctx.close();
    };
  } catch (e) {
    void ctx.close();
    if (throwOnError) throw e;
    onEnd();
    return () => {};
  }
}

export const VOICE_LABELS: Record<KokoroVoice, string> = {
  af_heart:  "American Female",
  am_adam:   "American Male",
  bf_emma:   "British Female",
  bm_george: "British Male",
};

export const VOICE_WEB_PARAMS: Record<KokoroVoice, { lang: string; rate: number; pitch: number; female: boolean }> = {
  af_heart:  { lang: "en-US", rate: 0.80, pitch: 1.20, female: true  },
  am_adam:   { lang: "en-US", rate: 0.78, pitch: 0.88, female: false },
  bf_emma:   { lang: "en-GB", rate: 0.78, pitch: 1.15, female: true  },
  bm_george: { lang: "en-GB", rate: 0.75, pitch: 0.78, female: false },
};

const FEMALE_HINTS = ["female", "woman", "zira", "samantha", "victoria", "kate", "hazel", "tessa", "moira", "fiona", "karen", "natasha", "eva", "susan", "emma"];
const MALE_HINTS   = ["male",   "man",   "david", "mark", "daniel", "james", "fred", "tom", "alex", "reed", "george", "richard"];

export function pickWebSpeechVoice(voice: KokoroVoice, voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const { lang, female } = VOICE_WEB_PARAMS[voice];
  const langCode = lang.split("-")[0];
  const pool = voices.filter((v) => v.lang.toLowerCase().startsWith(lang.toLowerCase()))
    .concat(voices.filter((v) => v.lang.toLowerCase().startsWith(langCode) && !v.lang.toLowerCase().startsWith(lang.toLowerCase())));
  const fallback = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const candidates = pool.length > 0 ? pool : fallback;
  if (candidates.length === 0) return undefined;
  const hints = female ? FEMALE_HINTS : MALE_HINTS;
  const anti  = female ? MALE_HINTS   : FEMALE_HINTS;
  return (
    candidates.find((v) => hints.some((h) => v.name.toLowerCase().includes(h))) ??
    candidates.find((v) => !anti.some((h) => v.name.toLowerCase().includes(h))) ??
    candidates[0]
  );
}

// Assigns voices to non-user character names deterministically. Narrator gets index 0.
export function assignKokoroVoices(characterNames: string[]): Map<string, KokoroVoice> {
  const map = new Map<string, KokoroVoice>();
  map.set("__narrator__", KOKORO_VOICES[0]);
  characterNames.forEach((name, i) => {
    map.set(name, KOKORO_VOICES[(i + 1) % KOKORO_VOICES.length]);
  });
  return map;
}
