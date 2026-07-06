"use client";

import { Edit3, Plus, Trash2 } from "lucide-react";
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
import {
  useCatalogComponents,
  useCreateCatalogComponent,
  useUpdateCatalogComponent,
  useDeleteCatalogComponent,
} from "@/features/catalog/hooks";
import type { CatalogComponent } from "@/features/catalog/db";
import { ListHeader } from "@/components/shared/ListHeader";
import { PageToolbar } from "@/components/shared/PageToolbar";

const UNITS = ["قطعة", "متر", "غرام", "علبة", "كيلو", "لتر", "ورقة"];

interface FormValues {
  name: string;
  defaultCostCents: number;
  unit: string;
  notes: string;
}

export default function CatalogClient({ hideHeader = false }: { hideHeader?: boolean }) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [editing, setEditing] = useState<CatalogComponent | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 400);
    return () => clearTimeout(handler);
  }, [search]);

  // جلب المكونات
  const { data: items = [], isLoading } = useCatalogComponents(debouncedSearch);

  const createMutation = useCreateCatalogComponent();
  const updateMutation = useUpdateCatalogComponent();
  const deleteMutation = useDeleteCatalogComponent();

  const handleSearch = useCallback((q: string) => {
    setSearch(q);
  }, []);

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
                  onEdit={() => setEditing(item)}
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
  return (
    <li className="bg-paper border border-hairline rounded-lg shadow-sm p-4 flex items-center justify-between gap-3">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="font-bold text-ink text-sm truncate">{item.name}</span>
        <span className="text-xs text-ink/60 flex items-center gap-1">
          <AmountText amount={item.defaultCostCents} />
          <span> د.أ / {item.unit}</span>
          {item.notes ? ` · ${item.notes}` : ""}
        </span>
      </div>
      <Button
        variant="icon"
        onClick={onEdit}
      >
        <Edit3 className="w-4 h-4" />
      </Button>
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
        <Select
          label="الوحدة"
          {...register("unit")}
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </Select>
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
    </form>
  );
}
