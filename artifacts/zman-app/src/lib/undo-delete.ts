import { toast } from "sonner";

interface ScheduleDeleteWithUndoOptions {
  /** الرسالة الرئيسية للتنبيه (مثل «سيُحذف المصروف — لا تغلق الصفحة»). */
  message: string;
  /** نص زر التراجع — افتراضي «تراجع». */
  undoLabel?: string;
  /** مدة العد التنازلي قبل الحذف النهائي — افتراضي 5000 مللي ثانية. */
  durationMs?: number;
  /** الحذف الفعلي بعد انتهاء المهلة فقط، مع محاولة أخيرة عند إغلاق الصفحة. */
  onCommit: () => Promise<void>;
  /** يُستدعى عند الضغط على زر التراجع (إلغاء الحذف واستعادة الصف). */
  onUndo?: () => void;
  /** يُستدعى عند فشل onCommit (لإظهار خطأ واستعادة الصف). */
  onError?: (err: unknown) => void;
}

/**
 * Issue #12 — نمط «حذف مع تراجع». (Issue #17 — إصلاح الأمانة.)
 *
 * يُظهر تنبيه sonner يحوي زر «تراجع». بعد `durationMs` (5 ثوانٍ افتراضياً)
 * يُستدعى `onCommit` لتنفيذ الحذف الفعلي. إن ضغط المستخدم «تراجع» قبل انتهاء
 * المهلة يُلغى الحذف ويُستدعى `onUndo`.
 *
 * كل استدعاء يملك إغلاقه الخاص (timer، committed flag، pagehide listener) —
 * التنبيهات المتزامنة لا تتداخل مع بعضها.
 *
 * السلوك:
 * - انتهاء المهلة → onCommit ثم toast.success("تم الحذف") (ماضي فقط بعد تأكيد الخادم).
 * - ضغط «تراجع» → onUndo (ولا يُستدعى onCommit لاحقاً)
 * - إغلاق الصفحة (pagehide) قبل الالتزام → onCommit fire-and-forget كمحاولة أخيرة
 * - فشل onCommit (رمى استثناء) → onError + استعادة الصف (مسؤولية المُستدعي)
 *
 * Issue #17 — صفاء العَلَم:
 * الرسالة المُمرَّرة من المُستدعي بصيغة مُستقبلية (لا ماضية) — لا يقول النظام
 * «تم الحذف» قبل أن يؤكّد الخادم. تأكيد الماضي `toast.success("تم الحذف")`
 * يظهر فقط بعد نجاح `onCommit`.
 *
 * Issue #17 — حارس إغلاق الصفحة:
 * نسجّل مستمع `pagehide` (لا `beforeunload` — غير موثوق على متصفّحات الهاتف
 * التي يستخدمها المالك 95% من الوقت). إن أُغلقت الصفحة قبل الالتزام، يُطلق
 * `commit()` fire-and-forget كمحاولة أخيرة. `onCommit` يستخدم Next.js server
 * actions عبر `mutateAsync`؛ وقت تشغيل Next.js client يُرسلها كـ fetch بمنطق
 * `keepalive: true` افتراضياً للـ server actions، فالطلب سيصل غالباً قبل قطع
 * الاتصال، لكن دون ضمان. هذا مقايضة مقبولة وفق Issue #17 — إصلاح «أمانة بأفضل
 * جهد» لا ضمان معاملة. عَلَم `committed` يمنع الإطلاق المزدوج إن تسابقت `pagehide`
 * مع المؤقّت أو `onDismiss`.
 */
export function scheduleDeleteWithUndo(
  opts: ScheduleDeleteWithUndoOptions,
): void {
  const durationMs = opts.durationMs ?? 5000;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let committed = false;

  // Issue #17 — مستمع pagehide: التزام fire-and-forget كمحاولة أخيرة عند إغلاق
  // الصفحة. يُزال في كل مسار خروج (commit / undo / dismiss) كي لا تتراكم.
  const onPageHide = () => {
    // Issue #6 — لا تُطلِق commit عند انقطاع الشبكة. الحذف سيفشل على الخادم
    // أصلاً، وإبقاء الصف على الواجهة (optimistic) سيُكذب على المستخدم. دعه
    // يبقى مرئياً وغير ملتزَم — سيُعالَج عند عودة الشبكة أو إعادة التحميل.
    if (!committed && typeof navigator !== "undefined" && navigator.onLine) {
      void commit();
    }
  };
  window.addEventListener("pagehide", onPageHide, { once: true });

  const cleanup = () => {
    window.removeEventListener("pagehide", onPageHide);
  };

  const commit = async () => {
    if (committed) return;
    committed = true;
    cleanup(); // أزل مستمع pagehide — التزامنا (نجح أم فشل).
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    try {
      await opts.onCommit();
      // Issue #17 — تأكيد الماضي فقط بعد نجاح الخادم.
      toast.success("تم الحذف");
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
        cleanup(); // أزل مستمع pagehide — اختار المستخدم التراجع.
        opts.onUndo?.();
      },
    },
    // إغلاق التنبيه يخفيه فقط؛ المؤقت هو الذي يثبت الحذف بعد المهلة.
    // هذا يمنع تثبيت حذف مالي بمجرد لمس X أو سحب الإشعار.
  });
}
