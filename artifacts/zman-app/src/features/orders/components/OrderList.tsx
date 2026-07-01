"use client";

import { Boxes, Edit, MessageSquare, Search, Trash2, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AmountText } from "@/components/shared/AmountText";
import { DateText } from "@/components/shared/DateText";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { cn } from "@/lib/utils";
import { buildOrderWhatsAppLink } from "@/lib/whatsapp";
import { useInfiniteOrders } from "../hooks";
import type { Order } from "../types";
import { OrderCard } from "./OrderCard";

interface OrderListProps {
  onEdit: (order: Order) => void;
  onDelete: (order: Order) => void;
  onViewDetail: (order: Order) => void;
  onCreateNew: () => void;
  onOpenComponents?: () => void;
}

// خيارات الحالات للمرشح العلوي
const statusFilters = [
  { value: "all", label: "الكل" },
  { value: "draft", label: "مسودة" },
  { value: "sent", label: "تم الإرسال" },
  { value: "confirmed", label: "مؤكد" },
  { value: "delivered", label: "تم التوصيل" },
  { value: "cancelled", label: "ملغى" },
];

const statusTranslations: Record<string, string> = {
  draft: "مسودة",
  sent: "تم الإرسال",
  confirmed: "مؤكد",
  delivered: "تم التوصيل",
  cancelled: "ملغى",
};

export function OrderList({
  onEdit,
  onDelete,
  onViewDetail,
  onCreateNew,
  onOpenComponents,
}: OrderListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // 1. قراءة الفلاتر الحالية من الـ URL (§7.3)
  const currentStatus = searchParams.get("status") || "all";
  const currentQuery = searchParams.get("q") || "";

  const [searchInput, setSearchInput] = useState(currentQuery);

  // تحديث حقل البحث مع إضافة تأخير (Debounce) لمنع كثرة استعلامات السيرفر
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (searchInput) {
        params.set("q", searchInput);
      } else {
        params.delete("q");
      }
      // العودة للصفحة الأولى دائماً عند تغيير البحث
      params.delete("cursor");
      router.replace(`${pathname}?${params.toString()}`);
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [searchInput, pathname, router, searchParams]);

  // مزامنة حالة البحث المحلي عند تغيير الـ URL (مثلاً عند مسح الفلاتر)
  useEffect(() => {
    setSearchInput(currentQuery);
  }, [currentQuery]);

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

  const handleStatusChange = (status: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("status", status);
    params.delete("cursor");
    router.replace(`${pathname}?${params.toString()}`);
  };

  const handleClearFilters = () => {
    setSearchInput("");
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
      {/* شريط البحث وتصفية الحالات: لاصق بأعلى منطقة المحتوى القابلة للتمرير */}
      <div className="sticky top-0 bg-canvas/95 backdrop-blur-sm pt-1 pb-3 z-sticky space-y-2.5">
        {/* صندوق البحث وزر إدارة المكوّنات */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              inputMode="text"
              placeholder="ابحث باسم العميل أو المنتج المطلوب..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full h-12 ps-11 pe-10 rounded-md border border-hairline-2 focus:outline-none focus:ring-2 focus:ring-ink bg-paper text-base leading-tight py-2.5 transition-colors"
            />
            <Search className="w-5 h-5 text-ink-3 absolute inset-s-4 top-3.5" />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                className="absolute inset-e-4 top-3.5 text-ink-3 hover:text-ink"
                aria-label="مسح البحث"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
          {onOpenComponents && (
            <button
              type="button"
              onClick={onOpenComponents}
              className="w-12 h-12 rounded-md border border-hairline-2 bg-paper text-ink-2 hover:text-ink hover:bg-canvas transition-colors flex items-center justify-center shrink-0 min-h-[44px] min-w-[44px]"
              title="إدارة المكوّنات"
              aria-label="إدارة المكوّنات"
            >
              <Boxes className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* رقاقات الحالات (Filter Chips) - سكرول أفقي للموبايل بدون إخفاء للتنقل (§10.1) */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 lg:mx-0 lg:px-0 no-scrollbar">
          {statusFilters.map((filter) => {
            const isActive = currentStatus === filter.value;
            return (
              <button
                key={filter.value}
                type="button"
                onClick={() => handleStatusChange(filter.value)}
                className={cn(
                  "px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors whitespace-nowrap min-h-[44px] flex items-center justify-center",
                  isActive
                    ? "bg-info text-paper border-info"
                    : "bg-paper text-ink-2 border-hairline hover:border-hairline-2",
                )}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
      </div>

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
          {/* عرض الموبايل: بطاقات مكدسة رأسياً (§10.1) */}
          <div className="space-y-3 lg:hidden">
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
              <thead className="bg-canvas border-b border-hairline text-ink-2 sticky top-0 z-sticky">
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
                      <span
                        className={cn(
                          "px-2.5 py-0.5 rounded-full text-xs font-semibold border leading-none inline-flex items-center justify-center h-5",
                          ord.status === "cancelled"
                            ? "bg-alert-soft text-alert-deep border-alert/20"
                            : ord.status === "draft"
                              ? "bg-warn-soft text-warn-deep border-warn/20"
                              : "bg-info-soft text-info border-info/20",
                        )}
                      >
                        {statusTranslations[ord.status] || ord.status}
                      </span>
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
