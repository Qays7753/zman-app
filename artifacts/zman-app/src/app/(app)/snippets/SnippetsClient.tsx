"use client";

import { Edit3, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { AppShellHeader } from "@/providers/app-shell-context";
import { EmptyState } from "@/components/shared/EmptyState";
import { ResponsiveModal } from "@/components/shared/ResponsiveModal";
import {
  createSnippet,
  deleteSnippet,
  getSnippets,
  updateSnippet,
} from "@/features/snippets/actions";
import type { Snippet } from "@/features/snippets/db";

const CATEGORIES = ["عام", "رسائل العملاء", "الوصف", "الشروط", "أخرى"];

interface FormValues {
  title: string;
  body: string;
  category: string;
}

export default function SnippetsClient() {
  const [items, setItems] = useState<Snippet[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Snippet | null>(null);
  const [creating, setCreating] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const fetchItems = useCallback((q?: string) => {
    startTransition(async () => {
      const result = await getSnippets(q);
      setItems(result);
    });
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearch(q);
    fetchItems(q);
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
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/40 pointer-events-none" />
            <input
              ref={searchRef}
              type="search"
              value={search}
              onChange={handleSearch}
              placeholder="بحث في الملاحظات..."
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

        {/* المحتوى */}
        {isPending ? (
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
            const res = await createSnippet(values);
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
        title="تعديل الملاحظة"
      >
        {editing && (
          <SnippetForm
            initialData={editing}
            onSubmit={async (values) => {
              const res = await updateSnippet({
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
              const res = await deleteSnippet(editing.id, updatedAt);
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
    <li className="bg-paper border border-hairline rounded-xl p-4 flex flex-col gap-2">
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
            className="w-8 h-8 rounded border border-hairline flex items-center justify-center text-ink/50 hover:text-ink hover:border-ink/30 transition-colors"
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

  const handleDelete = async () => {
    if (!onDelete) return;
    if (!confirm("هل أنت متأكد من حذف هذه الملاحظة؟")) return;
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
        <label className="text-xs font-semibold text-ink/60 block mb-1">العنوان *</label>
        <input
          type="text"
          placeholder=""
          {...register("title", { required: "العنوان مطلوب" })}
          className="w-full h-12 px-4 rounded-md border border-hairline focus:outline-none focus:ring-2 focus:ring-ink bg-paper text-base"
        />
        {errors.title && <span className="text-xs text-alert mt-1 block">{errors.title.message}</span>}
      </div>

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
          placeholder=""
          rows={5}
          className="w-full px-4 py-3 rounded-md border border-hairline focus:outline-none focus:ring-2 focus:ring-ink bg-paper text-base resize-none"
        />
        {errors.body && <span className="text-xs text-alert mt-1 block">{errors.body.message}</span>}
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 min-h-[48px] bg-ink text-paper rounded-md font-bold text-sm disabled:opacity-60 hover:bg-ink/90 transition-colors"
        >
          {isSubmitting ? "جاري الحفظ..." : initialData ? "حفظ التعديلات" : "إضافة الملاحظة"}
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isSubmitting}
            className="min-h-[48px] px-4 rounded-md border border-alert text-alert hover:bg-alert-soft transition-colors disabled:opacity-60 flex items-center"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </form>
  );
}
