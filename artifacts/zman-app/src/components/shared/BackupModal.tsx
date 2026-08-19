"use client";

import { useState } from "react";
import { Download, ShieldCheck, Database, CheckCircle2 } from "lucide-react";
import { ResponsiveModal } from "./ResponsiveModal";
import { Button } from "./Button";
import { useAccountBalancesQuery } from "@/features/finance/hooks";
import { useCatalogComponents } from "@/features/catalog/hooks";
import { useOpeningBalance } from "@/features/finance/hooks";
import { useCapitalAssets } from "@/features/depreciation/hooks";
import { useOrders } from "@/features/orders/hooks";

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BackupModal({ isOpen, onClose }: BackupModalProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [done, setDone] = useState(false);

  const { data: accounts } = useAccountBalancesQuery(undefined, true);
  const { data: catalog } = useCatalogComponents();
  const { data: openingBal } = useOpeningBalance();
  const { data: assets } = useCapitalAssets();
  const { data: ordersData } = useOrders({ limit: 100 });

  const handleExport = () => {
    setIsExporting(true);
    try {
      const backupData = {
        version: "1.0",
        exportDate: new Date().toISOString(),
        appName: "ZMAN-APP",
        summary: {
          accountsCount: accounts?.length ?? 0,
          catalogCount: catalog?.length ?? 0,
          assetsCount: assets?.length ?? 0,
          ordersCount: ordersData?.items?.length ?? 0,
        },
        data: {
          accounts: accounts ?? [],
          catalog: catalog ?? [],
          openingBalance: openingBal ?? null,
          capitalAssets: assets ?? [],
          recentOrders: ordersData?.items ?? [],
        },
      };

      const jsonString = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const filename = `zman-backup-${new Date().toLocaleDateString("en-CA")}.json`;

      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setDone(true);
      setTimeout(() => setDone(false), 3000);
    } catch {
      // Export handled gracefully
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <ResponsiveModal isOpen={isOpen} onClose={onClose} title="تصدير بيانات مرجعية">
      <div className="space-y-5 py-2">
        <div className="flex items-center gap-3 p-4 bg-brand-soft border border-brand/20 rounded-xl text-brand-deep">
          <Database className="w-6 h-6 shrink-0" />
          <div>
            <h4 className="font-bold text-sm">تصدير لقطة مرجعية</h4>
            <p className="text-xs text-ink-2 mt-0.5">
              ينزّل ملف JSON على جهازك يحوي الحسابات والكتالوج والأصول الرأسمالية
              والرصيد الافتتاحي، مع <strong>آخر 100 طلب</strong>.
            </p>
          </div>
        </div>

        <div className="space-y-2.5 text-xs text-ink-2">
          <div className="flex items-center justify-between p-2.5 bg-canvas rounded-lg border border-hairline">
            <span>عدد الحسابات والصناديق:</span>
            <span className="font-bold text-ink">{accounts?.length ?? 0}</span>
          </div>
          <div className="flex items-center justify-between p-2.5 bg-canvas rounded-lg border border-hairline">
            <span>أصناف الكتالوج والمخزون:</span>
            <span className="font-bold text-ink">{catalog?.length ?? 0}</span>
          </div>
          <div className="flex items-center justify-between p-2.5 bg-canvas rounded-lg border border-hairline">
            <span>الأصول الرأسمالية:</span>
            <span className="font-bold text-ink">{assets?.length ?? 0}</span>
          </div>
        </div>

        <div className="flex items-start gap-2 p-3 bg-alert/10 border border-alert/20 rounded-lg text-[11px] leading-relaxed text-ink-2">
          <ShieldCheck className="w-4 h-4 shrink-0 text-alert mt-0.5" />
          <span>
            <strong className="text-ink">ليست نسخة استرجاع كاملة.</strong> لا تشمل
            المصاريف والمشتريات والمبيعات والحركات النقدية، ولا يمكن استيرادها.
            للنسخ الاحتياطي الكامل استخدم نسخة قاعدة البيانات من Supabase.
          </span>
        </div>

        {done && (
          <div className="flex items-center gap-2 p-3 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold border border-emerald-200">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>تم تصدير البيانات المرجعية بنجاح!</span>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            إغلاق
          </Button>
          <Button
            onClick={handleExport}
            isLoading={isExporting}
            className="flex-1 gap-1.5"
          >
            <Download className="w-4 h-4 shrink-0" />
            تصدير البيانات (JSON)
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
