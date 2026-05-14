import AuthGuard from "@/components/AuthGuard";
import UploadPageClient from "./UploadPageClient";

export default function UploadPage() {
  return (
    <AuthGuard>
      <UploadPageClient />
    </AuthGuard>
  );
}
