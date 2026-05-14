"use client";

import { useRouter } from "next/navigation";
import UploadPanel from "@/components/UploadPanel";
import { supabase } from "@/lib/supabase";

export default function UploadPageClient() {
  const router = useRouter();

  function handleCharacterSelected(scriptId: string, characterId: string) {
    router.push(`/rehearse/${scriptId}?character=${characterId}`);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="max-w-md mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-semibold">Audition Assistant</h1>
          <button
            onClick={handleSignOut}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Sign out
          </button>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <UploadPanel onCharacterSelected={handleCharacterSelected} />
        </div>
      </div>
    </main>
  );
}
