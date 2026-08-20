"use client";

import { useMemo } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  Eye,
  History,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  Wallet,
} from "lucide-react";
import { AppShellHeader } from "@/providers/app-shell-context";
import { useAuditLog, type AuditLogEntry } from "@/features/audit/hooks";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { formatDate } from "@/lib/dates";

// ─────────────────────────────────────────────────────────────────────────
// Issue #16 — AuditLogClient
// ─────────────────────────────────────────────────────────────────────────
// Page consumer of useAuditLog(). Renders three states:
//   1. tableMissing === true → EmptyState "غير مُفعَّل بعد" (migration 0026
//      not applied on Supabase yet — the owner must apply it manually).
//   2. items.length === 0 → EmptyState "لا توجد عمليات مُسجَّلة بعد".
//   3. otherwise → list of AuditLogEntry rows + "تحميل المزيد" button for
//      infinite scroll (cursor = last item's ISO timestamp).
// ─────────────────────────────────────────────────────────────────────────

const ENTITY_META: Record<
  string,
  { label: string; icon: typeof ShoppingBag; color: string }
> = {
  purchase: { label: "مشتريات", icon: ShoppingCart, color: "text-ink-2" },
  expense: { label: "مصروف", icon: ArrowDownRight, color: "text-ink-2" },
  sale: { label: "مبيعة", icon: ArrowUpRight, color: "text-ink-2" },
  order: { label: "طلب", icon: ShoppingBag, color: "text-ink-2" },
  capital_asset: { label: "أصل رأسمالي", icon: History, color: "text-ink-2" },
  account: { label: "حساب", icon: Wallet, color: "text-ink-2" },
  transfer: { label: "تحويل", icon: ArrowLeft, color: "text-ink-2" },
  owner_transaction: { label: "معاملة مالك", icon: Wallet, color: "text-ink-2" },
};

const ACTION_LABELS: Record<string, string> = {
  create_purchase: "إنشاء مشتريات",
  update_purchase: "تعديل مشتريات",
  delete_purchase: "حذف مشتريات",
  create_expense: "إنشاء مصروف",
  update_expense: "تعديل مصروف",
  delete_expense: "حذف مصروف",
  create_sale: "إنشاء مبيعة",
  update_sale: "تعديل مبيعة",
  delete_sale: "حذف مبيعة",
  convert_order_to_sale: "تحويل طلب إلى مبيعة",
  reverse_sale: "عكس بيع",
  create_order: "إنشاء طلب",
  update_order: "تعديل طلب",
  delete_order: "حذف طلب",
  update_order_status: "تحديث حالة طلب",
  create_account: "إنشاء حساب",
  archive_account: "أرشفة حساب",
  unarchive_account: "إلغاء أرشفة حساب",
  delete_account: "حذف حساب",
  delete_transfer: "حذف تحويل",
  create_owner_transaction: "معاملة مالك",
  delete_owner_transaction: "حذف معاملة مالك",
  create_capital_asset: "إنشاء أصل رأسمالي",
  update_capital_asset: "تعديل أصل رأسمالي",
  delete_capital_asset: "إيقاف إهلاك أصل",
};

function actionVerb(action: string): {
  label: string;
  Icon: typeof Plus;
  tone: "create" | "update" | "delete" | "info";
} {
  if (action.startsWith("create_")) {
    return { label: "إنشاء", Icon: Plus, tone: "create" };
  }
  if (action.startsWith("update_") || action === "convert_order_to_sale") {
    return { label: "تعديل", Icon: Pencil, tone: "update" };
  }
  if (action === "reverse_sale" || action === "unarchive_account") {
    return { label: "عكس", Icon: RefreshCw, tone: "info" };
  }
  if (action.startsWith("delete_") || action === "archive_account") {
    return { label: "حذف", Icon: Trash2, tone: "delete" };
  }
  return { label: "إجراء", Icon: Eye, tone: "info" };
}

const TONE_COLOR: Record<string, string> = {
  create: "text-brand",
  update: "text-brand",
  delete: "text-alert",
  info: "text-ink-2",
};

function shortId(id: string | null): string | null {
  if (!id) return null;
  // Show first 8 chars of a UUID; for non-UUID strings, show up to 8 chars.
  return id.length >= 8 ? id.slice(0, 8) : id;
}

