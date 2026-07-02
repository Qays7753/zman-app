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
