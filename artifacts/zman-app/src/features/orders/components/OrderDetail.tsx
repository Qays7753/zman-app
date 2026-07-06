"use client";

import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Edit,
  MessageSquare,
  ShoppingCart,
  Trash2,
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
import { cn } from "@/lib/utils";
import { buildOrderWhatsAppLink } from "@/lib/whatsapp";
import { useConvertOrderToSale } from "../../finance/hooks";
import { useDeleteOrder, useOrder, useUpdateOrderStatus, useMessageTemplate } from "../hooks";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

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
  const [isConverting, setIsConverting] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [showConvertConfirm, setShowConvertConfirm] = useState(false);

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



  // احتساب الهامش المرجعي غير المخزن (§5.5)
  const estimatedProfit = orderData.totalPriceCents - orderData.totalCostCents;

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
          className="flex items-center gap-2 text-sm text-ink-2 hover:text-ink min-h-[44px] px-3 -ms-3 rounded-md transition-colors"
        >
          <ArrowRight className="w-5 h-5" />
          <span>العودة للطلبات</span>
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="p-2 rounded-md hover:bg-canvas text-ink-2 min-h-[44px] min-w-[44px] flex items-center justify-center border border-hairline transition-colors"
            title="تعديل"
          >
            <Edit className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => setIsDeleteOpen(true)}
            className="p-2 rounded-md hover:bg-alert-soft text-alert min-h-[44px] min-w-[44px] flex items-center justify-center border border-hairline transition-colors"
            title="حذف"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* بطاقة بيانات العميل والطلب */}
      <div className="bg-paper p-6 rounded-lg border border-hairline shadow-sm space-y-4">
        <div className="flex justify-between items-start gap-4">
          <div>
            <span className="text-xs text-ink-3 block mb-1">العميل</span>
            <h3 className="text-xl font-bold text-ink leading-tight">
              {orderData.customerName}
            </h3>
            <span className="text-sm text-ink-2 block mt-1" dir="ltr">
              {orderData.customerPhone}
              {orderData.customerPhoneAlt && ` / ${orderData.customerPhoneAlt}`}
            </span>
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
      <div className="bg-paper p-6 rounded-lg border border-hairline shadow-sm space-y-4">
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
                    {c.quantity} × <AmountText amount={c.costCents} />
                  </span>
                </div>
                <span className="font-bold text-ink-2">
                  <AmountText amount={c.costCents * c.quantity} />
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

      {/* ملخص التسعير والأرباح */}
      <div className="bg-paper p-6 rounded-lg border border-hairline shadow-sm space-y-4">
        <h4 className="text-base font-bold text-ink border-b border-hairline pb-2">
          التسعير والربح المرجعي
        </h4>

        <div className="space-y-3">
          <div className="flex justify-between items-center text-sm">
            <span className="text-ink-2">السعر النهائي المتفق عليه:</span>
            <span className="text-lg font-bold text-info">
              <AmountText amount={orderData.totalPriceCents} />
            </span>
          </div>

          {orderData.depositCents > 0 && (
            <>
              <div className="flex justify-between items-center text-sm">
                <span className="text-ink-2">العربون المستلم:</span>
                <span className="font-semibold text-info">
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
                  <AmountText amount={orderData.totalPriceCents - orderData.depositCents} />
                </span>
              </div>
            </>
          )}

          <div className="flex justify-between items-center text-sm">
            <span className="text-ink-2">إجمالي التكلفة الفعلية للمكونات:</span>
            <span className="font-semibold text-alert-deep">
              <AmountText amount={orderData.totalCostCents} />
            </span>
          </div>

          <hr className="border-hairline" />

          <div className="flex justify-between items-center text-base font-bold">
            <span className="text-ink-2">صافي الربح المرجعي (المقدر):</span>
            <span
              className={cn(estimatedProfit >= 0 ? "text-info" : "text-alert")}
            >
              <AmountText amount={estimatedProfit} />
            </span>
          </div>
        </div>
      </div>

      {/* أزرار الحالة السريعة */}
      {(nextStatuses[orderData.status] ?? []).length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {(nextStatuses[orderData.status] ?? []).map((next) => (
            <button
              key={next.status}
              type="button"
              onClick={() => {
                if (next.status === "cancelled") {
                  setCancelConfirmOpen(true);
                } else {
                  handleUpdateStatus(next.status);
                }
              }}
              disabled={isUpdatingStatus}
              className={`flex-1 min-h-[44px] px-3 rounded-md text-sm font-bold border transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 ${
                next.status === "cancelled"
                  ? "border-alert text-alert hover:bg-alert-soft"
                  : "border-ink/20 text-ink hover:bg-canvas"
              }`}
            >
              {next.status !== "cancelled" && <CheckCircle2 className="w-4 h-4" />}
              {next.label}
            </button>
          ))}
        </div>
      )}

      {/* زر التراسل السريع والاتفاق: شريط سفلي لاصق في الهاتف للإبهام ومرن بالديسكتوب (§9.1) */}
      <div className="sticky bottom-0 bg-paper border-t border-hairline p-4 flex flex-col gap-3 lg:static lg:p-0 lg:bg-transparent lg:border-none z-sticky lg:z-auto">
        <Button
          onClick={handleWhatsApp}
          className="w-full py-3"
          icon={<MessageSquare className="w-5 h-5" />}
        >
          <span>إرسال تفاصيل العرض عبر واتساب</span>
        </Button>
        {orderData.status !== "delivered" &&
          orderData.status !== "cancelled" && (
            <Button
              onClick={() => setShowConvertConfirm(true)}
              disabled={isConverting}
              className="w-full py-3"
              icon={<ShoppingCart className="w-5 h-5" />}
            >
              <span>تحويل إلى مبيعات (تسجيل إيراد)</span>
            </Button>
          )}
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
            سيتم ترحيل كامل المبلغ المتبقي (<AmountText amount={orderData.totalPriceCents - (orderData.depositCents || 0)} />) إلى الصندوق كإيراد مبيعات، وتحديث حالة الطلب إلى تم التسليم.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowConvertConfirm(false)}
              className="flex-1 min-h-[44px] rounded-lg border border-hairline-2 bg-paper text-ink-2 font-bold hover:bg-canvas transition-colors"
            >
              إلغاء
            </button>
            <button
              type="button"
              disabled={isConverting}
              onClick={handleConvertToSale}
              className="flex-1 min-h-[44px] rounded-lg text-paper font-bold bg-emerald hover:bg-emerald/90 transition-colors disabled:opacity-50 flex items-center justify-center"
            >
              {isConverting ? "جارٍ التحويل..." : "تأكيد التحويل"}
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

          <div className="flex gap-3 pt-2">
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
              variant="destructive"
              className="flex-1"
            >
              نعم، احذف الطلب
            </Button>
          </div>
        </div>
      </ResponsiveModal>

      <ConfirmDialog
        isOpen={cancelConfirmOpen}
        title="تأكيد إلغاء الطلب"
        message="هل أنت متأكد من إلغاء هذا الطلب؟ لا يمكن التراجع عن هذه العملية."
        confirmLabel="نعم، إلغاء الطلب"
        onConfirm={async () => {
          setCancelConfirmOpen(false);
          await handleUpdateStatus("cancelled");
        }}
        onCancel={() => setCancelConfirmOpen(false)}
        isLoading={isUpdatingStatus}
      />
    </div>
  );
}


