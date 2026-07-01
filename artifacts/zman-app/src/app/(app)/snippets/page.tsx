import { Suspense } from "react";
import { SkeletonList } from "@/components/shared/SkeletonList";
import dynamic from "next/dynamic";

export const metadata = {
  title: "الملاحظات | Zman",
};

const SnippetsClient = dynamic(() => import("./SnippetsClient"), {
  loading: () => <SkeletonList />,
});

export default function Page() {
  return (
    <Suspense fallback={<SkeletonList />}>
      <SnippetsClient />
    </Suspense>
  );
}
