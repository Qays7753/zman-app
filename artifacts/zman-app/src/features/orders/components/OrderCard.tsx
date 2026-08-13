"use client";

import {
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Edit,
  FileEdit,
  Loader2,
  MessageSquare,
  MoreVertical,
  RotateCcw,
  Send,
  ShoppingCart,
  Truck,
  Trash2,
  Wallet,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AmountText } from "@/components/shared/AmountText";
import { DateText } from "@/components/shared/DateText";
import { ResponsiveModal } from "@/components/shared/ResponsiveModal";
import { useClickOutside } from "@/components/shared/useClickOutside";
import { cn, formatAmmanDate, getAmmanDate } from "@/lib/utils";
import { formatDate } from "@/lib/dates";
import { buildOrderWhatsAppLink, hasWhatsAppNumber } from "@/lib/whatsapp";
import type { Order } from "../types";
import { useMessageTemplate, useUpdateOrderStatus } from "../hooks";
import { useConvertOrderToSale } from "../../finance/hooks";
import {
  NEXT_ACTION_LABEL,
  NEXT_STATUS,
  STATUS_COLORS,
  STATUS_LABELS,
  STATUS_STRIP,
} from "@/lib/status-colors";

// أيقونة كل حالة (للشريط العلوي)
const STATUS_ICON: Record<string, LucideIcon> = {
  draft: FileEdit,
  sent: Send,
  confirmed: CheckCircle2,
  delivered: Truck,
  cancelled: XCircle,
};

interface OrderCardProps {
  order: Order;
  onEdit: (order: Order) => void;
  onDelete: (order: Order) => void;
  onClick: (order: Order) => void;
}



