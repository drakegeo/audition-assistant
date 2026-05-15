// Kokoro WASM TTS — singleton model, lazy-loaded on first use.
// ~80 MB download cached by browser; runs entirely client-side, no server cost.

export const KOKORO_VOICES = [
  "af_heart",   // American Female (warm)
  "am_adam",    // American Male
  "bf_emma",    // British Female
  "bm_george",  // British Male
  "af_bella",   // American Female (bright)
  "am_michael", // American Male (deep)
  "af_sarah",   // American Female (soft)
  "bm_lewis",   // British Male (rich)
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
  af_heart:   "American Female · warm",
  am_adam:    "American Male · natural",
  bf_emma:    "British Female · clear",
  bm_george:  "British Male · deep",
  af_bella:   "American Female · bright",
  am_michael: "American Male · rich",
  af_sarah:   "American Female · soft",
  bm_lewis:   "British Male · measured",
};

// Assigns voices to non-user character names deterministically. Narrator gets index 0.
export function assignKokoroVoices(characterNames: string[]): Map<string, KokoroVoice> {
  const map = new Map<string, KokoroVoice>();
  map.set("__narrator__", KOKORO_VOICES[0]);
  characterNames.forEach((name, i) => {
    map.set(name, KOKORO_VOICES[(i + 1) % KOKORO_VOICES.length]);
  });
  return map;
}
