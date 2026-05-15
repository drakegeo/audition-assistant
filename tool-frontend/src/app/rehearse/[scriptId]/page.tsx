"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getScript } from "@/lib/api";
import { detectVoiceSupport } from "@/lib/voice/support";
import RehearsalView from "@/components/RehearsalView";
import AuthGuard from "@/components/AuthGuard";
import type { CueMode, Script } from "@/types/script";

export default async function RehearsePage({ params }: { params: Promise<{ scriptId: string }> }) {
  const { scriptId } = await params;
  return (
    <AuthGuard>
      <RehearsalPageInner scriptId={scriptId} />
    </AuthGuard>
  );
}

function RehearsalPageInner({ scriptId }: { scriptId: string }) {
  const searchParams = useSearchParams();
  const characterId = searchParams.get("character") ?? "";
  const [script, setScript] = useState<Script | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cueMode] = useState<CueMode>("hybrid");
  const [sttWarning, setSttWarning] = useState(false);

  useEffect(() => {
    // [voice-loop.md] Firefox doesn't support STT — warn before session starts
    const { stt } = detectVoiceSupport();
    if (!stt) setSttWarning(true);
  }, []);

  useEffect(() => {
    getScript(scriptId)
      .then((s) => setScript(s))
      .catch((e) => setError(String(e)));
  }, []);

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

  if (!characterId) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <p className="text-sm text-gray-600">No character selected. <a href="/upload" className="text-blue-600 hover:underline">Go back</a></p>
      </main>
    );
  }

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
        />
      </div>
    </main>
  );
}
