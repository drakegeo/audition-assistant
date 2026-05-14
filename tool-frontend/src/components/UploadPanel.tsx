"use client";

import { useRef, useState } from "react";
import { uploadScript, getScriptStatus } from "@/lib/api";
import type { Character, ScriptStatus } from "@/types/script";

type Step =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "polling"; scriptId: string; status: ScriptStatus }
  | { kind: "picking"; scriptId: string; characters: Character[] }
  | { kind: "error"; message: string };

const POLL_INTERVAL_MS = 2000;

interface Props {
  onCharacterSelected: (scriptId: string, characterId: string) => void;
}

export default function UploadPanel({ onCharacterSelected }: Props) {
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [file, setFile] = useState<File | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  async function startPolling(scriptId: string) {
    setStep({ kind: "polling", scriptId, status: "queued" });
    pollRef.current = setInterval(async () => {
      try {
        const s = await getScriptStatus(scriptId);
        if (s.status === "ready") {
          stopPolling();
          // Fetch full script for character list
          const { getCurrentScript } = await import("@/lib/api");
          const script = await getCurrentScript();
          if (!script) { setStep({ kind: "error", message: "Script not found after parsing." }); return; }
          setStep({ kind: "picking", scriptId, characters: script.characters });
        } else if (s.status === "failed") {
          stopPolling();
          setStep({ kind: "error", message: s.parse_error ?? "Parsing failed." });
        } else {
          setStep({ kind: "polling", scriptId, status: s.status });
        }
      } catch (err) {
        stopPolling();
        setStep({ kind: "error", message: String(err) });
      }
    }, POLL_INTERVAL_MS);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setStep({ kind: "uploading" });
    try {
      const { script_id } = await uploadScript(file);
      await startPolling(script_id);
    } catch (err) {
      setStep({ kind: "error", message: String(err) });
    }
  }

  if (step.kind === "picking") {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Who are you playing?</h2>
        <ul className="space-y-2">
          {step.characters.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => onCharacterSelected(step.scriptId, c.id)}
                className="w-full text-left px-4 py-3 rounded-lg border hover:bg-blue-50 hover:border-blue-400 transition"
              >
                <span className="font-medium">{c.name}</span>
                <span className="ml-2 text-sm text-gray-500">{c.line_count} lines</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (step.kind === "polling") {
    return (
      <div className="text-center space-y-2">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto" />
        <p className="text-sm text-gray-600 capitalize">{step.status}…</p>
      </div>
    );
  }

  if (step.kind === "error") {
    return (
      <div className="space-y-4">
        <p className="text-red-600 text-sm">{step.message}</p>
        <button
          onClick={() => setStep({ kind: "idle" })}
          className="text-sm text-blue-600 hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">
          Upload your script (PDF, max 10 MB)
        </label>
        <input
          type="file"
          accept=".pdf,application/pdf"
          required
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
      </div>
      <button
        type="submit"
        disabled={!file || step.kind === "uploading"}
        className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {step.kind === "uploading" ? "Uploading…" : "Upload & Parse"}
      </button>
    </form>
  );
}
