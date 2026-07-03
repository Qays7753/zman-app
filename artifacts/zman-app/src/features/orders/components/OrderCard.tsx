"use client";

import { Edit, Loader2, MessageSquare, MoreVertical, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AmountText } from "@/components/shared/AmountText";
import { DateText } from "@/components/shared/DateText";
import { ResponsiveModal } from "@/components/shared/ResponsiveModal";
import { cn } from "@/lib/utils";
import { buildOrderWhatsAppLink } from "@/lib/whatsapp";
import type { Order } from "../types";
import { useMessageTemplate, useUpdateOrderStatus } from "../hooks";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/status-colors";

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

  const handleStatusChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value;
    const oldStatus = localStatus;
    setLocalStatus(newStatus);
    setIsUpdatingStatus(true);
    try {
      const res = await updateStatusMutation.mutateAsync({
        id: order.id,
        newStatus,
        updatedAt: new Date(order.updatedAt).toISOString(),
      });
      if (res.status === "ok") {
        toast.success("تم تحديث حالة الطلب بنجاح");
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
            <div className="relative flex items-center gap-1.5">
              <select
                value={localStatus}
                disabled={isUpdatingStatus}
                onClick={(e) => e.stopPropagation()}
                onChange={handleStatusChange}
                className={cn(
                  "px-2 py-0.5 rounded-full text-xs font-semibold border leading-none h-6 cursor-pointer focus:outline-none focus:ring-1 focus:ring-info transition-colors duration-200",
                  STATUS_COLORS[localStatus] || "bg-info-soft text-info border-info/20",
                  isUpdatingStatus && "opacity-50 pointer-events-none"
                )}
                aria-label="تغيير حالة الطلب"
              >
                {Object.entries(STATUS_LABELS).map(([val, label]) => (
                  <option key={val} value={val} className="bg-paper text-ink">
                    {label}
                  </option>
                ))}
              </select>
              {isUpdatingStatus && (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-info" />
              )}
            </div>
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
      </div>

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
