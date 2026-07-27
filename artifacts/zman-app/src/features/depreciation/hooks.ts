"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addCapitalAsset } from "./actions";

// ─────────────────────────────────────────────────────────────────────────
// depreciation/hooks — React Query hooks لاستدعاء addCapitalAsset (Phase 4)
// ─────────────────────────────────────────────────────────────────────────
// بعد حفظ مصروف/شراء رأسمالي واختيار المستخدم «توزيع شهري (إهلاك)» في
// DepreciationPromptModal، يستدعي ExpenseForm/PurchaseForm useAddCapitalAsset
// لإنشاء صف capital_asset. onSuccess يُبطل استعلامات التقارير والـ dashboard
// لأن computeOperatingPnl يتأثر (يخصم الإهلاك من operatingNetCents).
//
// namespace منفصل: ["capital-assets"] (لا يتدخّل مع ["inventory"] أو ["reports"]).
// ─────────────────────────────────────────────────────────────────────────

export const capitalAssetKeys = {
  all: ["capital-assets"] as const,
};

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
