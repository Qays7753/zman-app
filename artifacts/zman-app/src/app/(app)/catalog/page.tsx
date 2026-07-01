import { Suspense } from "react";
import { SkeletonList } from "@/components/shared/SkeletonList";
import dynamic from "next/dynamic";

export const metadata = {
  title: "المكوّنات | Zman",
};

const CatalogClient = dynamic(() => import("./CatalogClient"), {
  loading: () => <SkeletonList />,
});

export default function Page() {
  return (
    <Suspense fallback={<SkeletonList />}>
      <CatalogClient />
    </Suspense>
  );
}
