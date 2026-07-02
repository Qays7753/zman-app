"use client";

import { Edit3, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { AppShellHeader } from "@/providers/app-shell-context";
import { EmptyState } from "@/components/shared/EmptyState";
import { ResponsiveModal } from "@/components/shared/ResponsiveModal";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/shared/Button";
import { TextField } from "@/components/shared/TextField";
import {
  useSnippets,
  useCreateSnippet,
  useUpdateSnippet,
  useDeleteSnippet,
} from "@/features/snippets/hooks";
import type { Snippet } from "@/features/snippets/db";
import { ListHeader } from "@/components/shared/ListHeader";

const CATEGORIES = ["عام", "رسائل العملاء", "الوصف", "الشروط", "أخرى"];

interface FormValues {
  title: string;
  body: string;
  category: string;
}

export default function SnippetsClient() {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Snippet | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // جلب البيانات عبر React Query لضمان الاستجابة الفورية (§10.1)
  const { data: items = [], isLoading } = useSnippets(search);

  const createMutation = useCreateSnippet();
  const updateMutation = useUpdateSnippet();
  const deleteMutation = useDeleteSnippet();

  const handleSearchChange = (q: string) => {
    setSearch(q);
  };

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("تعذّر النسخ");
    }
  };

  // تجميع المقتطفات حسب الفئة
  const grouped = items.reduce<Record<string, Snippet[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category]!.push(item);
    return acc;
  }, {});

  return (
    <>
      <AppShellHeader title="الملاحظات" />
      <div className="flex-1 flex flex-col gap-4">
        {/* شريط البحث والإضافة */}
        <ListHeader
          searchValue={search}
          onSearchChange={handleSearchChange}
          searchPlaceholder="بحث في الملاحظات..."
          actions={
            <Button
              onClick={() => setCreating(true)}
              icon={<Plus className="w-4 h-4" />}
            >
              إضافة
            </Button>
          }
        />

        {/* المحتوى */}
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-ink/40 text-sm">
            جاري التحميل...
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="لا توجد ملاحظات"
            description={search ? "لا توجد نتائج للبحث" : "أضف نصوصاً جاهزة تُستخدم بشكل متكرر"}
          />
        ) : (
          <div className="flex flex-col gap-6">
            {Object.entries(grouped).map(([category, snippets]) => (
              <div key={category}>
                <h3 className="text-xs font-bold text-ink/40 uppercase tracking-wider mb-2 px-1">
                  {category}
                </h3>
                <ul className="flex flex-col gap-2">
                  {snippets.map((s) => (
                    <SnippetCard
                      key={s.id}
                      snippet={s}
                      copied={copied === s.id}
                      onCopy={() => handleCopy(s.body, s.id)}
                      onEdit={() => setEditing(s)}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* نافذة الإضافة */}
      <ResponsiveModal
        isOpen={creating}
        onClose={() => setCreating(false)}
        title="إضافة ملاحظة"
      >
        <SnippetForm
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
        title="تعديل الملاحظة"
      >
        {editing && (
          <SnippetForm
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

function SnippetCard({
  snippet,
  copied,
  onCopy,
  onEdit,
}: {
  snippet: Snippet;
  copied: boolean;
  onCopy: () => void;
  onEdit: () => void;
}) {
  return (
    <li className="bg-paper border border-hairline rounded-lg shadow-sm p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <span className="font-bold text-ink text-sm">{snippet.title}</span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onCopy}
            className="text-xs px-2 py-1 rounded border border-hairline text-ink/60 hover:text-ink hover:border-ink/30 transition-colors"
          >
            {copied ? "✓ نُسخ" : "نسخ"}
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded border border-hairline flex items-center justify-center text-ink/50 hover:text-ink hover:border-ink/30 transition-colors"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <p className="text-sm text-ink/70 whitespace-pre-wrap leading-relaxed line-clamp-3">
        {snippet.body}
      </p>
    </li>
  );
}

function SnippetForm({
  initialData,
  onSubmit,
  onDelete,
}: {
  initialData?: Snippet;
  onSubmit: (values: FormValues) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      title: initialData?.title ?? "",
      body: initialData?.body ?? "",
      category: initialData?.category ?? "عام",
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
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4 pt-2">
      <TextField
        label="العنوان *"
        placeholder="مثال: رسالة شحن"
        error={errors.title?.message as string}
        {...register("title", { required: "العنوان مطلوب" })}
      />

      <div>
        <label className="text-xs font-semibold text-ink/60 block mb-1">الفئة</label>
        <select
          {...register("category")}
          className="w-full h-12 px-4 rounded-md border border-hairline focus:outline-none focus:ring-2 focus:ring-ink bg-paper text-base"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs font-semibold text-ink/60 block mb-1">النص *</label>
        <textarea
          {...register("body", { required: "النص مطلوب" })}
          placeholder="اكتب النص هنا..."
          rows={5}
          className="w-full px-4 py-3 rounded-md border border-hairline focus:outline-none focus:ring-2 focus:ring-ink bg-paper text-base resize-none"
        />
        {errors.body && <span className="text-xs text-alert mt-1 block">{errors.body.message}</span>}
      </div>

      <div className="flex gap-3 pt-2">
        <Button
          type="submit"
          isLoading={isSubmitting}
          className="flex-1"
        >
          {initialData ? "حفظ التعديلات" : "إضافة الملاحظة"}
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
        message="هل أنت متأكد من حذف هذه الملاحظة؟"
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmOpen(false)}
        isLoading={isSubmitting}
      />
    </form>
  );
}