export function OrderCard({
  order,
  onEdit,
  onDelete,
  onClick,
}: OrderCardProps) {
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const { data: templateText } = useMessageTemplate();
  const updateStatusMutation = useUpdateOrderStatus();
  const convertToSaleMutation = useConvertOrderToSale();
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [localStatus, setLocalStatus] = useState(order.status);
  // قائمة الحالات الأخرى (⋯) + تأكيد خفيف للنقل
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [showConvertConfirm, setShowConvertConfirm] = useState(false);
  const statusMenuRef = useRef<HTMLDivElement>(null);
  useClickOutside(statusMenuRef, () => setStatusMenuOpen(false), statusMenuOpen);

  // حساب المتبقي والعدّاد لتاريخ التسليم بالتوقيت المحلي لعمّان
  let countdownText = "—";
  let countdownColorClass = "text-ink-3";
  let isToday = false;

  if (order.deliveryDate) {
    const todayStr = getAmmanDate();
    const deliveryStr = formatAmmanDate(order.deliveryDate);
    const d1 = new Date(deliveryStr + "T00:00:00Z");
    const d2 = new Date(todayStr + "T00:00:00Z");
    const diffTime = d1.getTime() - d2.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > 0) {
      countdownText = `باقٍ ${diffDays} أيام`;
      countdownColorClass = "text-emerald-deep font-bold";
    } else if (diffDays === 0) {
      countdownText = "التسليم اليوم";
      isToday = true;
    } else {
      countdownText = `متأخّر ${Math.abs(diffDays)} أيام`;
      countdownColorClass = "text-alert font-bold";
    }
  }

  useEffect(() => {
    setLocalStatus(order.status);
  }, [order.status]);

  // رقما الهاتف اختياريان — بلا رقم لا معنى لزر واتساب (رابط wa.me مكسور).
  const canWhatsApp = hasWhatsAppNumber(order);

  const handleWhatsApp = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsActionsOpen(false);
    const link = buildOrderWhatsAppLink(order, templateText);
    window.open(link, "_blank");
    toast.info("تم الانتقال لتطبيق WhatsApp لإرسال الطلب");
  };

  const applyStatus = async (newStatus: string) => {
    // الوصول إلى "تم التوصيل" (delivered) يجب أن يمرّ عبر تحويل الطلب لمبيعات
    // (ينشئ سجل sale + يرحّل المتبقّي للصندوق). تغيير الحالة المجرّد يترك
    // مبيعات صفرية — فنحوّل هنا للمسار الصحيح.
    if (newStatus === "delivered") {
      setPendingStatus(null);
      setStatusMenuOpen(false);
      await handleConvertToSale();
      return;
    }

    const oldStatus = localStatus;
    setLocalStatus(newStatus);
    setIsUpdatingStatus(true);
    setPendingStatus(null);
    setStatusMenuOpen(false);
    try {
      const res = await updateStatusMutation.mutateAsync({
        id: order.id,
        newStatus,
        updatedAt: new Date(order.updatedAt).toISOString(),
      });
      if (res.status === "ok") {
        toast.success(`تم تحديث الحالة إلى: ${STATUS_LABELS[newStatus]}`);
      } else {
        toast.error(res.message);
        setLocalStatus(oldStatus);
      }
    } catch {
      toast.error("حدث خطأ أثناء تحديث الحالة");
      setLocalStatus(oldStatus);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // الحالة التالية في الرحلة (للزر الذكي)
  const nextStatus = NEXT_STATUS[localStatus];
  const isCancelled = localStatus === "cancelled";
  const canConvertToSale = localStatus !== "delivered" && localStatus !== "cancelled";

  const handleConvertToSale = async () => {
    setIsConverting(true);
    setShowConvertConfirm(false);
    try {
      const response = await convertToSaleMutation.mutateAsync({
        orderId: order.id,
        requestId: crypto.randomUUID(),
      });
      if (response.status === "ok") {
        toast.success("تم تحويل الطلب إلى إيراد (مبيعات)");
      } else {
        toast.error(response.message || "فشل تحويل الطلب");
      }
    } catch {
      toast.error("حدث خطأ أثناء تحويل الطلب");
    } finally {
      setIsConverting(false);
    }
  };



  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: card is an interactive wrapper containing other buttons, so div role=button is the only valid HTML layout */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onClick(order)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick(order);
          }
        }}
        className="rounded-xl bg-paper border border-hairline-2 shadow-sm hover:shadow-md hover:border-ink/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-offset-2 active:scale-[0.99] transition-all duration-200 cursor-pointer flex flex-col relative"
      >
        {/* الشريط العلوي: حالة الطلب الحالية — كامل العرض بلون الحالة */}
        <div
          className={cn(
            "flex items-center gap-2 px-4 h-9 text-sm font-bold rounded-t-xl",
            STATUS_STRIP[localStatus] || "bg-info-soft text-info",
          )}
        >
          {(() => {
            const Icon = STATUS_ICON[localStatus] ?? CheckCircle2;
            return <Icon className="w-4 h-4 shrink-0" />;
          })()}
          <span className="flex-1 truncate">{STATUS_LABELS[localStatus]}</span>
          {isUpdatingStatus && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
        </div>

        {/* جسم البطاقة (بحواف داخلية) */}
        <div className="p-4 flex flex-col gap-3">
        {/* السطر الأول: اسم العميل + زر الخيارات */}
        <div className="flex justify-between items-center gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-bold text-ink truncate text-base leading-tight">
              {order.customerName}
            </span>
          </div>

          {/* زر الخيارات: متجاوب وأكبر من 44px لملاءمة اللمس (§9.1) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsActionsOpen(true);
            }}
            className="p-2 -me-2 rounded-full hover:bg-canvas text-ink-2 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors"
            aria-label="خيارات الطلب"
          >
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>

        {/* السطر الثاني: اسم المنتج المطلوب */}
        <div className="text-sm text-ink-2 truncate">
          {order.productName} {order.quantity > 1 && `(عدد ${order.quantity})`}
        </div>

        {/* التفاصيل الإضافية — تظهر لكل الطلبات */}
        {(
          <div className="border-t border-hairline pt-2 mt-1 space-y-2">
            {/* ب-1: تاريخ التسليم + العدّاد الذكي */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 min-w-0">
                <Calendar className="w-3.5 h-3.5 text-ink-3 shrink-0" />
                {order.deliveryDate ? (
                  <span className="text-ink-2 font-medium">
                    التسليم: {formatDate(order.deliveryDate, "d MMMM yyyy")}
                  </span>
                ) : (
                  <span className="text-ink-3 font-normal">
                    لم يُحدّد تاريخ التسليم
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Clock className="w-3.5 h-3.5 text-ink-3 shrink-0" />
                {localStatus === "delivered" ? (
                  <span className="text-emerald-deep font-bold">تم التسليم</span>
                ) : localStatus === "cancelled" ? (
                  <span className="text-alert">ملغى</span>
                ) : order.deliveryDate ? (
                  isToday ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-warn-soft text-warn-deep border border-warn/10">
                      التسليم اليوم
                    </span>
                  ) : (
                    <span className={countdownColorClass}>
                      {countdownText}
                    </span>
                  )
                ) : (
                  <span className="text-ink-3">—</span>
                )}
              </div>
            </div>

            {/* ب-2: العربون + المتبقّي */}
            {order.depositCents > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-ink-2">
                <Wallet className="w-3.5 h-3.5 text-ink-3 shrink-0" />
                <span>عربون: </span>
                <span className="font-semibold text-ink">
                  <AmountText amount={order.depositCents} />
                </span>
                <span className="text-ink-3">·</span>
                <span>متبقٍّ: </span>
                <span className="font-semibold text-info">
                  <AmountText amount={order.totalPriceCents + (order.additionalProfitCents || 0) - order.depositCents} />
                </span>
              </div>
            )}
          </div>
        )}

        {/* السطر الثالث: السعر النهائي (يسار RTL) والتاريخ (يمين RTL) */}
        <div className="flex justify-between items-end border-t border-hairline pt-3 mt-1">
          {/* التاريخ النسبي في جهة اليسار باللغة العربية (§10.1) */}
          <span className="text-xs text-ink-3">
            <DateText date={order.createdAt} relative />
          </span>

          {/* السعر النهائي عريض باللون الدلالي الأساسي (§10.1) */}
          <div className="flex flex-col items-end gap-1">
            <span className="text-lg font-bold text-info leading-none">
              <AmountText amount={order.totalPriceCents} />
            </span>
          </div>
        </div>

        {/* السطر الرابع: زر الحالة الذكي (ينقل للمرحلة التالية) + قائمة الحالات الأخرى */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: wrapper only stops card-click propagation; children are the interactive elements */}
        <div
          className="flex items-center gap-2"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {/* زر إرسال واتساب — يمين الزر الذكي (RTL).
              يظهر فقط إن كان للزبون رقم: الرقمان اختياريان الآن. */}
          {canWhatsApp && (
          <button
            type="button"
            onClick={handleWhatsApp}
            className="min-h-[44px] min-w-[44px] rounded-lg border border-[#25D366]/40 bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 flex items-center justify-center transition-colors shrink-0 active:scale-[0.94]"
            aria-label="إرسال تفاصيل الطلب عبر واتساب"
            title="إرسال عبر واتساب"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          </button>
          )}

          {/* الزر الذكي: الفعل التالي في الرحلة */}
          {isCancelled ? (
            // طلب ملغى — لا فعل متاح، اعرض الحالة فقط
            <div className="flex-1 min-h-[44px] px-4 rounded-lg text-sm font-bold flex items-center justify-center gap-2 bg-alert-soft text-alert border border-alert/20">
              <XCircle className="w-4 h-4" />
              <span>ملغى</span>
            </div>
          ) : nextStatus ? (
            <button
              type="button"
              disabled={isUpdatingStatus}
              onClick={() => setPendingStatus(nextStatus)}
              className={cn(
                "flex-1 min-h-[44px] px-4 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all duration-150 active:scale-[0.97] disabled:opacity-50",
                nextStatus === "delivered"
                  ? "bg-emerald text-paper hover:bg-emerald/90"
                  : "bg-info text-paper hover:bg-info/90",
              )}
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{NEXT_ACTION_LABEL[localStatus]}</span>
            </button>
          ) : (
            // اكتملت الرحلة (تم التوصيل)
            <div className="flex-1 min-h-[44px] px-4 rounded-lg text-sm font-bold flex items-center justify-center gap-2 bg-emerald-soft text-emerald-deep border border-emerald/20">
              <Check className="w-4 h-4" />
              <span>{STATUS_LABELS[localStatus]}</span>
            </div>
          )}

          {/* زر تحويل إلى إيراد مستقل */}
          {canConvertToSale && (
            <button
              type="button"
              disabled={isConverting}
              onClick={() => setShowConvertConfirm(true)}
              className="px-3 min-h-[44px] rounded-lg border border-emerald text-emerald hover:bg-emerald-soft flex items-center justify-center gap-1.5 transition-all duration-150 active:scale-[0.97] disabled:opacity-50 font-bold text-sm shrink-0"
              title="تحويل إلى مبيعات (تسجيل إيراد)"
            >
              <ShoppingCart className="w-4.5 h-4.5" />
              <span className="hidden sm:inline">تسجيل إيراد</span>
            </button>
          )}

          {/* قائمة الحالات الأخرى (⋯) */}
          <div ref={statusMenuRef} className="relative shrink-0">
            <button
              type="button"
              disabled={isUpdatingStatus}
              onClick={() => setStatusMenuOpen((o) => !o)}
              className="min-h-[44px] min-w-[44px] px-2 rounded-lg border border-hairline-2 bg-paper text-ink-2 hover:bg-canvas flex items-center justify-center gap-1 transition-colors disabled:opacity-50"
              aria-label="حالات أخرى"
              title="تغيير لحالة أخرى"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
            {statusMenuOpen && (
              <div className="absolute bottom-full mb-2 end-0 z-dropdown w-44 bg-paper rounded-lg border border-hairline-2 shadow-lg p-1.5 animate-fade-in">
                {Object.entries(STATUS_LABELS).map(([val, lbl]) => {
                  const active = val === localStatus;
                  // للطلبات الملغاة: اعرض فقط الحالة الحالية (ملغى) كمعطّلة
                  // لا توجد انتقالات أخرى مسموحة
                  const isDisabledForCancelled = isCancelled && val !== "cancelled";
                  return (
                    <button
                      key={val}
                      type="button"
                      disabled={active || isDisabledForCancelled}
                      onClick={() => !isDisabledForCancelled && setPendingStatus(val)}
                      className={cn(
                        "w-full flex items-center gap-2 min-h-[40px] px-2.5 rounded-md text-sm text-start transition-colors",
                        active
                          ? "bg-canvas text-ink font-bold cursor-default"
                          : isDisabledForCancelled
                            ? "text-ink-3 cursor-not-allowed opacity-40"
                            : "text-ink-2 hover:bg-canvas",
                      )}
                    >
                      <span
                        className={cn(
                          "w-2.5 h-2.5 rounded-full shrink-0",
                          val === "draft" && "bg-warn",
                          val === "sent" && "bg-info/70",
                          val === "confirmed" && "bg-info",
                          val === "delivered" && "bg-emerald",
                          val === "cancelled" && "bg-alert",
                        )}
                      />
                      <span className="flex-1">{lbl}</span>
                      {active && <Check className="w-4 h-4 shrink-0 text-ink" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        </div>
      </div>

      {/* تأكيد خفيف قبل تغيير الحالة */}
      <ResponsiveModal
        isOpen={pendingStatus !== null}
        onClose={() => setPendingStatus(null)}
        title="تأكيد تغيير الحالة"
      >
        {pendingStatus && (
          <div className="space-y-4">
            <p className="text-sm text-ink-2 leading-relaxed">
              تغيير حالة هذا الطلب إلى{" "}
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full text-xs font-bold border",
                  STATUS_COLORS[pendingStatus],
                )}
              >
                {STATUS_LABELS[pendingStatus]}
              </span>
              ؟
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPendingStatus(null)}
                className="flex-1 min-h-[44px] rounded-lg border border-hairline-2 bg-paper text-ink-2 font-bold hover:bg-canvas transition-colors"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => applyStatus(pendingStatus)}
                className={cn(
                  "flex-1 min-h-[44px] rounded-lg text-paper font-bold transition-colors",
                  pendingStatus === "delivered"
                    ? "bg-emerald hover:bg-emerald/90"
                    : pendingStatus === "cancelled"
                      ? "bg-alert hover:bg-alert/90"
                      : "bg-info hover:bg-info/90",
                )}
              >
                تأكيد
              </button>
            </div>
          </div>
        )}
      </ResponsiveModal>

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
            سيتم ترحيل كامل المبلغ المتبقي (<AmountText amount={order.totalPriceCents + (order.additionalProfitCents || 0) - (order.depositCents || 0)} />) إلى الصندوق كإيراد مبيعات (يشمل الأرباح الإضافية)، وتحويل العربون المحصَّل إلى إيراد، وتحديث حالة الطلب إلى تم التسليم.
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

      {/* شيت الإجراءات المنبثق من الأسفل للموبايل والـ Dialog للديسكتوب (§9.3) */}
      <ResponsiveModal
        isOpen={isActionsOpen}
        onClose={() => setIsActionsOpen(false)}
        title="خيارات الطلب"
      >
        <div className="space-y-2">
          {/* خيار واتساب — يظهر فقط إن كان للزبون رقم */}
          {canWhatsApp && (
            <button
              type="button"
              onClick={handleWhatsApp}
              className="w-full min-h-[44px] px-4 py-3 rounded-md hover:bg-canvas text-ink-2 flex items-center gap-3 transition-colors text-start"
            >
              <MessageSquare className="w-5 h-5 text-info" />
              <span>إرسال تفاصيل العرض عبر واتساب</span>
            </button>
          )}

          {/* خيار تعديل */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsActionsOpen(false);
              onEdit(order);
            }}
            className="w-full min-h-[44px] px-4 py-3 rounded-md hover:bg-canvas text-ink-2 flex items-center gap-3 transition-colors text-start"
          >
            <Edit className="w-5 h-5" />
            <span>تعديل بيانات الطلب</span>
          </button>

          <hr className="border-hairline my-2" />

          {/* خيار حذف */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsActionsOpen(false);
              onDelete(order);
            }}
            className="w-full min-h-[44px] px-4 py-3 rounded-md hover:bg-alert-soft text-alert flex items-center gap-3 transition-colors text-start font-semibold"
          >
            <Trash2 className="w-5 h-5" />
            <span>حذف الطلب نهائياً</span>
          </button>
        </div>
      </ResponsiveModal>
    </>
  );
}