function previewSnapshot(snapshot: unknown): string | null {
  if (snapshot == null) return null;
  try {
    const json = typeof snapshot === "string" ? snapshot : JSON.stringify(snapshot);
    if (!json || json === "null" || json === "{}") return null;
    // Truncate to keep the row single-line on mobile (360px).
    const max = 120;
    return json.length > max ? `${json.slice(0, max)}…` : json;
  } catch {
    return null;
  }
}

function AuditRow({ entry }: { entry: AuditLogEntry }) {
  const meta = ENTITY_META[entry.entityType] ?? ENTITY_META.order!;
  const EntityIcon = meta.icon;
  const { label: verb, Icon: VerbIcon, tone } = actionVerb(entry.action);
  const actionLabel = ACTION_LABELS[entry.action] ?? entry.action;
  const preview = previewSnapshot(entry.changesSnapshot);
  const sid = shortId(entry.entityId);

  return (
    <div className="flex items-start gap-3 p-4 hover:bg-canvas transition-colors">
      <div className="p-2 rounded-lg bg-canvas shrink-0">
        <EntityIcon className={`h-4 w-4 ${meta.color}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center gap-1 text-xs font-bold ${TONE_COLOR[tone]}`}>
            <VerbIcon className="h-3.5 w-3.5" />
            {verb}
          </span>
          <span className="text-sm font-bold text-ink">{actionLabel}</span>
          {sid && (
            <span className="text-[10px] text-ink/45 font-mono dir-ltr whitespace-nowrap">
              #{sid}
            </span>
          )}
        </div>
        <p className="text-[10px] text-ink/45 mt-0.5 whitespace-nowrap">
          {formatDate(entry.timestamp, "yyyy-MM-dd HH:mm:ss")}
        </p>
        {preview && (
          <p
            className="text-[11px] text-ink/55 mt-1.5 font-mono break-all leading-relaxed bg-canvas/60 rounded px-1.5 py-1 border border-hairline/60"
            dir="ltr"
          >
            {preview}
          </p>
        )}
      </div>
    </div>
  );
}

export default function AuditLogClient() {
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useAuditLog();

  const allItems = useMemo(() => {
    const pages = data?.pages ?? [];
    const items: AuditLogEntry[] = [];
    for (const p of pages) items.push(...p.items);
    return items;
  }, [data]);

  const tableMissing = data?.pages?.[0]?.tableMissing === true;

  return (
    <>
      <AppShellHeader title="سجل التدقيق" />

      <div className="flex-1 p-4 max-w-2xl mx-auto w-full space-y-4 pb-28">
        <div className="flex items-center gap-2 px-1 py-1">
          <ShieldCheck className="h-5 w-5 text-brand" />
          <h2 className="text-sm font-black text-ink">سجل عمليات الإنشاء والتعديل والحذف</h2>
        </div>

        {isLoading ? (
          <SkeletonList count={8} />
        ) : isError ? (
          <ErrorState
            message="تعذّر تحميل سجل التدقيق. تحقّق من اتصالك ثم أعد المحاولة."
            onRetry={() => refetch()}
          />
        ) : tableMissing ? (
          <EmptyState
            title="سجل التدقيق غير مُفعَّل بعد"
            description="سيظهر هنا بعد تطبيق تحديث النظام. لا يؤثر ذلك على أي عملية مالية — كل العمليات تعمل كالمعتاد."
          />
        ) : allItems.length === 0 ? (
          <EmptyState
            title="لا توجد عمليات مُسجَّلة بعد"
            description="عند إنشاء أو تعديل أو حذف أي عملية مالية، سيظهر السجل هنا تلقائياً."
          />
        ) : (
          <>
            <div className="bg-paper rounded-lg border border-hairline shadow-sm divide-y divide-hairline overflow-hidden">
              {allItems.map((entry) => (
                <AuditRow key={entry.id} entry={entry} />
              ))}
            </div>

            {hasNextPage && (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="min-h-[44px] px-6 py-2.5 rounded-xl bg-paper border border-hairline text-ink font-bold hover:bg-canvas active:scale-95 transition-all text-xs sm:text-sm shadow-sm disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                >
                  {isFetchingNextPage ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      جارٍ التحميل…
                    </>
                  ) : (
                    "تحميل المزيد"
                  )}
                </button>
              </div>
            )}

            {!hasNextPage && (
              <p className="text-center text-[11px] text-ink/40 pt-2 flex items-center justify-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                لا توجد عمليات أقدم من هذا الحد
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}
