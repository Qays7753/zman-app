export const STATUS_COLORS: Record<string, string> = {
  draft: "bg-warn-soft text-warn-deep border-warn/20",
  sent: "bg-info-soft text-info border-info/20",
  confirmed: "bg-info text-paper border-info",
  delivered: "bg-emerald-soft text-emerald-deep border-emerald/20",
  cancelled: "bg-alert-soft text-alert border-alert/20",
};

export const STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  sent: "تم الإرسال",
  confirmed: "مؤكد",
  delivered: "تم التوصيل",
  cancelled: "ملغى",
};

// تسلسل رحلة الطلب — الحالة التالية المنطقية لكل حالة (للزر الذكي السياقي)
export const NEXT_STATUS: Record<string, string | null> = {
  draft: "sent", // مسودة → إرسال للعميل
  sent: "confirmed", // تم الإرسال → تأكيد
  confirmed: "delivered", // مؤكد → توصيل
  delivered: null, // اكتملت الرحلة
  cancelled: "draft", // ملغى → إعادة تفعيل (كمسودة)
};

// نصّ فعل الانتقال للحالة التالية (يظهر على الزر الذكي)
export const NEXT_ACTION_LABEL: Record<string, string> = {
  draft: "إرسال للعميل",
  sent: "تأكيد الطلب",
  confirmed: "تم التوصيل",
  delivered: "مكتمل",
  cancelled: "إعادة تفعيل",
};
