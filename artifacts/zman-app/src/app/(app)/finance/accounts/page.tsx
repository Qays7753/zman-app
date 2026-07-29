import { Suspense } from "react";
import { SkeletonList } from "@/components/shared/SkeletonList";
import AccountsClient from "./AccountsClient";

export const metadata = {
  title: "الحسابات والصناديق - Zman",
  description: "إدارة الحسابات البنكية والصناديق والمسحوبات الشخصية",
};

export default function AccountsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 p-4">
          <SkeletonList count={4} />
        </div>
      }
    >
      <AccountsClient />
    </Suspense>
  );
}
