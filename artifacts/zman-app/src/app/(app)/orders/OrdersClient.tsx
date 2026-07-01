"use client";

import { CalendarDays, LayoutList, Plus } from "lucide-react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { AppShellHeader } from "@/providers/app-shell-context";
import { ErrorState } from "@/components/shared/ErrorState";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { cn } from "@/lib/utils";
import { useOrder } from "@/features/orders/hooks";
import type { Order } from "@/features/orders/types";

const OrderList = dynamic(
  () => import("@/features/orders/components/OrderList").then((m) => m.OrderList),
  { loading: () => <SkeletonList count={3} /> },
);

const ResponsiveModal = dynamic(
  () => import("@/components/shared/ResponsiveModal").then((m) => m.ResponsiveModal),
  { ssr: false },
);

const CatalogClient = dynamic(
  () => import("../catalog/CatalogClient"),
  { ssr: false, loading: () => <SkeletonList count={3} /> },
);

const OrderForm = dynamic(
  () => import("@/features/orders/components/OrderForm").then((m) => m.OrderForm),
  { ssr: false, loading: () => <SkeletonList count={3} /> },
);

const OrderDetail = dynamic(
  () => import("@/features/orders/components/OrderDetail").then((m) => m.OrderDetail),
  { ssr: false, loading: () => <SkeletonList count={2} /> },
);

const OrderCalendar = dynamic(
  () => import("@/features/orders/components/OrderCalendar").then((m) => m.OrderCalendar),
  { ssr: false, loading: () => <SkeletonList count={4} /> },
);

export default function OrdersClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const viewId = searchParams.get("view");
  const editId = searchParams.get("edit");
  const isNew = searchParams.get("new") === "true";
  const tab = searchParams.get("tab") ?? "list";
  const [isComponentsOpen, setIsComponentsOpen] = useState(false);

  const {
    data: editOrder,
    isLoading: isLoadingEdit,
    isError: isErrorEdit,
    refetch: refetchEdit,
  } = useOrder(editId || "");

  const navigateTo = (paramsToSet: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("view");
    params.delete("edit");
    params.delete("new");
    for (const [key, value] of Object.entries(paramsToSet)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleShowList = () => navigateTo({});
  const handleShowDetail = (order: Order) => navigateTo({ view: order.id });
  const handleShowEdit = (order: Order) => navigateTo({ edit: order.id });
  const handleShowCreate = () => navigateTo({ new: "true" });

  const setTab = (t: "list" | "calendar") => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("view");
    params.delete("edit");
    params.delete("new");
    if (t === "list") params.delete("tab");
    else params.set("tab", t);
    router.push(`${pathname}?${params.toString()}`);
  };

  const isInSubView = isNew || !!editId || !!viewId;

  let pageTitle = "الطلبات الجارية";
  if (isNew) pageTitle = "إنشاء طلب جديد";
  else if (editId) pageTitle = "تعديل بيانات الطلب";
  else if (viewId) pageTitle = "تفاصيل الطلب";

  const pageAction: React.ReactNode = isInSubView ? null : (
    <div className="flex items-center gap-2">
      {/* مبدّل العرض: قائمة | تقويم */}
      <div className="flex items-center rounded-lg border border-hairline bg-canvas p-1 gap-0.5">
        <button
          type="button"
          onClick={() => setTab("list")}
          className={cn(
            "min-h-[36px] min-w-[36px] flex items-center justify-center rounded-md transition-colors",
            tab === "list"
              ? "bg-paper text-info shadow-sm"
              : "text-ink-3 hover:text-ink hover:bg-paper/60",
          )}
          aria-label="عرض القائمة"
          title="قائمة الطلبات"
        >
          <LayoutList className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setTab("calendar")}
          className={cn(
            "min-h-[36px] min-w-[36px] flex items-center justify-center rounded-md transition-colors",
            tab === "calendar"
              ? "bg-paper text-info shadow-sm"
              : "text-ink-3 hover:text-ink hover:bg-paper/60",
          )}
          aria-label="عرض التقويم"
          title="تقويم الطلبات"
        >
          <CalendarDays className="w-4 h-4" />
        </button>
      </div>

      {/* زر طلب جديد */}
      <button
        type="button"
        onClick={handleShowCreate}
        className="min-h-[44px] px-4 py-2 rounded-md bg-info hover:bg-info/90 text-paper font-bold text-sm flex items-center gap-2 transition-colors"
      >
        <Plus className="w-4 h-4" />
        <span className="hidden sm:inline">طلب جديد</span>
      </button>
    </div>
  );

  const renderEditForm = () => {
    if (isLoadingEdit) return <SkeletonList count={3} />;
    if (isErrorEdit || !editOrder) {
      return (
        <ErrorState message="فشل تحميل السجل المراد تعديله" onRetry={refetchEdit} />
      );
    }
    return (
      <OrderForm
        initialData={editOrder}
        onSubmitSuccess={handleShowList}
        onCancel={handleShowList}
      />
    );
  };

  return (
    <>
      <AppShellHeader title={pageTitle} action={pageAction} />
      {isNew && (
        <OrderForm onSubmitSuccess={handleShowList} onCancel={handleShowList} />
      )}

      {!!editId && renderEditForm()}

      {!!viewId && (
        <OrderDetail
          orderId={viewId}
          onEdit={() => handleShowEdit({ id: viewId } as Order)}
          onBack={handleShowList}
        />
      )}

      {!isInSubView && tab === "calendar" && (
        <OrderCalendar
          onViewDetail={handleShowDetail}
          onCreateNew={handleShowCreate}
        />
      )}

      {!isInSubView && tab !== "calendar" && (
        <OrderList
          onEdit={handleShowEdit}
          onDelete={(order: Order) => navigateTo({ view: order.id })}
          onViewDetail={handleShowDetail}
          onCreateNew={handleShowCreate}
          onOpenComponents={() => setIsComponentsOpen(true)}
        />
      )}

      <ResponsiveModal
        isOpen={isComponentsOpen}
        onClose={() => setIsComponentsOpen(false)}
        title="إدارة المكوّنات"
      >
        <CatalogClient hideHeader={true} />
      </ResponsiveModal>
    </>
  );
}
