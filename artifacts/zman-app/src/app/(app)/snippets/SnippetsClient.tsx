"use client";

import { Edit3, Plus, Trash2 } from "lucide-react";
import { useState, useCallback, useMemo } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { AppShellHeader } from "@/providers/app-shell-context";
import { EmptyState } from "@/components/shared/EmptyState";
import { ResponsiveModal } from "@/components/shared/ResponsiveModal";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/shared/Button";
import { TextField } from "@/components/shared/TextField";
import { Select } from "@/components/shared/Select";
import { TextArea } from "@/components/shared/TextArea";
import { SkeletonList } from "@/components/shared/SkeletonList";
import {
  useSnippets,
  useCreateSnippet,
  useUpdateSnippet,
  useDeleteSnippet,
} from "@/features/snippets/hooks";
import type { Snippet } from "@/features/snippets/db";
import { PageToolbar } from "@/components/shared/PageToolbar";

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

  const handleSearchChange = useCallback((q: string) => {
    setSearch(q);
  }, []);

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

  const pageAction = useMemo(() => (
    <PageToolbar
      search={{
        value: search,
        onChange: handleSearchChange,
        placeholder: "بحث في الملاحظات...",
      }}
      trailing={
        <Button
          onClick={() => setCreating(true)}
          size="icon"
          aria-label="إضافة ملاحظة"
          title="إضافة ملاحظة"
        >
          <Plus className="w-5 h-5" />
        </Button>
      }
    />
  ), [search, handleSearchChange]);

  return (
    <>
      <AppShellHeader title="" action={pageAction} />
      <div className="flex-1 flex flex-col gap-4">

        {/* المحتوى */}
        {isLoading ? (
          <SkeletonList />
        ) : items.length === 0 ? (
          <EmptyState
            title="لا توجد ملاحظات"
            description={search ? "لا توجد نتائج بحث مطابقة" : "أضف رسائل وملاحظات جاهزة لتسهيل المراسلة وتوثيق شروط الطلبات"}
          />
        ) : (
          <div className="space-y-6">
            {CATEGORIES.map((cat) => {
              const list = grouped[cat] || [];
              if (list.length === 0) return null;
              return (
                <div key={cat} className="space-y-2">
                  <h3 className="text-xs font-bold text-ink-3 px-1">{cat}</h3>
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {list.map((item, idx) => (
                      <li
                        key={item.id}
                        style={{ animationDelay: `${Math.min(idx, 4) * 60}ms` }}
                        className="animate-fade-slide-in"
                      >
                        <SnippetCard
                          snippet={item}
                          copied={copied === item.id}
                          onCopy={() => handleCopy(item.body, item.id)}
                          onEdit={() => setEditing(item)}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
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
          <Button
            variant="icon"
            onClick={onEdit}
          >
            <Edit3 className="w-3.5 h-3.5" />
          </Button>
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
        label="العنوان *"
        placeholder="مثال: رسالة شحن"
        error={errors.title?.message as string}
        {...register("title", { required: "العنوان مطلوب" })}
      />

      <Select
        label="الفئة"
        {...register("category")}
      >
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </Select>

      <TextArea
        label="النص *"
        {...register("body", { required: "النص مطلوب" })}
        placeholder="اكتب النص هنا..."
        error={errors.body?.message as string}
      />

      <div className="flex gap-3 pt-2">
        <Button
          type="submit"
          isLoading={isSubmitting}
          className="flex-1"
        >
          {initialData ? "حفظ التعديلات" : "إضافة للملاحظات"}
        </Button>
        {onDelete && (
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            isLoading={isSubmitting}
            className="flex-1"
          >
            حذف الملاحظة
          </Button>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        title="حذف الملاحظة"
        message="هل أنت متأكد من حذف هذه الملاحظة نهائياً؟"
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </form>
  );
}
