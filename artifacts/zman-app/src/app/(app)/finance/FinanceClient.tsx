"use client";

import { Banknote, ShoppingCart, Wallet, Plus, User, Settings, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition, useState, useEffect, useCallback, useRef } from "react";
import { AppShellHeader } from "@/providers/app-shell-context";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { Button } from "@/components/shared/Button";
import { FinanceCatalogModal } from "@/features/finance/components/FinanceCatalogModal";
import { useOpeningBalance } from "@/features/finance/hooks";
import { cn } from "@/lib/utils";
import { HeaderIconButton } from "@/components/shared/HeaderIconButton";
import { PageToolbar } from "@/components/shared/PageToolbar";
import { FloatingActionButton } from "@/components/shared/FloatingActionButton";

// ─── استيراد تبويبات العمليات اليومية ديناميكياً ───
const PaymentsTab = dynamic(
  () =>
    import("@/features/finance/components/PaymentsTab").then(
      (m) => m.PaymentsTab,
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
    import("@/features/finance/components/AccountsTab").then(
      (m) => m.AccountsTab,
    ),
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

/* ─── أنواع التبويبات اليومية ─── */
// تبويبان رئيسيان للمالك: مدفوعاتي (مصاريف + مشتريات) · مبيعاتي
const TABS = [
  { id: "payments", label: "مدفوعاتي", icon: Wallet },
  { id: "sales", label: "مبيعاتي", icon: Banknote },
] as const;

export default function FinanceClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [_isPending, startTransition] = useTransition();

  const { isLoading: opBalLoading } = useOpeningBalance();
  const rawTab = searchParams.get("tab");

  // دعم التوافق العكسي للروابط القديمة
  const activeTab =
    rawTab === "expenses" || rawTab === "purchases" || rawTab === "payments"
      ? "payments"
      : rawTab || "sales";

  const isReady = !opBalLoading || searchParams.has("tab");

  // توجيه تلقائي للروابط القديمة مع ضبط الرقاقة المناسبة
  useEffect(() => {
    if (rawTab === "expenses" || rawTab === "purchases") {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", "payments");
      if (!params.has("filter")) {
        params.set("filter", rawTab === "expenses" ? "expense" : "purchase");
      }
      router.replace(`${pathname}?${params.toString()}`);
    }
  }, [rawTab, pathname, router, searchParams]);

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
    params.delete("filter");
    params.delete("newPayment");
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

  // فلاتر ديناميكية حسب التبويب والرقاقة
  const currentFilter = searchParams.get("filter");
  const filters = (activeTab === "payments" && currentFilter === "expense") ? [{
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
  }] : activeTab === "accounts" ? [{
    key: "type",
    label: "النوع",
    value: searchParams.get("type") || "all",
    options: [
      { value: "all", label: "الكل" },
      { value: "draw", label: "مسحوبات شخصية" },
      { value: "inject", label: "حقن رأس مال" },
    ],
    onChange: (val: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (val === "all") params.delete("type");
      else params.set("type", val);
      router.replace(`${pathname}?${params.toString()}`);
    },
  }] : null;

  /* ─── الإجراء الأساسي (+) ─── */
  const handleAdd = useCallback(() => {
    const paramMap: Record<string, string> = {
      payments: "newPayment",
      expenses: "newPayment",
      purchases: "newPayment",
      sales: "newSale",
      accounts: "newAccount",
      owner: "newOwnerTx",
    };
    const queryParam = paramMap[activeTab];
    if (!queryParam) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set(queryParam, "true");
    router.replace(`${pathname}?${params.toString()}`);
  }, [activeTab, searchParams, pathname, router]);

  const addLabel: Record<string, string> = {
    payments: "تسجيل جديد",
    expenses: "تسجيل جديد",
    purchases: "تسجيل جديد",
    sales: "مبيعات جديدة",
    accounts: "حساب جديد",
    owner: "معاملة مالك جديدة",
  };

  /* ─── التقديم ─── */
  return (
    <>
      <AppShellHeader
        title=""
        action={
          <PageToolbar
            leading={
              <div className="flex items-center gap-0.5">
                {TABS.map((tab) => {
                  const isActive = tab.id === activeTab;
                  const Icon = tab.icon;
                  return (
                    <HeaderIconButton
                      key={tab.id}
                      label={tab.label}
                      isActive={isActive}
                      variant="tab"
                      onClick={() => handleTabChange(tab.id)}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                    </HeaderIconButton>
                  );
                })}
              </div>
            }
            search={{
              value: searchInput,
              onChange: setSearchInput,
              placeholder:
                activeTab === "payments"
                  ? "البحث في المدفوعات (مصاريف، مشتريات)..."
                  : activeTab === "sales"
                    ? "البحث في بيان المبيعات..."
                    : "البحث...",
            }}
            filters={filters || undefined}
          />
        }
      />

      <div className="flex-1 flex flex-col gap-6 pt-4">
        <div className="flex-1 flex flex-col">
          {!isReady ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-info" />
            </div>
          ) : (
            <>
              {activeTab === "payments" && <PaymentsTab />}
              {activeTab === "sales" && <SalesTab />}
              {activeTab === "accounts" && (
                <div className="space-y-8 flex flex-col">
                  <AccountsTab />
                  <OwnerTab />
                </div>
              )}
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
      {isActionableTab && (
        <FloatingActionButton
          onClick={handleAdd}
          label={addLabel[activeTab] || "تسجيل جديد"}
        />
      )}
    </>
  );
}
