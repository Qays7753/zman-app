"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useMessageTemplate, useUpdateMessageTemplate } from "../hooks";
import { Button } from "@/components/shared/Button";
import { TextArea } from "@/components/shared/TextArea";
import { SkeletonList } from "@/components/shared/SkeletonList";

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
    return <SkeletonList count={2} />;
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <TextArea
        label="نص رسالة تأكيد الطلب"
        id="whatsapp-template-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder="مرحباً {customerName}..."
        required
      />
      <div className="bg-canvas/50 p-3 rounded text-xs text-ink-3 leading-relaxed space-y-1">
        <p className="font-bold text-ink-2">المتغيرات المدعومة (سيتم استبدالها تلقائياً):</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li><code className="bg-paper px-1 py-0.5 rounded text-brand font-mono">{`{customerName}`}</code> : اسم العميل</li>
          <li><code className="bg-paper px-1 py-0.5 rounded text-brand font-mono">{`{productName}`}</code> : اسم المنتج المطلوب</li>
          <li><code className="bg-paper px-1 py-0.5 rounded text-brand font-mono">{`{quantity}`}</code> : كمية المنتج</li>
          <li><code className="bg-paper px-1 py-0.5 rounded text-brand font-mono">{`{totalPrice}`}</code> : السعر المتفق عليه</li>
          <li><code className="bg-paper px-1 py-0.5 rounded text-brand font-mono">{`{deliveryDate}`}</code> : تاريخ التسليم المتوقع</li>
          <li><code className="bg-paper px-1 py-0.5 rounded text-brand font-mono">{`{notes}`}</code> : ملاحظات إضافية</li>
        </ul>
      </div>

      <div className="flex gap-3 pt-2">
        <Button
          type="button"
          onClick={onClose}
          variant="secondary"
          className="flex-1"
        >
          إلغاء
        </Button>
        <Button
          type="submit"
          variant="ink"
          isLoading={updateTemplateMutation.isPending}
          className="flex-1 font-bold"
        >
          {updateTemplateMutation.isPending ? "جاري الحفظ..." : "حفظ التعديلات"}
        </Button>
      </div>
    </form>
  );
}
