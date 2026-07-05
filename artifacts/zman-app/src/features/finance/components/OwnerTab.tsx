"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Coins, Plus, Trash2, ArrowUpRight, ArrowDownRight, Loader2 } from "lucide-react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useOwnerTransactions, useCreateOwnerTransaction, useDeleteOwnerTransaction, useAccounts } from "../hooks";
import { AmountText } from "@/components/shared/AmountText";
import { Button } from "@/components/shared/Button";
import { ResponsiveModal } from "@/components/shared/ResponsiveModal";

export function OwnerTab() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { data: transactions, isLoading } = useOwnerTransactions();
  const { data: accounts } = useAccounts();
  const createTxMutation = useCreateOwnerTransaction();
  const deleteTxMutation = useDeleteOwnerTransaction();

  const isOpen = searchParams.get("newOwnerTx") === "true";

  const updateUrl = (params: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(params).forEach(([key, val]) => {
      if (val === null) next.delete(key);
      else next.set(key, val);
    });
    router.replace(`${pathname}?${next.toString()}`);
  };
  const [txType, setTxType] = useState<"draw" | "inject">("draw");
  const [txAmount, setTxAmount] = useState("");
  const [txAccountId, setTxAccountId] = useState("");
  const [txDate, setTxDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [txReason, setTxReason] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!txAccountId) {
      toast.error("يرجى اختيار الحساب المالي المرتبط");
      return;
    }
    const amt = parseFloat(txAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error("المبلغ يجب أن يكون أكبر من 0");
      return;
    }

    const val = {
      type: txType,
      amountCents: Math.round(amt * 1000),
      accountId: txAccountId,
      date: txDate,
      reason: txReason.trim() || undefined,
    };

    createTxMutation.mutate({
      values: val,
      requestId: crypto.randomUUID()
    }, {
      onSuccess: (res) => {
        if (res.status === "ok") {
          toast.success("تم تسجيل المعاملة بنجاح");
          updateUrl({ newOwnerTx: null });
          setTxAmount("");
          setTxReason("");
        } else {
          toast.error(res.message || "فشل تسجيل المعاملة");
        }
      },
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذه المعاملة؟ سيتم التراجع عن حركة الصندوق المرفقة.")) {
      return;
    }
    deleteTxMutation.mutate({ id }, {
      onSuccess: (res) => {
        if (res.status === "ok") {
          toast.success("تم حذف المعاملة بنجاح");
        } else {
          toast.error(res.message || "فشل حذف المعاملة");
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

  return (
    <div className="space-y-6">
      {/* الهيدر وزر الإضافة */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-ink">سحوبات وإيداعات المالك (حقوق الملكية)</h2>
          <p className="text-xs text-ink/50 mt-0.5">تسجيل السحوبات الشخصية وحقن رأس المال الإضافي للورشة</p>
        </div>
        <Button
          onClick={() => updateUrl({ newOwnerTx: "true" })}
          className="flex items-center gap-1 text-xs"
        >
          <Plus className="h-4 w-4" />
          معاملة مالك جديدة
        </Button>
      </div>

      {/* قائمة المعاملات */}
      <div className="bg-paper rounded-lg border border-hairline shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-canvas border-b border-hairline text-ink/65 text-xs font-bold">
              <tr>
                <th className="p-4">التاريخ</th>
                <th className="p-4">النوع</th>
                <th className="p-4">المبلغ</th>
                <th className="p-4">الحساب المرتبط</th>
                <th className="p-4">البيان / السبب</th>
                <th className="p-4 w-20">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline font-medium text-ink/85">
              {transactions?.map((tx) => {
                const acc = accounts?.find((a) => a.id === tx.accountId);
                const isDraw = tx.type === "draw";

                return (
                  <tr key={tx.id} className="hover:bg-canvas/30">
                    <td className="p-4 font-mono text-xs">{tx.date}</td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1 text-xs font-bold ${isDraw ? "text-alert" : "text-info"}`}>
                        {isDraw ? (
                          <>
                            <ArrowDownRight className="h-3.5 w-3.5" />
                            سحوبات المالك
                          </>
                        ) : (
                          <>
                            <ArrowUpRight className="h-3.5 w-3.5" />
                            حقن رأس مال
                          </>
                        )}
                      </span>
                    </td>
                    <td className="p-4 font-mono font-bold">
                      <AmountText amount={tx.amountCents} />
                    </td>
                    <td className="p-4 text-xs">{acc ? acc.name : "حساب غير معروف"}</td>
                    <td className="p-4 text-xs text-ink/60 max-w-[200px] truncate" title={tx.reason || ""}>
                      {tx.reason || "—"}
                    </td>
                    <td className="p-4 text-center">
                      <button
                        type="button"
                        onClick={() => handleDelete(tx.id)}
                        disabled={deleteTxMutation.isPending}
                        className="text-alert hover:bg-alert/10 p-1.5 rounded transition"
                        title="حذف السجل والتراجع عنه"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {(!transactions || transactions.length === 0) && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-ink/40 text-xs">
                    لا توجد معاملات مسجلة للمالك بعد.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* مودال المعاملة الجديدة */}
      <ResponsiveModal
        isOpen={isOpen}
        onClose={() => updateUrl({ newOwnerTx: null })}
        title="تسجيل معاملة مالك جديدة"
      >
        <form onSubmit={handleSubmit} className="space-y-4 p-4 font-medium text-ink">
          <div className="space-y-1">
            <label className="text-xs font-bold text-ink/75 block">نوع المعاملة</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTxType("draw")}
                className={`h-10 rounded-md border text-sm font-bold flex items-center justify-center gap-1.5 transition ${
                  txType === "draw"
                    ? "bg-alert/10 border-alert text-alert"
                    : "bg-canvas border-hairline hover:bg-canvas/80 text-ink/70"
                }`}
              >
                <ArrowDownRight className="h-4 w-4" />
                سحوبات شخصية (للخارج)
              </button>
              <button
                type="button"
                onClick={() => setTxType("inject")}
                className={`h-10 rounded-md border text-sm font-bold flex items-center justify-center gap-1.5 transition ${
                  txType === "inject"
                    ? "bg-info/10 border-info text-info"
                    : "bg-canvas border-hairline hover:bg-canvas/80 text-ink/70"
                }`}
              >
                <ArrowUpRight className="h-4 w-4" />
                حقن رأس مال (للداخل)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-ink/75 block">المبلغ (دينار أردني)</label>
              <input
                type="number"
                step="0.001"
                min="0.001"
                required
                value={txAmount}
                onChange={(e) => setTxAmount(e.target.value)}
                className="w-full h-10 px-3 bg-canvas border border-hairline rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ink font-mono"
                placeholder="0.000"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-ink/75 block">التاريخ</label>
              <input
                type="date"
                required
                value={txDate}
                onChange={(e) => setTxDate(e.target.value)}
                className="w-full h-10 px-3 bg-canvas border border-hairline rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ink"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-ink/75 block">الحساب المرتبط (الصندوق/البنك المتأثر)</label>
            <select
              required
              value={txAccountId}
              onChange={(e) => setTxAccountId(e.target.value)}
              className="w-full h-10 px-3 bg-canvas border border-hairline rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ink"
            >
              <option value="">اختر الحساب...</option>
              {accounts?.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.type === "cash" ? "نقدي" : "بنكي"})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-ink/75 block">البيان / السبب</label>
            <input
              type="text"
              value={txReason}
              onChange={(e) => setTxReason(e.target.value)}
              className="w-full h-10 px-3 bg-canvas border border-hairline rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ink"
              placeholder="مثال: سحب نقدي لمصاريف عائلية..."
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => updateUrl({ newOwnerTx: null })}
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              isLoading={createTxMutation.isPending}
            >
              تسجيل المعاملة
            </Button>
          </div>
        </form>
      </ResponsiveModal>
    </div>
  );
}
