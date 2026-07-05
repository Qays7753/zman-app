"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Lock, Unlock, Loader2, Info } from "lucide-react";
import { useOpeningBalance, useSaveOpeningBalance, useLockOpeningBalance } from "../hooks";
import { AmountText } from "@/components/shared/AmountText";
import { Button } from "@/components/shared/Button";

export function OpeningTab() {
  const { data: opBal, isLoading } = useOpeningBalance();
  const saveMutation = useSaveOpeningBalance();
  const lockMutation = useLockOpeningBalance();

  const [goLiveDate, setGoLiveDate] = useState("");
  const [cash, setCash] = useState("");
  const [bank, setBank] = useState("");
  const [capital, setCapital] = useState("");

  useEffect(() => {
    if (opBal) {
      setGoLiveDate(opBal.goLiveDate);
      setCash((opBal.cashCents / 1000).toString());
      setBank((opBal.bankCents / 1000).toString());
      setCapital((opBal.capitalCents / 1000).toString());
    } else {
      setGoLiveDate(new Date().toLocaleDateString("en-CA"));
      setCash("0");
      setBank("0");
      setCapital("0");
    }
  }, [opBal]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (opBal?.isLocked) {
      toast.error("هذا الإعداد مقفل ومؤكد بالفعل");
      return;
    }

    const cashVal = parseFloat(cash) || 0;
    const bankVal = parseFloat(bank) || 0;
    const capitalVal = parseFloat(capital) || 0;

    // فحص ميزان المراجعة الأساسي: الأصول (نقد + بنك) = رأس مال المالك
    if (Math.abs((cashVal + bankVal) - capitalVal) > 0.0001) {
      toast.error("تنبيه محاسبي: يجب أن يتطابق رأس المال الافتتاحي مع مجموع نقدية الصندوق والبنك (الأصول = حقوق الملكية)");
      return;
    }

    const val = {
      goLiveDate,
      cashCents: Math.round(cashVal * 1000),
      bankCents: Math.round(bankVal * 1000),
      capitalCents: Math.round(capitalVal * 1000),
    };

    saveMutation.mutate(val, {
      onSuccess: (res) => {
        if (res.status === "ok") {
          toast.success("تم حفظ الأرصدة الافتتاحية بنجاح");
        } else {
          toast.error(res.message || "فشل حفظ البيانات");
        }
      },
    });
  };

  const handleLock = () => {
    if (!opBal) return;
    if (opBal.isLocked) return;

    if (!confirm("تحذير محاسبي هام: قفل الرصيد الافتتاحي سيعتمد ميزان القيد تاريخياً ولن يسمح بتعديله لاحقاً بأي شكل لتثبيت القيود بصفة نهائية. هل تريد الاستمرار؟")) {
      return;
    }

    lockMutation.mutate({ id: opBal.id }, {
      onSuccess: (res) => {
        if (res.status === "ok") {
          toast.success("تم قفل وتثبيت الرصيد الافتتاحي بنجاح");
        } else {
          toast.error(res.message || "فشل قفل الإعداد");
        }
      },
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-info" />
      </div>
    );
  }

  const isLocked = opBal?.isLocked ?? false;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-base font-bold text-ink">الأرصدة الافتتاحية للورشة (تاريخ بدء التشغيل)</h2>
        <p className="text-xs text-ink/50 mt-0.5">ضبط المبالغ المتوفرة كاش وفي البنك ورأس مال البداية لمحاذاة الحسابات والميزانية</p>
      </div>

      <div className="bg-paper p-6 rounded-lg border border-hairline shadow-sm space-y-6 font-medium text-ink">
        <div className="flex items-center justify-between border-b border-hairline pb-4">
          <span className="text-xs font-bold text-ink/75 flex items-center gap-1.5">
            {isLocked ? (
              <>
                <Lock className="h-4.5 w-4.5 text-info" />
                الوضعية: مقفل ومؤكد محاسبياً
              </>
            ) : (
              <>
                <Unlock className="h-4.5 w-4.5 text-alert" />
                الوضعية: قيد التعديل والمراجعة
              </>
            )}
          </span>
          {!isLocked && opBal && (
            <Button
              type="button"
              onClick={handleLock}
              isLoading={lockMutation.isPending}
              className="flex items-center gap-1 text-xs px-3 h-8 bg-alert hover:bg-alert-hover text-paper"
            >
              <Lock className="h-3.5 w-3.5" />
              قفل وإغلاق التعديل نهائياً
            </Button>
          )}
        </div>

        {/* إشعار محاسبي */}
        <div className="p-3 bg-canvas border border-hairline rounded-lg flex gap-2.5 text-xs text-ink/70">
          <Info className="h-5 w-5 text-info shrink-0" />
          <p className="leading-relaxed">
            محاسبة البداية تتطلب مطابقة المعادلة: <span className="font-bold">كاش الصندوق الافتتاحي + رصيد البنك الافتتاحي = رأس المال الافتتاحي</span>. سيتحقق النظام من توازن الأطراف تلقائياً عند الحفظ لضمان سلامة ميزانية الوضع المالي.
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-ink/75 block">تاريخ بدء التشغيل المالي (Go-Live Date)</label>
            <input
              type="date"
              required
              disabled={isLocked}
              value={goLiveDate}
              onChange={(e) => setGoLiveDate(e.target.value)}
              className="w-full h-10 px-3 bg-canvas border border-hairline rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ink disabled:opacity-60"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-ink/75 block">كاش الصندوق الافتتاحي (دينار أردني)</label>
              <input
                type="number"
                step="0.001"
                min="0"
                required
                disabled={isLocked}
                value={cash}
                onChange={(e) => setCash(e.target.value)}
                className="w-full h-10 px-3 bg-canvas border border-hairline rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ink font-mono disabled:opacity-60"
                placeholder="0.000"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-ink/75 block">رصيد البنك الافتتاحي (دينار أردني)</label>
              <input
                type="number"
                step="0.001"
                min="0"
                required
                disabled={isLocked}
                value={bank}
                onChange={(e) => setBank(e.target.value)}
                className="w-full h-10 px-3 bg-canvas border border-hairline rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ink font-mono disabled:opacity-60"
                placeholder="0.000"
              />
            </div>
          </div>

          <div className="space-y-1 border-t border-hairline pt-4">
            <label className="text-xs font-bold text-ink/75 block">حقوق المالك الافتتاحية - رأس مال البداية (دينار أردني)</label>
            <input
              type="number"
              step="0.001"
              min="0"
              required
              disabled={isLocked}
              value={capital}
              onChange={(e) => setCapital(e.target.value)}
              className="w-full h-10 px-3 bg-canvas border border-hairline rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ink font-mono disabled:opacity-60"
              placeholder="0.000"
            />
          </div>

          {!isLocked && (
            <div className="flex justify-end pt-2 border-t border-hairline">
              <Button
                type="submit"
                isLoading={saveMutation.isPending}
                className="px-6"
              >
                حفظ وإعداد الأرصدة الافتتاحية
              </Button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
