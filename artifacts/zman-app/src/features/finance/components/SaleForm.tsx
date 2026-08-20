"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Link as LinkIcon, Trash2, Undo2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { MoneyInput } from "@/components/shared/MoneyInput";
import { Button } from "@/components/shared/Button";
import { TextArea } from "@/components/shared/TextArea";
import { assertOnline } from "@/lib/online";
import { saleInputSchema } from "../schema";
import type { NewSale, Sale } from "../types";

interface SaleFormProps {
  initialData?: Sale | null;
  /**
   * يُرجِع true عند نجاح الحفظ على الخادم، و false عند رفضه.
   *
   * ⚠️ التوقيع مقصود: المستدعي (SalesTab) يعالج الخطأ داخلياً بـ toast.error
   * ولا يرمي استثناءً — فلولا قيمة الإرجاع لما استطاع النموذج تمييز النجاح
   * من الفشل، ولمَسَح المسودّة حتى عند الرفض (فقدان إدخال المالك).
   */
  onSubmit: (values: NewSale) => Promise<boolean>;
  onDelete?: () => void;
  onReverse?: () => void;
  isSubmitting: boolean;
}

export function SaleForm({
  initialData,
  onSubmit,
  onDelete,
  onReverse,
  isSubmitting,
}: SaleFormProps) {
  const formId = useId();

  const defaultValues = {
    date: initialData
      ? (new Date(initialData.date).toLocaleDateString("en-CA") ?? "")
      : new Date().toLocaleDateString("en-CA"),
    source: (initialData?.source as "manual" | "order") || "manual",
    orderId: (initialData?.orderId as string | null) || null,
    amountCents: initialData?.amountCents || 0,
    description: initialData?.description || "",
  };

  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    reset,
    formState: { errors, isDirty },
  } = useForm({
    resolver: zodResolver(saleInputSchema),
    defaultValues,
  });

  useEffect(() => {
    if (initialData) {
      setValue(
        "date",
        new Date(initialData.date).toLocaleDateString("en-CA") ?? "",
      );
      setValue(
        "source",
        (initialData.source as "manual" | "order") || "manual",
      );
      setValue("orderId", initialData.orderId);
      setValue("amountCents", initialData.amountCents);
      setValue("description", initialData.description);
    }
  }, [initialData, setValue]);

  // ── مسودة localStorage (Issue #7) — إنشاء فقط، لا تُ persist في وضع التعديل ──
  const SALE_DRAFT_KEY = "zman_draft_sale";
  // مطابق لشكل defaultValues — مهم: source هو union دقيق لا string.
  type SaleDraft = {
    date: string;
    source: "manual" | "order";
    orderId: string | null;
    amountCents: number;
    description: string;
  };
  const [draftOffer, setDraftOffer] = useState<SaleDraft | null>(null);

  useEffect(() => {
    if (initialData) return;
    if (isDirty) {
      try {
        localStorage.setItem(SALE_DRAFT_KEY, JSON.stringify(getValues()));
      } catch {
        /* quota / private mode — silent */
      }
    } else {
      try {
        localStorage.removeItem(SALE_DRAFT_KEY);
      } catch {
        /* ignore */
      }
    }
  }, [isDirty, initialData, getValues]);

  useEffect(() => {
    if (initialData) return;
    try {
      const raw = localStorage.getItem(SALE_DRAFT_KEY);
      if (raw) setDraftOffer(JSON.parse(raw) as SaleDraft);
    } catch {
      /* ignore corrupted entries */
    }
  }, []);

  const handleRestoreDraft = () => {
    if (draftOffer) reset(draftOffer);
    setDraftOffer(null);
  };
  const handleDiscardDraft = () => {
    try {
      localStorage.removeItem(SALE_DRAFT_KEY);
    } catch {
      /* ignore */
    }
    setDraftOffer(null);
  };

  // Issue #5 — غلاف محلي لـ onSubmit يحرسه assertOnline. يُبقي المنطق داخل
  // SaleForm بدلاً من تعديل الأب (SalesTab) فيكون مكان صيانة واحد.
  // Issue #7 — امسح المسودّة فقط بعد تأكيد الخادم أن الحفظ نجح.
  // كان الكود يمسحها بمجرّد عودة onSubmit، لكن SalesTab يبتلع الخطأ بـ
  // toast.error ولا يرمي — فكانت مبيعة يرفضها الخادم تمحو مسودّة المالك.
  // نفس نمط SmartFinanceForm و OrderForm: المسح داخل فحص النتيجة.
  const handleFormSubmit = async (values: NewSale) => {
    try {
      assertOnline();
    } catch (e) {
      if (e instanceof Error && e.message === "offline") {
        toast.error("لا يوجد اتصال — لم يُحفظ. أعد المحاولة.");
        return;
      }
      throw e;
    }
    const ok = await onSubmit(values);
    if (ok) {
      try { localStorage.removeItem(SALE_DRAFT_KEY); } catch { /* ignore */ }
    }
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* مسودة غير محفوظة (Issue #7) */}
      {draftOffer && (
        <div className="p-3 rounded-lg border border-warn/30 bg-warn-soft text-warn-deep flex items-start gap-3 flex-wrap">
          <span className="text-sm flex-1">
            لديك مسودة غير محفوظة من إدخال سابق. هل تريد استرجاعها؟
          </span>
          <div className="flex gap-2 shrink-0">
            <Button
              type="button"
              variant="ink"
              className="min-h-[44px]"
              onClick={handleRestoreDraft}
            >
              استرجاع
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="min-h-[44px]"
              onClick={handleDiscardDraft}
            >
              تجاهل
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {/* التاريخ */}
        <div className="space-y-2 flex flex-col">
          <label
            htmlFor={`${formId}-date`}
            className="text-sm font-bold text-ink/75"
          >
            تاريخ البيع
          </label>
          <input
            id={`${formId}-date`}
            type="date"
            {...register("date")}
            className={`flex h-12 w-full rounded-md border border-hairline bg-paper px-3 py-2 text-base text-ink focus:outline-none focus:ring-2 focus:ring-ink ${
              errors.date ? "border-alert" : ""
            }`}
          />
          {errors.date && (
            <p className="text-xs text-alert mt-1">
              {errors.date.message as string}
            </p>
          )}
        </div>

        {/* المصدر */}
        <input type="hidden" {...register("source")} />

        {/* إذا كان مرتبط بطلب */}
        {initialData?.orderId && (
          <div className="p-3 bg-canvas/40 rounded-lg flex items-center justify-between border border-hairline text-sm">
            <span className="text-ink/60 flex items-center gap-1.5">
              <LinkIcon className="h-4 w-4" />
              مرتبط بالطلب:
            </span>
            <Link
              href={`/orders?view=${initialData.orderId}`}
              className="text-brand font-bold hover:underline"
            >
              عرض تفاصيل الطلب الأصلي
            </Link>
          </div>
        )}

        {/* القيمة */}
        <div className="space-y-2 flex flex-col">
          <label
            htmlFor={`${formId}-amount`}
            className="text-sm font-bold text-ink/75"
          >
            المبلغ المستلم
          </label>
          <Controller
            name="amountCents"
            control={control}
            render={({ field }) => (
              <MoneyInput
                value={Number(field.value) || 0}
                onChange={field.onChange}
                disabled={!!initialData?.orderId || isSubmitting}
                error={errors.amountCents?.message as string}
              />
            )}
          />
          {errors.amountCents && (
            <p className="text-xs text-alert mt-1">
              {errors.amountCents.message as string}
            </p>
          )}
          {initialData?.orderId && (
            <p className="text-xs text-ink/60 mt-1">
              * تم قفل المبلغ وتعديله تلقائياً بناءً على سعر الطلب الأصلي المتفق
              عليه.
            </p>
          )}
        </div>

        {/* الوصف */}
        <TextArea
          label="بيان وتفاصيل البيع"
          id={`${formId}-description`}
          placeholder=""
          {...register("description")}
          error={errors.description?.message as string}
        />
      </div>

      <div className="flex gap-3">
        <Button
          type="submit"
          variant="ink"
          isLoading={isSubmitting}
          className="flex-1"
        >
          {initialData ? "حفظ التعديلات" : "إضافة مبيعات"}
        </Button>

        {initialData?.orderId && onReverse ? (
          <Button
            type="button"
            variant="secondary"
            onClick={onReverse}
            disabled={isSubmitting}
            className="min-h-[44px] flex-1 gap-2 border-brand/30 text-brand hover:bg-brand-soft"
          >
            <Undo2 className="h-5 w-5" aria-hidden="true" />
            عكس التسليم
          </Button>
        ) : initialData && onDelete ? (
          <Button
            type="button"
            variant="icon"
            onClick={onDelete}
            disabled={isSubmitting}
            className="min-h-[44px] min-w-[44px] text-alert border-alert hover:bg-alert/5"
            title="حذف المبيعات"
            aria-label="حذف المبيعات"
          >
            <Trash2 className="h-5 w-5" aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    </form>
  );
}
