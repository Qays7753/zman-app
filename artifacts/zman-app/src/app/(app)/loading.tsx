import { SkeletonList } from "@/components/shared/SkeletonList";

/**
 * تظهر فور بدء تنقل App Router قبل اكتمال استعلامات الصفحة،
 * خصوصاً لوحة القيادة التي تجمع بيانات مالية متعددة عند الفتح.
 */
export default function AppLoading() {
  return (
    <div
      className="flex min-h-full flex-col gap-4"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">جاري تحميل الصفحة...</span>
      <div className="h-12 w-full animate-pulse rounded-xl border border-hairline bg-paper" />
      <SkeletonList count={3} />
    </div>
  );
}
