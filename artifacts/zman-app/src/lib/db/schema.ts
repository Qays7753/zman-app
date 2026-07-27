export * from "@/features/finance/db";
export * from "@/features/orders/db";
export * from "@/features/catalog/db";
export * from "@/features/inventory/db";
// Phase 4 — capital_asset جدول مستقل للأصول الرأسمالية المُهلَكة (خيار γ).
// لا يدخل cash_movement إطلاقاً (الإهلاك غير نقدي)؛ يُحسَب عند القراءة في
// computeOperatingPnl و IC-14 فقط. INV-22 (بعد إعادة الترقيم D10) يستثني
// صراحةً INV-1 لهذا الجدول.
export * from "@/features/depreciation/db";
export * from "@/features/snippets/db";
