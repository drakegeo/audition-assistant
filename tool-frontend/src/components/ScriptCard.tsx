"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteScript, getScript, getScriptStatus, renameScript } from "@/lib/api";
import type { Character, ScriptListItem } from "@/types/script";

const POLL_MS = 2000;

interface Props {
  script: ScriptListItem;
  onDeleted: (id: string) => void;
  onStatusChange: (id: string, status: string) => void;
}

export default function ScriptCard({ script, onDeleted, onStatusChange }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(script.title);
  const [isRenaming, setIsRenaming] = useState(false);
  const [characters, setCharacters] = useState<Character[] | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [status, setStatus] = useState(script.status);
  const [parseError, setParseError] = useState(script.parse_error);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll while parsing
  useEffect(() => {
    if (status !== "queued" && status !== "parsing") return;
    pollRef.current = setInterval(async () => {
      try {
        const s = await getScriptStatus(script.id);
        setStatus(s.status);
        onStatusChange(script.id, s.status);
        if (s.status === "ready" || s.status === "failed") {
          clearInterval(pollRef.current!);
          setParseError(s.parse_error ?? null);
        }
      } catch { clearInterval(pollRef.current!); }
    }, POLL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script.id, status]);

  useEffect(() => {
    if (isRenaming) inputRef.current?.focus();
  }, [isRenaming]);

  async function handleRename() {
    const trimmed = title.trim();
    if (!trimmed || trimmed === script.title) { setIsRenaming(false); return; }
    await renameScript(script.id, trimmed).catch(() => setTitle(script.title));
    setIsRenaming(false);
  }

  async function handleRehearse() {
    if (showPicker) { setShowPicker(false); return; }
    const full = await getScript(script.id);
    setCharacters(full.characters);
    setShowPicker(true);
  }

  async function handleDelete() {
    if (!confirm(`Delete "${title}"? This cannot be undone and counts toward your 3-script limit.`)) return;
    setDeleting(true);
    await deleteScript(script.id).catch(() => setDeleting(false));
    onDeleted(script.id);
  }

  const statusBadge: Record<string, string> = {
    ready: "bg-green-100 text-green-700",
    parsing: "bg-blue-100 text-blue-700",
    queued: "bg-yellow-100 text-yellow-700",
    failed: "bg-red-100 text-red-700",
  };
  const statusLabel: Record<string, string> = {
    ready: "Ready",
    parsing: "Parsing…",
    queued: "Queued",
    failed: "Failed",
  };

  return (
    <div className={`bg-white border rounded-xl p-5 space-y-4 shadow-sm transition-opacity ${deleting ? "opacity-40" : ""}`}>
      {/* Title */}
      <div className="flex items-start justify-between gap-2">
        {isRenaming ? (
          <input
            ref={inputRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") { setTitle(script.title); setIsRenaming(false); } }}
            className="flex-1 text-base font-semibold border-b-2 border-blue-500 outline-none bg-transparent"
          />
        ) : (
          <button
            onClick={() => setIsRenaming(true)}
            className="flex-1 text-left text-base font-semibold hover:text-blue-600 group flex items-center gap-1"
            title="Click to rename"
          >
            {title}
            <span className="text-gray-300 group-hover:text-blue-400 text-xs">✏️</span>
          </button>
        )}
        <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge[status] ?? ""}`}>
          {statusLabel[status] ?? status}
        </span>
      </div>

      {/* Parsing spinner */}
      {(status === "parsing" || status === "queued") && (
        <div className="flex items-center gap-2 text-sm text-blue-600">
          <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
          AI is reading your script…
        </div>
      )}

      {/* Error */}
      {status === "failed" && (
        <p className="text-sm text-red-600">{parseError ?? "Parsing failed."}</p>
      )}

      {/* Character picker */}
      {showPicker && characters && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Who are you playing?</p>
          <ul className="space-y-1">
            {characters.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => router.push(`/rehearse/${script.id}?character=${c.id}`)}
                  className="w-full text-left px-3 py-2 rounded-lg border text-sm hover:bg-blue-50 hover:border-blue-400 transition"
                >
                  <span className="font-medium">{c.name}</span>
                  <span className="ml-2 text-gray-400">{c.line_count} lines</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        {status === "ready" && (
          <button
            onClick={handleRehearse}
            className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700"
          >
            {showPicker ? "Cancel" : "Rehearse"}
          </button>
        )}
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="px-3 py-2 rounded-lg border text-sm text-red-500 hover:bg-red-50 hover:border-red-300 disabled:opacity-40"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
