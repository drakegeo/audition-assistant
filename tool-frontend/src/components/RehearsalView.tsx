"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { CueMode, Line, Script } from "@/types/script";
import { speakLine, durationEstimateMs } from "@/lib/voice/tts";
import { createSTT } from "@/lib/voice/stt";
import { createCueDetector } from "@/lib/voice/cue";
import { assignVoices, loadVoices } from "@/lib/voice/support";
import { reduce } from "@/lib/voice/session";
import type { SessionState, SessionEvent } from "@/lib/voice/session";

const LISTENING_TIMEOUT_MS = 30_000;

interface Props {
  script: Script;
  userCharacterId: string;
  cueMode: CueMode;
}

export default function RehearsalView({ script, userCharacterId, cueMode }: Props) {
  const lines = script.lines;

  const [state, rawDispatch] = useReducer(
    (s: SessionState, e: SessionEvent) => reduce(s, e, lines, userCharacterId),
    { kind: "idle" }
  );

  const dispatch = useCallback(
    (e: SessionEvent) => rawDispatch(e),
    [rawDispatch]
  );

  const [voiceMap, setVoiceMap] = useState<Map<string, SpeechSynthesisVoice>>(new Map());
  const [showSkipPrompt, setShowSkipPrompt] = useState(false);
  const sttRef = useRef<ReturnType<typeof createSTT>>(null);
  const lineRefs = useRef<(HTMLLIElement | null)[]>([]);

  // Character id → name lookup
  const charMap = new Map(script.characters.map((c) => [c.id, c.name]));
  const userCharName = charMap.get(userCharacterId) ?? "";

  // Load voices once on mount
  useEffect(() => {
    loadVoices().then((voices) => {
      const otherChars = script.characters
        .filter((c) => c.id !== userCharacterId)
        .map((c) => c.name);
      // Voice 0 = narrator (for scene headers / stage directions)
      const narrator = voices.find((v) => v.lang.toLowerCase().startsWith("en")) ?? voices[0];
      const assigned = assignVoices(otherChars, voices);
      assigned.set("__narrator__", narrator);
      setVoiceMap(assigned);
    });
  }, [script, userCharacterId]);

  // Scroll current line into view
  useEffect(() => {
    const idx =
      state.kind === "speaking" || state.kind === "listening"
        ? state.lineIndex
        : -1;
    if (idx >= 0) lineRefs.current[idx]?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [state]);

  // Effect: SPEAKING — call TTS, set timeout fallback
  useEffect(() => {
    if (state.kind !== "speaking") return;
    const line = lines[state.lineIndex];
    const charName = line.character_id ? (charMap.get(line.character_id) ?? "__narrator__") : "__narrator__";
    const voice = voiceMap.get(charName) ?? voiceMap.get("__narrator__");
    if (!voice) return; // voices not loaded yet

    const timeoutId = setTimeout(
      () => dispatch({ type: "tts_ended" }),
      durationEstimateMs(line.text)
    );

    const cancel = speakLine(line.text, voice, () => {
      clearTimeout(timeoutId);
      dispatch({ type: "tts_ended" });
    });

    return () => { clearTimeout(timeoutId); cancel(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, voiceMap]);

  // Effect: LISTENING — start STT + cue detection + 30s timeout
  useEffect(() => {
    if (state.kind !== "listening") return;
    const line = lines[state.lineIndex];

    const onCue = () => dispatch({ type: "cue_detected" });
    const detectCue = createCueDetector(cueMode, line.text, onCue);

    const stt = createSTT(
      (transcript) => detectCue(transcript),
      (error) => {
        if (error === "not-allowed") dispatch({ type: "stt_error", message: "Microphone permission denied." });
        // Other errors: let the auto-restart in createSTT handle it
      }
    );
    sttRef.current = stt;
    stt?.start();

    const timeoutId = setTimeout(() => setShowSkipPrompt(true), LISTENING_TIMEOUT_MS);

    return () => {
      clearTimeout(timeoutId);
      setShowSkipPrompt(false);
      stt?.stop();
      sttRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, cueMode]);

  // Keyboard shortcuts: Space = pause/resume, R = restart line, → = skip
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") { e.preventDefault(); dispatch({ type: state.kind === "paused" ? "resume" : "pause" }); }
      if (e.code === "KeyR") dispatch({ type: "restart_line" });
      if (e.code === "ArrowRight") dispatch({ type: "skip_line" });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch, state.kind]);

  const currentIndex =
    state.kind === "speaking" || state.kind === "listening" ? state.lineIndex : -1;
  const isIdle = state.kind === "idle";
  const isPaused = state.kind === "paused";
  const isError = state.kind === "error";
  const isActive = state.kind === "speaking" || state.kind === "listening";

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="flex items-center gap-3 p-4 border-b bg-white sticky top-0 z-10">
        {isIdle && currentIndex === -1 && (
          <button
            onClick={() => dispatch({ type: "start" })}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            Start Rehearsal
          </button>
        )}
        {(isActive || isPaused) && (
          <button
            onClick={() => dispatch({ type: isPaused ? "resume" : "pause" })}
            className="bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-900"
            aria-label={isPaused ? "Resume (Space)" : "Pause (Space)"}
          >
            {isPaused ? "Resume" : "Pause"}
          </button>
        )}
        {isActive && (
          <>
            <button
              onClick={() => dispatch({ type: "restart_line" })}
              className="px-3 py-2 rounded-lg text-sm border hover:bg-gray-50"
              aria-label="Restart line (R)"
            >
              Restart line
            </button>
            <button
              onClick={() => dispatch({ type: "skip_line" })}
              className="px-3 py-2 rounded-lg text-sm border hover:bg-gray-50"
              aria-label="Skip line (→)"
            >
              Skip
            </button>
          </>
        )}
        {isIdle && currentIndex >= 0 && (
          <p className="text-sm text-green-600 font-medium">Scene complete!</p>
        )}
        <div className="ml-auto text-xs text-gray-500">
          Playing as <span className="font-semibold">{userCharName}</span>
          {state.kind === "listening" && (
            <span className="ml-2 text-blue-600">● Listening</span>
          )}
          {state.kind === "speaking" && (
            <span className="ml-2 text-gray-400">Speaking…</span>
          )}
        </div>
      </div>

      {/* Script */}
      <ol className="flex-1 overflow-y-auto p-4 space-y-1 pb-32">
        {lines.map((line, idx) => (
          <LineItem
            key={line.id}
            line={line}
            charName={line.character_id ? charMap.get(line.character_id) : undefined}
            isUserLine={line.character_id === userCharacterId && line.kind === "dialogue"}
            isCurrent={idx === currentIndex}
            isPast={idx < currentIndex}
            ref={(el) => { lineRefs.current[idx] = el; }}
          />
        ))}
      </ol>

      {/* Skip prompt after 30s */}
      {showSkipPrompt && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-white border shadow-lg rounded-xl p-4 flex gap-3 items-center">
          <p className="text-sm">Still on this line?</p>
          <button
            onClick={() => { setShowSkipPrompt(false); dispatch({ type: "skip_line" }); }}
            className="text-sm text-blue-600 hover:underline"
          >
            Skip it
          </button>
          <button
            onClick={() => setShowSkipPrompt(false)}
            className="text-sm text-gray-500 hover:underline"
          >
            Keep going
          </button>
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full text-center space-y-4">
            <p className="text-red-600 font-medium">{(state as { message: string }).message}</p>
            <button
              onClick={() => dispatch({ type: "start" })}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm"
            >
              Restart
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

import React from "react";

const LineItem = React.forwardRef<
  HTMLLIElement,
  {
    line: Line;
    charName: string | undefined;
    isUserLine: boolean;
    isCurrent: boolean;
    isPast: boolean;
  }
>(function LineItem({ line, charName, isUserLine, isCurrent, isPast }, ref) {
  const base = "px-3 py-2 rounded-lg transition-colors text-sm";
  const highlight = isCurrent
    ? isUserLine
      ? "bg-blue-100 border-l-4 border-blue-500"
      : "bg-yellow-50 border-l-4 border-yellow-400"
    : isPast
    ? "text-gray-400"
    : "";

  if (line.kind === "scene_header") {
    return (
      <li ref={ref} className={`${base} font-semibold uppercase tracking-wide text-xs text-gray-500 ${highlight}`}>
        {line.text}
      </li>
    );
  }
  if (line.kind === "stage_direction") {
    return (
      <li ref={ref} className={`${base} italic text-gray-400 ${highlight}`}>
        {line.text}
      </li>
    );
  }
  return (
    <li ref={ref} className={`${base} ${highlight}`}>
      {charName && (
        <span className={`font-semibold mr-2 ${isUserLine ? "text-blue-600" : "text-gray-700"}`}>
          {charName}:
        </span>
      )}
      {line.text}
    </li>
  );
});
