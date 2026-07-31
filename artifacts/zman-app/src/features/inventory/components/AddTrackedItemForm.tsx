"use client";

/**
 * AddTrackedItemForm — نموذج سريع لإضافة صنف كتالوجي متتبَّع جديد.
 *
 * يُستخدم من مودال FAB شاشة المخزون (Issue #2). يبني صنفاً جديداً في
 * `catalog_component` مع `tracked: true` ورصيد افتتاحي اختياري، عبر
 * `useCreateCatalogComponent` (نفس الـ server action الذي يستخدمه CatalogClient).
 * لا يُلمَس أي منطق محاسبي — `createCatalogComponent` internally تستدعي
 * `addCatalogMovement(sourceType='opening')` داخل نفس الـ transaction عند
 * `openingStock > 0`.
 */

import { useState } from "react";
import { PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/shared/Button";
import { MoneyInput } from "@/components/shared/MoneyInput";
import { Select } from "@/components/shared/Select";
import { TextField } from "@/components/shared/TextField";
import { TextArea } from "@/components/shared/TextArea";
import { useCreateCatalogComponent } from "@/features/catalog/hooks";

const UNITS = ["قطعة", "متر", "غرام", "علبة", "كيلو", "لتر", "ورقة"];

interface AddTrackedItemFormProps {
  onDone: () => void;
}

export function AddTrackedItemForm({ onDone }: AddTrackedItemFormProps) {
  const [name, setName] = useState("");
  const [defaultCostCents, setDefaultCostCents] = useState(0);
  const [unit, setUnit] = useState<string>("قطعة");
  const [openingStock, setOpeningStock] = useState(0);
  const [notes, setNotes] = useState("");

  const createMutation = useCreateCatalogComponent();
  const isSubmitting = createMutation.isPending;

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("الاسم مطلوب");
      return;
    }
    if (defaultCostCents < 0) {
      toast.error("التكلفة الافتراضية لا يمكن أن تكون سالبة");
      return;
    }
    if (openingStock < 0) {
      toast.error("الرصيد الافتتاحي لا يمكن أن يكون سالباً");
      return;
    }
    // الـ hook يُبطِل تلقائياً namespace الكتالوج والمخزون عند النجاح،
    // لذا لا حاجة لإبطال يدوي هنا. (سابقاً كان النموذج يستدعي الـ action
    // مباشرةً بسبب نقص نوع `openingStock` في توقيع الـ hook — صار يُستخدم
    // الآن لأنّ الـ hook مُصلَّح.)
    const res = await createMutation.mutateAsync({
      name: name.trim(),
      defaultCostCents,
      unit,
      notes: notes.trim(),
      tracked: true,
      openingStock,
    });
    if (res.status === "ok") {
      toast.success(`تمت إضافة «${name.trim()}» للأصناف المتتبَّعة`);
      onDone();
    } else {
      toast.error(res.message);
    }
  };

  return (
    <div className="space-y-4">
      <TextField
        label="اسم الصنف *"
        placeholder="مثال: وعاء خرساني 7سم"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <div className="grid grid-cols-2 gap-3">
        <MoneyInput
          label="التكلفة الافتراضية"
          value={defaultCostCents}
          onChange={setDefaultCostCents}
          placeholder="0.000"
        />
        <Select
          label="الوحدة"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </Select>
      </div>

      <div className="p-3.5 bg-canvas/30 rounded-lg border border-hairline space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-ink/75">
          <PackageCheck className="w-4 h-4 text-info" />
          تتبَّع المخزون مُفعَّل افتراضياً
        </div>

        <div className="space-y-1.5">
          <label htmlFor="add-tracked-opening" className="text-xs font-semibold text-ink-3">
            الرصيد الافتتاحي (اختياري)
          </label>
          <input
            id="add-tracked-opening"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={openingStock}
            onChange={(e) => setOpeningStock(Number(e.target.value) || 0)}
            className="w-full h-12 px-4 py-2 rounded-md border border-hairline-2 bg-paper text-base text-ink focus:outline-none focus:ring-2 focus:ring-ink/10"
          />
          <p className="text-[11px] text-ink-3">
            الكمية الموجودة عندك الآن. يمكن تعديلها لاحقاً عبر «تعديل سريع للمخزون».
          </p>
          {openingStock > 0 && (
            <p className="text-[11px] leading-relaxed text-warn-deep bg-warn-soft border border-warn/30 rounded-lg p-2.5">
              <strong>يدخل بتكلفة صفر.</strong> تكلفة هذه الكمية حُسبت مصروفاً وقت
              شرائها، فلا تُحتسب مرّة ثانية. النتيجة: عند بيعها لن تُخصم لها تكلفة،
              فيظهر ربح أعلى من الحقيقي مؤقتاً — يتصحّح تلقائياً بعد نفاد هذه الكمية.
            </p>
          )}
        </div>
      </div>

      <TextArea
        label="ملاحظات (اختياري)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="ملاحظات اختيارية..."
      />

      <Button
        type="button"
        onClick={handleSubmit}
        isLoading={isSubmitting}
        className="w-full"
      >
        إضافة الصنف المتتبَّع
      </Button>
    </div>
  );
}
