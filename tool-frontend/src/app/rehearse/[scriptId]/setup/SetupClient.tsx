"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getScript, prepareTTS } from "@/lib/api";
import {
  getVoicesForLang,
  getVoiceById,
  getDefaultVoiceId,
  assignDefaultVoiceIds,
} from "@/lib/voice/edge-tts";
import type { Script } from "@/types/script";

const DEFAULT_LANG = "en-US";

function playVoiceSample(voiceId: string, onEnd: () => void): () => void {
  const audio = new Audio(`/audio_samples/${voiceId}.mp3`);
  audio.onended = onEnd;
  audio.onerror = onEnd;
  void audio.play().catch(onEnd);
  return () => { audio.pause(); audio.src = ""; };
}

export default function SetupClient({ scriptId }: { scriptId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [script, setScript] = useState<Script | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<string>(DEFAULT_LANG);
  const [characterId, setCharacterId] = useState<string>(searchParams.get("character") ?? "");
  // charId → voiceId  (the new unified format replacing the old gender-only format)
  const [voiceMap, setVoiceMap] = useState<Map<string, string>>(new Map());
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [prepared, setPrepared] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [prepStats, setPrepStats] = useState<{ generated: number; cached: number; failed: number } | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    getScript(scriptId)
      .then((s) => {
        setScript(s);
        const scriptLang = (s as Script & { language?: string }).language ?? DEFAULT_LANG;
        setLang(scriptLang);
        setCharacterId((prev) => prev || s.characters[0]?.id || "");

        // Try to restore saved voice prefs
        const saved = localStorage.getItem(`voice-prefs-${scriptId}`);
        if (saved) {
          try {
            const parsed = JSON.parse(saved) as Record<string, string>;
            // Detect old format where values were "female" / "male"
            const isOldFormat = Object.values(parsed).every(
              (v) => v === "female" || v === "male"
            );
            if (!isOldFormat) {
              // New format: values are voice IDs — use as-is
              setVoiceMap(new Map(Object.entries(parsed)));
              return;
            }
            // Old format: discard and fall through to defaults
            localStorage.removeItem(`voice-prefs-${scriptId}`);
          } catch { /* fall through */ }
        }
        // Assign defaults: cycle through all available voices so chars sound distinct
        setVoiceMap(assignDefaultVoiceIds(s.characters, scriptLang));
      })
      .catch((e) => setError(String(e)));
  }, [scriptId]);

  useEffect(() => () => { cancelRef.current?.(); }, []);

  function handleVoiceSelect(charId: string, voiceId: string) {
    setVoiceMap((prev) => new Map(prev).set(charId, voiceId));
    setPrepared(false);
    setPrepStats(null);
  }

  function handleCharacterSelect(id: string) {
    setCharacterId(id);
    setPrepared(false);
    setPrepStats(null);
  }

  function handlePreview(charId: string) {
    cancelRef.current?.();
    const voiceId = voiceMap.get(charId);
    if (!voiceId) return;
    setPreviewing(charId);
    cancelRef.current = playVoiceSample(voiceId, () => {
      setPreviewing(null);
      cancelRef.current = null;
    });
  }

  async function handlePrepare() {
    if (!script || !characterId) return;

    const otherChars = script.characters.filter((c) => c.id !== characterId);
    const ttsVoiceMap: Record<string, string> = {};
    otherChars.forEach((c) => {
      const voiceId = voiceMap.get(c.id) ?? getDefaultVoiceId(lang, "female");
      ttsVoiceMap[c.id] = voiceId;
    });

    // Save all voice prefs (new format: charId → voiceId)
    const prefs: Record<string, string> = {};
    voiceMap.forEach((voiceId, charId) => { prefs[charId] = voiceId; });
    localStorage.setItem(`voice-prefs-${scriptId}`, JSON.stringify(prefs));

    if (otherChars.length === 0) { setPrepared(true); return; }

    setPreparing(true);
    try {
      let result = await prepareTTS(scriptId, ttsVoiceMap);
      if (result.failed > 0) {
        const retry = await prepareTTS(scriptId, ttsVoiceMap);
        result = {
          urls: { ...result.urls, ...retry.urls },
          generated: result.generated + retry.generated,
          cached: result.cached + retry.cached,
          failed: retry.failed,
        };
      }
      setPrepStats({ generated: result.generated, cached: result.cached, failed: result.failed });
      setPrepared(true);
    } catch (e) {
      console.warn("TTS prepare failed", e);
      setPrepared(true);
    } finally {
      setPreparing(false);
    }
  }

  if (error) return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <p className="text-red-600 text-sm">{error}</p>
    </main>
  );

  if (!script) return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
    </main>
  );

  const otherChars = script.characters.filter((c) => c.id !== characterId);
  const { females, males } = getVoicesForLang(lang);

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4">
      <div className="w-full max-w-lg space-y-6">
        <div>
          <p className="text-xs text-gray-400 font-medium truncate mb-1">{script.title}</p>
          <h1 className="text-2xl font-bold text-gray-900">Set up rehearsal</h1>
          <p className="text-sm text-gray-500 mt-1">
            Pick a voice for each character, then choose who you&apos;re playing.
          </p>
        </div>

        {/* Step 1: Assign voices */}
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Voices</p>
            <p className="text-xs text-gray-400 mt-0.5">Select a voice per character · ▶ to preview</p>
          </div>
          <ul className="divide-y">
            {script.characters.map((char) => {
              const selectedId = voiceMap.get(char.id);
              const selectedVoice = selectedId ? getVoiceById(selectedId) : undefined;
              return (
                <li key={char.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-800">{char.name}</span>
                    <div className="flex items-center gap-2">
                      {selectedVoice && (
                        <span className="text-xs text-gray-400">
                          {selectedVoice.gender === "female" ? "♀" : "♂"} {selectedVoice.name}
                        </span>
                      )}
                      <button
                        onClick={() => handlePreview(char.id)}
                        disabled={previewing !== null || !selectedId}
                        className="text-blue-500 hover:text-blue-700 disabled:text-gray-300 text-sm w-6 text-center"
                        aria-label={`Preview ${char.name}`}
                      >
                        {previewing === char.id ? "…" : "▶"}
                      </button>
                    </div>
                  </div>

                  {/* Voice chips */}
                  <div className="flex flex-wrap gap-1">
                    {females.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => handleVoiceSelect(char.id, v.id)}
                        className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                          selectedId === v.id
                            ? "bg-pink-500 border-pink-500 text-white"
                            : "border-gray-200 text-gray-500 hover:border-pink-300 hover:text-pink-600"
                        }`}
                      >
                        {v.name}
                      </button>
                    ))}
                    {females.length > 0 && males.length > 0 && (
                      <span className="text-gray-200 self-center text-xs px-0.5">|</span>
                    )}
                    {males.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => handleVoiceSelect(char.id, v.id)}
                        className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                          selectedId === v.id
                            ? "bg-blue-500 border-blue-500 text-white"
                            : "border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600"
                        }`}
                      >
                        {v.name}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Step 2: Choose your character */}
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">I&apos;m playing</p>
            <p className="text-xs text-gray-400 mt-0.5">Select the character you will speak aloud.</p>
          </div>
          <ul className="divide-y">
            {script.characters.map((char) => {
              const isMe = char.id === characterId;
              return (
                <li key={char.id}>
                  <button
                    onClick={() => handleCharacterSelect(char.id)}
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${
                      isMe ? "bg-blue-50" : "hover:bg-gray-50"
                    }`}
                  >
                    <span className={`shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      isMe ? "border-blue-600 bg-blue-600" : "border-gray-300"
                    }`}>
                      {isMe && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </span>
                    <span className={`text-sm font-medium ${isMe ? "text-blue-700" : "text-gray-800"}`}>
                      {char.name}
                    </span>
                    <span className="ml-auto text-xs text-gray-400">{char.line_count} lines</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Prepare / Start */}
        {!prepared ? (
          <button
            onClick={() => void handlePrepare()}
            disabled={preparing || !characterId}
            className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {preparing ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                Preparing voices…
              </>
            ) : "Prepare Voices"}
          </button>
        ) : (
          <div className="space-y-3">
            {prepStats && (
              <p className="text-center text-xs text-green-600 font-medium">
                ✓ {prepStats.generated + prepStats.cached} line{prepStats.generated + prepStats.cached !== 1 ? "s" : ""} ready
                {prepStats.failed > 0 && ` · ${prepStats.failed} failed (browser fallback)`}
              </p>
            )}
            <button
              onClick={() => router.push(`/rehearse/${scriptId}?character=${characterId}`)}
              className="w-full bg-green-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-green-700 transition"
            >
              Start Rehearsal
            </button>
            <button
              onClick={() => { setPrepared(false); setPrepStats(null); }}
              className="w-full text-sm text-gray-400 hover:text-gray-600 text-center"
            >
              Change voices or character
            </button>
          </div>
        )}

        <button onClick={() => router.back()} className="w-full text-sm text-gray-400 hover:text-gray-600 text-center">
          Back
        </button>
      </div>
    </main>
  );
}
