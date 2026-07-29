"use client";

/**
 * SmartAlertsBar — شريط تنبيهات ذكي (Round 3 UX refactor).
 * يُجيب على «هل عندي مشاكل الآن؟» بلمحة سريعة بدل إغراق الداشبورد بقوائم.
 * كل تنبيه = رابط مباشر للصفحة المختصّة.
 *
 * يختفي تلقائياً إن لم توجد تنبيهات (يُرجِع null).
 */

import { AlertTriangle, Clock, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface SmartAlertsBarProps {
  /** عدد أصناف المخزون التي رصيدها صفر أو سالب */
  lowStockCount: number;
  /** عدد الطلبات في الحالتين «مرسل» أو «مؤكد» (لم تُسلَّم بعد) */
  pendingOrdersCount: number;
  /** عدد الطلبات المتأخرة عن موعد التسليم المتوقع */
  overdueOrdersCount?: number;
  /** هل الكاش المتاح أقل من 50 دينار */
  isLowCash?: boolean;
}

export function SmartAlertsBar({
  lowStockCount,
  pendingOrdersCount,
  overdueOrdersCount = 0,
  isLowCash = false,
}: SmartAlertsBarProps) {
  if (lowStockCount === 0 && pendingOrdersCount === 0 && overdueOrdersCount === 0 && !isLowCash) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2" role="status" aria-label="تنبيهات النظام">
      {overdueOrdersCount > 0 && (
        <Link
          href="/orders"
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-alert/15 border border-alert/40 text-xs font-bold text-alert hover:bg-alert/25 active:scale-95 transition-all min-h-[44px]"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-alert" />
          <span>
            {overdueOrdersCount}{" "}
            {overdueOrdersCount === 1 ? "طلب متأخر عن موعد التسليم" : "طلبات متأخرة عن موعد التسليم"}
          </span>
          <ArrowLeft className="h-3 w-3 opacity-50 shrink-0" />
        </Link>
      )}

      {isLowCash && (
        <Link
          href="/finance/accounts"
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-warn-soft border border-warn/40 text-xs font-bold text-warn-deep hover:bg-warn/20 active:scale-95 transition-all min-h-[44px]"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warn-deep" />
          <span>رصيد الصندوق منخفض (أقل من 50 د.أ)</span>
          <ArrowLeft className="h-3 w-3 opacity-50 shrink-0" />
        </Link>
      )}

      {lowStockCount > 0 && (
        <Link
          href="/inventory"
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-alert-soft border border-alert/30 text-xs font-bold text-alert hover:bg-alert/15 active:scale-95 transition-all min-h-[44px]"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>
            {lowStockCount}{" "}
            {lowStockCount === 1 ? "صنف رصيده منخفض" : "أصناف رصيدها منخفض"}
          </span>
          <ArrowLeft className="h-3 w-3 opacity-50 shrink-0" />
        </Link>
      )}

      {pendingOrdersCount > 0 && (
        <Link
          href="/orders"
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-canvas border border-hairline text-xs font-bold text-ink-2 hover:bg-paper active:scale-95 transition-all min-h-[44px]"
        >
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>
            {pendingOrdersCount}{" "}
            {pendingOrdersCount === 1 ? "طلب معلَّق" : "طلبات معلَّقة"}
          </span>
          <ArrowLeft className="h-3 w-3 opacity-50 shrink-0" />
        </Link>
      )}
    </div>
  );
}
