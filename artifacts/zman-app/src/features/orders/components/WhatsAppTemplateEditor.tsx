"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useMessageTemplate, useUpdateMessageTemplate } from "../hooks";

interface WhatsAppTemplateEditorProps {
  onClose: () => void;
}

export function WhatsAppTemplateEditor({ onClose }: WhatsAppTemplateEditorProps) {
  const { data: templateText, isLoading } = useMessageTemplate();
  const updateTemplateMutation = useUpdateMessageTemplate();
  const [text, setText] = useState("");

  useEffect(() => {
    if (templateText) {
      setText(templateText);
    }
  }, [templateText]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    try {
      const res = await updateTemplateMutation.mutateAsync(text);
      if (res.status === "ok") {
        toast.success("تم تحديث القالب بنجاح");
        onClose();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("حدث خطأ أثناء حفظ القالب");
    }
  };

  if (isLoading) {
    return <div className="py-6 text-center text-sm text-ink-3">جاري تحميل القالب...</div>;
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="whatsapp-template-textarea" className="text-sm font-bold text-ink-2">
          نص رسالة تأكيد الطلب
        </label>
        <textarea
          id="whatsapp-template-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          className="w-full p-3 rounded-md border border-hairline focus:outline-none focus:ring-2 focus:ring-ink bg-paper text-sm leading-relaxed"
          placeholder="مرحباً {customerName}..."
          required
        />
        <div className="bg-canvas/50 p-3 rounded text-xs text-ink-3 leading-relaxed space-y-1">
          <p className="font-bold text-ink-2">المتغيرات المدعومة (سيتم استبدالها تلقائياً):</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li><code className="bg-paper px-1 py-0.5 rounded text-info font-mono">{`{customerName}`}</code> : اسم العميل</li>
            <li><code className="bg-paper px-1 py-0.5 rounded text-info font-mono">{`{productName}`}</code> : اسم المنتج المطلوب</li>
            <li><code className="bg-paper px-1 py-0.5 rounded text-info font-mono">{`{quantity}`}</code> : كمية المنتج</li>
            <li><code className="bg-paper px-1 py-0.5 rounded text-info font-mono">{`{totalPrice}`}</code> : السعر المتفق عليه</li>
            <li><code className="bg-paper px-1 py-0.5 rounded text-info font-mono">{`{deliveryDate}`}</code> : تاريخ التسليم المتوقع</li>
            <li><code className="bg-paper px-1 py-0.5 rounded text-info font-mono">{`{notes}`}</code> : ملاحظات إضافية</li>
          </ul>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 min-h-[44px] py-2 px-4 rounded-md border border-hairline-2 text-ink-2 hover:bg-canvas font-semibold transition-colors"
        >
          إلغاء
        </button>
        <button
          type="submit"
          disabled={updateTemplateMutation.isPending}
          className="flex-1 min-h-[44px] py-2 px-4 rounded-md bg-ink text-paper font-bold hover:bg-ink/90 transition-colors flex items-center justify-center gap-2"
        >
          {updateTemplateMutation.isPending ? "جاري الحفظ..." : "حفظ التعديلات"}
        </button>
      </div>
    </form>
  );
}
