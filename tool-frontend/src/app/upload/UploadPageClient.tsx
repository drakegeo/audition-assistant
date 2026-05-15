"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { listScripts, uploadScript } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import ScriptCard from "@/components/ScriptCard";
import type { ScriptListItem } from "@/types/script";

const MAX_SCRIPTS = 3;

export default function UploadPageClient() {
  const router = useRouter();
  const [scripts, setScripts] = useState<ScriptListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listScripts().then((s) => { setScripts(s); setLoading(false); });
  }, []);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const { script_id } = await uploadScript(file);
      const newScript: ScriptListItem = {
        id: script_id,
        title: file.name.replace(/\.pdf$/i, ""),
        status: "queued",
        created_at: new Date().toISOString(),
        parsed_at: null,
        parse_error: null,
      };
      setScripts((prev) => [newScript, ...prev]);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes("quota")) {
        setUploadError(`You've reached the ${MAX_SCRIPTS}-script limit for the free plan.`);
      } else {
        setUploadError(msg);
      }
    }
    setUploading(false);
  }

  function handleDeleted(id: string) {
    setScripts((prev) => prev.filter((s) => s.id !== id));
  }

  function handleStatusChange(id: string, status: string) {
    setScripts((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: status as ScriptListItem["status"] } : s))
    );
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const canUpload = scripts.length < MAX_SCRIPTS;
  const usedFraction = scripts.length / MAX_SCRIPTS;

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="max-w-xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">My Scripts</h1>
          <button onClick={handleSignOut} className="text-sm text-gray-400 hover:text-gray-600">
            Sign out
          </button>
        </div>

        {/* Quota bar */}
        <div className="bg-white border rounded-xl px-5 py-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 font-medium">Free plan</span>
            <span className={`font-semibold ${scripts.length >= MAX_SCRIPTS ? "text-red-500" : "text-gray-700"}`}>
              {scripts.length} / {MAX_SCRIPTS} scripts used
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${scripts.length >= MAX_SCRIPTS ? "bg-red-400" : "bg-blue-500"}`}
              style={{ width: `${usedFraction * 100}%` }}
            />
          </div>
        </div>

        {/* Upload form */}
        {canUpload && (
          <div className="bg-white border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Upload a new script</h2>
            <form onSubmit={handleUpload} className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                required
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}
              <button
                type="submit"
                disabled={!file || uploading}
                className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {uploading ? "Uploading…" : "Upload & Parse"}
              </button>
            </form>
          </div>
        )}

        {scripts.length >= MAX_SCRIPTS && (
          <p className="text-sm text-center text-gray-500">
            You&apos;ve used all {MAX_SCRIPTS} script slots. Delete one to upload a new script.
          </p>
        )}

        {/* Script cards */}
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : scripts.length === 0 ? (
          <p className="text-center text-gray-400 py-10">No scripts yet. Upload your first PDF above.</p>
        ) : (
          <div className="space-y-4">
            {scripts.map((s) => (
              <ScriptCard
                key={s.id}
                script={s}
                onDeleted={handleDeleted}
                onStatusChange={handleStatusChange}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
