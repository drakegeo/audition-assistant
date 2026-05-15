"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getScript } from "@/lib/api";
import { assignKokoroVoices, KOKORO_VOICES, VOICE_LABELS, type KokoroVoice } from "@/lib/voice/kokoro";
import type { Script } from "@/types/script";

// Maps each Kokoro voice to Web Speech params so the preview approximates the accent/tone.
const VOICE_PREVIEW_PARAMS: Record<KokoroVoice, { lang: string; rate: number; pitch: number }> = {
  af_heart:  { lang: "en-US", rate: 1.05, pitch: 1.70 },
  am_adam:   { lang: "en-US", rate: 0.95, pitch: 0.50 },
  bf_emma:   { lang: "en-GB", rate: 0.90, pitch: 1.55 },
  bm_george: { lang: "en-GB", rate: 0.85, pitch: 0.40 },
};

function previewVoice(charName: string, voice: KokoroVoice, onEnd: () => void): () => void {
  if (typeof window === "undefined" || !window.speechSynthesis) { onEnd(); return () => {}; }
  window.speechSynthesis.cancel();
  const { lang, rate, pitch } = VOICE_PREVIEW_PARAMS[voice];
  const utter = new SpeechSynthesisUtterance(`Hi, I'm ${charName}.`);
  utter.lang = lang;
  utter.rate = rate;
  utter.pitch = pitch;
  // prefer a voice matching the target locale
  const match = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith(lang));
  if (match) utter.voice = match;
  utter.onend = onEnd;
  utter.onerror = () => onEnd();
  window.speechSynthesis.speak(utter);
  return () => window.speechSynthesis.cancel();
}

export default function SetupClient({ scriptId }: { scriptId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const characterId = searchParams.get("character") ?? "";

  const [script, setScript] = useState<Script | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voiceMap, setVoiceMap] = useState<Map<string, KokoroVoice>>(new Map());
  const [previewing, setPreviewing] = useState<string | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    getScript(scriptId)
      .then((s) => {
        setScript(s);
        const otherNames = s.characters
          .filter((c) => c.id !== characterId)
          .map((c) => c.name);
        setVoiceMap(assignKokoroVoices(otherNames));
      })
      .catch((e) => setError(String(e)));
  }, [scriptId, characterId]);

  useEffect(() => () => { cancelRef.current?.(); }, []);

  function handleVoiceChange(charName: string, voice: KokoroVoice) {
    setVoiceMap((prev) => new Map(prev).set(charName, voice));
  }

  function handlePreview(charName: string) {
    cancelRef.current?.();
    setPreviewing(charName);
    const voice = voiceMap.get(charName) ?? KOKORO_VOICES[0];
    cancelRef.current = previewVoice(charName, voice, () => {
      setPreviewing(null);
      cancelRef.current = null;
    });
  }

  function handleStart() {
    if (!script) return;
    const prefs: Record<string, KokoroVoice> = {};
    voiceMap.forEach((voice, name) => { prefs[name] = voice; });
    localStorage.setItem(`voice-prefs-${scriptId}`, JSON.stringify(prefs));
    router.push(`/rehearse/${scriptId}?character=${characterId}`);
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <p className="text-red-600 text-sm">{error}</p>
      </main>
    );
  }

  if (!script) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </main>
    );
  }

  const userCharName = script.characters.find((c) => c.id === characterId)?.name ?? "";
  const otherChars = script.characters.filter((c) => c.id !== characterId);

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4">
      <div className="w-full max-w-md space-y-6">
        <div>
          <p className="text-xs text-gray-400 font-medium truncate mb-1">{script.title}</p>
          <h1 className="text-2xl font-bold text-gray-900">Choose voices</h1>
          <p className="text-sm text-gray-500 mt-1">
            Hear how each character will sound before you start.
          </p>
        </div>

        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">You</p>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-blue-600">{userCharName}</span>
            <span className="text-xs text-gray-400 ml-auto">your voice</span>
          </div>
        </div>

        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Other characters</p>
          </div>
          <ul className="divide-y">
            {otherChars.map((char) => {
              const current = voiceMap.get(char.name) ?? KOKORO_VOICES[0];
              return (
                <li key={char.id} className="px-4 py-3 flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-800 w-24 shrink-0 truncate">
                    {char.name}
                  </span>
                  <select
                    value={current}
                    onChange={(e) => handleVoiceChange(char.name, e.target.value as KokoroVoice)}
                    className="flex-1 text-xs border rounded-lg px-2 py-1.5 bg-white text-gray-700"
                  >
                    {KOKORO_VOICES.map((v) => (
                      <option key={v} value={v}>{VOICE_LABELS[v]}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => handlePreview(char.name)}
                    disabled={previewing !== null}
                    className="text-blue-500 hover:text-blue-700 disabled:text-gray-300 text-sm px-1 w-6 text-center"
                    aria-label={`Preview ${char.name}`}
                  >
                    {previewing === char.name ? "…" : "▶"}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <button
          onClick={handleStart}
          className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-blue-700 transition"
        >
          Start Rehearsal
        </button>

        <button
          onClick={() => router.back()}
          className="w-full text-sm text-gray-400 hover:text-gray-600 text-center"
        >
          Back
        </button>
      </div>
    </main>
  );
}
