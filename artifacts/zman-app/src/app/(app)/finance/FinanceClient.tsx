"use client";

import { Banknote, ShoppingCart, Wallet, Plus, Landmark, User, Settings, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition, useState, useEffect, useCallback, useRef } from "react";
import { AppShellHeader } from "@/providers/app-shell-context";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { Button } from "@/components/shared/Button";
import { FinanceCatalogModal } from "@/features/finance/components/FinanceCatalogModal";
import { useOpeningBalance } from "@/features/finance/hooks";
import { cn } from "@/lib/utils";
import { PageToolbar } from "@/components/shared/PageToolbar";

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

/* ─── أنواع التبويبات ─── */
const TABS = [
  { id: "purchases", label: "المشتريات", icon: ShoppingCart },
  { id: "expenses", label: "المصاريف", icon: Wallet },
  { id: "sales", label: "المبيعات", icon: Banknote },
  { id: "accounts", label: "الحسابات", icon: Landmark },
  { id: "owner", label: "المصاريف الشخصية", icon: User },
  { id: "opening", label: "الافتتاحي", icon: Settings },
] as const;



export default function FinanceClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [_isPending, startTransition] = useTransition();

  // التبويب الافتراضي هو المشتريات دائماً
  const { isLoading: opBalLoading } = useOpeningBalance();
  const activeTab = searchParams.get("tab") || "purchases";
  const isReady = !opBalLoading || searchParams.has("tab");

  // حالة البحث
  const currentQuery = searchParams.get("search") || "";
  const [searchInput, setSearchInput] = useState(currentQuery);

  // حالة مودال الكتالوج
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [catalogType, setCatalogType] = useState<"purchases" | "expenses">("purchases");

  // مزامنة البحث مع URL
  useEffect(() => { setSearchInput(currentQuery); }, [currentQuery]);

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

  /* ─── تبديل التبويبات ─── */
  const handleTabChange = useCallback((tabId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tabId);
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
  }, [searchParams, pathname, router, startTransition]);

  /* ─── حساب المتغيرات المشتقة للكتالوج ─── */
  const manageCatalogParam = searchParams.get("manageCatalog");
  const showCatalog = isCatalogOpen || !!manageCatalogParam;
  const resolvedCatalogType = (manageCatalogParam as "purchases" | "expenses") || catalogType;

  const handleCloseCatalog = () => {
    setIsCatalogOpen(false);
    if (searchParams.has("manageCatalog")) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("manageCatalog");
      router.replace(`${pathname}?${params.toString()}`);
    }
  };

  const isActionableTab = activeTab !== "opening";
  const hasSearch = activeTab === "purchases" || activeTab === "expenses" || activeTab === "sales";

  // فلاتر ديناميكية حسب التبويب
  const filters = activeTab === "expenses" ? [{
    key: "category",
    label: "الفئة",
    value: searchParams.get("category") || "all",
    options: EXPENSE_CATEGORIES.map((cat) => ({
      value: cat === "الكل" ? "all" : cat,
      label: cat,
    })),
    onChange: (val: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (val === "all") params.delete("category");
      else params.set("category", val);
      router.replace(`${pathname}?${params.toString()}`);
    },
  }] : activeTab === "sales" ? [{
    key: "source",
    label: "المصدر",
    value: searchParams.get("source") || "all",
    options: SALE_SOURCES,
    onChange: (val: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (val === "all") params.delete("source");
      else params.set("source", val);
      router.replace(`${pathname}?${params.toString()}`);
    },
  }] : null;

  /* ─── الإجراء الأساسي (+) ─── */
  const handleAdd = useCallback(() => {
    const paramMap: Record<string, string> = {
      purchases: "newPurchase", expenses: "newExpense", sales: "newSale",
      accounts: "newAccount", owner: "newOwnerTx",
    };
    const queryParam = paramMap[activeTab];
    if (!queryParam) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set(queryParam, "true");
    router.replace(`${pathname}?${params.toString()}`);
  }, [activeTab, searchParams, pathname, router]);

  const addLabel: Record<string, string> = {
    purchases: "مشتريات جديدة", expenses: "مصروف جديد", sales: "مبيعات جديدة",
    accounts: "حساب جديد", owner: "معاملة مالك جديدة",
  };

  /* ─── التقديم ─── */
  return (
    <>
      <AppShellHeader
        title=""
        action={
          <PageToolbar
            search={
              hasSearch
                ? {
                    value: searchInput,
                    onChange: setSearchInput,
                    placeholder:
                      activeTab === "purchases"
                        ? "البحث في المشتريات..."
                        : activeTab === "expenses"
                          ? "البحث في المصاريف..."
                          : "البحث في بيان المبيعات...",
                  }
                : undefined
            }
            reserveSearchSpace={true}
            filters={filters || undefined}
            reserveFilterSpace={true}
            reserveMenuSpace={false}
            trailing={
              isActionableTab ? (
                <Button
                  onClick={handleAdd}
                  size="icon"
                  className="lg:w-auto lg:min-w-0 lg:px-4 lg:py-2 lg:gap-2 flex items-center justify-center font-bold"
                  aria-label={addLabel[activeTab] ?? ""}
                  title={addLabel[activeTab] ?? ""}
                >
                  <Plus className="w-5 h-5 shrink-0" />
                  <span className="hidden lg:inline text-sm font-bold whitespace-nowrap">
                    {addLabel[activeTab]}
                  </span>
                </Button>
              ) : (
                <span className="w-11 h-11 shrink-0" aria-hidden="true" />
              )
            }
          />
        }
      />

      {/* صف التبويبات المستقل — عرض كامل بلا قصّ، كل تبويب حصة متساوية */}
      <div className="flex items-stretch border-b border-hairline -mx-4 px-1 sm:mx-0 sm:px-0">
        {[
          TABS.find((t) => t.id === "purchases")!,
          TABS.find((t) => t.id === "expenses")!,
          TABS.find((t) => t.id === "owner")!,
          TABS.find((t) => t.id === "sales")!,
        ].map((tab) => {
          const isActive = tab.id === activeTab;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              title={tab.label}
              aria-label={tab.label}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-1 min-h-[52px] px-1 border-b-2 -mb-px transition-colors",
                isActive
                  ? "border-info text-info font-bold"
                  : "border-transparent text-ink-3 hover:text-ink",
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="text-[11px] font-semibold whitespace-nowrap">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 flex flex-col gap-6 pt-4">
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

      {showCatalog && (
        <FinanceCatalogModal
          isOpen={showCatalog}
          onClose={handleCloseCatalog}
          type={resolvedCatalogType}
        />
      )}
    </>
  );
}
