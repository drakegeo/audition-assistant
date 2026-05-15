import { Suspense } from "react";
import AuthGuard from "@/components/AuthGuard";
import SetupClient from "./SetupClient";

export default async function SetupPage({ params }: { params: Promise<{ scriptId: string }> }) {
  const { scriptId } = await params;
  return (
    <AuthGuard>
      <Suspense>
        <SetupClient scriptId={scriptId} />
      </Suspense>
    </AuthGuard>
  );
}
