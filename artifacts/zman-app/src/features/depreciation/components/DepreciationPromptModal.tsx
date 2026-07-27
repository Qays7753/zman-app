"use client";

import { useState } from "react";
import { Calculator, Clock, TrendingDown } from "lucide-react";
import { ResponsiveModal } from "@/components/shared/ResponsiveModal";
import { Button } from "@/components/shared/Button";
import { formatFilsToJod } from "@/lib/money";

// ─────────────────────────────────────────────────────────────────────────
// DepreciationPromptModal — سؤال الإهلاك بعد حفظ تكلفة رأسمالية (Phase 4)
// ─────────────────────────────────────────────────────────────────────────
// بعد حفظ مصروف/شراء بـ is_capital_asset=true، يعطي النظام المستخدم خيارين:
//   (أ) «خصم مرة واحدة» — لا يُنشئ capital_asset. الصف يظهر سطراً منفصلاً في
//       الميزانية كـ «إضافات أصول رأسمالية» (سلوك Phase 2 الافتراضي). لا
//       يُخصَم شيء من الربح التشغيلي.
//   (ب) «توزيع شهري (إهلاك)» — يُنشئ capital_asset مع usefulLifeMonths (1-600).
//       النظام يخصم monthlyDepreciationCents شهرياً من الربح التشغيلي عبر
//       computeOperatingPnl (خيار γ — محسوب عند القراءة، لا CRON).
//
// يُستخدَم من ExpenseForm/PurchaseForm خلف toggle «تصنيف متقدّم» (spec card 4.E):
// المستخدم العادي يكتفي بـ checkbox «أصل رأسمالي» (Phase 2). من يريد الإهلاك
// يفتح الـ toggle، فبعد الحفظ يظهر هذا المودال.
//
// الخصائص:
//   - isOpen: تحكم في العرض (من الأب).
//   - onClose: إغلاق بدون تأكيد (يعامل كاختيار ضمني للخيار أ — لا إهلاك).
//   - assetName: اسم الأصل (للعرض في العنوان).
//   - purchaseAmountCents: قيمة الأصل (لعرض monthlyDepreciation المحسوبة).
//   - onConfirmDeductOnce: استدعاء عند اختيار (أ) — الأب يغلق المودال.
//   - onConfirmSpread: استدعاء عند اختيار (ب) مع usefulLifeMonths (1-600).
//
// RTL بالكامل. الأرقام بـ formatFilsToJod.
// ─────────────────────────────────────────────────────────────────────────

interface DepreciationPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  assetName: string;
  purchaseAmountCents: number;
  onConfirmDeductOnce: () => void;
  onConfirmSpread: (usefulLifeMonths: number) => void;
  isSubmitting?: boolean;
}

type SelectedOption = "deduct_once" | "spread" | null;

