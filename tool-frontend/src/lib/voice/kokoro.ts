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

function playPCM(audio: Float32Array<ArrayBufferLike>, sampleRate: number, onEnd: () => void): () => void {
  const ctx = new AudioContext({ sampleRate });
  const pcm = new Float32Array(audio); // copy into plain ArrayBuffer for copyToChannel
  const buf = ctx.createBuffer(1, pcm.length, sampleRate);
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
}

export async function speakLineKokoro(
  text: string,
  voice: KokoroVoice,
  onEnd: () => void,
): Promise<() => void> {
  if (!_tts) { onEnd(); return () => {}; }
  try {
    const result: { audio: Float32Array<ArrayBufferLike>; sampling_rate: number } = await _tts.generate(text, { voice });
    return playPCM(result.audio, result.sampling_rate, onEnd);
  } catch {
    onEnd();
    return () => {};
  }
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
