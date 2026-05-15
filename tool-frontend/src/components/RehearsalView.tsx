"use client";

import React, { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { CueMode, Line, Script } from "@/types/script";
import { speakLine, durationEstimateMs } from "@/lib/voice/tts";
import { loadKokoro, speakLineKokoro, assignKokoroVoices, isKokoroReady, KOKORO_VOICES, type KokoroVoice } from "@/lib/voice/kokoro";
import { createSTT } from "@/lib/voice/stt";
import { createCueDetector } from "@/lib/voice/cue";
import { assignVoices, loadVoices } from "@/lib/voice/support";
import { reduce } from "@/lib/voice/session";
import type { SessionState, SessionEvent } from "@/lib/voice/session";

const LISTENING_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Word highlighting helpers
// ---------------------------------------------------------------------------

function normWord(w: string) {
  return w.toLowerCase().replace(/[^\w]/g, "");
}

function toWordSet(text: string): Set<string> {
  return new Set(text.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(Boolean));
}

/**
 * Highlight words in a dialogue line based on what the user has spoken.
 * - confirmedWords (final STT results): solid blue — definitely said.
 * - interimWords (current partial result): light blue — being recognised now.
 */
function highlightWords(
  text: string,
  confirmedWords: Set<string>,
  interimWords: Set<string>
): React.ReactNode {
  if (confirmedWords.size === 0 && interimWords.size === 0) return text;
  const tokens = text.split(/(\s+)/);
  return tokens.map((token, i) => {
    if (/^\s+$/.test(token)) return token;
    const norm = normWord(token);
    if (!norm) return token;
    if (confirmedWords.has(norm)) {
      return (
        <mark key={i} className="bg-blue-500 text-white rounded-sm px-0.5 not-italic">
          {token}
        </mark>
      );
    }
    if (interimWords.has(norm)) {
      return (
        <mark key={i} className="bg-blue-200 text-blue-800 rounded-sm px-0.5 not-italic">
          {token}
        </mark>
      );
    }
    return token;
  });
}

// ---------------------------------------------------------------------------
// Scene list panel
// ---------------------------------------------------------------------------

interface SceneListProps {
  lines: Line[];
  onJump: (lineIndex: number) => void;
  onClose: () => void;
}

function SceneList({ lines, onJump, onClose }: SceneListProps) {
  const scenes = lines
    .map((line, idx) => ({ line, idx }))
    .filter(({ line }) => line.kind === "scene_header");

  return (
    <div className="absolute top-14 right-4 z-20 w-72 bg-white border shadow-xl rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-gray-50">
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Scenes</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
      </div>
      {scenes.length === 0 ? (
        <p className="text-sm text-gray-400 px-4 py-3">No scene headers found.</p>
      ) : (
        <ul className="max-h-80 overflow-y-auto divide-y">
          {scenes.map(({ line, idx }) => (
            <li key={line.id}>
              <button
                onClick={() => { onJump(idx); onClose(); }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-blue-50 text-gray-700"
              >
                {line.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

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
  const dispatch = useCallback((e: SessionEvent) => rawDispatch(e), [rawDispatch]);

  const [voiceMap, setVoiceMap] = useState<Map<string, SpeechSynthesisVoice>>(new Map());
  const [kokoroState, setKokoroState] = useState<"loading" | "ready" | "failed">("loading");
  const [kokoroVoiceMap, setKokoroVoiceMap] = useState<Map<string, KokoroVoice>>(new Map());
  const [showSkipPrompt, setShowSkipPrompt] = useState(false);
  const [showScenes, setShowScenes] = useState(false);
  // confirmedWords: from final STT results — reliably spoken (solid blue)
  // interimWords:  from current partial result — being heard right now (light blue)
  const [confirmedWords, setConfirmedWords] = useState<Set<string>>(new Set());
  const [interimWords, setInterimWords] = useState<Set<string>>(new Set());
  // Tracks ALL text spoken this line across multiple STT sessions (Chrome
  // restarts recognition after long silences, resetting event.results).
  const accumulatedRef = useRef("");
  const sttRef = useRef<ReturnType<typeof createSTT>>(null);
  const lineRefs = useRef<(HTMLLIElement | null)[]>([]);

  const charMap = new Map(script.characters.map((c) => [c.id, c.name]));
  const userCharName = charMap.get(userCharacterId) ?? "";

  useEffect(() => {
    const otherChars = script.characters
      .filter((c) => c.id !== userCharacterId)
      .map((c) => c.name);
    setKokoroVoiceMap(assignKokoroVoices(otherChars));
    loadVoices().then((voices) => {
      const narrator = voices.find((v) => v.lang.toLowerCase().startsWith("en")) ?? voices[0];
      const assigned = assignVoices(otherChars, voices);
      assigned.set("__narrator__", narrator);
      setVoiceMap(assigned);
    });
  }, [script, userCharacterId]);

  useEffect(() => {
    loadKokoro()
      .then(() => setKokoroState("ready"))
      .catch(() => setKokoroState("failed"));
  }, []);

  // Scroll current line into view
  useEffect(() => {
    const idx = state.kind === "speaking" || state.kind === "listening" ? state.lineIndex : -1;
    if (idx >= 0) lineRefs.current[idx]?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [state]);

  // SPEAKING
  useEffect(() => {
    if (state.kind !== "speaking") return;
    const line = lines[state.lineIndex];
    const charName = line.character_id ? (charMap.get(line.character_id) ?? "__narrator__") : "__narrator__";

    let cancelled = false;
    let cancelPlayback = () => {};
    const timeoutId = setTimeout(() => dispatch({ type: "tts_ended" }), durationEstimateMs(line.text));

    if (isKokoroReady()) {
      const voiceId = kokoroVoiceMap.get(charName) ?? KOKORO_VOICES[0];
      void (async () => {
        if (cancelled) return;
        cancelPlayback = await speakLineKokoro(line.text, voiceId, () => {
          if (!cancelled) { clearTimeout(timeoutId); dispatch({ type: "tts_ended" }); }
        });
        if (cancelled) cancelPlayback();
      })();
    } else {
      const voice = voiceMap.get(charName) ?? voiceMap.get("__narrator__");
      if (!voice) { clearTimeout(timeoutId); return; }
      const charIndex = script.characters.findIndex((c) => c.name === charName);
      const rate = 0.92 + (charIndex >= 0 ? (charIndex % 3) * 0.04 : 0);
      const pitch = 1.0 + (charIndex >= 0 ? (charIndex % 2) * 0.1 : 0);
      cancelPlayback = speakLine(line.text, voice, () => { clearTimeout(timeoutId); dispatch({ type: "tts_ended" }); }, rate, pitch);
    }

    return () => { cancelled = true; clearTimeout(timeoutId); cancelPlayback(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, voiceMap, kokoroVoiceMap]);

  // LISTENING
  useEffect(() => {
    if (state.kind !== "listening") return;
    const line = lines[state.lineIndex];
    const onCue = () => dispatch({ type: "cue_detected" });
    const detectCue = createCueDetector(cueMode, line.text, onCue);
    const stt = createSTT(
      (sessionTranscript, isFinal) => {
        // sessionTranscript is the full text from the current STT session.
        // Prepend any text from previous sessions so the cue detector always
        // sees the complete picture of what the user has said this line.
        const fullTranscript = (accumulatedRef.current + " " + sessionTranscript).trim();

        if (isFinal) {
          // Commit this session's text into the accumulated base so future
          // sessions (after a Chrome restart) still have it.
          accumulatedRef.current = fullTranscript;
          setConfirmedWords(toWordSet(fullTranscript));
          setInterimWords(new Set());
        } else {
          setInterimWords(toWordSet(sessionTranscript));
        }
        detectCue(fullTranscript);
      },
      (error) => { if (error === "not-allowed") dispatch({ type: "stt_error", message: "Microphone permission denied." }); }
    );
    sttRef.current = stt;
    stt?.start();
    const timeoutId = setTimeout(() => setShowSkipPrompt(true), LISTENING_TIMEOUT_MS);
    return () => {
      clearTimeout(timeoutId);
      setShowSkipPrompt(false);
      setConfirmedWords(new Set());
      setInterimWords(new Set());
      accumulatedRef.current = "";
      stt?.stop();
      sttRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, cueMode]);

  // Keyboard shortcuts
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

  const currentIndex = state.kind === "speaking" || state.kind === "listening" ? state.lineIndex : -1;
  const isIdle = state.kind === "idle";
  const isPaused = state.kind === "paused";
  const isError = state.kind === "error";
  const isActive = state.kind === "speaking" || state.kind === "listening";

  function jumpToScene(lineIndex: number) {
    lineRefs.current[lineIndex]?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  return (
    <div className="flex flex-col h-full relative">
      {/* Controls */}
      <div className="flex items-center gap-3 p-4 border-b bg-white sticky top-0 z-10">
        {isIdle && currentIndex === -1 && (
          <button onClick={() => dispatch({ type: "start" })}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
            Start Rehearsal
          </button>
        )}
        {(isActive || isPaused) && (
          <button onClick={() => dispatch({ type: isPaused ? "resume" : "pause" })}
            className="bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-900"
            aria-label={isPaused ? "Resume (Space)" : "Pause (Space)"}>
            {isPaused ? "Resume" : "Pause"}
          </button>
        )}
        {isActive && (
          <>
            <button onClick={() => dispatch({ type: "restart_line" })}
              className="px-3 py-2 rounded-lg text-sm border hover:bg-gray-50" aria-label="Restart (R)">
              Restart
            </button>
            <button onClick={() => dispatch({ type: "skip_line" })}
              className="px-3 py-2 rounded-lg text-sm border hover:bg-gray-50" aria-label="Skip (→)">
              Skip
            </button>
          </>
        )}
        {isIdle && currentIndex >= 0 && (
          <p className="text-sm text-green-600 font-medium">Scene complete!</p>
        )}
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={() => setShowScenes((v) => !v)}
            className="text-xs text-gray-500 border rounded-lg px-3 py-1.5 hover:bg-gray-50"
          >
            Scenes ▾
          </button>
          <span className="text-xs text-gray-500">
            <span className="font-semibold">{userCharName}</span>
            {state.kind === "listening" && <span className="ml-2 text-blue-600">● Listening</span>}
            {state.kind === "speaking" && <span className="ml-2 text-gray-400">Speaking…</span>}
          </span>
          {kokoroState === "loading" && (
            <span className="text-xs text-gray-400 animate-pulse">Loading voice model…</span>
          )}
        </div>
      </div>

      {/* Scene list dropdown */}
      {showScenes && (
        <SceneList lines={lines} onJump={jumpToScene} onClose={() => setShowScenes(false)} />
      )}

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
            confirmedWords={idx === currentIndex && state.kind === "listening" ? confirmedWords : new Set()}
            interimWords={idx === currentIndex && state.kind === "listening" ? interimWords : new Set()}
            ref={(el) => { lineRefs.current[idx] = el; }}
          />
        ))}
      </ol>

      {/* Skip prompt */}
      {showSkipPrompt && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-white border shadow-lg rounded-xl p-4 flex gap-3 items-center">
          <p className="text-sm">Still on this line?</p>
          <button onClick={() => { setShowSkipPrompt(false); dispatch({ type: "skip_line" }); }}
            className="text-sm text-blue-600 hover:underline">Skip it</button>
          <button onClick={() => setShowSkipPrompt(false)}
            className="text-sm text-gray-500 hover:underline">Keep going</button>
        </div>
      )}

      {/* Error overlay */}
      {isError && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full text-center space-y-4">
            <p className="text-red-600 font-medium">{(state as { message: string }).message}</p>
            <button onClick={() => dispatch({ type: "start" })}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">Restart</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LineItem
// ---------------------------------------------------------------------------

const LineItem = React.forwardRef<
  HTMLLIElement,
  {
    line: Line;
    charName: string | undefined;
    isUserLine: boolean;
    isCurrent: boolean;
    isPast: boolean;
    confirmedWords: Set<string>;
    interimWords: Set<string>;
  }
>(function LineItem({ line, charName, isUserLine, isCurrent, isPast, confirmedWords, interimWords }, ref) {
  const base = "px-3 py-2 rounded-lg transition-colors text-sm leading-relaxed";
  const highlight = isCurrent
    ? isUserLine
      ? "bg-blue-50 border-l-4 border-blue-500"
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

  // Dialogue — highlight spoken words when this is the active user line
  const textContent =
    isUserLine && isCurrent && (confirmedWords.size > 0 || interimWords.size > 0)
      ? highlightWords(line.text, confirmedWords, interimWords)
      : line.text;

  return (
    <li ref={ref} className={`${base} ${highlight}`}>
      {charName && (
        <span className={`font-semibold mr-2 ${isUserLine ? "text-blue-600" : "text-gray-700"}`}>
          {charName}:
        </span>
      )}
      {textContent}
    </li>
  );
});
