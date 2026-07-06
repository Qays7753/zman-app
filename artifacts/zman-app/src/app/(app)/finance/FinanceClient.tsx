"use client";

import { Banknote, ShoppingCart, Wallet, Plus, Boxes, Landmark, User, Settings, ArrowLeftRight, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition, useState, useEffect, useCallback, useMemo } from "react";
import { AppShellHeader } from "@/providers/app-shell-context";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { SegmentedControl } from "@/components/shared/SegmentedControl";
import { PageToolbar, type ToolbarFilterGroup, type ToolbarMenuItem } from "@/components/shared/PageToolbar";
import { Button } from "@/components/shared/Button";
import { FinanceCatalogModal } from "@/features/finance/components/FinanceCatalogModal";
import { useOpeningBalance } from "@/features/finance/hooks";

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

const AccountsTab = dynamic(
  () =>
    import("@/features/finance/components/AccountsTab").then((m) => m.AccountsTab),
  {
    ssr: false,
    loading: () => <SkeletonList count={3} />,
  },
);

const OwnerTab = dynamic(
  () =>
    import("@/features/finance/components/OwnerTab").then((m) => m.OwnerTab),
  {
    ssr: false,
    loading: () => <SkeletonList count={3} />,
  },
);

const OpeningTab = dynamic(
  () =>
    import("@/features/finance/components/OpeningTab").then((m) => m.OpeningTab),
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
  // التقصير ذكي: افتح على الافتتاحي أولاً إذا لم تُدخل أي أرصدة بعد لتوجيه المستخدم
  const { data: opBal, isLoading: opBalLoading } = useOpeningBalance();
  // لا نقرّر "opening" إلا بعد اكتمال التحميل (يمنع وميض purchases→opening)
  const defaultTab = !opBalLoading && opBal === null ? "opening" : "purchases";
  const activeTab = searchParams.get("tab") || defaultTab;
  const isReady = !opBalLoading || searchParams.has("tab");

  const tabs = [
    { id: "purchases", label: "المشتريات", icon: ShoppingCart },
    { id: "expenses", label: "المصاريف", icon: Wallet },
    { id: "sales", label: "المبيعات", icon: Banknote },
    { id: "accounts", label: "الحسابات", icon: Landmark },
    { id: "owner", label: "المالك", icon: User },
    { id: "opening", label: "الافتتاحي", icon: Settings },
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

  const handleTabChange = useCallback((tabId: string) => {
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
  }, [searchParams, pathname, router]);

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
  } else if (activeTab === "accounts") {
    menuItems = [
      {
        key: "transfer",
        label: "تحويل بيني",
        icon: <ArrowLeftRight className="w-5 h-5" />,
        onClick: () => {
          const params = new URLSearchParams(searchParams.toString());
          params.set("newTransfer", "true");
          router.replace(`${pathname}?${params.toString()}`);
        },
      },
    ];
  }

  // الإجراء الأساسي المربّع (+)
  const getTrailingAction = useCallback(() => {
    let label = "مشتريات جديدة";
    let queryParam = "newPurchase";
    if (activeTab === "expenses") {
      label = "مصروف جديد";
      queryParam = "newExpense";
    } else if (activeTab === "sales") {
      label = "مبيعات جديدة";
      queryParam = "newSale";
    } else if (activeTab === "accounts") {
      label = "حساب جديد";
      queryParam = "newAccount";
    } else if (activeTab === "owner") {
      label = "معاملة مالك جديدة";
      queryParam = "newOwnerTx";
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
  }, [activeTab, searchParams, pathname, router]);

  const isActionableTab = activeTab === "purchases" || activeTab === "expenses" || activeTab === "sales" || activeTab === "accounts" || activeTab === "owner";
  const hasSearch = activeTab === "purchases" || activeTab === "expenses" || activeTab === "sales";

  const pageAction = useMemo(() => (
    <PageToolbar
      leading={
        <div className="overflow-x-auto no-scrollbar -mx-1 px-1">
          <SegmentedControl
            value={activeTab}
            onChange={handleTabChange}
            compact
            options={tabs.map((t) => ({
              value: t.id,
              label: "", // أبقِ label: "" (أيقونات فقط، قرار المالك)
              icon: <t.icon className="h-5 w-5 shrink-0" />,
            }))}
            className="shrink-0 gap-0.5"
          />
        </div>
      }
      search={hasSearch ? {
        value: searchInput,
        onChange: setSearchInput,
        placeholder:
          activeTab === "purchases"
            ? "البحث في المشتريات..."
            : activeTab === "expenses"
            ? "البحث في المصاريف..."
            : "البحث في بيان المبيعات...",
      } : undefined}
      filters={hasSearch ? filters : undefined}
      menuItems={menuItems}
      // حجز مساحة البحث/الفلتر/الإعدادات دائماً (في كل التبويبات) ليبقى
      // شكل الهيدر ثابتاً ولا تقفز الأزرار عند التنقّل بين التبويبات
      reserveSearchSpace
      reserveFilterSpace
      reserveMenuSpace
      trailing={isActionableTab ? getTrailingAction() : undefined}
    />
  ), [activeTab, handleTabChange, hasSearch, searchInput, filters, menuItems, isActionableTab, getTrailingAction]);

  return (
    <>
      <AppShellHeader title="" action={pageAction} />
      <div className="flex-1 flex flex-col gap-6">
        {/* محتوى التبويب النشط */}
        <div className="flex-1 flex flex-col">
          {!isReady ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-info" />
            </div>
          ) : (
            <>
              {activeTab === "purchases" && <PurchasesTab />}
              {activeTab === "expenses" && <ExpensesTab />}
              {activeTab === "sales" && <SalesTab />}
              {activeTab === "accounts" && <AccountsTab />}
              {activeTab === "owner" && <OwnerTab />}
              {activeTab === "opening" && <OpeningTab />}
            </>
          )}
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
