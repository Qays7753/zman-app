"use client";

/**
 * UpcomingDeliveriesCard — طلبات تحتاج تسليم قريباً (Round 2 / Issue #9).
 *
 * يعرض حتى 5 طلبات غير مُسلَّمة، تاريخ تسليمها (أو استلامها إن لم يُحدَّد
 * موعد التسليم) يقع ضمن نافذة 7 أيام تبدأ من اليوم بتوقيت عمّان.
 *
 * - مصدر البيانات: `useOrders({ limit: 100 })` (نفس نمط GlobalSearch).
 * - الفلترة على العميل — لا مسّ للـ backend.
 * - يستخدم `getAmmanDate()` لتفادي فخّ UTC-vs-Amman.
 * - يختفي تلقائياً عند عدم وجود طلبات قادمة (يُرجع null، كنمط SmartAlertsBar).
 */

import { Calendar, ArrowLeft, Truck } from "lucide-react";
import Link from "next/link";
import { useOrders } from "@/features/orders/hooks";
import { formatAmmanDate, getAmmanDate } from "@/lib/utils";
import { formatDate } from "@/lib/dates";

interface DeliveryCountdown {
  text: string;
  colorClass: string;
}

/**
 * نصّ العدّ التنازلي لتاريخ التسليم — نسخة محلية من منطق OrderCard.tsx
 * (الأسطر 82–105). لا نستورده لتجنّب اقتران غير ضروري.
 */
function getDeliveryCountdown(deliveryDate: string): DeliveryCountdown {
  const todayStr = getAmmanDate();
  const deliveryStr = formatAmmanDate(deliveryDate);
  const d1 = new Date(deliveryStr + "T00:00:00Z");
  const d2 = new Date(todayStr + "T00:00:00Z");
  const diffTime = d1.getTime() - d2.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays > 0) {
    return { text: `باقٍ ${diffDays} أيام`, colorClass: "text-brand-deep font-bold" };
  }
  if (diffDays === 0) {
    return { text: "التسليم اليوم", colorClass: "text-warn-deep font-bold" };
  }
  return { text: `متأخّر ${Math.abs(diffDays)} أيام`, colorClass: "text-alert font-bold" };
}

const HORIZON_DAYS = 7;

export function UpcomingDeliveriesCard() {
  const { data: ordersData } = useOrders({ limit: 100 });

  const today = getAmmanDate();
  const todayMs = new Date(today + "T00:00:00Z").getTime();
  const horizonEnd = new Date(todayMs + HORIZON_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const upcoming = (ordersData?.items ?? [])
    .filter((o) => o.status !== "delivered" && o.status !== "cancelled")
    .filter((o) => {
      const dd = o.deliveryDate ?? o.receivedDate;
      return Boolean(dd) && dd >= today && dd <= horizonEnd;
    })
    .sort((a, b) =>
      (a.deliveryDate ?? a.receivedDate).localeCompare(b.deliveryDate ?? b.receivedDate),
    )
    .slice(0, 5);

  if (upcoming.length === 0) return null;

  return (
    <div className="rounded-xl border border-hairline bg-paper shadow-sm overflow-hidden">
      {/* الترويسة */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 bg-canvas border-b border-hairline">
        <div className="flex items-center gap-2 min-w-0">
          <Truck className="h-4 w-4 text-brand shrink-0" />
          <span className="text-sm font-bold text-ink truncate">طلبات تحتاج تسليم قريباً</span>
        </div>
        <span className="text-[11px] font-bold text-brand bg-brand-soft px-2 py-0.5 rounded-full shrink-0">
          {upcoming.length}
        </span>
      </div>

      {/* الصفوف */}
      <ul className="divide-y divide-hairline/60">
        {upcoming.map((o) => {
          const dd = o.deliveryDate ?? o.receivedDate;
          const countdown = dd ? getDeliveryCountdown(dd) : null;
          return (
            <li key={o.id}>
              <Link
                href={`/orders?q=${encodeURIComponent(o.customerName)}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-canvas transition-colors min-h-12"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink truncate">{o.customerName}</p>
                  <p className="text-xs text-ink-2 truncate">
                    {o.productName}
                    {o.quantity > 1 ? ` (عدد ${o.quantity})` : ""}
                  </p>
                  {dd && (
                    <p className="text-[11px] text-ink-3 mt-0.5 flex items-center gap-1">
                      <Calendar className="h-3 w-3 shrink-0" />
                      <span>{formatDate(dd, "d MMMM yyyy")}</span>
                    </p>
                  )}
                </div>
                {countdown && (
                  <span className={`text-xs shrink-0 ${countdown.colorClass}`}>
                    {countdown.text}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* الرابط السفلي */}
      <Link
        href="/orders?sort=delivery"
        className="flex items-center justify-between gap-2 px-4 py-2.5 bg-brand-soft/60 border-t border-brand/10 hover:bg-brand-soft transition-colors min-h-12"
      >
        <span className="text-xs font-bold text-brand">عرض كل الطلبات</span>
        <ArrowLeft className="h-3.5 w-3.5 text-brand opacity-70 shrink-0" />
      </Link>
    </div>
  );
}
