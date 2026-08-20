"use client";

import { useId, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Trash2, History, CheckCircle2, Clock } from "lucide-react";

import { ResponsiveModal } from "@/components/shared/ResponsiveModal";
import { MoneyInput } from "@/components/shared/MoneyInput";
import { Button } from "@/components/shared/Button";
import { Select } from "@/components/shared/Select";
import { TextArea } from "@/components/shared/TextArea";
import { AmountText } from "@/components/shared/AmountText";
import { DateText } from "@/components/shared/DateText";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { assertOnline } from "@/lib/online";
import { formatFilsToJod } from "@/lib/money";
import {
  useAccounts,
  useCreateReceivablePayment,
  useDeleteReceivablePayment,
  useReceivable,
} from "../hooks";
import type { PaymentItem } from "../queries";

// ── مخطط التحقق لتسجيل دفعة سداد ────────────────────────────────────────────

const paymentSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "التاريخ غير صالح" }),
  amountCents: z.coerce
    .number()
    .int()
    .positive("المبلغ يجب أن يكون أكبر من 0"),
  accountId: z.string().min(1, "الصندوق / الحساب المالي مطلوب"),
  notes: z.string().max(1000).default(""),
});

type PaymentFormValues = z.infer<typeof paymentSchema>;

interface ReceivablePaymentModalProps {
  receivableItem: PaymentItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ReceivablePaymentModal({
  receivableItem,
  isOpen,
  onClose,
  onSuccess,
}: ReceivablePaymentModalProps) {
  const id = useId();
  const today = new Date().toLocaleDateString("en-CA");
  const [showAddForm, setShowAddForm] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);

  // جلب تفاصيل الذمة وسجل دفعاتها
  const { data: receivableDetail, refetch: refetchDetail, isLoading: isLoadingDetail } =
    useReceivable(receivableItem?.id || "");

  const { data: accounts = [] } = useAccounts();
  const activeAccounts = useMemo(
    () => accounts.filter((a) => !a.isArchived),
    [accounts],
  );
  const defaultAccountId = useMemo(
    () => activeAccounts.find((a) => a.type === "cash")?.id || activeAccounts[0]?.id || "",
    [activeAccounts],
  );

  const createPaymentMutation = useCreateReceivablePayment();
  const deletePaymentMutation = useDeleteReceivablePayment();

  // حساب المتبقي الفعلي
  const originalAmountCents = receivableDetail?.amountCents ?? receivableItem?.amountCents ?? 0;
  const paidAmountCents = receivableDetail?.paidAmountCents ?? receivableItem?.paidAmountCents ?? 0;
  const remainingCents = Math.max(0, originalAmountCents - paidAmountCents);
  const isFullyPaid = remainingCents === 0;

