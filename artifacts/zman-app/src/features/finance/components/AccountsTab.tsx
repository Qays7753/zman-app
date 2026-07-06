"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Landmark, Loader2, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useAccountBalancesQuery, useCreateAccount, useTransferBetweenAccounts, useArchiveAccount, useUnarchiveAccount, useDeleteAccount } from "../hooks";
import { AmountText } from "@/components/shared/AmountText";
import { Button } from "@/components/shared/Button";
import { ResponsiveModal } from "@/components/shared/ResponsiveModal";

export function AccountsTab() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { data: accounts, isLoading, refetch } = useAccountBalancesQuery();
  const createAccountMutation = useCreateAccount();
  const transferMutation = useTransferBetweenAccounts();
  const archiveMutation = useArchiveAccount();
  const unarchiveMutation = useUnarchiveAccount();
  const deleteMutation = useDeleteAccount();

  const handleArchive = (id: string) => {
    archiveMutation.mutate(id, {
      onSuccess: (res) => {
        if (res.status === "ok") toast.success("تمت أرشفة الحساب بنجاح");
        else toast.error(res.message);
      },
    });
  };

  const handleUnarchive = (id: string) => {
    unarchiveMutation.mutate(id, {
      onSuccess: (res) => {
        if (res.status === "ok") toast.success("تم إلغاء أرشفة الحساب بنجاح");
        else toast.error(res.message);
      },
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا الحساب؟")) return;
    deleteMutation.mutate(id, {
      onSuccess: (res) => {
        if (res.status === "ok") toast.success("تم حذف الحساب بنجاح");
        else toast.error(res.message);
      },
    });
  };

  const isAddOpen = searchParams.get("newAccount") === "true";
  const isTransferOpen = searchParams.get("newTransfer") === "true";

  const updateUrl = (params: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(params).forEach(([key, val]) => {
      if (val === null) next.delete(key);
      else next.set(key, val);
    });
    router.replace(`${pathname}?${next.toString()}`);
  };

  // Add Account form states
  const [accName, setAccName] = useState("");
  const [accType, setAccType] = useState<"cash" | "bank">("cash");
  const [accOpening, setAccOpening] = useState("");

  // Transfer form states
  const [fromAcc, setFromAcc] = useState("");
  const [toAcc, setToAcc] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferDate, setTransferDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [transferDesc, setTransferDesc] = useState("");

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accName.trim()) {
      toast.error("اسم الحساب مطلوب");
      return;
    }
    const val = {
      name: accName.trim(),
      type: accType,
      openingBalanceCents: Math.round(parseFloat(accOpening || "0") * 1000),
    };

    createAccountMutation.mutate(val, {
      onSuccess: (res) => {
        if (res.status === "ok") {
          toast.success("تم إنشاء الحساب بنجاح");
          updateUrl({ newAccount: null });
          setAccName("");
          setAccOpening("");
        } else {
          toast.error(res.message || "فشل إنشاء الحساب");
        }
      },
    });
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromAcc || !toAcc) {
      toast.error("يرجى اختيار الحساب المرسل والمستقبل");
      return;
    }
    if (fromAcc === toAcc) {
      toast.error("لا يمكن التحويل لنفس الحساب");
      return;
    }
    const amountVal = parseFloat(transferAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      toast.error("المبلغ يجب أن يكون أكبر من 0");
      return;
    }

    const val = {
      fromId: fromAcc,
      toId: toAcc,
      amountCents: Math.round(amountVal * 1000),
      date: transferDate,
      description: transferDesc.trim() || undefined,
    };

    transferMutation.mutate({
      ...val,
      requestId: crypto.randomUUID()
    }, {
      onSuccess: (res) => {
        if (res.status === "ok") {
          toast.success("تم التحويل المالي بنجاح");
          updateUrl({ newTransfer: null });
          setTransferAmount("");
          setTransferDesc("");
        } else {
          toast.error(res.message || "فشل عملية التحويل");
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
      {/* الأزرار العلوية */}
      <div>
        <h2 className="text-base font-bold text-ink">الحسابات النقدية والبنكية</h2>
        <p className="text-xs text-ink/50 mt-0.5">إدارة الخزائن النقدية، الحسابات البنكية وحركات التحويل البيني</p>
      </div>

      {/* قائمة الحسابات */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {accounts?.map((acc) => (
          <div
            key={acc.id}
            className={`bg-paper p-5 rounded-lg border shadow-sm flex flex-col justify-between space-y-4 transition-all ${
              acc.isArchived ? "border-hairline-2 opacity-60" : "border-hairline"
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-sm text-ink">{acc.name}</h3>
                <span className="text-[10px] bg-canvas px-2 py-0.5 rounded-full border border-hairline font-bold text-ink/60 mt-1 inline-block">
                  {acc.type === "cash" ? "صندوق نقدية" : "حساب بنكي"}
                  {acc.isArchived && " • مؤرشف"}
                </span>
              </div>
              <Landmark className="h-5 w-5 text-info" />
            </div>
            <div>
              <span className="text-xs text-ink/40 block">الرصيد الحالي</span>
              <span className="text-xl font-bold font-mono text-ink">
                <AmountText amount={acc.balanceCents} />
              </span>
            </div>
            {/* أزرار الإجراءات - أيقونات فقط بدون أي نصوص لتفادي ازدحام الواجهة */}
            <div className="flex gap-2 pt-2 border-t border-hairline justify-end">
              {!acc.isArchived ? (
                <button
                  type="button"
                  onClick={() => handleArchive(acc.id)}
                  disabled={archiveMutation.isPending}
                  title="أرشفة"
                  className="p-2.5 rounded-md border border-hairline-2 text-ink-2 hover:bg-canvas transition-colors disabled:opacity-50 flex items-center justify-center"
                >
                  <Archive className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleUnarchive(acc.id)}
                  disabled={unarchiveMutation.isPending}
                  title="إلغاء الأرشفة"
                  className="p-2.5 rounded-md border border-info/30 text-info hover:bg-info-soft transition-colors disabled:opacity-50 flex items-center justify-center"
                >
                  <ArchiveRestore className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => handleDelete(acc.id)}
                disabled={deleteMutation.isPending}
                title="حذف"
                className="p-2.5 rounded-md border border-alert/30 text-alert hover:bg-alert-soft transition-colors disabled:opacity-50 flex items-center justify-center"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
        {(!accounts || accounts.length === 0) && (
          <div className="col-span-full bg-paper p-10 rounded-lg border border-hairline text-center">
            <p className="text-sm text-ink/50">لا توجد حسابات مالية معرفة بعد.</p>
          </div>
        )}
      </div>

      {/* مودال إضافة حساب جديد */}
      <ResponsiveModal
        isOpen={isAddOpen}
        onClose={() => updateUrl({ newAccount: null })}
        title="إنشاء حساب مالي جديد"
      >
        <form onSubmit={handleAddSubmit} className="space-y-4 p-4 font-medium text-ink">
          <div className="space-y-1">
            <label className="text-xs font-bold text-ink/75 block">اسم الحساب (مثال: صندوق المعرض، حساب بنك الاتحاد)</label>
            <input
              type="text"
              required
              value={accName}
              onChange={(e) => setAccName(e.target.value)}
              className="w-full h-10 px-3 bg-canvas border border-hairline rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ink"
              placeholder="أدخل اسم الحساب..."
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-ink/75 block">نوع الحساب</label>
            <select
              value={accType}
              onChange={(e) => setAccType(e.target.value as any)}
              className="w-full h-10 px-3 bg-canvas border border-hairline rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ink"
            >
              <option value="cash">صندوق نقدية (كاش)</option>
              <option value="bank">حساب بنكي</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-ink/75 block">الرصيد الافتتاحي (دينار أردني)</label>
            <input
              type="number"
              step="0.001"
              min="0"
              value={accOpening}
              onChange={(e) => setAccOpening(e.target.value)}
              className="w-full h-10 px-3 bg-canvas border border-hairline rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ink font-mono"
              placeholder="0.000"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => updateUrl({ newAccount: null })}
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              isLoading={createAccountMutation.isPending}
            >
              إنشاء
            </Button>
          </div>
        </form>
      </ResponsiveModal>

      {/* مودال التحويل البيني */}
      <ResponsiveModal
        isOpen={isTransferOpen}
        onClose={() => updateUrl({ newTransfer: null })}
        title="تحويل مالي بين الحسابات"
      >
        <form onSubmit={handleTransferSubmit} className="space-y-4 p-4 font-medium text-ink">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-ink/75 block">من حساب (المرسل)</label>
              <select
                required
                value={fromAcc}
                onChange={(e) => setFromAcc(e.target.value)}
                className="w-full h-10 px-3 bg-canvas border border-hairline rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ink"
              >
                <option value="">اختر حساب المرسل...</option>
                {accounts?.filter((acc) => !acc.isArchived).map((acc) => (
                  <option key={acc.id} value={acc.id}>{acc.name} ({acc.type === "cash" ? "نقدي" : "بنكي"})</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-ink/75 block">إلى حساب (المستقبل)</label>
              <select
                required
                value={toAcc}
                onChange={(e) => setToAcc(e.target.value)}
                className="w-full h-10 px-3 bg-canvas border border-hairline rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ink"
              >
                <option value="">اختر حساب المستقبل...</option>
                {accounts?.filter((acc) => !acc.isArchived).map((acc) => (
                  <option key={acc.id} value={acc.id}>{acc.name} ({acc.type === "cash" ? "نقدي" : "بنكي"})</option>
                ))}
              </select>
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
                value={transferAmount}
                onChange={(e) => setTransferAmount(e.target.value)}
                className="w-full h-10 px-3 bg-canvas border border-hairline rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ink font-mono"
                placeholder="0.000"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-ink/75 block">التاريخ</label>
              <input
                type="date"
                required
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
                className="w-full h-10 px-3 bg-canvas border border-hairline rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ink"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-ink/75 block">البيان / الوصف</label>
            <input
              type="text"
              value={transferDesc}
              onChange={(e) => setTransferDesc(e.target.value)}
              className="w-full h-10 px-3 bg-canvas border border-hairline rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ink"
              placeholder="مثال: تغذية الصندوق الفرعي من البنك..."
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => updateUrl({ newTransfer: null })}
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              isLoading={transferMutation.isPending}
            >
              تحويل
            </Button>
          </div>
        </form>
      </ResponsiveModal>
    </div>
  );
}
