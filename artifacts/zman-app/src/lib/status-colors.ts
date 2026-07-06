export const STATUS_COLORS: Record<string, string> = {
  draft: "bg-warn-soft text-warn-deep border-warn/20",
  sent: "bg-info-soft text-info border-info/20",
  confirmed: "bg-info text-paper border-info",
  delivered: "bg-emerald-soft text-emerald-deep border-emerald/20",
  cancelled: "bg-alert-soft text-alert border-alert/20",
};

export const STATUS_LABELS: Record<string, string> = {
  draft: "مقترح",
  sent: "تم التأكيد",
  confirmed: "تحت التنفيذ",
  delivered: "تم التسليم",
  cancelled: "ملغى",
};

// ألوان الشريط العلوي الكامل لكل حالة (خلفية + نص)
export const STATUS_STRIP: Record<string, string> = {
  draft: "bg-warn-soft text-warn-deep",
  sent: "bg-info-soft text-info",
  confirmed: "bg-info text-paper",
  delivered: "bg-emerald text-paper",
  cancelled: "bg-alert-soft text-alert",
};

// تسلسل رحلة الطلب — الحالة التالية المنطقية لكل حالة (للزر الذكي السياقي)
export const NEXT_STATUS: Record<string, string | null> = {
  draft: "sent", // مسودة → إرسال للعميل
  sent: "confirmed", // تم الإرسال → تأكيد
  confirmed: "delivered", // مؤكد → توصيل
  delivered: null, // اكتملت الرحلة
  cancelled: null, // ملغى → لا انتقال ممكن
};

// نصّ فعل الانتقال للحالة التالية (يظهر على الزر الذكي)
export const NEXT_ACTION_LABEL: Record<string, string> = {
  draft: "تأكيد الاتفاق",
  sent: "بدء التنفيذ",
  confirmed: "تم التسليم",
  delivered: "مكتمل",
  cancelled: "ملغى",
};
