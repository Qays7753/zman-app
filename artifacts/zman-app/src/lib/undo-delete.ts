import { toast } from "sonner";

interface ScheduleDeleteWithUndoOptions {
  /** الرسالة الرئيسية للتنبيه (مثل «تم حذف المصروف»). */
  message: string;
  /** نص زر التراجع — افتراضي «تراجع». */
  undoLabel?: string;
  /** مدة العد التنازلي قبل الحذف النهائي — افتراضي 5000 مللي ثانية. */
  durationMs?: number;
  /** الحذف الفعلي بعد انتهاء المهلة أو إغلاق التنبيه يدوياً. */
  onCommit: () => Promise<void>;
  /** يُستدعى عند الضغط على زر التراجع (إلغاء الحذف واستعادة الصف). */
  onUndo?: () => void;
  /** يُستدعى عند فشل onCommit (لإظهار خطأ واستعادة الصف). */
  onError?: (err: unknown) => void;
}

/**
 * Issue #12 — نمط «حذف مع تراجع».
 *
 * يُظهر تنبيه sonner يحوي زر «تراجع». بعد `durationMs` (5 ثوانٍ افتراضياً)
 * يُستدعى `onCommit` لتنفيذ الحذف الفعلي. إن ضغط المستخدم «تراجع» قبل انتهاء
 * المهلة يُلغى الحذف ويُستدعى `onUndo`.
 *
 * كل استدعاء يملك إغلاقه الخاص (timer، committed flag) — التنبيهات المتزامنة
 * لا تتداخل مع بعضها.
 *
 * السلوك:
 * - انتهاء المهلة → onCommit
 * - ضغط «تراجع» → onUndo (ولا يُستدعى onCommit لاحقاً)
 * - إغلاق التنبيه يدوياً (X أو swipe) → onCommit فوراً (commit early)
 * - فشل onCommit (رمى استثناء) → onError + استعادة الصف (مسؤولية المُستدعي)
 */
export function scheduleDeleteWithUndo(
  opts: ScheduleDeleteWithUndoOptions,
): void {
  const durationMs = opts.durationMs ?? 5000;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let committed = false;

  const commit = async () => {
    if (committed) return;
    committed = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    try {
      await opts.onCommit();
    } catch (e) {
      opts.onError?.(e);
    }
  };

  timer = setTimeout(() => {
    void commit();
  }, durationMs);

  toast(opts.message, {
    duration: durationMs,
    action: {
      label: opts.undoLabel ?? "تراجع",
      onClick: () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        // امنع أي commit لاحق — التراجع نهائي ضمن نافذة المهلة.
        committed = true;
        opts.onUndo?.();
      },
    },
    onDismiss: () => {
      // أُغلق التنبيه يدوياً (X أو swipe أو بعد انتهاء المهلة) — نفِّذ الحذف مبكراً.
      // إن كان committed=true مسبقاً (ضغط تراجع أو نفّذ setTimeout) فهذه لا-عملية.
      void commit();
    },
  });
}
