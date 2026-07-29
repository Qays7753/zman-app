import { Suspense } from "react";
import { SkeletonList } from "@/components/shared/SkeletonList";
import OpeningBalanceClient from "./OpeningBalanceClient";

export const metadata = {
  title: "الأرصدة الافتتاحية - Zman",
  description: "إعداد وقفل الأرصدة الافتتاحية للمشروع",
};

export default function OpeningBalancePage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 p-4">
          <SkeletonList count={3} />
        </div>
      }
    >
      <OpeningBalanceClient />
    </Suspense>
  );
}
