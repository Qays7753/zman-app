"use client";

import { Edit3, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { toast } from "sonner";
import { AppShellHeader } from "@/providers/app-shell-context";
import { EmptyState } from "@/components/shared/EmptyState";
import { MoneyInput } from "@/components/shared/MoneyInput";
import { ResponsiveModal } from "@/components/shared/ResponsiveModal";
import {
  createCatalogComponent,
  deleteCatalogComponent,
  getCatalogComponents,
  updateCatalogComponent,
} from "@/features/catalog/actions";
import type { CatalogComponent } from "@/features/catalog/db";

const UNITS = ["قطعة", "متر", "غرام", "علبة", "كيلو", "لتر", "ورقة"];

interface FormValues {
  name: string;
  defaultCostCents: number;
  unit: string;
  notes: string;
}

export default function CatalogClient({ hideHeader = false }: { hideHeader?: boolean }) {
  const [items, setItems] = useState<CatalogComponent[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<CatalogComponent | null>(null);
  const [creating, setCreating] = useState(false);
  const [isPending, startTransition] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);

  const fetchItems = useCallback(
    (q?: string) => {
      startTransition(async () => {
        const result = await getCatalogComponents(q);
        setItems(result);
      });
    },
    [],
  );

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearch(q);
    fetchItems(q);
  };

  return (
    <>
      {!hideHeader && <AppShellHeader title="المكوّنات" />}
      <div className="flex-1 flex flex-col gap-4">
        {/* شريط البحث والإضافة */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/40 pointer-events-none" />
            <input
              ref={searchRef}
              type="search"
              value={search}
              onChange={handleSearch}
              placeholder="بحث في المكوّنات..."
              className="w-full h-11 pr-9 pl-4 rounded-lg border border-hairline bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-ink"
            />
          </div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="h-11 px-4 rounded-lg bg-ink text-paper text-sm font-bold flex items-center gap-1.5 hover:bg-ink/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            إضافة
          </button>
        </div>

        {/* قائمة المكوّنات */}
        {isPending ? (
          <div className="flex-1 flex items-center justify-center text-ink/40 text-sm">
            جاري التحميل...
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="المكوّنات فارغة"
            description={search ? "لا توجد نتائج للبحث" : "أضف مكوّنات شائعة لتسهيل إنشاء الطلبات"}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <CatalogCard
                key={item.id}
                item={item}
                onEdit={() => setEditing(item)}
              />
            ))}
          </ul>
        )}
      </div>

      {/* نافذة الإضافة */}
      <ResponsiveModal
        isOpen={creating}
        onClose={() => setCreating(false)}
        title="إضافة مكوّن"
      >
        <CatalogForm
          onSubmit={async (values) => {
            const res = await createCatalogComponent(values);
            if (res.status === "error") {
              toast.error(res.message);
            } else {
              toast.success("تمت الإضافة");
              setCreating(false);
              fetchItems(search);
            }
          }}
        />
      </ResponsiveModal>

      {/* نافذة التعديل */}
      <ResponsiveModal
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        title="تعديل المكوّن"
      >
        {editing && (
          <CatalogForm
            initialData={editing}
            onSubmit={async (values) => {
              const res = await updateCatalogComponent({
                id: editing.id,
                updatedAt: editing.updatedAt instanceof Date
                  ? editing.updatedAt.toISOString()
                  : String(editing.updatedAt),
                ...values,
              });
              if (res.status === "error") {
                toast.error(res.message);
              } else {
                toast.success("تم الحفظ");
                setEditing(null);
                fetchItems(search);
              }
            }}
            onDelete={async () => {
              const updatedAt = editing.updatedAt instanceof Date
                ? editing.updatedAt.toISOString()
                : String(editing.updatedAt);
              const res = await deleteCatalogComponent(editing.id, updatedAt);
              if (res.status === "error") {
                toast.error(res.message);
              } else {
                toast.success("تم الحذف");
                setEditing(null);
                fetchItems(search);
              }
            }}
          />
        )}
      </ResponsiveModal>
    </>
  );
}

function CatalogCard({
  item,
  onEdit,
}: {
  item: CatalogComponent;
  onEdit: () => void;
}) {
  const costJOD = (item.defaultCostCents / 1000).toFixed(3);
  return (
    <li className="bg-paper border border-hairline rounded-xl p-4 flex items-center justify-between gap-3">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="font-bold text-ink text-sm truncate">{item.name}</span>
        <span className="text-xs text-ink/60">
          {costJOD} د.أ / {item.unit}
          {item.notes ? ` · ${item.notes}` : ""}
        </span>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="shrink-0 w-9 h-9 rounded-lg border border-hairline flex items-center justify-center text-ink/50 hover:text-ink hover:border-ink/30 transition-colors"
      >
        <Edit3 className="w-4 h-4" />
      </button>
    </li>
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
  const { register, handleSubmit, control, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      name: initialData?.name ?? "",
      defaultCostCents: initialData?.defaultCostCents ?? 0,
      unit: initialData?.unit ?? "قطعة",
      notes: initialData?.notes ?? "",
    },
  });

  const submit = async (values: FormValues) => {
    setIsSubmitting(true);
    try {
      await onSubmit(values);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    if (!confirm("هل أنت متأكد من حذف هذا المكوّن؟")) return;
    setIsSubmitting(true);
    try {
      await onDelete();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4 pt-2">
      <div>
        <label className="text-xs font-semibold text-ink/60 block mb-1">اسم المكوّن *</label>
        <input
          type="text"
          placeholder=""
          {...register("name", { required: "الاسم مطلوب" })}
          className="w-full h-12 px-4 rounded-md border border-hairline focus:outline-none focus:ring-2 focus:ring-ink bg-paper text-base"
        />
        {errors.name && <span className="text-xs text-alert mt-1 block">{errors.name.message}</span>}
      </div>

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
        <div>
          <label className="text-xs font-semibold text-ink/60 block mb-1">الوحدة</label>
          <select
            {...register("unit")}
            className="w-full h-12 px-4 rounded-md border border-hairline focus:outline-none focus:ring-2 focus:ring-ink bg-paper text-base"
          >
            {UNITS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-ink/60 block mb-1">ملاحظات (اختياري)</label>
        <textarea
          {...register("notes")}
          placeholder=""
          rows={2}
          className="w-full px-4 py-3 rounded-md border border-hairline focus:outline-none focus:ring-2 focus:ring-ink bg-paper text-base resize-none"
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 min-h-[48px] bg-ink text-paper rounded-md font-bold text-sm disabled:opacity-60 hover:bg-ink/90 transition-colors"
        >
          {isSubmitting ? "جاري الحفظ..." : initialData ? "حفظ التعديلات" : "إضافة للمكوّنات"}
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isSubmitting}
            className="min-h-[48px] px-4 rounded-md border border-alert text-alert hover:bg-alert-soft transition-colors disabled:opacity-60 flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </form>
  );
}
