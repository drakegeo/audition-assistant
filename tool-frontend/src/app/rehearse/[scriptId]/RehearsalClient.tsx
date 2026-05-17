"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getScript } from "@/lib/api";
import { detectVoiceSupport } from "@/lib/voice/support";
import RehearsalView from "@/components/RehearsalView";
import type { CueMode, Script } from "@/types/script";

export default function RehearsalClient({ scriptId }: { scriptId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const characterId = searchParams.get("character") ?? "";
  const [script, setScript] = useState<Script | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cueMode] = useState<CueMode>("hybrid");
  const [sttWarning, setSttWarning] = useState(false);
  const [audioUrls, setAudioUrls] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    const { stt } = detectVoiceSupport();
    if (!stt) setSttWarning(true);
  }, []);

  useEffect(() => {
    // Enforce one-way flow: rehearsal is only reachable from setup.
    // If there are no prepared URLs in sessionStorage, send the user back to setup.
    if (!characterId) {
      router.replace(`/rehearse/${scriptId}/setup`);
      return;
    }
    const raw = sessionStorage.getItem(`tts-urls-${scriptId}`);
    if (!raw) {
      router.replace(`/rehearse/${scriptId}/setup`);
      return;
    }
    try {
      setAudioUrls(JSON.parse(raw) as Record<string, string>);
    } catch {
      router.replace(`/rehearse/${scriptId}/setup`);
      return;
    }

    getScript(scriptId)
      .then((s) => setScript(s))
      .catch((e) => setError(String(e)));
  }, [scriptId, characterId, router]);

  if (error) return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <p className="text-red-600 text-sm">{error}</p>
    </main>
  );

  if (!script || audioUrls === null) return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
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
          ttsReady={true}
        />
      </div>
    </main>
  );
}
