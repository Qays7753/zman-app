"use client";

import { Edit3, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { toast } from "sonner";
import { AppShellHeader } from "@/providers/app-shell-context";
import { EmptyState } from "@/components/shared/EmptyState";
import { MoneyInput } from "@/components/shared/MoneyInput";
import { ResponsiveModal } from "@/components/shared/ResponsiveModal";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/shared/Button";
import { TextField } from "@/components/shared/TextField";
import {
  useCatalogComponents,
  useCreateCatalogComponent,
  useUpdateCatalogComponent,
  useDeleteCatalogComponent,
} from "@/features/catalog/hooks";
import type { CatalogComponent } from "@/features/catalog/db";
import { ListHeader } from "@/components/shared/ListHeader";

const UNITS = ["قطعة", "متر", "غرام", "علبة", "كيلو", "لتر", "ورقة"];

interface FormValues {
  name: string;
  defaultCostCents: number;
  unit: string;
  notes: string;
}

export default function CatalogClient({ hideHeader = false }: { hideHeader?: boolean }) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<CatalogComponent | null>(null);
  const [creating, setCreating] = useState(false);

  // جلب البيانات عبر React Query لضمان الاستجابة الفورية (§10.1)
  const { data: items = [], isLoading } = useCatalogComponents(search);

  const createMutation = useCreateCatalogComponent();
  const updateMutation = useUpdateCatalogComponent();
  const deleteMutation = useDeleteCatalogComponent();

  const handleSearch = (q: string) => {
    setSearch(q);
  };

  return (
    <>
      {!hideHeader && <AppShellHeader title="المكوّنات" />}
      <div className="flex-1 flex flex-col gap-4">
        {/* شريط البحث والإضافة */}
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

        {/* قائمة المكوّنات */}
        {isLoading ? (
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
            const res = await createMutation.mutateAsync(values);
            if (res.status === "error") {
              toast.error(res.message);
            } else {
              toast.success("تمت الإضافة");
              setCreating(false);
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
              const res = await updateMutation.mutateAsync({
                ...editing,
                ...values,
              });
              if (res.status === "error") {
                toast.error(res.message);
              } else {
                toast.success("تم الحفظ");
                setEditing(null);
              }
            }}
            onDelete={async () => {
              const updatedAt = editing.updatedAt instanceof Date
                ? editing.updatedAt.toISOString()
                : String(editing.updatedAt);
              const res = await deleteMutation.mutateAsync({ id: editing.id, updatedAt });
              if (res.status === "error") {
                toast.error(res.message);
              } else {
                toast.success("تم الحذف");
                setEditing(null);
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
    <li className="bg-paper border border-hairline rounded-lg shadow-sm p-4 flex items-center justify-between gap-3">
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
        className="shrink-0 w-11 h-11 min-w-[44px] min-h-[44px] rounded-lg border border-hairline flex items-center justify-center text-ink/50 hover:text-ink hover:border-ink/30 transition-colors"
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
          placeholder="ملاحظات اختيارية..."
          rows={2}
          className="w-full px-4 py-3 rounded-md border border-hairline focus:outline-none focus:ring-2 focus:ring-ink bg-paper text-base resize-none"
        />
      </div>

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
            variant="destructive"
            onClick={handleDelete}
            isLoading={isSubmitting}
            icon={<Trash2 className="w-4 h-4" />}
            className="px-4"
          />
        )}
      </div>
      <ConfirmDialog
        isOpen={confirmOpen}
        title="تأكيد الحذف"
        message="هل أنت متأكد من حذف هذا المكوّن؟"
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmOpen(false)}
        isLoading={isSubmitting}
      />
    </form>
  );
}
