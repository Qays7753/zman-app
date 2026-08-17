"use client";

import { Plus, Trash2, PackageCheck, History, PackageMinus, AlertTriangle, MoreVertical, Pencil } from "lucide-react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { toast } from "sonner";
import { AppShellHeader } from "@/providers/app-shell-context";
import { EmptyState } from "@/components/shared/EmptyState";
import { MoneyInput } from "@/components/shared/MoneyInput";
import { ResponsiveModal } from "@/components/shared/ResponsiveModal";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/shared/Button";
import { TextField } from "@/components/shared/TextField";
import { Select } from "@/components/shared/Select";
import { TextArea } from "@/components/shared/TextArea";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { AmountText } from "@/components/shared/AmountText";
import { InfoTooltip } from "@/components/shared/InfoTooltip";
import { CardActionSheet } from "@/components/shared/CardActionSheet";
import {
  useCatalogComponents,
  useCreateCatalogComponent,
  useUpdateCatalogComponent,
  useDeleteCatalogComponent,
} from "@/features/catalog/hooks";
import type { CatalogComponent } from "@/features/catalog/db";
import {
  useComponentStock,
  useAllComponentStocks,
  useCatalogMovements,
  useAdjustStock,
} from "@/features/inventory/hooks";
import { ListHeader } from "@/components/shared/ListHeader";
import { PageToolbar } from "@/components/shared/PageToolbar";
import { DateText } from "@/components/shared/DateText";

const UNITS = ["قطعة", "متر", "غرام", "علبة", "كيلو", "لتر", "ورقة"];

interface FormValues {
  name: string;
  defaultCostCents: number;
  unit: string;
  notes: string;
  tracked: boolean;
  openingStock: number;
}

