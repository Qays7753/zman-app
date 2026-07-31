import { Suspense } from "react";
import { SkeletonList } from "@/components/shared/SkeletonList";
import AuditLogClient from "./AuditLogClient";

export const metadata = {
  title: "سجل التدقيق - Zman",
  description: "مراجعة كل عمليات الإنشاء والتعديل والحذف المالية",
};

export default function AuditLogPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 p-4">
          <SkeletonList count={5} />
        </div>
      }
    >
      <AuditLogClient />
    </Suspense>
  );
}
