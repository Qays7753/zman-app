import { formatFilsToJod } from "./money";

/**
 * تنظيف رقم الهاتف وتحويله للصيغة الدولية الافتراضية (الأردن 962)
 */
export function cleanPhoneNumber(phone: string): string {
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
 * إنشاء رابط wa.me الموجه لتطبيق WhatsApp مع نص رسالة جاهز (§18 rule 14)
 */
export function buildOrderWhatsAppLink(
  order: {
    customerName: string;
    customerPhone: string;
    productName: string;
    quantity: number;
    totalPriceCents: number;
    deliveryDate?: string | null;
    notes?: string | null;
  },
  templateText?: string
): string {
  const cleanPhone = cleanPhoneNumber(order.customerPhone);
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