export default function CatalogClient({ hideHeader = false }: { hideHeader?: boolean }) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [editing, setEditing] = useState<CatalogComponent | null>(null);
  const [creating, setCreating] = useState(false);
  const [movementsFor, setMovementsFor] = useState<CatalogComponent | null>(null);
  const [adjustFor, setAdjustFor] = useState<CatalogComponent | null>(null);
  // Issue #15 — شيت إجراءات سفلي لكل بطاقة كتالوج (تعديل/حذف).
  const [actionSheetItem, setActionSheetItem] = useState<CatalogComponent | null>(null);
  // Round 5 — حالة حذف المكوّن عبر ConfirmDialog (بدل window.confirm).
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<CatalogComponent | null>(null);
  // Round 5 — حالة تأكيد إلغاء التتبّع لصنف له رصيد > 0 (مرفوعة من البطاقة).
  const [confirmUntrackItem, setConfirmUntrackItem] = useState<
    { item: CatalogComponent; stock: number } | null
  >(null);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 400);
    return () => clearTimeout(handler);
  }, [search]);

  // جلب المكونات وأرصدة المخزون دفعة واحدة (المرحلة 4 — حل مشكلة N+1)
  const { data: items = [], isLoading } = useCatalogComponents(debouncedSearch);
  const { data: stockMap } = useAllComponentStocks();

  const createMutation = useCreateCatalogComponent();
  const updateMutation = useUpdateCatalogComponent();
  const deleteMutation = useDeleteCatalogComponent();

  const handleSearch = useCallback((q: string) => {
    setSearch(q);
  }, []);

  // Round 5 — مُعالج تبديل التتبّع على البطاقة. عند محاولة إلغاء التتبّع لصنف له
  // رصيد > 0، اعرض ConfirmDialog (مرفوعة من البطاقة) قبل التنفيذ. وإلا فنفّذ مباشرة.
  const handleToggleTracked = async (
    item: CatalogComponent,
    next: boolean,
    currentStock: number,
  ) => {
    if (!next && item.tracked && currentStock > 0) {
      setConfirmUntrackItem({ item, stock: currentStock });
      return;
    }
    const res = await updateMutation.mutateAsync({ ...item, tracked: next });
    if (res.status !== "ok") {
      toast.error(res.message);
    } else if (next) {
      toast.info("تم التفعيل. لتسجيل رصيد افتتاحي افتح بطاقة الصنف");
    }
  };

  const pageAction = useMemo(() => {
    if (hideHeader) return null;
    return (
      <PageToolbar
        search={{
          value: search,
          onChange: handleSearch,
          placeholder: "بحث في المكوّنات...",
        }}
        trailing={
          <Button
            onClick={() => setCreating(true)}
            size="icon"
            aria-label="إضافة مكوّن جديد"
            title="إضافة مكوّن جديد"
          >
            <Plus className="w-5 h-5" />
          </Button>
        }
      />
    );
  }, [hideHeader, search, handleSearch]);

  return (
    <>
      {!hideHeader && <AppShellHeader title="" action={pageAction} />}
      <div className="flex-1 flex flex-col gap-4">
        {/* شريط البحث والإضافة */}
        {hideHeader && (
          <ListHeader
            searchValue={search}
            onSearchChange={handleSearch}
            searchPlaceholder="بحث في المكوّنات..."
            actions={
              <Button
                onClick={() => setCreating(true)}
                icon={<Plus className="w-4 h-4" />}
              >
                إضافة
              </Button>
            }
          />
        )}

        {/* قائمة المكوّنات */}
        {isLoading ? (
          <SkeletonList />
        ) : items.length === 0 ? (
          <EmptyState
            title="المكوّنات فارغة"
            description={search ? "لا توجد نتائج للبحث" : "أضف مكوّنات شائعة لتسهيل إنشاء الطلبات"}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item, idx) => (
              <li
                key={item.id}
                style={{ animationDelay: `${Math.min(idx, 4) * 60}ms` }}
                className="animate-fade-slide-in"
              >
                <CatalogCard
                  item={item}
                  stock={item.tracked ? (stockMap?.[item.id] ?? 0) : undefined}
                  onShowMovements={() => setMovementsFor(item)}
                  onAdjustStock={() => setAdjustFor(item)}
                  onOpenActions={() => setActionSheetItem(item)}
                  onToggleTracked={(next, currentStock) => handleToggleTracked(item, next, currentStock)}
                  isTogglingTracked={updateMutation.isPending}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* مودال إنشاء مكوّن جديد */}
      <ResponsiveModal
        isOpen={creating}
        onClose={() => setCreating(false)}
        title="إضافة مكوّن جديد"
      >
        <CatalogForm
          onSubmit={async (vals) => {
            const res = await createMutation.mutateAsync(vals);
            if (res.status === "ok") {
              toast.success("تم الحفظ بنجاح");
              setCreating(false);
            } else {
              toast.error(res.message);
            }
          }}
        />
      </ResponsiveModal>

      {/* مودال تعديل مكوّن موجود */}
      <ResponsiveModal
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        title="تعديل المكوّن"
      >
        {editing && (
          <CatalogForm
            initialData={editing}
            onSubmit={async (vals) => {
              const res = await updateMutation.mutateAsync({
                ...editing,
                ...vals,
              });
              if (res.status === "ok") {
                toast.success("تم التعديل بنجاح");
                setEditing(null);
              } else {
                toast.error(res.message);
              }
            }}
            onDelete={async () => {
              const updatedAt = editing.updatedAt instanceof Date
                ? editing.updatedAt.toISOString()
                : String(editing.updatedAt);
              const res = await deleteMutation.mutateAsync({ id: editing.id, updatedAt });
              if (res.status === "ok") {
                toast.success("تم حذف المكوّن بنجاح");
                setEditing(null);
              } else {
                toast.error(res.message);
              }
            }}
          />
        )}
      </ResponsiveModal>

      {/* مودال عرض حركات المخزون */}
      <ResponsiveModal
        isOpen={movementsFor !== null}
        onClose={() => setMovementsFor(null)}
        title={movementsFor ? `حركات مخزون: ${movementsFor.name}` : "حركات المخزون"}
      >
        {movementsFor && <MovementsList catalogComponentId={movementsFor.id} />}
      </ResponsiveModal>

      {/* مودال التسوية اليدوية (صرف/إضافة) */}
      <ResponsiveModal
        isOpen={adjustFor !== null}
        onClose={() => setAdjustFor(null)}
        title={adjustFor ? `تسوية مخزون: ${adjustFor.name}` : "تسوية مخزون"}
      >
        {adjustFor && (
          <AdjustStockForm
            item={adjustFor}
            onDone={() => setAdjustFor(null)}
          />
        )}
      </ResponsiveModal>

      {/* Issue #15 — شيت إجراءات سفلي لكل بطاقة كتالوج. المساران:
          - «تعديل» → فتح مودال التعديل (setEditing).
          - «حذف» → confirm() ثم deleteMutation مباشرة. حذف الكتالوج hard delete
            (FK RESTRICT) فلا يصلح لنمط التراجع — ذلك للمصاريف/المشتريات فقط. */}
      <CardActionSheet
        isOpen={actionSheetItem !== null}
        onClose={() => setActionSheetItem(null)}
        title="إجراءات"
        actions={
          actionSheetItem
            ? [
                {
                  label: "تعديل",
                  icon: <Pencil className="w-5 h-5" />,
                  onClick: () => {
                    const item = actionSheetItem;
                    setActionSheetItem(null);
                    setEditing(item);
                  },
                },
                {
                  label: "حذف",
                  icon: <Trash2 className="w-5 h-5" />,
                  variant: "danger" as const,
                  onClick: () => {
                    const item = actionSheetItem;
                    setActionSheetItem(null);
                    setConfirmDeleteItem(item);
                  },
                },
              ]
            : []
        }
      />

      {/* Round 5 — تأكيد حذف المكوّن نهائياً (بديل window.confirm في الشيت). */}
      <ConfirmDialog
        isOpen={confirmDeleteItem !== null}
        title="حذف المكوّن نهائياً"
        message="سيُحذف هذا المكوّن نهائياً من الكتالوج. قد تظلّ كشوفات حساب الطلبات السابقة المرتبطة به قائمة، لكن أي تعديل لاحق للطلبات لن يجد هذا الصنف. لا يمكن التراجع عن هذا الإجراء."
        confirmLabel="نعم، حذف نهائي"
        cancelLabel="إلغاء"
        onConfirm={async () => {
          if (!confirmDeleteItem) return;
          const item = confirmDeleteItem;
          const updatedAt = item.updatedAt instanceof Date
            ? item.updatedAt.toISOString()
            : String(item.updatedAt);
          const res = await deleteMutation.mutateAsync({ id: item.id, updatedAt });
          if (res.status === "ok") {
            toast.success("تم حذف المكوّن بنجاح");
            setConfirmDeleteItem(null);
          } else {
            toast.error(res.message);
          }
        }}
        onCancel={() => setConfirmDeleteItem(null)}
        isLoading={deleteMutation.isPending}
      />

      {/* Round 5 — تأكيد إلغاء التتبّع لصنف له رصيد > 0 (مرفوعة من البطاقة). */}
      <ConfirmDialog
        isOpen={confirmUntrackItem !== null}
        title="تأكيد إلغاء التتبّع"
        message={
          confirmUntrackItem
            ? `ستفقد التتبّع. الرصيد الحالي ${confirmUntrackItem.stock} ${confirmUntrackItem.item.unit} سيُعامَل كصفر للطلبات الجديدة. سيتم حذف سجل الحركات ناعماً. هل أنت متأكد؟`
            : ""
        }
        confirmLabel="نعم، ألغِ التتبّع"
        cancelLabel="إلغاء"
        onConfirm={async () => {
          if (!confirmUntrackItem) return;
          const item = confirmUntrackItem.item;
          const res = await updateMutation.mutateAsync({ ...item, tracked: false });
          if (res.status === "ok") {
            toast.success("تم إلغاء التتبّع");
            setConfirmUntrackItem(null);
          } else {
            toast.error(res.message);
          }
        }}
        onCancel={() => setConfirmUntrackItem(null)}
        isLoading={updateMutation.isPending}
      />
    </>
  );
}

