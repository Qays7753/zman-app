"use client";

import { useState } from "react";
import { AlertTriangle, ArrowUpDown, Package, PackageMinus, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShellHeader } from "@/providers/app-shell-context";
import { PageToolbar } from "@/components/shared/PageToolbar";
import { HeaderIconButton } from "@/components/shared/HeaderIconButton";
import { AmountText } from "@/components/shared/AmountText";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { ErrorState } from "@/components/shared/ErrorState";
import { EmptyState } from "@/components/shared/EmptyState";
import { FloatingActionButton } from "@/components/shared/FloatingActionButton";
import { ResponsiveModal } from "@/components/shared/ResponsiveModal";
import { cn } from "@/lib/utils";
import { useInventoryValuation } from "./hooks";
import { AddTrackedItemForm } from "./components/AddTrackedItemForm";
import { QuickAdjustStockForm } from "./components/QuickAdjustStockForm";

type SortKey = "alpha" | "lowest" | "highest";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "alpha", label: "أبجدي" },
  { key: "lowest", label: "أقل رصيداً" },
  { key: "highest", label: "أعلى قيمة" },
];

export function InventoryScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sort, setSort] = useState<SortKey>("alpha");
  const [isFabOpen, setIsFabOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [isQuickAdjustOpen, setIsQuickAdjustOpen] = useState(false);
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const { data, isLoading, isError, refetch } = useInventoryValuation();

  const items = data?.items ?? [];

  const lowStockItems = items.filter((i) => i.lowStock);
  const lowStockOnly = searchParams.get("filter") === "low-stock";
  const visibleItems = lowStockOnly ? lowStockItems : items;

  const sorted = [...visibleItems].sort((a, b) => {
    if (sort === "alpha") return a.name.localeCompare(b.name, "ar");
    if (sort === "lowest") return a.balance - b.balance;
    if (sort === "highest") return b.bookValueCents - a.bookValueCents;
    return 0;
  });

  const selectedSortLabel =
    SORT_OPTIONS.find((option) => option.key === sort)?.label ?? "أبجدي";

  return (
    <>
      <AppShellHeader
        title="المخزون"
        action={
          <PageToolbar
            filterSlot={
              <>
                <HeaderIconButton
                  label={`ترتيب المخزون: ${selectedSortLabel}`}
                  isActive={sort !== "alpha"}
                  onClick={() => setIsSortOpen(true)}
                >
                  <ArrowUpDown className="w-5 h-5" />
                </HeaderIconButton>
                <ResponsiveModal
                  isOpen={isSortOpen}
                  onClose={() => setIsSortOpen(false)}
                  title="ترتيب المخزون"
                >
                  <div className="flex flex-col gap-1">
                    {SORT_OPTIONS.map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => {
                          setSort(opt.key);
                          setIsSortOpen(false);
                        }}
                        className={cn(
                          "min-h-[56px] flex items-center justify-between gap-3 px-4 rounded-lg text-start text-sm font-bold transition-colors",
                          sort === opt.key
                            ? "bg-brand-soft text-brand-deep"
                            : "text-ink hover:bg-canvas",
                        )}
                      >
                        <span>{opt.label}</span>
                        {sort === opt.key && <span aria-hidden="true">✓</span>}
                      </button>
                    ))}
                  </div>
                </ResponsiveModal>
              </>
            }
          />
        }
      />

      <div className="lg:pb-0">
      {/* تنبيه الرصيد المنخفض */}
      {!isLoading && lowStockItems.length > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-xl bg-warn-soft border border-warn/20 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-warn-deep mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-warn-deep">
              {lowStockItems.length === 1
                ? "صنف واحد نفد رصيده"
                : `${lowStockItems.length} أصناف نفد رصيدها`}
            </p>
            <p className="text-xs text-warn-deep/80 mt-0.5">
              {lowStockItems.map((i) => i.name).join("، ")}
            </p>
          </div>
        </div>
      )}

      {/* إحصائيات سريعة */}
      {!isLoading && data && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-xl bg-paper border border-hairline px-4 py-3">
            <p className="text-xs text-ink-3 mb-1">إجمالي الأصناف</p>
            <p className="text-2xl font-bold text-ink">{data.totalCatalogs}</p>
          </div>
          <div className="rounded-xl bg-paper border border-hairline px-4 py-3">
            <p className="text-xs text-ink-3 mb-1">القيمة الدفترية</p>
            <p className="text-lg font-bold text-ink">
              <AmountText amount={data.totalBookValueCents} />
            </p>
          </div>
        </div>
      )}

      {lowStockOnly && !isLoading && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3">
          <p className="text-xs font-semibold text-warn-deep">عرض الأصناف منخفضة الرصيد فقط</p>
          <button
            type="button"
            onClick={() => router.replace("/inventory")}
            className="min-h-12 px-3 rounded-lg border border-warn/30 bg-paper text-sm font-bold text-warn-deep focus-visible:ring-2 focus-visible:ring-warn-deep focus-visible:ring-offset-2"
          >
            عرض الكل
          </button>
        </div>
      )}



      {/* الحالات */}
      {isLoading && <SkeletonList count={5} />}
      {isError && (
        <ErrorState
          message="تعذّر تحميل بيانات المخزون. حاول مجدداً."
          onRetry={() => refetch()}
        />
      )}

      {/* القائمة */}
      {!isLoading && !isError && sorted.length === 0 && (
        <EmptyState
          title={lowStockOnly ? "لا توجد أصناف منخفضة الرصيد" : "لا يوجد مخزون متتبَّع حتى الآن"}
          description={lowStockOnly ? "كل الأصناف المتتبَّعة ضمن الرصيد المتاح حالياً." : "تتبع كميات وقيم خامات الورشة لمنع النفاد واحتساب القيمة الدفترية."}
          steps={[
            "اذهب إلى شاشة الكتالوج الخاصة بالخامات",
            "اختر الصنف المراد تتبعه وفعّل خيار (تتبع المخزون)",
            "حدد الكمية المتوفرة حالياً وسعر الشراء"
          ]}
          actionLabel="الانتقال إلى الكتالوج"
          onAction={() => router.push("/catalog")}
        />
      )}

      {!isLoading && !isError && sorted.length > 0 && (
        <div className="flex flex-col gap-2">
          {sorted.map((item) => (
            <div
              key={item.catalogComponentId}
              className={cn(
                "bg-paper rounded-xl border px-4 py-3 flex items-center justify-between gap-3",
                item.lowStock ? "border-warn/30 bg-warn-soft/30" : "border-hairline",
              )}
            >
              {/* الاسم + الوحدة */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-ink truncate">{item.name}</p>
                  {item.lowStock && (
                    <span className="flex-shrink-0 text-[10px] font-bold text-warn-deep bg-warn/10 px-1.5 py-0.5 rounded-full">
                      نفد
                    </span>
                  )}
                </div>
                <p className="text-xs text-ink-3 mt-0.5">
                  القيمة الدفترية:{" "}
                  <span className="text-ink-2 font-medium">
                    <AmountText amount={item.bookValueCents} />
                  </span>
                </p>
              </div>

              {/* الرصيد */}
              <div className="text-end flex-shrink-0">
                <p
                  className={cn(
                    "text-xl font-bold tabular-nums",
                    item.lowStock ? "text-warn-deep" : item.balance > 0 ? "text-ink" : "text-ink-3",
                  )}
                >
                  {item.balance}
                </p>
                <p className="text-[11px] text-ink-3">{item.unit}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      </div>

      {/* ═══ Issue #2 — FAB إجراءات المخزون ═══ */}
      <FloatingActionButton
        onClick={() => setIsFabOpen(true)}
        label="إجراءات المخزون"
      />

      {/* المودال الرئيسي: قائمة الإجراءات */}
      <ResponsiveModal
        isOpen={isFabOpen}
        onClose={() => setIsFabOpen(false)}
        title="إجراءات المخزون"
      >
        <div className="grid grid-cols-1 gap-2">
          <button
            type="button"
            onClick={() => {
              setIsFabOpen(false);
              setIsAddItemOpen(true);
            }}
            className="flex items-center gap-3 p-4 rounded-lg border border-hairline hover:border-ink/20 hover:bg-canvas transition-colors min-h-16 text-start focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <Plus className="w-5 h-5 text-brand-deep shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-ink">إضافة صنف مُتابَع</p>
              <p className="text-xs text-ink-3">إنشاء صنف جديد في الكتالوج وتفعيل تتبّع المخزون</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => {
              setIsFabOpen(false);
              setIsQuickAdjustOpen(true);
            }}
            className="flex items-center gap-3 p-4 rounded-lg border border-hairline hover:border-ink/20 hover:bg-canvas transition-colors min-h-16 text-start focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <PackageMinus className="w-5 h-5 text-ink-2 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-ink">تعديل سريع للمخزون</p>
              <p className="text-xs text-ink-3">صرف أو إضافة يدوية لصنف متتبَّع موجود</p>
            </div>
          </button>
          <Link
            href="/catalog"
            onClick={() => setIsFabOpen(false)}
            className="flex items-center gap-3 p-4 rounded-lg border border-hairline hover:border-ink/20 hover:bg-canvas transition-colors min-h-[60px]"
          >
            <Package className="w-5 h-5 text-ink-3 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-ink">إدارة الكتالوج الكامل</p>
              <p className="text-xs text-ink-3">عرض وتعديل كل أصناف الكتالوج (متتبَّعة وغير متتبَّعة)</p>
            </div>
          </Link>
        </div>
      </ResponsiveModal>

      {/* مودال: إضافة صنف متتبَّع جديد */}
      <ResponsiveModal
        isOpen={isAddItemOpen}
        onClose={() => setIsAddItemOpen(false)}
        title="إضافة صنف مُتابَع"
      >
        <AddTrackedItemForm onDone={() => setIsAddItemOpen(false)} />
      </ResponsiveModal>

      {/* مودال: تعديل سريع للمخزون */}
      <ResponsiveModal
        isOpen={isQuickAdjustOpen}
        onClose={() => setIsQuickAdjustOpen(false)}
        title="تعديل سريع للمخزون"
      >
        <QuickAdjustStockForm
          items={items.map((i) => ({
            catalogComponentId: i.catalogComponentId,
            name: i.name,
            unit: i.unit,
            balance: i.balance,
          }))}
          onDone={() => setIsQuickAdjustOpen(false)}
        />
      </ResponsiveModal>
    </>
  );
}
