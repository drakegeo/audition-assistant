"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getScript, prepareTTS } from "@/lib/api";
import { assignDefaultVoiceIds, getDefaultVoiceId } from "@/lib/voice/edge-tts";
import { detectVoiceSupport } from "@/lib/voice/support";
import RehearsalView from "@/components/RehearsalView";
import type { CueMode, Script } from "@/types/script";

export default function RehearsalClient({ scriptId }: { scriptId: string }) {
  const searchParams = useSearchParams();
  const characterId = searchParams.get("character") ?? "";
  const [script, setScript] = useState<Script | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cueMode] = useState<CueMode>("hybrid");
  const [sttWarning, setSttWarning] = useState(false);
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
  const [ttsReady, setTtsReady] = useState(false);

  useEffect(() => {
    const { stt } = detectVoiceSupport();
    if (!stt) setSttWarning(true);
  }, []);

  useEffect(() => {
    getScript(scriptId)
      .then(async (s) => {
        setScript(s);
        const scriptLang = (s as Script & { language?: string }).language ?? "en-US";
        const otherChars = s.characters.filter((c) => c.id !== characterId);
        if (otherChars.length === 0) { setTtsReady(true); return; }

        // Load saved voice prefs (charId → voiceId). Ignore old format (gender strings).
        let savedPrefs: Record<string, string> = {};
        const saved = localStorage.getItem(`voice-prefs-${scriptId}`);
        if (saved) {
          try {
            const parsed = JSON.parse(saved) as Record<string, string>;
            const isOldFormat = Object.values(parsed).every((v) => v === "female" || v === "male");
            if (!isOldFormat) savedPrefs = parsed;
          } catch { /* ignore */ }
        }
        if (Object.keys(savedPrefs).length === 0) {
          assignDefaultVoiceIds(otherChars, scriptLang).forEach((voiceId, charId) => {
            savedPrefs[charId] = voiceId;
          });
        }

        const voiceMap: Record<string, string> = {};
        for (const char of otherChars) {
          voiceMap[char.id] = savedPrefs[char.id] ?? getDefaultVoiceId(scriptLang, "female");
        }

        try {
          const result = await prepareTTS(scriptId, voiceMap);
          setAudioUrls(result.urls);
        } catch (e) {
          console.warn("TTS URL fetch failed, falling back to browser voices", e);
        } finally {
          setTtsReady(true);
        }
      })
      .catch((e) => setError(String(e)));
  }, [scriptId, characterId]);

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

  if (!characterId) return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <p className="text-sm text-gray-600">No character selected. <a href="/upload" className="text-blue-600 hover:underline">Go back</a></p>
    </main>
  );

  return (
    <main className="h-screen flex flex-col bg-white">
      <div className="px-4 py-2 border-b text-xs text-gray-500 font-medium truncate">
        {script.title}
      </div>
      {sttWarning && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-800">
          Your browser doesn&apos;t support voice recognition. You can still rehearse — use the <strong>Skip</strong> button to advance your lines manually.
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        <RehearsalView
          script={script}
          userCharacterId={characterId}
          cueMode={cueMode}
          audioUrls={audioUrls}
          ttsReady={ttsReady}
        />
      </div>
    </main>
  );
}