  const paymentForm = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      date: today,
      amountCents: remainingCents > 0 ? remainingCents : 0,
      accountId: defaultAccountId,
      notes: "",
    },
  });

  // تعبئة المبلغ المتبقي بالكامل
  const handleFillFullRemaining = () => {
    paymentForm.setValue("amountCents", remainingCents, { shouldValidate: true });
  };

  const handleCreatePaymentSubmit = async (values: PaymentFormValues) => {
    if (!receivableItem) return;
    try {
      assertOnline();
    } catch {
      toast.error("لا يوجد اتصال — لم يُحفظ. أعد المحاولة.");
      return;
    }

    if (values.amountCents > remainingCents) {
      toast.error(`المبلغ المدفوع يتجاوز الرصيد المتبقي (${formatFilsToJod(remainingCents)})`);
      return;
    }

    const res = await createPaymentMutation.mutateAsync({
      data: {
        receivableId: receivableItem.id,
        amountCents: values.amountCents,
        date: values.date,
        accountId: values.accountId,
        notes: values.notes || undefined,
      },
      requestId: crypto.randomUUID(),
    });

    if (res.status === "ok") {
      toast.success("تم تسجيل دفعة السداد بنجاح");
      paymentForm.reset({
        date: today,
        amountCents: 0,
        accountId: defaultAccountId,
        notes: "",
      });
      setShowAddForm(false);
      refetchDetail();
      onSuccess();
    } else {
      toast.error(res.message);
    }
  };

  const handleConfirmDeletePayment = async () => {
    if (!deletingPaymentId) return;
    const res = await deletePaymentMutation.mutateAsync({ id: deletingPaymentId });
    if (res.status === "ok") {
      toast.success("تم حذف دفعة السداد");
      setDeletingPaymentId(null);
      refetchDetail();
      onSuccess();
    } else {
      toast.error(res.message);
    }
  };

  if (!receivableItem) return null;

  return (
    <>
      <ResponsiveModal
        isOpen={isOpen}
        onClose={onClose}
        title={`دَين: ${receivableItem.personName || receivableItem.title}`}
      >
        <div className="space-y-4">
          {/* بطاقة ملخص الدَّين */}
          <div className="p-4 bg-canvas/70 rounded-xl border border-hairline space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-ink/60 font-medium">حالة الدَّين</span>
              {isFullyPaid ? (
                <span className="px-2.5 py-1 bg-brand-soft text-brand-deep text-xs rounded-full font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  مسدَّد بالكامل
                </span>
              ) : (
                <span className="px-2.5 py-1 bg-warn-soft text-warn-deep text-xs rounded-full font-bold flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  قائم (غير مسدد)
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-hairline text-center">
              <div>
                <span className="text-[10px] text-ink/50 block">المبلغ الأصلي</span>
                <span className="font-mono font-bold text-sm text-ink">
                  <AmountText amount={originalAmountCents} />
                </span>
              </div>
              <div>
                <span className="text-[10px] text-ink/50 block">المسدَّد</span>
                <span className="font-mono font-bold text-sm text-brand-deep">
                  <AmountText amount={paidAmountCents} />
                </span>
              </div>
              <div>
                <span className="text-[10px] text-ink/50 block">المتبقي</span>
                <span className="font-mono font-bold text-sm text-alert">
                  <AmountText amount={remainingCents} />
                </span>
              </div>
            </div>

            {receivableItem.notes && (
              <p className="text-xs text-ink/65 pt-2 border-t border-hairline">
                <span className="font-bold">ملاحظات:</span> {receivableItem.notes}
              </p>
            )}
          </div>

          {/* نموذج إضافة دفعة جديدة */}
          {!isFullyPaid && (
            <div>
              {!showAddForm ? (
                <Button
                  type="button"
                  variant="ink"
                  onClick={() => {
                    paymentForm.setValue("amountCents", remainingCents);
                    setShowAddForm(true);
                  }}
                  icon={<Plus className="w-4 h-4" />}
                  className="w-full min-h-12"
                >
                  تسجيل دفعة سداد جديدة
                </Button>
              ) : (
                <form
                  onSubmit={paymentForm.handleSubmit(handleCreatePaymentSubmit)}
                  className="p-4 bg-paper rounded-xl border border-hairline shadow-sm space-y-4 animate-fade-in"
                >
                  <div className="flex items-center justify-between border-b border-hairline pb-2">
                    <h4 className="text-sm font-bold text-ink">تسجيل دفعة سداد</h4>
                    <button
                      type="button"
                      onClick={() => setShowAddForm(false)}
                      className="text-xs text-ink/50 hover:text-ink min-h-12 px-2"
                    >
                      إلغاء
                    </button>
                  </div>

                  {/* التاريخ */}
                  <div className="space-y-1.5 flex flex-col">
                    <label className="text-xs font-bold text-ink/75">تاريخ الدفعة</label>
                    <input
                      type="date"
                      {...paymentForm.register("date")}
                      className={`flex h-12 w-full rounded-md border bg-canvas px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink ${
                        paymentForm.formState.errors.date ? "border-alert" : "border-hairline"
                      }`}
                    />
                  </div>

                  {/* المبلغ */}
                  <div className="space-y-1.5 flex flex-col">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-ink/75">المبلغ المستلم</label>
                      <button
                        type="button"
                        onClick={handleFillFullRemaining}
                        className="text-[11px] text-brand font-bold hover:underline"
                      >
                        سداد كامل المتبقي ({formatFilsToJod(remainingCents)})
                      </button>
                    </div>
                    <Controller
                      name="amountCents"
                      control={paymentForm.control}
                      render={({ field }) => (
                        <MoneyInput
                          value={Number(field.value) || 0}
                          onChange={field.onChange}
                          error={paymentForm.formState.errors.amountCents?.message}
                        />
                      )}
                    />
                  </div>

                  {/* الصندوق / الحساب المالي */}
                  <div className="space-y-1.5 flex flex-col">
                    <label className="text-xs font-bold text-ink/75">أُودع في صندوق / حساب</label>
                    <Controller
                      name="accountId"
                      control={paymentForm.control}
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onChange={field.onChange}
                          error={paymentForm.formState.errors.accountId?.message}
                        >
                          <option value="">-- اختر الحساب المالي --</option>
                          {activeAccounts.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.name} ({acc.type === "cash" ? "صندوق كاش" : "بنك"})
                            </option>
                          ))}
                        </Select>
                      )}
                    />
                  </div>

                  {/* ملاحظات */}
                  <TextArea
                    label="ملاحظات الدفعة (اختياري)"
                    id={`${id}-payment-notes`}
                    placeholder="تفاصيل إضافية عن الدفعة..."
                    {...paymentForm.register("notes")}
                  />

                  <div className="flex gap-2 pt-2">
                    <Button
                      type="submit"
                      variant="ink"
                      isLoading={createPaymentMutation.isPending}
                      className="flex-1 min-h-12"
                    >
                      حفظ دفعة السداد
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setShowAddForm(false)}
                      className="min-h-12"
                    >
                      إلغاء
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* سجل دفعات السداد */}
          <div className="space-y-2 pt-2 border-t border-hairline">
            <h4 className="text-xs font-bold text-ink/70 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" />
              سجل الدفعات السابقة ({receivableDetail?.payments?.length ?? 0})
            </h4>

            {isLoadingDetail ? (
              <p className="text-xs text-ink/40 text-center py-4">جاري تحميل سجل الدفعات...</p>
            ) : !receivableDetail?.payments || receivableDetail.payments.length === 0 ? (
              <p className="text-xs text-ink/40 text-center py-4 bg-canvas/40 rounded-lg border border-hairline">
                لم يتم تسجيل أي دفعات سداد لهذا الدَّين بعد.
              </p>
            ) : (
              <div className="divide-y divide-hairline bg-canvas/40 rounded-lg border border-hairline overflow-hidden">
                {receivableDetail.payments.map((pmt) => (
                  <div
                    key={pmt.id}
                    className="p-3 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-brand-deep text-sm">
                          +<AmountText amount={pmt.amountCents} />
                        </span>
                        <span className="text-[10px] text-ink/50">
                          {pmt.accountName || "حساب مالي"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-ink/50 text-[10px]">
                        <DateText date={pmt.date} relative />
                        {pmt.notes && <span className="truncate max-w-[150px]">· {pmt.notes}</span>}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setDeletingPaymentId(pmt.id)}
                      className="min-h-[36px] min-w-[36px] p-2 text-ink/40 hover:text-alert transition-colors rounded-md"
                      title="حذف هذه الدفعة"
                      aria-label="حذف الدفعة"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </ResponsiveModal>

      {/* تأكيد حذف دفعة سداد */}
      <ConfirmDialog
        isOpen={deletingPaymentId !== null}
        title="تأكيد حذف دفعة السداد"
        message="سيؤدي حذف هذه الدفعة إلى إعادة المبلغ إلى الرصيد المتبقي للدَّين وخصمه من الصندوق. هل أنت متأكد؟"
        onConfirm={handleConfirmDeletePayment}
        onCancel={() => setDeletingPaymentId(null)}
        isLoading={deletePaymentMutation.isPending}
      />
    </>
  );
}
