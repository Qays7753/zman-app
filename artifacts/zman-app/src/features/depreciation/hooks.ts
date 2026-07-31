"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { addCapitalAsset, deleteCapitalAsset, updateCapitalAsset } from "./actions";
import { getAllCapitalAssets } from "./assetsQueries";
import { getAmmanDate } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────
// depreciation/hooks — React Query hooks لاستدعاء addCapitalAsset (Phase 4)
// ─────────────────────────────────────────────────────────────────────────
// بعد حفظ مصروف/شراء رأسمالي واختيار المستخدم «توزيع شهري (إهلاك)» في
// DepreciationPromptModal، يستدعي ExpenseForm/PurchaseForm useAddCapitalAsset
// لإنشاء صف capital_asset. onSuccess يُبطل استعلامات التقارير والـ dashboard
// لأن computeOperatingPnl يتأثر (يخصم الإهلاك من operatingNetCents).
//
// namespace منفصل: ["capital-assets"] (لا يتدخّل مع ["inventory"] أو ["reports"]).
//
// D7 fix (SA4) — useDeleteCapitalAsset لزر «إيقاف الإهلاك» على صفوف
// ExpensesTab/PurchasesTab. يُبطل استعلامات finance/reports/dashboard لأن
// حذف capital_asset ناعماً يوقف الإهلاك فيُتأثر operatingNetCents.
// ─────────────────────────────────────────────────────────────────────────

export const capitalAssetKeys = {
  all: ["capital-assets"] as const,
  list: (asOfDate?: string) => [...capitalAssetKeys.all, "list", asOfDate ?? ""] as const,
};

/**
 * جلب كل الأصول الرأسمالية النشطة مع بيانات الإهلاك — لشاشة /assets.
 */
export function useCapitalAssets(asOfDate?: string) {
  const date = asOfDate ?? getAmmanDate();
  return useQuery({
    queryKey: capitalAssetKeys.list(date),
    queryFn: () => getAllCapitalAssets(date),
    staleTime: 0,
    refetchOnMount: "always",
  });
}

interface AddCapitalAssetVariables {
  sourceType: "expense" | "purchase";
  sourceId: string;
  name: string;
  purchaseDate: string;
  purchaseAmountCents: number;
  usefulLifeMonths: number;
}

export function useAddCapitalAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: AddCapitalAssetVariables) => addCapitalAsset(vars),
    onSuccess: (res) => {
      if (res.status === "ok") {
        // الإهلاك يُخصَم من computeOperatingPnl → كل من dashboard و reports يتأثران.
        queryClient.invalidateQueries({ queryKey: ["reports"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        queryClient.invalidateQueries({ queryKey: capitalAssetKeys.all });
      }
    },
  });
}

export function useDeleteCapitalAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCapitalAsset(id),
    onSuccess: (res) => {
      if (res.status === "ok") {
        // إيقاف الإهلاك يُلغي خصم monthly_dep من operatingNetCents في كل قراءة
        // مستقبلية → يجب إبطال كل من finance/reports/dashboard.
        queryClient.invalidateQueries({ queryKey: ["finance"] });
        queryClient.invalidateQueries({ queryKey: ["reports"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        queryClient.invalidateQueries({ queryKey: capitalAssetKeys.all });
      }
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────
// useUpdateCapitalAsset — تعديل أصل رأسمالي قائم (Issue #11)
// ─────────────────────────────────────────────────────────────────────────
// يُستدعى من EditAssetModal في AssetsScreen. يُحدِّث: الاسم + تاريخ الشراء
// (startDate) + العمر النافع فقط. 🔒 لا يقبل purchaseAmountCents إطلاقاً —
// القيمة الأصلية تُؤخَذ من الصف الحالي في DB داخل updateCapitalAsset.
// onSuccess يُبطل استعلامات reports/dashboard/capital-assets لأن
// monthlyDepreciationCents قد يتغيّر → computeOperatingPnl يتأثر.
// ─────────────────────────────────────────────────────────────────────────

interface UpdateCapitalAssetVariables {
  id: string;
  name: string;
  purchaseDate: string;
  usefulLifeMonths: number;
}

export function useUpdateCapitalAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: UpdateCapitalAssetVariables) => updateCapitalAsset(vars),
    onSuccess: (res) => {
      if (res.status === "ok") {
        // تعديل العمر النافع/تاريخ البدء يُعيد توزيع الإهلاك في القراءات
        // المستقبلية → يجب إبطال كل من reports/dashboard/capital-assets.
        queryClient.invalidateQueries({ queryKey: ["reports"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        queryClient.invalidateQueries({ queryKey: capitalAssetKeys.all });
      }
    },
  });
}
