import { Suspense } from "react";
import AuthGuard from "@/components/AuthGuard";
import RehearsalClient from "./RehearsalClient";

export default async function RehearsePage({ params }: { params: Promise<{ scriptId: string }> }) {
  const { scriptId } = await params;
  return (
    <AuthGuard>
      <Suspense fallback={
        <main className="min-h-screen flex items-center justify-center">
          <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
        </main>
      }>
        <RehearsalClient scriptId={scriptId} />
      </Suspense>
    </AuthGuard>
  );
}
