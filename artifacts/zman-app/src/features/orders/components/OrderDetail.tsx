"use client";

import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Edit,
  MessageSquare,
  ShoppingCart,
  Trash2,
  PackageMinus,
  Wallet,
  XCircle,
} from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { AmountText } from "@/components/shared/AmountText";
import { DateText } from "@/components/shared/DateText";
import { ErrorState } from "@/components/shared/ErrorState";
import { ResponsiveModal } from "@/components/shared/ResponsiveModal";
import { Button } from "@/components/shared/Button";
import { MoneyInput } from "@/components/shared/MoneyInput";
import { TextArea } from "@/components/shared/TextArea";
import { cn } from "@/lib/utils";
import { buildOrderWhatsAppLink, hasWhatsAppNumber } from "@/lib/whatsapp";
import {
  useAccounts,
  useConvertOrderToSale,
  useRefundOrder,
  useForfeitDeposit,
  useReverseDepositForfeiture,
  useReverseSale,
} from "../../finance/hooks";
import { useDeleteOrder, useOrder, useUpdateOrderStatus, useMessageTemplate } from "../hooks";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
// Phase 3 — استعلام حركات المخزون المُستهلكة عند التسليم (card 3.M).
import { getCatalogMovementsForOrder } from "@/features/inventory/queries";
import { useQuery } from "@tanstack/react-query";

interface OrderDetailProps {
  orderId: string;
  onEdit: () => void;
  onBack: () => void;
}



