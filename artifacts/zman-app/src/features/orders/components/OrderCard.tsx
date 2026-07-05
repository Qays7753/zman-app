"use client";

import {
  ArrowLeft,
  Check,
  ChevronDown,
  Edit,
  Loader2,
  MessageSquare,
  MoreVertical,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AmountText } from "@/components/shared/AmountText";
import { DateText } from "@/components/shared/DateText";
import { ResponsiveModal } from "@/components/shared/ResponsiveModal";
import { useClickOutside } from "@/components/shared/useClickOutside";
import { cn } from "@/lib/utils";
import { buildOrderWhatsAppLink } from "@/lib/whatsapp";
import type { Order } from "../types";
import { useMessageTemplate, useUpdateOrderStatus } from "../hooks";
import {
  NEXT_ACTION_LABEL,
  NEXT_STATUS,
  STATUS_COLORS,
  STATUS_LABELS,
} from "@/lib/status-colors";

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
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [localStatus, setLocalStatus] = useState(order.status);
  // قائمة الحالات الأخرى (⋯) + تأكيد خفيف للنقل
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const statusMenuRef = useRef<HTMLDivElement>(null);
  useClickOutside(statusMenuRef, () => setStatusMenuOpen(false), statusMenuOpen);

  useEffect(() => {
    setLocalStatus(order.status);
  }, [order.status]);

  const handleWhatsApp = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsActionsOpen(false);
    const link = buildOrderWhatsAppLink(order, templateText);
    window.open(link, "_blank");
    toast.info("تم الانتقال لتطبيق WhatsApp لإرسال الطلب");
  };

  const applyStatus = async (newStatus: string) => {
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
        className="p-4 rounded-lg bg-paper border border-hairline shadow-sm hover:border-hairline-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-offset-2 active:scale-[0.98] transition-all duration-150 cursor-pointer flex flex-col gap-3 relative"
      >
        {/* السطر الأول: اسم العميل وحالة الطلب + زر الخيارات */}
        <div className="flex justify-between items-center gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-bold text-ink truncate text-base leading-tight">
              {order.customerName}
            </span>
            {/* شارة الحالة الحالية (عرض فقط — تُظهر أين الطلب الآن) */}
            <span
              className={cn(
                "px-2 py-0.5 rounded-full text-xs font-semibold border leading-none h-6 flex items-center gap-1 shrink-0",
                STATUS_COLORS[localStatus] || "bg-info-soft text-info border-info/20",
              )}
            >
              {STATUS_LABELS[localStatus]}
              {isUpdatingStatus && (
                <Loader2 className="w-3 h-3 animate-spin" />
              )}
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
            {order.depositCents > 0 && order.status !== "delivered" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-canvas border border-hairline text-ink-2 font-medium">
                متبقي: <AmountText amount={order.totalPriceCents - order.depositCents} />
              </span>
            )}
          </div>
        </div>

        {/* السطر الرابع: زر الحالة الذكي (ينقل للمرحلة التالية) + قائمة الحالات الأخرى */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: wrapper only stops card-click propagation; children are the interactive elements */}
        <div
          className="flex items-center gap-2"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {/* الزر الذكي: الفعل التالي في الرحلة */}
          {nextStatus ? (
            <button
              type="button"
              disabled={isUpdatingStatus}
              onClick={() => setPendingStatus(nextStatus)}
              className={cn(
                "flex-1 min-h-[44px] px-4 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all duration-150 active:scale-[0.97] disabled:opacity-50",
                nextStatus === "delivered"
                  ? "bg-emerald text-paper hover:bg-emerald/90"
                  : isCancelled
                    ? "bg-canvas text-ink-2 border border-hairline-2 hover:bg-paper"
                    : "bg-info text-paper hover:bg-info/90",
              )}
            >
              {isCancelled ? (
                <RotateCcw className="w-4 h-4" />
              ) : (
                <ArrowLeft className="w-4 h-4" />
              )}
              <span>{NEXT_ACTION_LABEL[localStatus]}</span>
            </button>
          ) : (
            // اكتملت الرحلة (تم التوصيل)
            <div className="flex-1 min-h-[44px] px-4 rounded-lg text-sm font-bold flex items-center justify-center gap-2 bg-emerald-soft text-emerald-deep border border-emerald/20">
              <Check className="w-4 h-4" />
              <span>مكتمل</span>
            </div>
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
                  return (
                    <button
                      key={val}
                      type="button"
                      disabled={active}
                      onClick={() => setPendingStatus(val)}
                      className={cn(
                        "w-full flex items-center gap-2 min-h-[40px] px-2.5 rounded-md text-sm text-start transition-colors",
                        active
                          ? "bg-canvas text-ink font-bold cursor-default"
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

      {/* تأكيد خفيف قبل تغيير الحالة */}
      <ResponsiveModal
        isOpen={pendingStatus !== null}
        onClose={() => setPendingStatus(null)}
        title="تأكيد تغيير الحالة"
      >
        {pendingStatus && (
          <div className="space-y-4">
            <p className="text-sm text-ink-2 leading-relaxed">
              تغيير حالة طلب <span className="font-bold text-ink">{order.customerName}</span> إلى{" "}
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

      {/* شيت الإجراءات المنبثق من الأسفل للموبايل والـ Dialog للديسكتوب (§9.3) */}
      <ResponsiveModal
        isOpen={isActionsOpen}
        onClose={() => setIsActionsOpen(false)}
        title="خيارات الطلب"
      >
        <div className="space-y-2">
          {/* خيار واتساب */}
          <button
            type="button"
            onClick={handleWhatsApp}
            className="w-full min-h-[44px] px-4 py-3 rounded-md hover:bg-canvas text-ink-2 flex items-center gap-3 transition-colors text-start"
          >
            <MessageSquare className="w-5 h-5 text-info" />
            <span>إرسال تفاصيل العرض عبر واتساب</span>
          </button>

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
