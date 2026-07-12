"use client";

import { Boxes, CalendarDays, LayoutList, MessageSquare, Plus } from "lucide-react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useCallback, useMemo } from "react";
import { AppShellHeader } from "@/providers/app-shell-context";
import { ErrorState } from "@/components/shared/ErrorState";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { Button } from "@/components/shared/Button";
import { HeaderIconButton } from "@/components/shared/HeaderIconButton";
import { PageToolbar } from "@/components/shared/PageToolbar";
import { FloatingActionButton } from "@/components/shared/FloatingActionButton";
import { StatusFilterSheet } from "@/features/orders/components/StatusFilterSheet";
import { useOrder, useOrderStatusCounts } from "@/features/orders/hooks";
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

const WhatsAppTemplateEditor = dynamic(
  () =>
    import("@/features/orders/components/WhatsAppTemplateEditor").then(
      (m) => m.WhatsAppTemplateEditor,
    ),
  { ssr: false, loading: () => <SkeletonList count={3} /> },
);

export default function OrdersClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const viewId = searchParams.get("view");
  const editId = searchParams.get("edit");
  const isNew = searchParams.get("new") === "true";
  const tab = searchParams.get("tab") ?? "list";
  const currentStatus = searchParams.get("status") || "all";
  const currentQuery = searchParams.get("q") || "";
  const currentSort = searchParams.get("sort") || "newest";
  const { data: statusCounts } = useOrderStatusCounts();
  const [isComponentsOpen, setIsComponentsOpen] = useState(false);
  const [isTemplateOpen, setIsTemplateOpen] = useState(false);

  // بحث محلي مع debounce يكتب q في الـ URL (يقرأه العرضان: قائمة/تقويم)
  const [searchInput, setSearchInput] = useState(currentQuery);
  useEffect(() => {
    setSearchInput(currentQuery);
  }, [currentQuery]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput === currentQuery) return;
      const params = new URLSearchParams(searchParams.toString());
      if (searchInput) params.set("q", searchInput);
      else params.delete("q");
      params.delete("cursor");
      router.replace(`${pathname}?${params.toString()}`);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput, currentQuery, pathname, router, searchParams]);

  const setStatusFilter = (status: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (status === "all") params.delete("status");
    else params.set("status", status);
    params.delete("cursor");
    router.replace(`${pathname}?${params.toString()}`);
  };

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

  const handleShowList = useCallback(() => navigateTo({}), [searchParams, pathname, router]);
  const handleShowDetail = useCallback((order: Order) => navigateTo({ view: order.id }), [searchParams, pathname, router]);
  const handleShowEdit = useCallback((order: Order) => navigateTo({ edit: order.id }), [searchParams, pathname, router]);
  const handleShowCreate = useCallback(() => navigateTo({ new: "true" }), [searchParams, pathname, router]);

  const setTab = useCallback((t: "list" | "calendar") => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("view");
    params.delete("edit");
    params.delete("new");
    if (t === "list") params.delete("tab");
    else params.set("tab", t);
    router.push(`${pathname}?${params.toString()}`);
  }, [searchParams, pathname, router]);

  const isInSubView = isNew || !!editId || !!viewId;

  // لا عنوان للعرض الرئيسي (القائمة/التقويم) — يوفّر مساحة للأزرار.
  // نُبقيه فقط في الشاشات الفرعية كسياق (إنشاء/تعديل/تفاصيل).
  let pageTitle = "";
  if (isNew) pageTitle = "إنشاء طلب جديد";
  else if (editId) pageTitle = "تعديل بيانات الطلب";
  else if (viewId) pageTitle = "تفاصيل الطلب";

  const pageAction: React.ReactNode = useMemo(() => {
    if (isInSubView) return null;
    return (
      <PageToolbar
        leading={
          <HeaderIconButton
            label={tab === "calendar" ? "عرض القائمة" : "عرض التقويم"}
            onClick={() => setTab(tab === "calendar" ? "list" : "calendar")}
          >
            {tab === "calendar" ? (
              <LayoutList className="w-5 h-5" />
            ) : (
              <CalendarDays className="w-5 h-5" />
            )}
          </HeaderIconButton>
        }
        search={{
          value: searchInput,
          onChange: setSearchInput,
          placeholder: "ابحث باسم العميل أو المنتج...",
        }}
        filterSlot={
          <StatusFilterSheet
            value={currentStatus}
            counts={statusCounts ?? {}}
            onChange={setStatusFilter}
            sort={currentSort}
            onSortChange={(sortVal) => {
              const params = new URLSearchParams(searchParams.toString());
              if (sortVal === "newest") params.delete("sort");
              else params.set("sort", sortVal);
              params.delete("cursor");
              router.replace(`${pathname}?${params.toString()}`);
            }}
          />
        }
        menuItems={[
          {
            key: "upcoming",
            label: "طلبات قرب تسليمها (7 أيام)",
            icon: <CalendarDays className="w-5 h-5 text-info" />,
            onClick: () => {
              const params = new URLSearchParams(searchParams.toString());
              params.set("sort", "delivery");
              params.set("status", "all");
              params.delete("cursor");
              router.replace(`${pathname}?${params.toString()}`);
            },
          },
          {
            key: "template",
            label: "قالب رسالة واتساب",
            icon: <MessageSquare className="w-5 h-5 text-info" />,
            onClick: () => setIsTemplateOpen(true),
          },
          {
            key: "components",
            label: "إدارة المكوّنات",
            icon: <Boxes className="w-5 h-5" />,
            onClick: () => setIsComponentsOpen(true),
          },
        ]}
      />
    );
  }, [
    isInSubView,
    tab,
    setTab,
    searchInput,
    setSearchInput,
    currentStatus,
    statusCounts,
    setStatusFilter,
    currentSort,
    searchParams,
    pathname,
    router,
  ]);

  const renderEditForm = () => {
    if (isLoadingEdit) return <SkeletonList count={3} />;
    if (isErrorEdit || !editOrder) {
      return (
        <ErrorState message="فشل تحميل السجل المراد تعديله" onRetry={refetchEdit} />
      );
    }
    return (
      <OrderForm
        key={editId}
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
        />
      )}

      <ResponsiveModal
        isOpen={isComponentsOpen}
        onClose={() => setIsComponentsOpen(false)}
        title="إدارة المكوّنات"
      >
        <CatalogClient hideHeader={true} />
      </ResponsiveModal>

      <ResponsiveModal
        isOpen={isTemplateOpen}
        onClose={() => setIsTemplateOpen(false)}
        title="تعديل قالب رسالة WhatsApp"
      >
        <WhatsAppTemplateEditor onClose={() => setIsTemplateOpen(false)} />
      </ResponsiveModal>

      {!isInSubView && (
        <FloatingActionButton
          onClick={handleShowCreate}
          label="طلب جديد"
        />
      )}
    </>
  );
}
