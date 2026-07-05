"use client";

import { Banknote, ShoppingCart, Wallet, Plus, Boxes } from "lucide-react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition, useState, useEffect } from "react";
import { AppShellHeader } from "@/providers/app-shell-context";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { SegmentedControl } from "@/components/shared/SegmentedControl";
import { PageToolbar, type ToolbarFilterGroup, type ToolbarMenuItem } from "@/components/shared/PageToolbar";
import { Button } from "@/components/shared/Button";
import { FinanceCatalogModal } from "@/features/finance/components/FinanceCatalogModal";

// استيراد تبويبات المالية ديناميكياً لتقسيم الحزم البرمجية (§12.1)
const PurchasesTab = dynamic(
  () =>
    import("@/features/finance/components/PurchasesTab").then(
      (m) => m.PurchasesTab,
    ),
  {
    ssr: false,
    loading: () => <SkeletonList count={3} />,
  },
);

const ExpensesTab = dynamic(
  () =>
    import("@/features/finance/components/ExpensesTab").then(
      (m) => m.ExpensesTab,
    ),
  {
    ssr: false,
    loading: () => <SkeletonList count={3} />,
  },
);

const SalesTab = dynamic(
  () =>
    import("@/features/finance/components/SalesTab").then((m) => m.SalesTab),
  {
    ssr: false,
    loading: () => <SkeletonList count={3} />,
  },
);

const EXPENSE_CATEGORIES = [
  "الكل",
  "رواتب",
  "إيجار",
  "كهرباء ومياه",
  "نقل وتوصيل",
  "تعبئة وتغليف",
  "صيانة وأدوات",
  "أخرى",
];

const SALE_SOURCES = [
  { value: "all", label: "الكل" },
  { value: "manual", label: "يدوي" },
  { value: "order", label: "طلب محوّل" },
];

export default function FinanceClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [_isPending, startTransition] = useTransition();

  // الحصول على التبويب النشط من محددات الـ URL (§7.3)
  const activeTab = searchParams.get("tab") || "purchases";

  const tabs = [
    { id: "purchases", label: "المشتريات", icon: ShoppingCart },
    { id: "expenses", label: "المصاريف", icon: Wallet },
    { id: "sales", label: "المبيعات", icon: Banknote },
  ];

  // حالة البحث والـ Debounce
  const currentQuery = searchParams.get("search") || "";
  const [searchInput, setSearchInput] = useState(currentQuery);

  // حالة مودال الكتالوج المرفوعة للأب
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);

  useEffect(() => {
    setSearchInput(currentQuery);
  }, [currentQuery]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput === currentQuery) return;
      const params = new URLSearchParams(searchParams.toString());
      if (searchInput) params.set("search", searchInput);
      else params.delete("search");
      router.replace(`${pathname}?${params.toString()}`);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput, currentQuery, pathname, router, searchParams]);

  const handleTabChange = (tabId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tabId);
    // إزالة فلاتر البحث وصفحات التعديل للتبويب الآخر عند التنقل
    params.delete("search");
    params.delete("category");
    params.delete("source");
    params.delete("newPurchase");
    params.delete("editPurchase");
    params.delete("newExpense");
    params.delete("editExpense");
    params.delete("newSale");
    params.delete("editSale");

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  // فلاتر ديناميكية حسب التبويب
  let filters: ToolbarFilterGroup[] | undefined = undefined;
  if (activeTab === "expenses") {
    filters = [
      {
        key: "category",
        label: "الفئة",
        value: searchParams.get("category") || "all",
        options: EXPENSE_CATEGORIES.map((cat) => ({
          value: cat === "الكل" ? "all" : cat,
          label: cat,
        })),
        onChange: (val) => {
          const params = new URLSearchParams(searchParams.toString());
          if (val === "all") params.delete("category");
          else params.set("category", val);
          router.replace(`${pathname}?${params.toString()}`);
        },
      },
    ];
  } else if (activeTab === "sales") {
    filters = [
      {
        key: "source",
        label: "المصدر",
        value: searchParams.get("source") || "all",
        options: SALE_SOURCES,
        onChange: (val) => {
          const params = new URLSearchParams(searchParams.toString());
          if (val === "all") params.delete("source");
          else params.set("source", val);
          router.replace(`${pathname}?${params.toString()}`);
        },
      },
    ];
  }

  // إجراءات ثانوية للمنيو المنسدل (إدارة الأصناف/الفئات — للمشتريات والمصاريف فقط)
  let menuItems: ToolbarMenuItem[] | undefined = undefined;
  if (activeTab === "purchases") {
    menuItems = [
      {
        key: "catalog",
        label: "إدارة أصناف المشتريات",
        icon: <Boxes className="w-5 h-5" />,
        onClick: () => setIsCatalogOpen(true),
      },
    ];
  } else if (activeTab === "expenses") {
    menuItems = [
      {
        key: "catalog",
        label: "إدارة فئات المصاريف",
        icon: <Boxes className="w-5 h-5" />,
        onClick: () => setIsCatalogOpen(true),
      },
    ];
  }

  // الإجراء الأساسي المربّع (+)
  const getTrailingAction = () => {
    let label = "مشتريات جديدة";
    let queryParam = "newPurchase";
    if (activeTab === "expenses") {
      label = "مصروف جديد";
      queryParam = "newExpense";
    } else if (activeTab === "sales") {
      label = "مبيعات جديدة";
      queryParam = "newSale";
    }

    return (
      <Button
        onClick={() => {
          const params = new URLSearchParams(searchParams.toString());
          params.set(queryParam, "true");
          router.replace(`${pathname}?${params.toString()}`);
        }}
        size="icon"
        aria-label={label}
        title={label}
      >
        <Plus className="w-5 h-5" />
      </Button>
    );
  };

  const pageAction = (
    <PageToolbar
      leading={
        <SegmentedControl
          value={activeTab}
          onChange={handleTabChange}
          compact
          options={tabs.map((t) => ({
            value: t.id,
            label: "", // أيقونات فقط لتفادي القص على الموبايل
            icon: <t.icon className="h-5 w-5 shrink-0" />,
          }))}
          className="shrink-0 gap-0.5"
        />
      }
      search={{
        value: searchInput,
        onChange: setSearchInput,
        placeholder:
          activeTab === "purchases"
            ? "البحث في المشتريات..."
            : activeTab === "expenses"
            ? "البحث في المصاريف..."
            : "البحث في بيان المبيعات...",
      }}
      filters={filters}
      menuItems={menuItems}
      reserveFilterSpace
      reserveMenuSpace
      trailing={getTrailingAction()}
    />
  );

  return (
    <>
      <AppShellHeader title="" action={pageAction} />
      <div className="flex-1 flex flex-col gap-6">
        {/* محتوى التبويب النشط */}
        <div className="flex-1 flex flex-col">
          {activeTab === "purchases" && <PurchasesTab />}
          {activeTab === "expenses" && <ExpensesTab />}
          {activeTab === "sales" && <SalesTab />}
        </div>
      </div>

      {isCatalogOpen && (activeTab === "purchases" || activeTab === "expenses") && (
        <FinanceCatalogModal
          isOpen={isCatalogOpen}
          onClose={() => setIsCatalogOpen(false)}
          type={activeTab as "purchases" | "expenses"}
        />
      )}
    </>
  );
}
