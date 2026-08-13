import { formatFilsToJod } from "./money";

/**
 * تنظيف رقم الهاتف وتحويله للصيغة الدولية الافتراضية (الأردن 962)
 */
export function cleanPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return "";

  // إزالة أي رموز غير رقمية
  let clean = phone.replace(/\D/g, "");

  // معالجة صيغ الهاتف الأردني الشائعة
  if (clean.startsWith("00962")) {
    clean = clean.slice(2);
  } else if (clean.startsWith("07")) {
    clean = `962${clean.slice(1)}`;
  } else if (clean.startsWith("7") && clean.length === 9) {
    clean = `962${clean}`;
  }

  return clean;
}

export function fillTemplate(
  template: string,
  order: {
    customerName: string;
    productName: string;
    quantity: number;
    totalPriceCents: number;
    deliveryDate?: string | null;
    notes?: string | null;
  }
): string {
  const formattedPrice = formatFilsToJod(order.totalPriceCents);
  const formattedDeliveryDate = order.deliveryDate ? order.deliveryDate : "غير محدد";

  return template
    .replace(/{customerName}/g, order.customerName)
    .replace(/{productName}/g, order.productName)
    .replace(/{quantity}/g, String(order.quantity))
    .replace(/{totalPrice}/g, formattedPrice)
    .replace(/{deliveryDate}/g, formattedDeliveryDate)
    .replace(/{notes}/g, order.notes ? `- ملاحظات إضافية: ${order.notes}` : "");
}

/**
 * هل يملك الطلب رقماً صالحاً للإرسال عبر واتساب؟ الرقمان اختياريان، فقد لا
 * يوجد أيٌّ منهما. تُستعمل في الواجهة لإخفاء زر واتساب بدل فتح رابط مكسور.
 */
export function hasWhatsAppNumber(order: {
  customerPhone?: string | null;
  customerPhoneAlt?: string | null;
}): boolean {
  return (
    cleanPhoneNumber(order.customerPhone).length > 0 ||
    cleanPhoneNumber(order.customerPhoneAlt).length > 0
  );
}

/**
 * إنشاء رابط wa.me الموجه لتطبيق WhatsApp مع نص رسالة جاهز (§18 rule 14)
 *
 * الرقم الأساسي اختياري: إن كان فارغاً نرجع للرقم البديل. إن غاب الاثنان
 * فلا رابط — تتحقّق الواجهة عبر hasWhatsAppNumber قبل عرض الزر أصلاً.
 */
export function buildOrderWhatsAppLink(
  order: {
    customerName: string;
    customerPhone?: string | null;
    customerPhoneAlt?: string | null;
    productName: string;
    quantity: number;
    totalPriceCents: number;
    deliveryDate?: string | null;
    notes?: string | null;
  },
  templateText?: string
): string {
  const cleanPhone =
    cleanPhoneNumber(order.customerPhone) ||
    cleanPhoneNumber(order.customerPhoneAlt);
  const defaultTemplate = `مرحباً سيد/ة {customerName}،

يسعدنا تأكيد تفاصيل طلبك كالتالي:
- المنتج: {productName}
- الكمية: {quantity}
- السعر الإجمالي: {totalPrice}
{notes}
شكراً لثقتك بنا وتعاملك معنا!`;

  const template = templateText || defaultTemplate;
  const message = fillTemplate(template, order);

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}
