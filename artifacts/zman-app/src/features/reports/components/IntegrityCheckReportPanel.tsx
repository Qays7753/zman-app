"use client";

import { CheckCircle2, AlertTriangle, XCircle, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/shared/Button";
import { AmountText } from "@/components/shared/AmountText";
import { runFinancialIntegrityCheckAction } from "@/features/finance/actions";
import type {
  IntegrityReport,
  IntegrityCheckResult,
} from "@/features/finance/integrityCheck";

function StatusIcon({ status }: { status: IntegrityCheckResult["status"] }) {
  if (status === "PASS") return <CheckCircle2 className="h-5 w-5 text-info" />;
  if (status === "WARN")
    return <AlertTriangle className="h-5 w-5 text-warn-deep" />;
  return <XCircle className="h-5 w-5 text-alert" />;
}

const statusLabelAr: Record<IntegrityCheckResult["status"], string> = {
  PASS: "سليم",
  WARN: "تحذير",
  FAIL: "خطأ",
};

const statusColorClass: Record<IntegrityCheckResult["status"], string> = {
  PASS: "border-info/30 bg-info-soft text-info",
  WARN: "border-warn/30 bg-warn-soft text-warn-deep",
  FAIL: "border-alert/30 bg-alert-soft text-alert",
};

export function IntegrityCheckReportPanel() {
  const [report, setReport] = useState<IntegrityReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const runCheck = async () => {
    setIsLoading(true);
    try {
      const res = await runFinancialIntegrityCheckAction();
      if (res.status === "ok" && res.data) {
        setReport(res.data);
        if (res.data.overallStatus === "PASS") {
          toast.success("الفحص المالي: كل الحسابات سليمة");
        } else if (res.data.overallStatus === "WARN") {
          toast.warning("الفحص المالي: توجد تحذيرات");
        } else {
          toast.error("الفحص المالي: توجد مشاكل تحتاج إصلاح");
        }
      } else {
        toast.error(
          res.status === "error" ? res.message : "فشل الفحص المالي",
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-paper rounded-lg border border-hairline shadow-sm p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-hairline pb-3">
        <div>
          <h3 className="text-base font-bold text-ink flex items-center gap-1.5">
            <ShieldCheck className="h-5 w-5 text-info" />
            الفحص المالي الدوري
          </h3>
          <p className="text-xs text-ink/50 mt-0.5">
            فحص آمن لسلامة الحسابات المالية. اضغط للاطّلاع على تقرير فوري.
          </p>
        </div>
        <Button
          onClick={runCheck}
          isLoading={isLoading}
          variant="secondary"
          size="sm"
          className="shrink-0"
        >
          {isLoading ? "جارٍ الفحص..." : "فحص الآن"}
        </Button>
      </div>

      {report && (
        <div className="space-y-3">
          {/* الملخص العام */}
          <div
            className={`p-4 rounded-lg border ${statusColorClass[report.overallStatus]} flex items-center gap-3`}
          >
            <StatusIcon status={report.overallStatus} />
            <div className="min-w-0">
              <p className="font-bold">{report.summaryAr}</p>
              <p className="text-xs opacity-70">
                تاريخ الفحص: {report.asOfDate} · أُجري في:{" "}
                {new Date(report.runAt).toLocaleString("ar-JO", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            </div>
          </div>

          {/* تفاصيل كل فحص */}
          <div className="space-y-2">
            {report.results.map((r) => (
              <div
                key={r.id}
                className={`p-3 rounded-md border ${statusColorClass[r.status]} flex flex-col gap-1.5`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusIcon status={r.status} />
                  <span className="font-bold text-sm">{r.titleAr}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-paper/50">
                    {statusLabelAr[r.status]}
                  </span>
                </div>
                <p className="text-xs opacity-80 leading-relaxed">
                  {r.descriptionAr}
                </p>

                {r.driftCents !== undefined && r.driftCents !== 0 && (
                  <p className="text-xs font-mono">
                    الفارق: <AmountText amount={Math.abs(r.driftCents)} />{" "}
                    {r.driftCents < 0 ? "(سالب)" : "(موجب)"}
                  </p>
                )}

                {r.count !== undefined && r.count > 0 && (
                  <p className="text-xs">عدد المخالفات: {r.count}</p>
                )}

                {r.offendingIds && r.offendingIds.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer opacity-70">
                      المعرّفات المخالفة ({r.offendingIds.length})
                    </summary>
                    <ul className="mt-1 space-y-0.5 font-mono opacity-60 break-all">
                      {r.offendingIds.map((id) => (
                        <li key={id}>{id}</li>
                      ))}
                    </ul>
                  </details>
                )}

                {r.suggestedFixAr && (
                  <p className="text-xs italic opacity-70 border-t border-current/20 pt-1.5 mt-1">
                    ↩ {r.suggestedFixAr}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