export function OrderDetail({ orderId, onEdit, onBack }: OrderDetailProps) {
  const _router = useRouter();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // 1. جلب بيانات الطلب ومكوناته الفرعية (§1.2)
  const { data: orderData, isLoading, isError, refetch } = useOrder(orderId);
  const { data: templateText } = useMessageTemplate();
  const deleteOrderMutation = useDeleteOrder();
  const updateStatusMutation = useUpdateOrderStatus();
  const convertOrderToSaleMutation = useConvertOrderToSale();
  const reverseSaleMutation = useReverseSale();
  const refundOrderMutation = useRefundOrder();
  const forfeitDepositMutation = useForfeitDeposit();
  const reverseDepositForfeitureMutation = useReverseDepositForfeiture();
  const { data: accounts = [] } = useAccounts();

  // Phase 3 — حركات المخزون المُستهلكة (card 3.M). تُجلب دائماً، لكن تُعرض فقط
  // إن كان الطلب مُسلَّماً. يُعاد جلبها تلقائياً عند تغيّر حالة الطلب.
  const { data: consumedMovements = [] } = useQuery({
    queryKey: ["inventory", "consumed-for-order", orderId],
    queryFn: () => getCatalogMovementsForOrder(orderId),
    enabled: !!orderId,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const [isConverting, setIsConverting] = useState(false);
  const [isReversing, setIsReversing] = useState(false);
  const [isReversingForfeiture, setIsReversingForfeiture] = useState(false);
  const [isForfeiting, setIsForfeiting] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelOptionsOpen, setCancelOptionsOpen] = useState(false);
  const [showConvertConfirm, setShowConvertConfirm] = useState(false);
  const [showReverseConfirm, setShowReverseConfirm] = useState(false);
  const [showReverseForfeitureConfirm, setShowReverseForfeitureConfirm] = useState(false);
  const [forfeitModalOpen, setForfeitModalOpen] = useState(false);
  const [forfeitNotes, setForfeitNotes] = useState("");
  const [forfeitDate, setForfeitDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundAmountCents, setRefundAmountCents] = useState(0);
  const [refundAccountId, setRefundAccountId] = useState("");
  const [refundDate, setRefundDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [refundNotes, setRefundNotes] = useState("");

  const handleConvertToSale = async () => {
    setIsConverting(true);
    setShowConvertConfirm(false);
    try {
      const response = await convertOrderToSaleMutation.mutateAsync({
        orderId: orderData?.id ?? "",
        requestId: crypto.randomUUID(),
      });

      if (response.status === "ok") {
        toast.success("تم تحويل الطلب إلى مبيعات");
        onBack();
      } else {
        toast.error(response.message || "فشل تحويل الطلب إلى مبيعات");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setIsConverting(false);
    }
  };

  const handleOpenRefund = () => {
    setRefundAmountCents(orderData?.depositCents ?? 0);
    setRefundAccountId(
      accounts.find((account) => account.type === "cash" && !account.isArchived)?.id ??
        accounts.find((account) => !account.isArchived)?.id ??
        "",
    );
    setRefundDate(new Date().toLocaleDateString("en-CA"));
    setRefundNotes("");
    setRefundModalOpen(true);
  };

  const handleRefund = async () => {
    if (!orderData || !refundAccountId || refundAmountCents <= 0) {
      toast.error("اختر الحساب وأدخل مبلغاً صالحاً للرد");
      return;
    }
    if (refundAmountCents > orderData.depositCents) {
      toast.error("مبلغ الرد يتجاوز العربون المتبقي");
      return;
    }

    const response = await refundOrderMutation.mutateAsync({
      values: {
        orderId: orderData.id,
        date: refundDate,
        amountCents: refundAmountCents,
        accountId: refundAccountId,
        notes: refundNotes,
      },
      requestId: crypto.randomUUID(),
    });

    if (response.status === "ok") {
      toast.success("تم تسجيل رد الأموال وتحديث العربون المتبقي");
      setRefundModalOpen(false);
      await refetch();
    } else {
      toast.error(response.message);
    }
  };

  const handleOpenForfeit = () => {
    setForfeitDate(new Date().toLocaleDateString("en-CA"));
    setForfeitNotes("");
    setForfeitModalOpen(true);
  };

  const handleForfeit = async () => {
    if (!orderData || orderData.depositCents <= 0) {
      toast.error("لا يوجد عربون متبقٍ قابل للاحتجاز");
      return;
    }
    setIsForfeiting(true);
    try {
      const response = await forfeitDepositMutation.mutateAsync({
        values: {
          orderId: orderData.id,
          date: forfeitDate,
          notes: forfeitNotes,
        },
        requestId: crypto.randomUUID(),
      });
      if (response.status === "ok") {
        toast.success("تم احتجاز العربون وإلغاء الطلب");
        setForfeitModalOpen(false);
        onBack();
      } else {
        toast.error(response.message || "فشل احتجاز العربون");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setIsForfeiting(false);
    }
  };

  const handleReverseForfeiture = async () => {
    if (!orderData?.forfeitureSale) return;
    setIsReversingForfeiture(true);
    setShowReverseForfeitureConfirm(false);
    try {
      const response = await reverseDepositForfeitureMutation.mutateAsync({
        values: { orderId: orderData.id },
        requestId: crypto.randomUUID(),
      });
      if (response.status === "ok") {
        toast.success("تم عكس احتجاز العربون وإعادة الطلب إلى «مؤكد»");
        onBack();
      } else {
        toast.error(response.message || "فشل عكس احتجاز العربون");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setIsReversingForfeiture(false);
    }
  };

  const handleReverseSale = async () => {
    setIsReversing(true);
    setShowReverseConfirm(false);
    try {
      const response = await reverseSaleMutation.mutateAsync({
        orderId: orderData?.id ?? "",
      });
      if (response.status === "ok") {
        toast.success("تم عكس التسليم وإعادة الطلب إلى حالة «مؤكد»");
        onBack();
      } else {
        toast.error(response.message || "فشل عكس البيع");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setIsReversing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-1/4 bg-hairline-2 rounded mb-6" />
        <div className="h-40 bg-paper border border-hairline rounded-lg" />
        <div className="h-60 bg-paper border border-hairline rounded-lg" />
      </div>
    );
  }

  if (isError || !orderData) {
    return (
      <ErrorState
        message="فشل تحميل تفاصيل الطلب. قد يكون غير موجود أو تم حذفه."
        onRetry={refetch}
      />
    );
  }



  // احتساب الهامش المرجعي غير المخزن (§5.5). الأرباح الإضافية تُضاف،
  // والتوصيل لا يدخل هذه المعادلة (رقم مرجعي فقط).
  const estimatedProfit =
    orderData.totalPriceCents -
    orderData.totalCostCents +
    (orderData.additionalProfitCents ?? 0);

  // معالجة الحذف المتأكد (Tier 2 Deletes) (§9.4)
  const handleDeleteConfirm = async () => {
    setIsDeleting(true);
    try {
      const response = await deleteOrderMutation.mutateAsync({
        id: orderData.id,
        updatedAt: new Date(orderData.updatedAt).toISOString(),
      });

      if (response.status === "ok") {
        toast.success("تم حذف الطلب بنجاح");
        setIsDeleteOpen(false);
        onBack();
      } else {
        toast.error(response.message || "فشل عملية حذف الطلب");
      }
    } catch (_error) {
      toast.error("حدث خطأ أثناء الاتصال بالسيرفر لحذف الطلب");
    } finally {
      setIsDeleting(false);
    }
  };

  // أزرار الحالة السريعة — الانتقالات المنطقية فقط
  const nextStatuses: Record<string, { status: string; label: string }[]> = {
    draft: [{ status: "sent", label: "إرسال ➜" }, { status: "cancelled", label: "إلغاء" }],
    sent: [{ status: "confirmed", label: "تأكيد ➜" }, { status: "cancelled", label: "إلغاء" }],
    confirmed: [{ status: "delivered", label: "توصيل ✓" }, { status: "cancelled", label: "إلغاء" }],
    delivered: [],
    cancelled: [],
  };

  const handleUpdateStatus = async (newStatus: string) => {
    // التسليم يمرّ عبر التحويل لمبيعة، لا عبر updateOrderStatus (المسار المباشر
    // إلى delivered ممنوع في الخادم). نُوجّه زر "توصيل ✓" إلى نفس مسار التحويل.
    if (newStatus === "delivered") {
      setShowConvertConfirm(true);
      return;
    }
    setIsUpdatingStatus(true);
    try {
      const response = await updateStatusMutation.mutateAsync({
        id: orderData.id,
        newStatus,
        updatedAt: new Date(orderData.updatedAt).toISOString(),
      });
      if (response.status === "ok") {
        toast.success("تم تحديث حالة الطلب");
      } else {
        toast.error(response.message || "فشل تحديث الحالة");
      }
    } catch {
      toast.error("حدث خطأ أثناء تحديث الحالة");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleWhatsApp = () => {
    if (!orderData) return;
    const link = buildOrderWhatsAppLink(orderData, templateText);
    window.open(link, "_blank");
    toast.info("تم الانتقال لتطبيق WhatsApp لإرسال تفاصيل العرض");
  };

  return (
    <div className="space-y-6 max-w-xl mx-auto pb-32 lg:pb-0">
      {/* زر العودة والخيارات الرئيسية */}
      <div className="flex items-center justify-between border-b border-hairline pb-4">
        <button
          type="button"
          onClick={onBack}
          className="flex min-h-12 items-center gap-2 rounded-md px-3 -ms-3 text-sm text-ink-2 transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          <ArrowRight className="w-5 h-5" />
          <span>العودة للطلبات</span>
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="h-12 w-12 rounded-md border border-hairline text-ink-2 transition-colors hover:bg-canvas focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            title="تعديل"
            aria-label="تعديل الطلب"
          >
            <Edit className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => setIsDeleteOpen(true)}
            className="h-12 w-12 rounded-md border border-alert/30 text-alert-deep transition-colors hover:bg-alert-soft focus-visible:ring-2 focus-visible:ring-alert-deep focus-visible:ring-offset-2"
            title="حذف"
            aria-label="حذف الطلب"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* بطاقة بيانات العميل والطلب */}
      <div className="bg-paper p-4 sm:p-6 rounded-lg border border-hairline shadow-elev-1 space-y-4">
        <div className="flex justify-between items-start gap-4">
          <div>
            <span className="text-xs text-ink-3 block mb-1">العميل</span>
            <h3 className="text-xl font-bold text-ink leading-tight">
              {orderData.customerName}
            </h3>
            {/* رقما الهاتف اختياريان — قد لا يوجد أيٌّ منهما */}
            {(orderData.customerPhone || orderData.customerPhoneAlt) && (
              <span className="text-sm text-ink-2 block mt-1" dir="ltr">
                {[orderData.customerPhone, orderData.customerPhoneAlt]
                  .filter(Boolean)
                  .join(" / ")}
              </span>
            )}
          </div>

          <StatusBadge
            status={orderData.status}
            className="px-3 py-1 h-6 text-xs font-semibold border leading-none flex items-center justify-center"
          />
        </div>

        <hr className="border-hairline" />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-xs text-ink-3 block mb-1">
              المنتج المطلوب
            </span>
            <span className="font-semibold text-ink">
              {orderData.productName}
            </span>
          </div>
          <div>
            <span className="text-xs text-ink-3 block mb-1">الكمية</span>
            <span className="font-semibold text-ink">
              {orderData.quantity} قطعة
            </span>
          </div>
          <div>
            <span className="text-xs text-ink-3 block mb-1">تاريخ استلام الطلب</span>
            <span className="text-sm text-ink-2 font-semibold">
              {orderData.receivedDate ? <DateText date={orderData.receivedDate} /> : "غير محدد"}
            </span>
          </div>
          <div>
            <span className="text-xs text-ink-3 block mb-1">تاريخ التسليم المتوقع</span>
            <span className="text-sm text-ink-2 font-semibold">
              {orderData.deliveryDate ? <DateText date={orderData.deliveryDate} /> : "غير محدد"}
            </span>
          </div>
          <div className="col-span-2">
            <span className="text-xs text-ink-3 block mb-1">تاريخ الإنشاء الفعلي</span>
            <span className="text-sm text-ink-3">
              <DateText date={orderData.createdAt} />
            </span>
          </div>
        </div>

        {orderData.notes && (
          <>
            <hr className="border-hairline" />
            <div>
              <span className="text-xs text-ink-3 block mb-1">
                ملاحظات الطلب
              </span>
              <p className="text-sm text-ink-2 leading-relaxed bg-canvas p-3 rounded">
                {orderData.notes}
              </p>
            </div>
          </>
        )}
      </div>

      {/* بطاقة مكونات الطلب */}
      <div className="bg-paper p-4 sm:p-6 rounded-lg border border-hairline shadow-elev-1 space-y-4">
        <h4 className="text-base font-bold text-ink border-b border-hairline pb-2">
          تكلفة المكونات الفرعية
        </h4>

        {orderData.components.length === 0 ? (
          <p className="text-sm text-ink-3 text-center py-4">
            لا توجد مواد أو مكونات مسجلة لهذا الطلب.
          </p>
        ) : (
          <div className="space-y-3">
            {orderData.components.map((c) => (
              <div
                key={c.id}
                className="flex justify-between items-center text-sm py-1"
              >
                <div>
                  <span className="font-semibold text-ink">{c.name}</span>
                  <span className="text-xs text-ink-3 block">
                    {c.quantity} × <AmountText amount={c.costCents} /> ×{" "}
                    {orderData.quantity} وحدة
                  </span>
                </div>
                <span className="font-bold text-ink-2">
                  <AmountText amount={c.costCents * c.quantity * orderData.quantity} />
                </span>
              </div>
            ))}

            <div className="border-t border-hairline pt-3 flex justify-between items-center text-sm font-semibold">
              <span className="text-ink-2">إجمالي تكلفة المكونات:</span>
              <span className="text-ink">
                <AmountText amount={orderData.totalCostCents} />
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Phase 3 (card 3.M) — المواد المستهلكة من المخزون. تُعرض فقط للطلبات
          المُسلَّمة (status='delivered'). تسرد كل صنف متتبَّع اُستهلك في التسليم
          مع الكمية والتاريخ. إن لم تكن هناك حركات، لا تُعرض البطاقة. */}
      {orderData.status === "delivered" && consumedMovements.length > 0 && (
        <div className="bg-paper p-6 rounded-lg border border-hairline shadow-sm space-y-3">
          <h4 className="text-base font-bold text-ink border-b border-hairline pb-2 flex items-center gap-1.5">
            <PackageMinus className="w-4 h-4 text-brand-deep" />
            المواد المستهلكة من المخزون
          </h4>
          <ul className="divide-y divide-hairline">
            {consumedMovements.map((m) => (
              <li
                key={m.movementId}
                className="py-2.5 flex items-center justify-between gap-3 text-sm"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-ink">{m.catalogName}</span>
                    <span className="text-[10px] text-ink-3">
                      ({m.componentName})
                    </span>
                  </div>
                  <div className="text-xs text-ink-3 mt-0.5">
                    <DateText date={m.movementDate} />
                    {m.notes ? ` · ${m.notes}` : ""}
                  </div>
                </div>
                <span className="font-bold text-alert shrink-0">
                  −{m.quantity} {m.catalogUnit}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ملخص التسعير والأرباح */}
      <div className="bg-paper p-4 sm:p-6 rounded-lg border border-hairline shadow-elev-1 space-y-4">
        <h4 className="text-base font-bold text-ink border-b border-hairline pb-2">
          التسعير والربح المرجعي
        </h4>

        <div className="space-y-3">
          <div className="flex justify-between items-center text-sm">
            <span className="text-ink-2">السعر النهائي المتفق عليه:</span>
            <span className="text-lg font-bold text-ink">
              <AmountText amount={orderData.totalPriceCents} />
            </span>
          </div>

          {orderData.depositCents > 0 && (
            <>
              <div className="flex justify-between items-center text-sm">
                <span className="text-ink-2">العربون المتبقي القابل للرد:</span>
                <span className="font-semibold text-warn-deep">
                  <AmountText amount={orderData.depositCents} />
                  {orderData.depositDate && (
                    <span className="text-xs text-ink-3 font-normal ms-1">
                      (بتاريخ {orderData.depositDate})
                    </span>
                  )}
                </span>
              </div>

              <div className="flex justify-between items-center text-sm">
                <span className="text-ink-2">المبلغ المتبقي للاستيفاء:</span>
                <span className="font-bold text-ink">
                  <AmountText amount={orderData.totalPriceCents + (orderData.additionalProfitCents || 0) - orderData.depositCents} />
                </span>
              </div>
            </>
          )}

          <div className="flex justify-between items-center text-sm">
            <span className="text-ink-2">إجمالي تكلفة المكوّنات (تقديرية):</span>
            <span className="font-semibold text-alert-deep">
              <AmountText amount={orderData.totalCostCents} />
            </span>
          </div>

          {(orderData.additionalProfitCents ?? 0) > 0 && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-ink-2">أرباح إضافية:</span>
              <span className="font-semibold text-brand-deep">
                +<AmountText amount={orderData.additionalProfitCents ?? 0} />
              </span>
            </div>
          )}

          <hr className="border-hairline" />

          <div className="flex justify-between items-center text-base font-bold">
            <span className="text-ink-2">صافي الربح المرجعي (المقدر):</span>
            <span
              className={cn(estimatedProfit >= 0 ? "text-brand-deep" : "text-alert-deep")}
            >
              <AmountText amount={estimatedProfit} />
            </span>
          </div>

          {/* التوصيل — رقم مرجعي فقط، خارج حساب الربح */}
          {(orderData.deliveryPaidCents ?? 0) > 0 && (
            <div className="pt-2 mt-1 border-t border-hairline">
              <div className="flex justify-between items-center text-sm">
                <span className="text-ink-3">التوصيل — مرجعي:</span>
                <span className="font-medium text-ink-2">
                  <AmountText amount={orderData.deliveryPaidCents ?? 0} />
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action Dock — قرار واحد واضح حسب حالة الطلب، مع إبقاء كل handlers الحالية كما هي */}
      <div className="sticky bottom-0 z-actionbar bg-paper border-t border-hairline p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex flex-col gap-2 shadow-[0_-4px_14px_rgba(26,46,26,0.06)] lg:static lg:p-0 lg:bg-transparent lg:border-none lg:shadow-none lg:z-auto">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(nextStatuses[orderData.status] ?? []).map((next) => (
            <Button
              key={next.status}
              type="button"
              onClick={() => {
                if (next.status === "cancelled") {
                  setCancelOptionsOpen(true);
                } else {
                  handleUpdateStatus(next.status);
                }
              }}
              disabled={isUpdatingStatus}
              variant={next.status === "cancelled" ? "destructive" : "primary"}
              className="w-full"
              icon={
                next.status === "cancelled" ? (
                  <XCircle className="w-5 h-5" />
                ) : next.status === "delivered" ? (
                  <ShoppingCart className="w-5 h-5" />
                ) : (
                  <CheckCircle2 className="w-5 h-5" />
                )
              }
            >
              {next.label}
            </Button>
          ))}

          {/* المسار المباشر محفوظ للمسودات/المرسلة فقط؛ عند «مؤكد» يصبح زر «توصيل» هو المسار الوحيد لتجنب التكرار. */}
          {orderData.status !== "delivered" &&
            orderData.status !== "cancelled" &&
            orderData.status !== "confirmed" && (
              <Button
                onClick={() => setShowConvertConfirm(true)}
                disabled={isConverting}
                variant="secondary"
                className="w-full"
                icon={<ShoppingCart className="w-5 h-5" />}
              >
                تسجيل إيراد مباشرة
              </Button>
            )}

          {/* رد الأموال يبقى مستقلاً عن تغيير الحالة أو عكس التسليم. */}
          {orderData.status !== "delivered" &&
            orderData.status !== "cancelled" &&
            orderData.depositCents > 0 && (
              <Button
                onClick={handleOpenRefund}
                disabled={refundOrderMutation.isPending}
                variant="secondary"
                className="w-full"
                icon={<Wallet className="w-5 h-5" />}
              >
                رد أموال العربون
              </Button>
            )}

          {orderData.status === "delivered" && (
            <Button
              onClick={() => setShowReverseConfirm(true)}
              disabled={isReversing}
              variant="secondary"
              className="w-full"
              icon={<ArrowLeft className="w-5 h-5" />}
            >
              عكس التسليم
            </Button>
          )}

          {orderData.status === "cancelled" && orderData.forfeitureSale && (
            <Button
              onClick={() => setShowReverseForfeitureConfirm(true)}
              disabled={isReversingForfeiture}
              variant="secondary"
              className="w-full"
              icon={<ArrowLeft className="w-5 h-5" />}
            >
              عكس احتجاز العربون
            </Button>
          )}

          {hasWhatsAppNumber(orderData) && (
            <Button
              onClick={handleWhatsApp}
              variant="secondary"
              className="w-full"
              icon={<MessageSquare className="w-5 h-5" />}
            >
              إرسال تفاصيل العرض عبر واتساب
            </Button>
          )}
        </div>
      </div>

      {/* تأكيد تحويل الطلب إلى مبيعات (إيراد) */}
      <ResponsiveModal
        isOpen={showConvertConfirm}
        onClose={() => setShowConvertConfirm(false)}
        title="تأكيد تحويل الطلب إلى مبيعات"
      >
        <div className="space-y-4 p-4 font-medium text-ink">
          <p className="text-sm text-ink-2 leading-relaxed">
            هل أنت متأكد من تحويل هذا الطلب إلى مبيعات (تسجيل إيراد)؟
          </p>
          <p className="text-xs text-ink-3">
            سيتم ترحيل كامل المبلغ المتبقي (<AmountText amount={orderData.totalPriceCents + (orderData.additionalProfitCents || 0) - (orderData.depositCents || 0)} />) إلى الصندوق كإيراد مبيعات (يشمل الأرباح الإضافية)، وتحويل العربون المحصَّل إلى إيراد، وتحديث حالة الطلب إلى تم التسليم.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => setShowConvertConfirm(false)}
              className="flex-1 min-h-12 rounded-lg border border-hairline-2 bg-paper text-ink-2 font-bold hover:bg-canvas transition-colors"
            >
              إلغاء
            </button>
            <button
              type="button"
              disabled={isConverting}
              onClick={handleConvertToSale}
              className="flex-1 min-h-12 rounded-lg text-paper font-bold bg-brand-deep hover:bg-brand transition-colors disabled:opacity-50 flex items-center justify-center"
            >
              {isConverting ? "جارٍ التحويل..." : "تأكيد التحويل"}
            </button>
          </div>
        </div>
      </ResponsiveModal>

      {/* نموذج رد الأموال — مستقل عن عكس التسليم والإلغاء النهائي */}
      <ResponsiveModal
        isOpen={refundModalOpen}
        onClose={() => setRefundModalOpen(false)}
        title="رد أموال العربون"
      >
        <div className="space-y-4 p-4">
          <div className="rounded-lg border border-warn/30 bg-warn-soft p-3 text-sm text-warn-deep leading-relaxed">
            المتاح للرد الآن: <AmountText amount={orderData.depositCents} />. سيُسجَّل الخروج من الحساب الذي تختاره، ولا يغيّر هذا الإجراء حالة الطلب.
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm font-bold text-ink-2">المبلغ المراد رده</label>
              <button
                type="button"
                className="min-h-12 px-2 text-sm font-bold text-brand-deep"
                onClick={() => setRefundAmountCents(orderData.depositCents)}
              >
                رد كامل المبلغ
              </button>
            </div>
            <MoneyInput
              value={refundAmountCents}
              onChange={(value) => setRefundAmountCents(Number(value) || 0)}
              error={
                refundAmountCents > orderData.depositCents
                  ? "المبلغ يتجاوز العربون المتبقي"
                  : undefined
              }
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="refund-date" className="text-sm font-bold text-ink-2">
              تاريخ الرد
            </label>
            <input
              id="refund-date"
              type="date"
              value={refundDate}
              onChange={(event) => setRefundDate(event.target.value)}
              className="flex h-12 w-full rounded-md border border-border-field bg-paper px-3 py-2 text-base text-ink focus:ring-2 focus:ring-brand focus:ring-offset-2"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="refund-account" className="text-sm font-bold text-ink-2">
              الحساب الذي خرجت منه الأموال
            </label>
            <select
              id="refund-account"
              value={refundAccountId}
              onChange={(event) => setRefundAccountId(event.target.value)}
              className="flex h-12 w-full rounded-md border border-border-field bg-paper px-3 py-2 text-base text-ink focus:ring-2 focus:ring-brand focus:ring-offset-2"
            >
              <option value="">اختر الحساب الفعلي</option>
              {accounts
                .filter((account) => !account.isArchived)
                .map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} ({account.type === "cash" ? "صندوق" : "بنك"})
                  </option>
                ))}
            </select>
          </div>

          <TextArea
            label="ملاحظات الرد (اختياري)"
            id="refund-notes"
            value={refundNotes}
            onChange={(event) => setRefundNotes(event.target.value)}
            placeholder="سبب الرد أو تفاصيله..."
          />

          <div className="flex flex-col gap-3 pt-2 sm:flex-row">
            <Button
              type="button"
              variant="secondary"
              className="min-h-12 w-full flex-1"
              onClick={() => setRefundModalOpen(false)}
              disabled={refundOrderMutation.isPending}
            >
              إلغاء
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-12 w-full flex-1"
              onClick={() => void handleRefund()}
              isLoading={refundOrderMutation.isPending}
              disabled={
                refundOrderMutation.isPending ||
                !refundAccountId ||
                refundAmountCents <= 0 ||
                refundAmountCents > orderData.depositCents
              }
            >
              تأكيد رد الأموال
            </Button>
          </div>
        </div>
      </ResponsiveModal>

      {/* حوار مصير العربون — الاحتفاظ بالمتبقي وإلغاء الطلب */}
      <ResponsiveModal
        isOpen={forfeitModalOpen}
        onClose={() => setForfeitModalOpen(false)}
        title="احتفاظ بالعربون وإلغاء الطلب"
      >
        <div className="space-y-4 p-4">
          <div className="rounded-lg border border-alert/30 bg-alert-soft p-3 text-sm text-alert-deep leading-relaxed">
            سيتم احتجاز المتبقي كإيراد تسوية، وتسجيل القرار على الطلب، ثم نقله إلى «ملغى». لا تُنشأ حركة نقدية جديدة لأن المال دخل الصندوق سابقاً.
          </div>
          <div className="rounded-lg border border-hairline bg-canvas p-3 text-sm font-bold text-ink">
            المتبقي الذي سيُحتجز: <AmountText amount={orderData.depositCents} />
          </div>
          <div className="space-y-2">
            <label htmlFor="forfeit-date" className="text-sm font-bold text-ink-2">
              تاريخ التسوية
            </label>
            <input
              id="forfeit-date"
              type="date"
              value={forfeitDate}
              onChange={(event) => setForfeitDate(event.target.value)}
              className="flex h-12 w-full rounded-md border border-border-field bg-paper px-3 py-2 text-base text-ink focus:ring-2 focus:ring-brand focus:ring-offset-2"
            />
          </div>
          <TextArea
            label="ملاحظات الاحتجاز (اختياري)"
            id="forfeit-notes"
            value={forfeitNotes}
            onChange={(event) => setForfeitNotes(event.target.value)}
            placeholder="سبب الاحتفاظ بالعربون أو تفاصيل الاتفاق..."
          />
          <div className="flex flex-col gap-3 pt-2 sm:flex-row">
            <Button
              type="button"
              variant="secondary"
              className="min-h-12 w-full flex-1"
              onClick={() => setForfeitModalOpen(false)}
              disabled={isForfeiting}
            >
              تراجع
            </Button>
            <Button
              type="button"
              variant="destructive-solid"
              className="min-h-12 w-full flex-1"
              onClick={() => void handleForfeit()}
              isLoading={isForfeiting}
              disabled={isForfeiting || orderData.depositCents <= 0}
            >
              تأكيد الاحتفاظ والإلغاء
            </Button>
          </div>
        </div>
      </ResponsiveModal>

      {/* تأكيد عكس التسليم — إعادة الطلب من "delivered" إلى "confirmed" */}
      <ResponsiveModal
        isOpen={showReverseConfirm}
        onClose={() => setShowReverseConfirm(false)}
        title="تأكيد عكس التسليم"
      >
        <div className="space-y-4 p-4 font-medium text-ink">
          <p className="text-sm text-ink-2 leading-relaxed">
            هل أنت متأكد من عكس هذا التسليم؟ سيتم:
          </p>
          <ul className="text-xs text-ink-3 space-y-1 list-disc list-inside">
            <li>إعادة العربون المحوَّل إلى حركة عربون (deposit) نشطة.</li>
            <li>حذف حركة المتبقي من الصندوق.</li>
            <li>حذف سجل المبيعة.</li>
            <li>إعادة حالة الطلب إلى «تحت التنفيذ» لتعديله ثم إعادة تحويله.</li>
          </ul>
          <p className="text-xs text-warn-deep bg-warn-soft p-2 rounded">
            ملاحظة: النقد الفعلي في الصندوق لا يتأثر — العربون كان محفوظاً كنقد منذ بدايته.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => setShowReverseConfirm(false)}
              className="flex-1 min-h-12 rounded-lg border border-hairline-2 bg-paper text-ink-2 font-bold hover:bg-canvas transition-colors"
            >
              إلغاء
            </button>
            <button
              type="button"
              disabled={isReversing}
              onClick={handleReverseSale}
              className="flex-1 min-h-12 rounded-lg text-paper font-bold bg-warn-deep hover:bg-warn-deep/90 transition-colors disabled:opacity-50 flex items-center justify-center"
            >
              {isReversing ? "جارٍ العكس..." : "تأكيد عكس البيع"}
            </button>
          </div>
        </div>
      </ResponsiveModal>

      {/* شيت الحذف للتأكيد (Tier 2 Destructive Action) (§9.4) */}
      <ResponsiveModal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        title="تأكيد حذف الطلب"
      >
        <div className="space-y-4">
          <div className="p-4 bg-alert-soft rounded text-alert-deep flex items-start gap-3">
            <AlertCircle className="w-6 h-6 shrink-0" />
            <div className="text-sm leading-relaxed">
              <p className="font-bold">تحذير: إجراء غير قابل للتراجع</p>
              <p className="mt-1">
                سيتم إخفاء هذا الطلب من جميع القوائم والتقارير واللوحات المالية.
                يُحفظ السجل لطيفاً في قاعدة البيانات فقط.
              </p>
            </div>
          </div>

          <p className="text-sm text-ink-2">
            هل أنت متأكد من رغبتك في حذف هذا الطلب للمنتج{" "}
            <strong>{orderData.productName}</strong>؟
          </p>

          <div className="flex flex-col gap-3 pt-2 sm:flex-row">
            <Button
              type="button"
              onClick={() => setIsDeleteOpen(false)}
              disabled={isDeleting}
              variant="secondary"
              className="flex-1"
            >
              إلغاء
            </Button>
            <Button
              type="button"
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              isLoading={isDeleting}
              variant="destructive-solid"
              className="min-h-12 flex-1"
            >
              نعم، احذف الطلب
            </Button>
          </div>
        </div>
      </ResponsiveModal>

      {/* اختيار نوع الإلغاء قبل تنفيذ أي تغيير على حالة الطلب */}
      <ResponsiveModal
        isOpen={cancelOptionsOpen}
        onClose={() => setCancelOptionsOpen(false)}
        title="اختيار نوع الإلغاء"
      >
        <div className="space-y-3 p-4">
          <p className="text-sm text-ink-2 leading-relaxed">
            اختر ما يناسب وضع الطلب. الإلغاء المؤقت لا يرد الأموال، والإلغاء النهائي لا ينفذ رد أموال تلقائياً.
          </p>
          <Button
            type="button"
            variant="primary"
            className="w-full min-h-12"
            onClick={() => {
              setCancelOptionsOpen(false);
              void handleUpdateStatus("confirmed");
            }}
            disabled={isUpdatingStatus || orderData.status === "confirmed"}
          >
            {orderData.status === "confirmed"
              ? "الطلب مؤكد بالفعل"
              : "إلغاء مؤقت — إبقاء الطلب «مؤكداً»"}
          </Button>
          {orderData.depositCents > 0 && (
            <>
              <Button
                type="button"
                variant="secondary"
                className="w-full min-h-12"
                onClick={() => {
                  setCancelOptionsOpen(false);
                  handleOpenRefund();
                }}
                disabled={refundOrderMutation.isPending}
              >
                رد كامل أو جزئي للعربون
              </Button>
              <Button
                type="button"
                variant="destructive-solid"
                className="w-full min-h-12"
                onClick={() => {
                  setCancelOptionsOpen(false);
                  handleOpenForfeit();
                }}
                disabled={isForfeiting}
              >
                احتفاظ بالعربون وإلغاء الطلب
              </Button>
              <p className="px-1 text-xs text-warn-deep leading-relaxed">
                اختر الرد إذا كان المال سيعود للعميل، أو الاحتفاظ إذا كان القرار نهائياً. بعد الرد الجزئي يمكنك احتجاز المتبقي.
              </p>
            </>
          )}
          {orderData.depositCents <= 0 && (
            <Button
              type="button"
              variant="destructive-solid"
              className="w-full min-h-12"
              onClick={() => {
                setCancelOptionsOpen(false);
                setCancelConfirmOpen(true);
              }}
              disabled={isUpdatingStatus}
            >
              إلغاء نهائي — نقل الطلب إلى «ملغى»
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            className="w-full min-h-12"
            onClick={() => setCancelOptionsOpen(false)}
          >
            متابعة العمل على الطلب
          </Button>
        </div>
      </ResponsiveModal>

      <ConfirmDialog
        isOpen={cancelConfirmOpen}
        title="تأكيد الإلغاء النهائي"
        message="سيُنقل الطلب إلى «ملغى» ويُغلق مسار التنفيذ. لا يسجل هذا الإجراء رد أموال؛ نفّذ رد الأموال بشكل منفصل عند الحاجة قبل الإلغاء النهائي."
        confirmLabel="نعم، إلغاء نهائي"
        onConfirm={async () => {
          setCancelConfirmOpen(false);
          await handleUpdateStatus("cancelled");
        }}
        onCancel={() => setCancelConfirmOpen(false)}
        isLoading={isUpdatingStatus}
      />

      <ConfirmDialog
        isOpen={showReverseForfeitureConfirm}
        title="تأكيد عكس احتجاز العربون"
        message="سيُعاد تصنيف حركة العربون إلى التزام، ويُحذف سجل مبيعة الاحتجاز ناعماً، ويُعاد الطلب إلى «مؤكد». لا تُنشأ حركة نقدية جديدة، وتبقى ردود الأموال السابقة كما هي."
        confirmLabel="نعم، عكس الاحتجاز"
        onConfirm={() => void handleReverseForfeiture()}
        onCancel={() => setShowReverseForfeitureConfirm(false)}
        isLoading={isReversingForfeiture}
      />
    </div>
  );
}


