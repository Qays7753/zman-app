"use client";

/**
 * QuickAdjustStockForm — نموذج سريع لتعديل رصيد صنف متتبَّع.
 *
 * يُستخدم من مودال FAB شاشة المخزون (Issue #2). يختار المستخدم صنفاً متتبَّعاً
 * من قائمة منسدلة، يحدد اتجاه التسوية (in / out)، يدخل الكمية والسبب الاختياري،
 * ثم يُرسل إلى `adjustStock` عبر `useAdjustStock`. لا يُلمَس أي منطق محاسبي —
 * الـ server action هو نفسه الذي يستخدمه `AdjustStockForm` في CatalogClient.
 */

import { useState } from "react";
import { AlertTriangle, PackageCheck, PackageMinus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/shared/Button";
import { Select } from "@/components/shared/Select";
import { TextField } from "@/components/shared/TextField";
import { InfoTooltip } from "@/components/shared/InfoTooltip";
import { useAdjustStock, useComponentStock } from "../hooks";

export interface QuickAdjustStockItem {
  catalogComponentId: string;
  name: string;
  unit: string;
  balance: number;
}

interface QuickAdjustStockFormProps {
  items: QuickAdjustStockItem[];
  onDone: () => void;
}

export function QuickAdjustStockForm({ items, onDone }: QuickAdjustStockFormProps) {
  const [selectedId, setSelectedId] = useState<string>("");
  const [direction, setDirection] = useState<"in" | "out">("out");
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const adjustStockMutation = useAdjustStock();
  // الرصيد الحالي للصنف المختار (live) — لعرضه وللتحذير من السالب.
  const { data: currentStock = 0 } = useComponentStock(selectedId || undefined);

  const selectedItem = items.find((i) => i.catalogComponentId === selectedId);
  const itemUnit = selectedItem?.unit ?? "قطعة";

  const handleSubmit = async () => {
    if (!selectedId) {
      toast.error("اختر صنفاً أولاً");
      return;
    }
    if (quantity <= 0) {
      toast.error("الكمية يجب أن تكون موجبة");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await adjustStockMutation.mutateAsync({
        catalogComponentId: selectedId,
        direction,
        quantity,
        reason: reason.trim() || undefined,
        requestId: crypto.randomUUID(),
      });
      if (res.status === "ok") {
        toast.success(
          direction === "in"
            ? `تمت إضافة ${quantity} ${itemUnit} للمخزون`
            : `تم صرف ${quantity} ${itemUnit} من المخزون`,
        );
        onDone();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("فشل الاتصال بالسيرفر");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="p-6 text-center space-y-2">
        <AlertTriangle className="w-8 h-8 text-ink-3 mx-auto" />
        <p className="text-sm font-semibold text-ink-2">لا توجد أصناف متتبَّعة بعد</p>
        <p className="text-xs text-ink-3 leading-relaxed">
          أضف صنفاً متتبَّعاً جديداً عبر «إضافة صنف مُتابَع» لتفعيل التسوية السريعة.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Select
        label="الصنف المتتبَّع *"
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
      >
        <option value="">— اختر صنفاً —</option>
        {items.map((item) => (
          <option key={item.catalogComponentId} value={item.catalogComponentId}>
            {item.name} (الرصيد: {item.balance} {item.unit})
          </option>
        ))}
      </Select>

      {selectedId && (
        <div className="p-3 bg-canvas/30 rounded-md text-sm text-ink-2 flex items-center justify-between">
          <span>الرصيد الحالي:</span>
          <span className="font-bold text-brand">{currentStock} {itemUnit}</span>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-bold text-ink/75 flex items-center gap-1.5">
          نوع التسوية
          <InfoTooltip text="الصرف اليدوي (out) لتلف أو فقدان مخزون: يُخصم الرصيد ويُسجَّل خسارة غير نقدية في بند «هدر/تلف مخزون» بالقائمة المالية (تخفض الربح التشغيلي). الإضافة اليدوية (in) لردّ مخزون عائد أو تسوية موجبة: لا تؤثر على الربح." />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setDirection("out")}
            className={`min-h-12 py-2.5 rounded-md border text-sm font-bold flex items-center justify-center gap-1.5 transition-colors ${
              direction === "out"
                ? "border-alert text-alert bg-alert-soft"
                : "border-hairline text-ink-2 bg-paper hover:bg-canvas"
            }`}
          >
            <PackageMinus className="w-4 h-4" />
            صرف يدوي (out)
          </button>
          <button
            type="button"
            onClick={() => setDirection("in")}
            className={`min-h-12 py-2.5 rounded-md border text-sm font-bold flex items-center justify-center gap-1.5 transition-colors ${
              direction === "in"
                ? "border-brand text-brand bg-brand-soft"
                : "border-hairline text-ink-2 bg-paper hover:bg-canvas"
            }`}
          >
            <PackageCheck className="w-4 h-4" />
            إضافة يدوية (in)
          </button>
        </div>
        {direction === "out" ? (
          <p className="text-[11px] text-alert/80 leading-relaxed">
            الصرف اليدوي يُسجَّل كخسارة غير نقدية في بند «هدر/تلف مخزون» — يُخفِض الربح التشغيلي بقدر قيمة الكمية المخصومة. لا يُخصم النقد من الصندوق.
          </p>
        ) : (
          <p className="text-[11px] text-ink-3 leading-relaxed">
            الإضافة اليدوية تزيد الرصيد دون أثر على الربح أو الصندوق — لتسوية موجبة أو ردّ مخزون عائد.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="quick-adjust-qty" className="text-sm font-bold text-ink/75">
          الكمية
        </label>
        <input
          id="quick-adjust-qty"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value) || 0)}
          className="w-full h-12 px-4 py-2 rounded-md border border-hairline-2 bg-paper text-base text-ink focus:outline-none focus:ring-2 focus:ring-ink/10"
        />
        {direction === "out" && selectedId && quantity > currentStock && (
          <p className="text-[11px] text-warn-deep flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            الكمية تتجاوز الرصيد — سيرصبح الرصيد سالباً ({currentStock - quantity} {itemUnit}).
            مسموح (§6 سيناريو 1) لكن يُنصح بمراجعة الأرقام.
          </p>
        )}
      </div>

      <TextField
        label="السبب (اختياري)"
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="مثال: تلف، فقدان، جرد"
      />

      <Button
        type="button"
        onClick={handleSubmit}
        isLoading={isSubmitting}
        disabled={!selectedId}
        className="w-full"
      >
        تأكيد التسوية
      </Button>
    </div>
  );
}
