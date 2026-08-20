import { DashboardClient } from "@/features/dashboard/components/DashboardClient";

/**
 * الصفحة الرئيسية تعرض القشرة والـloading state فور وصول route.
 *
 * لا ننفذ getDashboardBundle هنا عبر Server Component؛ كان ذلك يحجب كل انتقال
 * إلى `/` حتى تكتمل حزمة مالية/مخزون كبيرة من قاعدة البيانات. DashboardClient
 * يجلب الحزمة عبر React Query، فيستفيد من الكاش عند الرجوع ويعرض skeleton عند
 * الفتح البارد بدلاً من إبقاء route عالقاً في انتظار Server Component.
 */
export default function Home() {
  return <DashboardClient />;
}