export function DepreciationPromptModal({
  isOpen,
  onClose,
  assetName,
  purchaseAmountCents,
  onConfirmDeductOnce,
  onConfirmSpread,
  isSubmitting = false,
}: DepreciationPromptModalProps) {
  const [selected, setSelected] = useState<SelectedOption>(null);
  const [usefulLifeMonths, setUsefulLifeMonths] = useState<string>("12");

  const lifeNum = Number.parseInt(usefulLifeMonths, 10);
  const isLifeValid =
    Number.isInteger(lifeNum) && lifeNum >= 1 && lifeNum <= 600;
  const monthlyDepCents = isLifeValid
    ? Math.floor(purchaseAmountCents / lifeNum)
    : 0;

  const handleConfirm = () => {
    if (selected === "deduct_once") {
      onConfirmDeductOnce();
    } else if (selected === "spread" && isLifeValid) {
      onConfirmSpread(lifeNum);
    }
  };

  const canConfirm =
    selected === "deduct_once" ||
    (selected === "spread" && isLifeValid);

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose}
      title="هل تريد إهلاك هذا الأصل؟"
    >
      <div className="space-y-5">
        {/* شرح */}
        <div className="p-3.5 bg-canvas/40 rounded-lg border border-hairline">
          <p className="text-sm text-ink leading-relaxed">
            هذا المبلغ (
            <strong className="font-bold" dir="ltr">
              {formatFilsToJod(purchaseAmountCents)}
            </strong>
            ) سيُسجَّل كأصل رأسمالي
            {assetName ? <> («{assetName}»)</> : null}. لديك خياران:
          </p>
        </div>

        {/* خيار (أ): خصم مرة واحدة */}
        <button
          type="button"
          onClick={() => setSelected("deduct_once")}
          className={`w-full text-start p-4 rounded-lg border-2 transition-all ${
            selected === "deduct_once"
              ? "border-info bg-info-soft"
              : "border-hairline bg-paper hover:border-ink/30"
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                selected === "deduct_once"
                  ? "border-info bg-info"
                  : "border-hairline-2"
              }`}
            >
              {selected === "deduct_once" && (
                <div className="w-2 h-2 rounded-full bg-paper" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="w-4 h-4 text-info flex-shrink-0" />
                <span className="font-bold text-ink text-sm">
                  (أ) خصم مرة واحدة
                </span>
              </div>
              <p className="text-xs text-ink-2 leading-relaxed">
                يُفصَل عن الربح التشغيلي لهذا الشهر ويُعرض كـ«إضافة أصل رأسمالي»
                في الميزانية. الربح التشغيلي لن يتأثّر. مناسب للأصول صغيرة القيمة
                أو حين لا تريد تتبّع الإهلاك شهرياً.
              </p>
            </div>
          </div>
        </button>

        {/* خيار (ب): توزيع شهري (إهلاك) */}
        <button
          type="button"
          onClick={() => setSelected("spread")}
          className={`w-full text-start p-4 rounded-lg border-2 transition-all ${
            selected === "spread"
              ? "border-info bg-info-soft"
              : "border-hairline bg-paper hover:border-ink/30"
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                selected === "spread"
                  ? "border-info bg-info"
                  : "border-hairline-2"
              }`}
            >
              {selected === "spread" && (
                <div className="w-2 h-2 rounded-full bg-paper" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Calculator className="w-4 h-4 text-info flex-shrink-0" />
                <span className="font-bold text-ink text-sm">
                  (ب) توزيع شهري (إهلاك)
                </span>
              </div>
              <p className="text-xs text-ink-2 leading-relaxed">
                يُخصَم شهرياً من الربح التشغيلي طوال عمر الأصل النافع. مناسب
                للأصول الكبيرة (آلات، معدات) حيث يُعطي صورة أدقّ للربح الفعلي.
              </p>
            </div>
          </div>
        </button>

        {/* مدخل العمر النافع — يظهر فقط عند اختيار (ب) */}
        {selected === "spread" && (
          <div className="space-y-2 p-3.5 bg-canvas/40 rounded-lg border border-hairline animate-fade-in">
            <label
              htmlFor="depreciation-useful-life"
              className="text-sm font-bold text-ink/75 flex items-center gap-1.5"
            >
              <Clock className="w-4 h-4 text-info" />
              العمر النافع (بالأشهر)
            </label>
            <input
              id="depreciation-useful-life"
              type="number"
              inputMode="numeric"
              min={1}
              max={600}
              step={1}
              value={usefulLifeMonths}
              onChange={(e) => setUsefulLifeMonths(e.target.value)}
              className="flex h-12 w-full rounded-md border border-hairline bg-paper px-4 py-2 text-base text-ink text-start focus:outline-none focus:ring-2 focus:ring-ink"
            />
            {usefulLifeMonths !== "" && !isLifeValid && (
              <p className="text-xs text-alert mt-1">
                العمر النافع يجب أن يكون عدداً صحيحاً بين 1 و 600 شهراً (50 سنة).
              </p>
            )}
            {isLifeValid && (
              <div className="text-xs text-info-deep bg-info-soft/50 rounded-md p-2.5 space-y-1">
                <div className="flex items-center justify-between">
                  <span>الإهلاك الشهري:</span>
                  <strong className="font-bold" dir="ltr">
                    {formatFilsToJod(monthlyDepCents)}
                  </strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>الإجمالي بعد {lifeNum} شهراً:</span>
                  <strong className="font-bold" dir="ltr">
                    {formatFilsToJod(monthlyDepCents * lifeNum)}
                  </strong>
                </div>
                {monthlyDepCents * lifeNum < purchaseAmountCents && (
                  <p className="text-[10px] text-ink-3 italic">
                    ملاحظة: قد يقل الإجمالي عن قيمة الشراء بفعل تقريب
                    Math.floor للأقرب فلس. الفرق يُفقد عند انقضاء العمر (مقبول
                    للأصول منخفضة القيمة).
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* أزرار */}
        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            variant="ink"
            className="flex-1"
            onClick={handleConfirm}
            isLoading={isSubmitting}
            disabled={!canConfirm}
          >
            تأكيد
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            تخطّي
          </Button>
        </div>

        <p className="text-[11px] text-ink-3 text-center leading-relaxed">
          الإهلاك غير نقدي — لا يؤثر على الصندوق ولا على الميزانية. يُخصَم من
          الربح التشغيلي فقط (لمطابقة مفهوم «تكلفة الأصل» بذهن صاحب العمل —
          INV-22 بعد إعادة الترقيم D10).
        </p>
      </div>
    </ResponsiveModal>
  );
}
