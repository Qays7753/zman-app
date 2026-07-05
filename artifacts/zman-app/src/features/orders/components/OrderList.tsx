"use client";

import { Edit, MessageSquare, Trash2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AmountText } from "@/components/shared/AmountText";
import { DateText } from "@/components/shared/DateText";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { buildOrderWhatsAppLink } from "@/lib/whatsapp";
import { useInfiniteOrders } from "../hooks";
import type { Order } from "../types";
import { OrderCard } from "./OrderCard";
import { StatusBadge } from "@/components/shared/StatusBadge";

interface OrderListProps {
  onEdit: (order: Order) => void;
  onDelete: (order: Order) => void;
  onViewDetail: (order: Order) => void;
  onCreateNew: () => void;
}

export function OrderList({
  onEdit,
  onDelete,
  onViewDetail,
  onCreateNew,
}: OrderListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // الفلاتر تُدار الآن من هيدر الصفحة (PageToolbar) عبر الـ URL؛
  // هنا نقرأها فقط لجلب البيانات (تبقى مشتركة مع عرض التقويم)
  const currentStatus = searchParams.get("status") || "all";
  const currentQuery = searchParams.get("q") || "";

  // 2. جلب البيانات باستخدام Infinite Query (§10.1)
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    refetch,
  } = useInfiniteOrders({
    status: currentStatus,
    q: currentQuery,
  });

  const handleClearFilters = () => {
    router.replace(pathname);
  };

  // تفريغ الصفحات المجلوبة في مصفوفة موحدة
  const allOrders = data?.pages.flatMap((page) => page.items) || [];
  const isFiltering = currentStatus !== "all" || currentQuery !== "";

  // 3. معالجة حالات العرض المختلفة (تحميل، خطأ، فارغ) (§10.3)
  if (isLoading) {
    return <SkeletonList />;
  }

  if (isError) {
    return <ErrorState onRetry={refetch} />;
  }

  return (
    <div className="space-y-4">
      {/* 4. التحقق من القوائم الفارغة والـ Onboarding (§9.5) */}
      {allOrders.length === 0 ? (
        isFiltering ? (
          <EmptyState
            title="لا توجد نتائج تطابق الفلتر"
            description="جرب البحث بكلمات أخرى أو مسح مرشح الحالة الحالي للعثور على الطلبات."
            actionLabel="مسح فلاتر البحث"
            onAction={handleClearFilters}
            isFilterResult={true}
          />
        ) : (
          <EmptyState
            title="لا توجد طلبات بعد"
            description="أنشئ طلبك الأول لتسجيل منتجاتك وإرسال عروض الأسعار والتفاصيل لعملائك عبر واتساب."
            actionLabel="أنشئ أول طلب الآن"
            onAction={onCreateNew}
            isFilterResult={false}
          />
        )
      ) : (
        <>
          {/* عرض الموبايل: بطاقات مكدسة رأسياً منفصلة ومميزة (§10.1) */}
          <div className="space-y-4 lg:hidden">
            {allOrders.map((ord) => (
              <OrderCard
                key={ord.id}
                order={ord}
                onEdit={onEdit}
                onDelete={onDelete}
                onClick={onViewDetail}
              />
            ))}
          </div>

          {/* عرض الديسكتوب: جدول منسق وقابل للتصفح (§10.2) */}
          <div className="hidden lg:block overflow-x-auto rounded-lg border border-hairline bg-paper shadow-sm">
            <table className="w-full border-collapse text-start text-sm">
              <thead className="bg-canvas border-b border-hairline text-ink-2">
                <tr>
                  <th className="px-6 py-4 text-start font-bold">العميل</th>
                  <th className="px-6 py-4 text-start font-bold">المنتج</th>
                  <th className="px-6 py-4 text-start font-bold">الكمية</th>
                  <th className="px-6 py-4 text-start font-bold">الحالة</th>
                  <th className="px-6 py-4 text-start font-bold">
                    السعر النهائي
                  </th>
                  <th className="px-6 py-4 text-start font-bold">
                    تاريخ الطلب
                  </th>
                  <th className="px-6 py-4 text-center font-bold">الخيارات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {allOrders.map((ord) => (
                  <tr
                    key={ord.id}
                    onClick={() => onViewDetail(ord)}
                    className="hover:bg-canvas/40 transition-colors cursor-pointer group"
                  >
                    <td className="px-6 py-4 font-semibold text-ink">
                      {ord.customerName}
                    </td>
                    <td className="px-6 py-4 text-ink-2">{ord.productName}</td>
                    <td className="px-6 py-4 text-ink-2">{ord.quantity}</td>
                    <td className="px-6 py-4">
                      <StatusBadge status={ord.status} />
                    </td>
                    <td className="px-6 py-4 font-bold text-info">
                      <AmountText amount={ord.totalPriceCents} />
                    </td>
                    <td className="px-6 py-4 text-ink-3">
                      <DateText date={ord.createdAt} relative />
                    </td>
                    {/* biome-ignore lint/a11y/useKeyWithClickEvents: cell wrapper blocks click propagation, contains keyboard-accessible buttons */}
                    <td
                      className="px-6 py-4 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-center gap-2">
                        {/* إرسال واتساب */}
                        <button
                          type="button"
                          onClick={() =>
                            window.open(buildOrderWhatsAppLink(ord), "_blank")
                          }
                          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded hover:bg-canvas text-info transition-colors"
                          title="إرسال تفاصيل واتساب"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </button>
                        {/* تعديل الطلب */}
                        <button
                          type="button"
                          onClick={() => onEdit(ord)}
                          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded hover:bg-canvas text-ink-2 transition-colors"
                          title="تعديل الطلب"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        {/* حذف الطلب */}
                        <button
                          type="button"
                          onClick={() => onDelete(ord)}
                          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded hover:bg-alert-soft text-alert transition-colors"
                          title="حذف الطلب"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 5. زر تحميل المزيد (عرض المزيد) للكيرسر (§10.1) */}
          {hasNextPage && (
            <div className="pt-4 flex justify-center">
              <button
                type="button"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="w-full lg:w-auto min-h-[44px] px-8 py-2.5 bg-paper hover:bg-canvas border border-hairline-2 rounded-md text-sm font-semibold text-ink-2 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isFetchingNextPage
                  ? "جاري تحميل المزيد..."
                  : "تحميل المزيد من الطلبات"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