function CatalogCard({
  item,
  stock,
  onShowMovements,
  onAdjustStock,
  onOpenActions,
  onToggleTracked,
  isTogglingTracked,
}: {
  item: CatalogComponent;
  stock?: number;
  onShowMovements: () => void;
  onAdjustStock: () => void;
  onOpenActions: () => void;
  /** Round 5 — يُستدعى عند تبديل التتبّع من البطاقة مباشرةً. `currentStock` 
   *  يُمرَّر من خطاف الرصيد الموجود في البطاقة (لتفادي تكرار الاستعلام في الأب). */
  onToggleTracked: (next: boolean, currentStock: number) => void;
  isTogglingTracked?: boolean;
}) {
  // الرصيد يُمرَّر كـ prop من useAllComponentStocks المجمّع في الأب لحل مشكلة N+1 (المرحلة 4)

  return (
    <div className="bg-paper border border-hairline rounded-lg shadow-sm p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-ink text-sm truncate">{item.name}</span>
            {/* Round 5 — مفتاح تبديل التتبّع على البطاقة مباشرةً (بدل فتح المودال).
                يظهر دائماً حتى يمكن تفعيل التتبّع من البطاقة، ويتغيّر اللون عبر
                has-[:checked] حسب حالة الإدخال. */}
            <label className="flex items-center gap-1.5 min-h-[44px] cursor-pointer text-[10px] px-1.5 py-0.5 rounded-full border border-info/30 has-[:checked]:bg-info-soft has-[:checked]:text-info text-ink-3">
              <PackageCheck className="w-3 h-3" />
              <span>{item.tracked ? "متتبَّع" : "تفعيل التتبع"}</span>
              <input
                type="checkbox"
                className="sr-only"
                checked={item.tracked}
                onChange={(e) => onToggleTracked(e.target.checked, stock ?? 0)}
                disabled={isTogglingTracked}
              />
            </label>
          </div>
          <span className="text-xs text-ink/60 flex items-center gap-1">
            <AmountText amount={item.defaultCostCents} />
            <span> د.أ / {item.unit}</span>
            {item.notes ? ` · ${item.notes}` : ""}
          </span>
        </div>
        {/* Issue #15 — زر ⋯ لفتح شيت الإجراءات السفلي (تعديل/حذف) بدل زر التعديل المباشر. */}
        <button
          type="button"
          onClick={onOpenActions}
          className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg text-ink-2 hover:bg-canvas transition-colors flex-shrink-0"
          aria-label="إجراءات"
        >
          <MoreVertical className="w-5 h-5" />
        </button>
      </div>

      {/* Phase 3 — شريط الرصيد + الإجراءات */}
      {item.tracked && (
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-hairline flex-wrap">
          <span className="text-xs text-ink-2 flex items-center gap-1.5">
            <span className="text-ink-3">الرصيد الحالي:</span>
            <span className="font-bold text-info">
              {stock ?? 0} {item.unit}
            </span>
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onAdjustStock}
              className="text-xs px-2.5 rounded-md border border-hairline text-ink-2 hover:bg-canvas transition-colors flex items-center gap-1 min-h-[44px]"
              title="تسوية يدوية — صرف أو إضافة (لا تدخل P&L)"
            >
              <PackageMinus className="w-3.5 h-3.5" />
              تسوية يدوية
            </button>
            <button
              type="button"
              onClick={onShowMovements}
              className="text-xs px-2.5 rounded-md border border-hairline text-ink-2 hover:bg-canvas transition-colors flex items-center gap-1 min-h-[44px]"
              title="عرض آخر 20 حركة"
            >
              <History className="w-3.5 h-3.5" />
              الحركات
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CatalogForm({
  initialData,
  onSubmit,
  onDelete,
}: {
  initialData?: CatalogComponent;
  onSubmit: (values: FormValues) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { register, handleSubmit, control, watch, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      name: initialData?.name ?? "",
      defaultCostCents: initialData?.defaultCostCents ?? 0,
      unit: initialData?.unit ?? "قطعة",
      notes: initialData?.notes ?? "",
      tracked: initialData?.tracked ?? false,
      openingStock: 0, // الرصيد الافتتاحي يُطبَّق فقط عند تفعيل التتبّع لأول مرة.
    },
  });

  // Phase 3 — تتبّع تفعيل التتبّع لتغيير سلوك حقل الرصيد الافتتاحي. وعند محاولة
  // إلغاء التتبّع لصنف له رصيد > 0، اعرض تحذيراً يطلب تأكيداً صريحاً (§6 سيناريو 4).
  const isTracked = watch("tracked");
  const wasInitiallyTracked = initialData?.tracked ?? false;
  const [confirmUntrackOpen, setConfirmUntrackOpen] = useState(false);
  const [pendingTrackedValue, setPendingTrackedValue] = useState<boolean | null>(null);

  // Pull the current stock (only if the item is currently tracked) so we can show
  // the warning in the untrack confirmation.
  const { data: currentStock } = useComponentStock(
    wasInitiallyTracked ? initialData?.id : undefined,
  );

  // Intercept the tracked checkbox: if user tries to turn OFF tracking on an item
  // that has stock > 0, intercept and show confirm dialog instead.
  const handleTrackedChange = (checked: boolean) => {
    if (!checked && wasInitiallyTracked && (currentStock ?? 0) > 0) {
      // §6 سيناريو 4 / SA1 NOTE-3: اعرض التحذير قبل الإلغاء.
      setPendingTrackedValue(false);
      setConfirmUntrackOpen(true);
      // لا نُغيّر الحقل — يبقى true حتى يؤكّد المستخدم.
      return;
    }
    // وإلا فغيّر مباشرةً.
    setPendingTrackedValue(checked);
    // Use react-hook-form setValue indirectly via the Controller below.
    // Simpler: dispatch via the registered input.
    const event = { target: { checked, type: "checkbox" } } as React.ChangeEvent<HTMLInputElement>;
    // Find the input and call its onChange. Use a ref-less approach: rely on Controller.
    // We've registered tracked as a plain checkbox below; setting value requires
    // a different mechanism. To keep it simple, we re-render via state + use Controller.
    void event;
  };

  const submit = async (values: FormValues) => {
    setIsSubmitting(true);
    try {
      await onSubmit(values);
    } catch {
      toast.error("فشل الاتصال بالسيرفر — حاول مجدداً");
    } finally {
      setIsSubmitting(false);
    }
  };

  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleDelete = () => {
    setConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!onDelete) return;
    setConfirmOpen(false);
    setIsSubmitting(true);
    try {
      await onDelete();
    } catch {
      toast.error("فشل الاتصال بالسيرفر — حاول مجدداً");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4 pt-2">
      <TextField
        label="اسم المكوّن *"
        placeholder="مثال: وعاء خرساني 7سم"
        error={errors.name?.message as string}
        {...register("name", { required: "الاسم مطلوب" })}
      />

      <div className="grid grid-cols-2 gap-3">
        <Controller
          control={control}
          name="defaultCostCents"
          render={({ field: { value, onChange } }) => (
            <MoneyInput
              label="التكلفة الافتراضية"
              value={value}
              onChange={onChange}
              placeholder="0.000"
            />
          )}
        />
        <Select
          label="الوحدة"
          {...register("unit")}
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </Select>
      </div>

      {/* Phase 3 — علم التتبّع + الرصيد الافتتاحي */}
      <div className="p-3.5 bg-canvas/30 rounded-lg border border-hairline space-y-3">
        <Controller
          control={control}
          name="tracked"
          render={({ field: { value, onChange } }) => (
            <label
              htmlFor="catalog-tracked"
              className="flex items-center gap-3 min-h-[44px] cursor-pointer"
            >
              <input
                type="checkbox"
                id="catalog-tracked"
                checked={value}
                onChange={(e) => {
                  const checked = e.target.checked;
                  if (!checked && wasInitiallyTracked && (currentStock ?? 0) > 0) {
                    // §6 سيناريو 4 / SA1 NOTE-3: اعرض التحذير.
                    setPendingTrackedValue(false);
                    setConfirmUntrackOpen(true);
                    return;
                  }
                  onChange(checked);
                }}
                className="h-5 w-5 rounded border-hairline-2 text-info focus:ring-info"
              />
              <span className="text-sm font-bold text-ink/75 flex items-center gap-1.5">
                <PackageCheck className="w-4 h-4 text-info" />
                متتبَّع (تفعيل خصم/إضافة المخزون عند الشراء والتوصيل)
              </span>
              <InfoTooltip text="عند تفعيل التتبَّع: الشراء لهذا الصنف يُسجَّل كمخزون (لا يخفض الربح في شهر الشراء)، وعند البيع تُخصم تكلفة البضاعة المباعة من الربح. الأصناف غير المتتبَّعة تُعالَج كمصروف تشغيلي مباشر." />
            </label>
          )}
        />

        {/* الرصيد الافتتاحي يظهر فقط عند تفعيل التتبّع لأول مرة. */}
        {isTracked && !wasInitiallyTracked && (
          <div className="space-y-1.5">
            <label htmlFor="catalog-opening" className="text-xs font-semibold text-ink-3">
              الرصيد الافتتاحي (يُضاف مرة واحدة عند التفعيل)
            </label>
            <input
              id="catalog-opening"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              {...register("openingStock", { valueAsNumber: true })}
              className="w-full h-12 px-4 py-2 rounded-md border border-hairline-2 bg-paper text-base text-ink focus:outline-none focus:ring-2 focus:ring-ink/10"
            />
            <p className="text-[11px] text-ink-3">
              سيُدرَج حركة <code className="font-mono">in</code> بقيمة هذا الرقم
              عند الحفظ. يمكن تعديل الرصيد لاحقاً عبر «تسوية يدوية».
            </p>
          </div>
        )}

        {/* تنبيه عند محاولة إلغاء التتبّع لصنف له رصيد > 0. */}
        {wasInitiallyTracked && !isTracked && (
          <div className="p-2 rounded-md bg-warn-soft text-warn-deep text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              ستفقد التتبّع. الرصيد الحالي ({currentStock ?? 0} {initialData?.unit ?? "قطعة"})
              سيُعامَل كصفر للطلبات الجديدة. سيتم حذف سجل الحركات ناعماً (الأثر التاريخي يُحافَظ عليه).
            </span>
          </div>
        )}
      </div>

      <TextArea
        label="ملاحظات (اختياري)"
        {...register("notes")}
        placeholder="ملاحظات اختيارية..."
      />

      <div className="flex gap-3 pt-2">
        <Button
          type="submit"
          isLoading={isSubmitting}
          className="flex-1"
        >
          {initialData ? "حفظ التعديلات" : "إضافة للمكوّنات"}
        </Button>
        {onDelete && (
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            isLoading={isSubmitting}
            className="flex-1"
          >
            حذف المكوّن
          </Button>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        title="حذف مكوّن الكتالوج"
        message="هل أنت متأكد من حذف هذا المكوّن نهائياً؟ قد يؤثر ذلك على كشوفات حساب الطلبات المرتبطة به."
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />

      {/* §6 سيناريو 4 / SA1 NOTE-3 — تأكيد إلغاء التتبّع لصنف له رصيد > 0. */}
      <ConfirmDialog
        isOpen={confirmUntrackOpen}
        title="تأكيد إلغاء التتبّع"
        message={`ستفقد التتبّع. الرصيد الحالي ${currentStock ?? 0} ${initialData?.unit ?? "قطعة"} سيُعامَل كصفر للطلبات الجديدة. سيتم حذف سجل الحركات ناعماً. هل أنت متأكد؟`}
        confirmLabel="نعم، ألغِ التتبّع"
        onConfirm={() => {
          setConfirmUntrackOpen(false);
          // اضبط الحقل يدوياً — react-hook-form setValue يلزم controller.
          // نُحاكي ذلك عبر استدعاء handleChange على الـ input.
          if (pendingTrackedValue !== null) {
            // استخدم setValue عبر المرجع إلى الـ Controller. للبساطة، نُحدّث
            // القيمة عبر dispatch event على الـ DOM.
            const input = document.getElementById("catalog-tracked") as HTMLInputElement | null;
            if (input) {
              input.checked = pendingTrackedValue;
              input.dispatchEvent(new Event("change", { bubbles: true }));
            }
          }
          setPendingTrackedValue(null);
        }}
        onCancel={() => {
          setConfirmUntrackOpen(false);
          setPendingTrackedValue(null);
        }}
      />
    </form>
  );
}

/**
 * مودال عرض آخر 20 حركة مخزون لصنف.
 */
function MovementsList({ catalogComponentId }: { catalogComponentId: string }) {
  const { data: movements = [], isLoading } = useCatalogMovements(catalogComponentId, 20);

  if (isLoading) {
    return (
      <div className="p-4 text-center text-sm text-ink-3">جارٍ التحميل…</div>
    );
  }

  if (movements.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-ink-3">
        لا توجد حركات مخزون مسجَّلة لهذا الصنف بعد.
      </div>
    );
  }

  const sourceTypeAr: Record<string, string> = {
    purchase: "شراء",
    order_delivery: "توصيل طلب",
    opening: "رصيد افتتاحي",
    adjustment: "تسوية",
    manual_in: "إضافة يدوية",
    manual_out: "صرف يدوي",
  };

  return (
    <div className="p-2">
      <ul className="divide-y divide-hairline">
        {movements.map((m) => (
          <li key={m.id} className="py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                    m.direction === "in"
                      ? "bg-info-soft text-info"
                      : "bg-alert-soft text-alert"
                  }`}
                >
                  {m.direction === "in" ? "+" : "−"}
                  {m.quantity}
                </span>
                <span className="text-xs text-ink-3">
                  {sourceTypeAr[m.sourceType] ?? m.sourceType}
                </span>
              </div>
              <div className="text-[11px] text-ink-3 mt-0.5">
                <DateText date={m.date} />
                {m.notes ? ` · ${m.notes}` : ""}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * مودال التسوية اليدوية للرصيد (صرف يدوي / إضافة يدوية). §6 سيناريو 11.
 * لا تدخل P&L — حركة مخزون صرفة عبر adjustStock action.
 */
function AdjustStockForm({
  item,
  onDone,
}: {
  item: CatalogComponent;
  onDone: () => void;
}) {
  const [direction, setDirection] = useState<"in" | "out">("out");
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const adjustStockMutation = useAdjustStock();
  const { data: currentStock = 0 } = useComponentStock(item.id);

  const handleSubmit = async () => {
    if (quantity <= 0) {
      toast.error("الكمية يجب أن تكون موجبة");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await adjustStockMutation.mutateAsync({
        catalogComponentId: item.id,
        direction,
        quantity,
        reason: reason.trim() || undefined,
        requestId: crypto.randomUUID(),
      });
      if (res.status === "ok") {
        toast.success(
          direction === "in"
            ? `تمت إضافة ${quantity} ${item.unit} للمخزون`
            : `تم صرف ${quantity} ${item.unit} من المخزون`,
        );
        onDone();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("فشل الاتصال بالسيرفر");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="p-3 bg-canvas/30 rounded-md text-sm text-ink-2 flex items-center justify-between">
        <span>الرصيد الحالي:</span>
        <span className="font-bold text-info">{currentStock} {item.unit}</span>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-bold text-ink/75 flex items-center gap-1.5">
          نوع التسوية
          <InfoTooltip text="الصرف اليدوي (out) لتلف أو فقدان مخزون: يُخصم الرصيد ويُسجَّل خسارة غير نقدية في بند «هدر/تلف مخزون» بالقائمة المالية (تخفض الربح التشغيلي). الإضافة اليدوية (in) لردّ مخزون عائد أو تسوية موجبة: لا تؤثر على الربح." />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setDirection("out")}
            className={`min-h-[44px] py-2.5 rounded-md border text-sm font-bold flex items-center justify-center gap-1.5 transition-colors ${
              direction === "out"
                ? "border-alert text-alert bg-alert-soft"
                : "border-hairline text-ink-2 bg-paper hover:bg-canvas"
            }`}
          >
            <PackageMinus className="w-4 h-4" />
            صرف يدوي (out)
          </button>
          <button
            type="button"
            onClick={() => setDirection("in")}
            className={`min-h-[44px] py-2.5 rounded-md border text-sm font-bold flex items-center justify-center gap-1.5 transition-colors ${
              direction === "in"
                ? "border-info text-info bg-info-soft"
                : "border-hairline text-ink-2 bg-paper hover:bg-canvas"
            }`}
          >
            <PackageCheck className="w-4 h-4" />
            إضافة يدوية (in)
          </button>
        </div>
        {direction === "out" ? (
          <p className="text-[11px] text-alert/80 leading-relaxed">
            الصرف اليدوي يُسجَّل كخسارة غير نقدية في بند «هدر/تلف مخزون» — يُخفِض الربح التشغيلي بقدر قيمة الكمية المخصومة. لا يُخصم النقد من الصندوق.
          </p>
        ) : (
          <p className="text-[11px] text-ink-3 leading-relaxed">
            الإضافة اليدوية تزيد الرصيد دون أثر على الربح أو الصندوق — لتسوية موجبة أو ردّ مخزون عائد.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="adjust-qty" className="text-sm font-bold text-ink/75">
          الكمية
        </label>
        <input
          id="adjust-qty"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value) || 0)}
          className="w-full h-12 px-4 py-2 rounded-md border border-hairline-2 bg-paper text-base text-ink focus:outline-none focus:ring-2 focus:ring-ink/10"
        />
        {direction === "out" && quantity > currentStock && (
          <p className="text-[11px] text-warn-deep flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            الكمية تتجاوز الرصيد — سيرصبح الرصيد سالباً ({currentStock - quantity} {item.unit}).
            مسموح (§6 سيناريو 1) لكن يُنصح بمراجعة الأرقام.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="adjust-reason" className="text-sm font-bold text-ink/75">
          السبب (اختياري)
        </label>
        <input
          id="adjust-reason"
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="مثال: تلف، فقدان، جرد"
          className="w-full h-12 px-4 py-2 rounded-md border border-hairline-2 bg-paper text-base text-ink focus:outline-none focus:ring-2 focus:ring-ink/10"
        />
      </div>

      <Button
        type="button"
        onClick={handleSubmit}
        isLoading={isSubmitting}
        className="w-full"
      >
        تأكيد التسوية
      </Button>
    </div>
  );
}
