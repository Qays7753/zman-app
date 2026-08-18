"use client";

// ─────────────────────────────────────────────────────────────────────────────
// SmartFinanceForm — نموذج إدخال ذكي موحَّد للمالك (جولة UX #3)
// ─────────────────────────────────────────────────────────────────────────────
// ثلاثة أوضاع تُحدَّد بسيلكتور مرئي في الأعلى:
//   1. «مصروف يومي»  → createExpense(isCapitalAsset=false, costNature='variable')
//   2. «شراء مواد»   → createPurchase مع ربط اختياري بصنف متتبَّع
//   3. «أصل للورشة»  → createExpense(isCapitalAsset=true) + DepreciationPromptModal
//
// لا يُلمَس أي منطق محاسبي أو قاعدة بيانات — إعادة استخدام كاملة لـ:
//   createExpense, createPurchase, addCapitalAsset, DepreciationPromptModal
// ─────────────────────────────────────────────────────────────────────────────

import { zodResolver } from "@hookform/resolvers/zod";
import { Banknote, ShoppingBag, Wrench, Users } from "lucide-react";
import { useEffect, useMemo, useId, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { MoneyInput } from "@/components/shared/MoneyInput";
import { Button } from "@/components/shared/Button";
import { Select } from "@/components/shared/Select";
import { TextArea } from "@/components/shared/TextArea";
import { assertOnline } from "@/lib/online";
import { formatFilsToJod } from "@/lib/money";

import {
  useCreateExpense,
  useCreatePurchase,
  useUpdateExpense,
  useUpdatePurchase,
  useExpenseCategoryCatalog,
  useCreateReceivable,
  useAccounts,
  usePurchaseItemCatalog,
} from "../hooks";
import { useAddCapitalAsset, useUpdateCapitalAsset } from "@/features/depreciation/hooks";
import { getCapitalAssetForSource } from "@/features/depreciation/queries";
import { DepreciationPromptModal } from "@/features/depreciation/components/DepreciationPromptModal";
import { useCatalogComponents } from "@/features/catalog/hooks";
import { useComponentStock } from "@/features/inventory/hooks";

// ── أوضاع النموذج ────────────────────────────────────────────────────────────

type Mode = "expense" | "purchase" | "asset" | "receivable";

const MODES: { id: Mode; label: string; icon: React.ReactNode }[] = [
  { id: "expense", label: "مصروف يومي", icon: <Banknote className="w-4 h-4" /> },
  { id: "purchase", label: "شراء مواد", icon: <ShoppingBag className="w-4 h-4" /> },
  { id: "asset", label: "أصل للورشة", icon: <Wrench className="w-4 h-4" /> },
  { id: "receivable", label: "دَين لشخص", icon: <Users className="w-4 h-4" /> },
];

// ── مخططات التحقق ────────────────────────────────────────────────────────────

const expenseSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "التاريخ غير صالح" }),
  category: z.string().min(1, "الفئة مطلوبة").max(200),
  amountCents: z.coerce
    .number()
    .int()
    .positive("المبلغ يجب أن يكون أكبر من 0"),
  description: z.string().max(1000).default(""),
});

const purchaseSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "التاريخ غير صالح" }),
  catalogId: z.string().nullable().default(null),
  itemName: z.string().min(1, "اسم الصنف مطلوب").max(200),
  supplier: z
    .string()
    .max(200, { message: "اسم المورد لا يتعدى 200 حرف" })
    .default(""),
  quantity: z.coerce
    .number()
    .int()
    .positive("الكمية يجب أن تكون أكبر من 0"),
  totalCents: z.coerce
    .number()
    .int()
    .positive("الإجمالي يجب أن يكون أكبر من 0"),
  notes: z.string().max(1000).default(""),
});

const assetSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "التاريخ غير صالح" }),
  name: z.string().min(1, "اسم الأصل مطلوب").max(200),
  amountCents: z.coerce
    .number()
    .int()
    .positive("المبلغ يجب أن يكون أكبر من 0"),
  description: z.string().max(1000).default(""),
  wantDepreciation: z.boolean().default(false),
});

const receivableSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "التاريخ غير صالح" }),
  personName: z.string().min(1, "اسم الشخص مطلوب").max(200),
  amountCents: z.coerce
    .number()
    .int()
    .positive("المبلغ يجب أن يكون أكبر من 0"),
  accountId: z.string().min(1, "الصندوق / الحساب المالي مطلوب"),
  notes: z.string().max(1000).default(""),
});

type ExpenseValues = z.infer<typeof expenseSchema>;
type PurchaseValues = z.infer<typeof purchaseSchema>;
type AssetValues = z.infer<typeof assetSchema>;
type ReceivableValues = z.infer<typeof receivableSchema>;

// ── واجهة المكوّن ─────────────────────────────────────────────────────────────

/**
 * بيانات تهيئة التعديل (Issue #1 — Edit Trap).
 * حقل مُسطَّح يغطي الأنواع الثلاثة (مصروف / شراء / أصل) دون ربط مباشر بأنواع
 * Expense/Purchase Legacy. الحقول الاختيارية تُتجاهَل في الأوضاع غير المناسبة.
 */
export interface SmartFinanceFormInitialData {
  /** معرّف السجل المراد تعديله */
  id: string;
  /** ختم آخر تحديث (للتحقق من التزامن في الخادم) */
  updatedAt?: string | Date;
  /** نوع السجل — يُحدِّد الوضع الافتراضي للنموذج */
  type: "expense" | "purchase" | "asset";
  /** التاريخ بصيغة ISO yyyy-mm-dd */
  date: string;
  /**
   * المبلغ الأساسي:
   * - وضع «مصروف» أو «أصل» → amountCents للمصروف.
   * - وضع «شراء» → الإجمالي (totalCents) للشراء.
   */
  amountCents: number;
  /** الوصف/البيان الحر (مصروف.description أو أصل.description) */
  description?: string;
  // ── حقول خاصة بوضع المصروف/الأصل ──
  /** فئة المصروف، أو اسم الأصل (في وضع «أصل» يُخزَّن الاسم في حقل category في DB) */
  category?: string;
  /** علم رأسمالية المصروف (للحفاظ على تصنيفه الأصلي عند التعديل) */
  isCapitalAsset?: boolean;
  /** طبيعة التكلفة (للحفاظ على التصنيف الأصلي عند التعديل) */
  costNature?: "variable" | "fixed" | null;
  // ── حقول خاصة بوضع الشراء ──
  /** بيان الصنف المشترى (purchase.item) */
  itemName?: string;
  /** المورّد (purchase.supplier) — لمنع محوه بصمت عند التعديل */
  supplier?: string;
  /** الكمية (purchase.quantity) */
  quantity?: number;
  /** ملاحظات الشراء (purchase.notes) */
  notes?: string;
  /** معرّف صنف الكتالوج المرتبط بالشراء، إن وُجد */
  linkedCatalogComponentId?: string | null;
}

interface SmartFinanceFormProps {
  /** استدعاء بعد أي نجاح (يُخبر الأب بإعادة جلب القائمة) */
  onSuccess: () => void;
  /** إغلاق المودال */
  onClose: () => void;
  /**
   * بيانات تعديل سجل موجود. إن مُرِّر، يُفتح النموذج في وضع التعديل:
   * - يُختار الوضع تلقائياً من `type`.
   * - تُملأ الحقول من البيانات.
   * - عند الحفظ، يُستدعى updateExpense/updatePurchase بدلاً من create.*
   * إن لم يُمرَّر، يبقى السلوك الافتراضي (إنشاء جديد) كما هو.
   */
  initialData?: SmartFinanceFormInitialData;
  /** الوضع الافتراضي للنموذج عند الإنشاء الجديد (افتراضي: 'expense') */
  defaultMode?: Mode;
}

// ── المكوّن ────────────────────────────────────────────────────────────────────

export function SmartFinanceForm({
  onSuccess,
  onClose,
  initialData,
  defaultMode = "expense",
}: SmartFinanceFormProps) {
  const [mode, setMode] = useState<Mode>(initialData?.type ?? defaultMode);
  const id = useId();
  const isEditing = !!initialData?.id;

  // ── Mutations ──────────────────────────────────────────────────────────────
  const createExpense = useCreateExpense();
  const createPurchase = useCreatePurchase();
  const updateExpense = useUpdateExpense();
  const updatePurchase = useUpdatePurchase();
  const addCapitalAsset = useAddCapitalAsset();
  const updateCapitalAsset = useUpdateCapitalAsset();
  const createReceivable = useCreateReceivable();

  // ── مودال الإهلاك (وضع «أصل للورشة»)  ───────────────────────────────────
  const [pendingAsset, setPendingAsset] = useState<{
    sourceId: string;
    name: string;
    date: string;
    amountCents: number;
  } | null>(null);

  // ── بيانات الحسابات المالية (وضع «دَين لشخص») ──────────────────────────────
  const { data: accounts = [] } = useAccounts();
  const activeAccounts = useMemo(
    () => accounts.filter((a) => !a.isArchived),
    [accounts],
  );
  const defaultAccountId = useMemo(
    () => activeAccounts.find((a) => a.type === "cash")?.id || activeAccounts[0]?.id || "",
    [activeAccounts],
  );

  // ── بيانات الكتالوج (وضع «شراء مواد») ────────────────────────────────────
  const { data: allCatalogItems = [] } = useCatalogComponents();
  const trackedItems = useMemo(
    () => allCatalogItems.filter((c) => c.tracked),
    [allCatalogItems],
  );
  // في وضع التعديل: إن وُجد linkedCatalogComponentId نُهيّئ الـ picker إليه؛
  // وإلا وُجد itemName، نُهيّئه كـ«إدخال يدوي» لعرض الحقل النصي مُعبَّئاً.
  const [selectedCatalogId, setSelectedCatalogId] = useState<string | null>(
    initialData?.linkedCatalogComponentId ?? null,
  );
  const { data: currentStock } = useComponentStock(selectedCatalogId ?? undefined);
  const selectedItem = useMemo(
    () => trackedItems.find((i) => i.id === selectedCatalogId),
    [trackedItems, selectedCatalogId],
  );
  const [isCustomItem, setIsCustomItem] = useState(
    !initialData?.linkedCatalogComponentId && !!initialData?.itemName,
  );

  // ── فئات المصاريف (وضع «مصروف يومي») ────────────────────────────────────
  const { data: dbCategories = [] } = useExpenseCategoryCatalog();
  const { data: dbPurchaseItems = [] } = usePurchaseItemCatalog();
  const categoryOptions = useMemo(
    () => Array.from(new Set(dbCategories.map((c) => c.name))),
    [dbCategories],
  );
  // في وضع التعديل: إن لم تكن الفئة في كتالوج الفئات، نُهيّئه كـ«إدخال يدوي».
  const [isCustomCategory, setIsCustomCategory] = useState(false);

  // ── قفل الإرسال المزدوج (Issue #2) ─────────────────────────────────────────
  const inFlight = useRef(false);

  // بعد تحميل كتالوج الفئات، صحِّح isCustomCategory إن كانت الفئة موجودة فعلاً.
  useEffect(() => {
    if (initialData?.category && categoryOptions.length > 0) {
      setIsCustomCategory(!categoryOptions.includes(initialData.category));
    }
  }, [initialData?.category, categoryOptions]);

  const today = new Date().toLocaleDateString("en-CA");

  // ── القيم الافتراضية لكل وضع (تُشتق من initialData في وضع التعديل) ───────
  const expenseDefaults = useMemo<ExpenseValues>(
    () => ({
      date: initialData?.date ?? today,
      category: initialData?.category ?? "",
      amountCents: initialData?.amountCents ?? 0,
      description: initialData?.description ?? "",
    }),
    [initialData, today],
  );

  const purchaseDefaults = useMemo<PurchaseValues>(
    () => ({
      date: initialData?.date ?? today,
      catalogId: initialData?.linkedCatalogComponentId ?? null,
      itemName: initialData?.itemName ?? "",
      supplier: initialData?.supplier ?? "",
      quantity: initialData?.quantity ?? 1,
      totalCents: initialData?.amountCents ?? 0,
      notes: initialData?.notes ?? "",
    }),
    [initialData, today],
  );

  const assetDefaults = useMemo<AssetValues>(
    () => ({
      date: initialData?.date ?? today,
      name: initialData?.category ?? "",
      amountCents: initialData?.amountCents ?? 0,
      description: initialData?.description ?? "",
      wantDepreciation: false,
    }),
    [initialData, today],
  );

  const receivableDefaults = useMemo<ReceivableValues>(
    () => ({
      date: today,
      personName: "",
      amountCents: 0,
      accountId: defaultAccountId,
      notes: "",
    }),
    [today, defaultAccountId],
  );

  // ── نماذج RHF (واحد لكل وضع) ─────────────────────────────────────────────
  const expenseForm = useForm<ExpenseValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: expenseDefaults,
  });

  const purchaseForm = useForm<PurchaseValues>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: purchaseDefaults,
  });

  const assetForm = useForm<AssetValues>({
    resolver: zodResolver(assetSchema),
    defaultValues: assetDefaults,
  });

  const receivableForm = useForm<ReceivableValues>({
    resolver: zodResolver(receivableSchema),
    defaultValues: receivableDefaults,
  });

  useEffect(() => {
    if (defaultAccountId && !receivableForm.getValues("accountId")) {
      receivableForm.setValue("accountId", defaultAccountId);
    }
  }, [defaultAccountId, receivableForm]);

  // ── مسودات localStorage (Issue #7) ─────────────────────────────────────
  const DRAFT_KEYS: Record<Mode, string> = {
    expense: "zman_draft_expense",
    purchase: "zman_draft_purchase",
    asset: "zman_draft_asset",
    receivable: "zman_draft_receivable",
  };

  type AnyDraft = ExpenseValues | PurchaseValues | AssetValues | ReceivableValues;
  const [draftOffer, setDraftOffer] = useState<Record<Mode, AnyDraft | null>>({
    expense: null,
    purchase: null,
    asset: null,
    receivable: null,
  });

  // (1) persist on isDirty change — gated by active mode + create-only.
  useEffect(() => {
    if (isEditing || mode !== "expense") return;
    if (expenseForm.formState.isDirty) {
      try {
        localStorage.setItem(DRAFT_KEYS.expense, JSON.stringify(expenseForm.getValues()));
      } catch {
        /* quota / private mode — silent */
      }
    } else {
      try {
        localStorage.removeItem(DRAFT_KEYS.expense);
      } catch {
        /* ignore */
      }
    }
  }, [expenseForm.formState.isDirty, mode, isEditing]);

  useEffect(() => {
    if (isEditing || mode !== "purchase") return;
    if (purchaseForm.formState.isDirty) {
      try {
        localStorage.setItem(DRAFT_KEYS.purchase, JSON.stringify(purchaseForm.getValues()));
      } catch {
        /* quota / private mode — silent */
      }
    } else {
      try {
        localStorage.removeItem(DRAFT_KEYS.purchase);
      } catch {
        /* ignore */
      }
    }
  }, [purchaseForm.formState.isDirty, mode, isEditing]);

  useEffect(() => {
    if (isEditing || mode !== "asset") return;
    if (assetForm.formState.isDirty) {
      try {
        localStorage.setItem(DRAFT_KEYS.asset, JSON.stringify(assetForm.getValues()));
      } catch {
        /* quota / private mode — silent */
      }
    } else {
      try {
        localStorage.removeItem(DRAFT_KEYS.asset);
      } catch {
        /* ignore */
      }
    }
  }, [assetForm.formState.isDirty, mode, isEditing]);

  useEffect(() => {
    if (isEditing || mode !== "receivable") return;
    if (receivableForm.formState.isDirty) {
      try {
        localStorage.setItem(DRAFT_KEYS.receivable, JSON.stringify(receivableForm.getValues()));
      } catch {
        /* quota / private mode — silent */
      }
    } else {
      try {
        localStorage.removeItem(DRAFT_KEYS.receivable);
      } catch {
        /* ignore */
      }
    }
  }, [receivableForm.formState.isDirty, mode, isEditing]);

  // (2) on mount, اعرض استرجاع المسودة إن وُجدت (إنشاء فقط).
  useEffect(() => {
    if (isEditing) return;
    try {
      const exp = localStorage.getItem(DRAFT_KEYS.expense);
      const pur = localStorage.getItem(DRAFT_KEYS.purchase);
      const ast = localStorage.getItem(DRAFT_KEYS.asset);
      const rec = localStorage.getItem(DRAFT_KEYS.receivable);
      setDraftOffer({
        expense: exp ? (JSON.parse(exp) as ExpenseValues) : null,
        purchase: pur ? (JSON.parse(pur) as PurchaseValues) : null,
        asset: ast ? (JSON.parse(ast) as AssetValues) : null,
        receivable: rec ? (JSON.parse(rec) as ReceivableValues) : null,
      });
    } catch {
      /* ignore corrupted entries */
    }
  }, []);

  // (3) restore / discard handlers — تعمل على الوضع النشط فقط.
  const handleRestoreDraft = () => {
    const offer = draftOffer[mode];
    if (!offer) return;
    if (mode === "expense") {
      expenseForm.reset(offer as ExpenseValues);
    } else if (mode === "purchase") {
      purchaseForm.reset(offer as PurchaseValues);
    } else if (mode === "asset") {
      assetForm.reset(offer as AssetValues);
    } else {
      receivableForm.reset(offer as ReceivableValues);
    }
    setDraftOffer((prev) => ({ ...prev, [mode]: null }));
  };
  const handleDiscardDraft = () => {
    try {
      localStorage.removeItem(DRAFT_KEYS[mode]);
    } catch {
      /* ignore */
    }
    setDraftOffer((prev) => ({ ...prev, [mode]: null }));
  };

  // ── تبديل الوضع + إعادة ضبط الحالة ──────────────────────────────────────
  const handleModeChange = (m: Mode) => {
    setMode(m);
    setIsCustomItem(!initialData?.linkedCatalogComponentId && !!initialData?.itemName);
    setIsCustomCategory(!initialData?.category);
    setSelectedCatalogId(initialData?.linkedCatalogComponentId ?? null);
    expenseForm.reset(expenseDefaults);
    purchaseForm.reset(purchaseDefaults);
    assetForm.reset(assetDefaults);
    receivableForm.reset(receivableDefaults);
  };

  // ── handlers per mode ─────────────────────────────────────────────────────

  const updatedAtIso =
    initialData?.updatedAt instanceof Date
      ? initialData.updatedAt.toISOString()
      : typeof initialData?.updatedAt === "string"
        ? initialData.updatedAt
        : "";

  const handleExpenseSubmit = async (values: ExpenseValues) => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      // Issue #5 — تحقّق من الاتصال قبل أي طلب تعديل للخادم.
      try {
        assertOnline();
      } catch (e) {
        if (e instanceof Error && e.message === "offline") {
          toast.error("لا يوجد اتصال — لم يُحفظ. أعد المحاولة.");
          return;
        }
        throw e;
      }
      // ── وضع التعديل: نُحدِّث السجل القائم بدلاً من إنشاء جديد ──
      if (isEditing && initialData) {
        const res = await updateExpense.mutateAsync({
          id: initialData.id,
          updatedAt: updatedAtIso,
          values: {
            date: values.date,
            category: values.category,
            amountCents: values.amountCents,
            description: values.description || "",
            // نُحافِظ على التصنيف الأصلي (وضع «مصروف يومي» لا يُعرِّض هذه الحقول للمستخدم).
            isCapitalAsset: initialData.isCapitalAsset ?? false,
            costNature: initialData.costNature ?? "variable",
          },
        });
        if (res.status === "ok") {
          try { localStorage.removeItem(DRAFT_KEYS.expense); } catch { /* ignore */ }
          toast.success("تم تحديث المصروف");
          onSuccess();
          onClose();
        } else {
          toast.error(res.message);
        }
        return;
      }

      // ── وضع الإنشاء (الأصل) ──
      const res = await createExpense.mutateAsync({
        values: {
          date: values.date,
          category: values.category,
          amountCents: values.amountCents,
          description: values.description || "",
          isCapitalAsset: false,
          costNature: "variable",
        },
        requestId: crypto.randomUUID(),
      });
      if (res.status === "ok") {
        try { localStorage.removeItem(DRAFT_KEYS.expense); } catch { /* ignore */ }
        toast.success("تم تسجيل المصروف");
        onSuccess();
        onClose();
      } else {
        toast.error(res.message);
      }
    } finally {
      inFlight.current = false;
    }
  };

  const handlePurchaseSubmit = async (values: PurchaseValues) => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      // Issue #5 — تحقّق من الاتصال قبل أي طلب تعديل للخادم.
      try {
        assertOnline();
      } catch (e) {
        if (e instanceof Error && e.message === "offline") {
          toast.error("لا يوجد اتصال — لم يُحفظ. أعد المحاولة.");
          return;
        }
        throw e;
      }
      const qty = values.quantity;
      const unitCostMicroCents =
        qty > 0 ? Math.round((values.totalCents * 1000) / qty) : values.totalCents * 1000;

      // ── وضع التعديل ──
      if (isEditing && initialData) {
        const res = await updatePurchase.mutateAsync({
          id: initialData.id,
          updatedAt: updatedAtIso,
          values: {
            date: values.date,
            item: values.itemName,
            // الحقل مرئي في وضع «شراء مواد» ويُملأ من initialData.supplier عند
            // الفتح، فقيمة النموذج هي مصدر الحقيقة. لا fallback إلى القيمة
            // الأصلية — وإلا استحال على المالك مسح اسم مورّد أُدخل خطأً.
            supplier: values.supplier.trim(),
            quantity: qty,
            unitCostMicroCents,
            notes: values.notes || "",
            // نُحافِظ على التصنيف الأصلي (وضع «شراء مواد» لا يُعرِّضه للمستخدم).
            isCapitalAsset: initialData.isCapitalAsset ?? false,
            costNature: initialData.costNature ?? "variable",
            linkedCatalogComponentId: values.catalogId ?? null,
          },
        });
        if (res.status === "ok") {
          try { localStorage.removeItem(DRAFT_KEYS.purchase); } catch { /* ignore */ }
          toast.success("تم تحديث شراء المواد");
          onSuccess();
          onClose();
        } else {
          toast.error(res.message);
        }
        return;
      }

      // ── وضع الإنشاء (الأصل) ──
      const res = await createPurchase.mutateAsync({
        values: {
          date: values.date,
          item: values.itemName,
          supplier: values.supplier.trim(),
          quantity: qty,
          unitCostMicroCents,
          notes: values.notes || "",
          isCapitalAsset: false,
          costNature: "variable",
          linkedCatalogComponentId: values.catalogId ?? null,
        },
        requestId: crypto.randomUUID(),
      });
      if (res.status === "ok") {
        try { localStorage.removeItem(DRAFT_KEYS.purchase); } catch { /* ignore */ }
        toast.success("تم تسجيل شراء المواد");
        onSuccess();
        onClose();
      } else {
        toast.error(res.message);
      }
    } finally {
      inFlight.current = false;
    }
  };

  const handleAssetSubmit = async (values: AssetValues) => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      // Issue #5 — تحقّق من الاتصال قبل أي طلب تعديل للخادم.
      try {
        assertOnline();
      } catch (e) {
        if (e instanceof Error && e.message === "offline") {
          toast.error("لا يوجد اتصال — لم يُحفظ. أعد المحاولة.");
          return;
        }
        throw e;
      }
      // ── وضع التعديل: نُحدِّث المصروف الأساسي (isCapitalAsset=true) ──
      if (isEditing && initialData) {
        const res = await updateExpense.mutateAsync({
          id: initialData.id,
          updatedAt: updatedAtIso,
          values: {
            date: values.date,
            category: values.name,
            amountCents: values.amountCents,
            description: values.description || "",
            isCapitalAsset: true,
            costNature: undefined,
          },
        });
        if (res.status === "ok") {
          // Sync name + purchaseDate to the linked capital_asset (if any).
          // 🔒 Never pass purchaseAmountCents — UpdateCapitalAssetVariables type enforces this.
          try {
            const linkedAsset = await getCapitalAssetForSource("expense", initialData.id);
            if (linkedAsset) {
              await updateCapitalAsset.mutateAsync({
                id: linkedAsset.id,
                name: values.name,
                purchaseDate: values.date,
                usefulLifeMonths: linkedAsset.usefulLifeMonths, // unchanged
              });
            }
          } catch {
            // Non-fatal: the expense was already updated successfully. Capital-asset sync
            // is best-effort. A failure here is logged by the mutation's onError path.
          }
          try { localStorage.removeItem(DRAFT_KEYS.asset); } catch { /* ignore */ }
          toast.success("تم تحديث الأصل");
          // لا نُعيد فتح DepreciationPromptModal في وضع التعديل (الارتباط القائم
          // يُحافَظ عليه). فقط نُخبر الأب ونُغلق.
          onSuccess();
          onClose();
        } else {
          toast.error(res.message);
        }
        return;
      }

      // ── وضع الإنشاء (الأصل) ──
      const res = await createExpense.mutateAsync({
        values: {
          date: values.date,
          category: values.name,
          amountCents: values.amountCents,
          description: values.description || "",
          isCapitalAsset: true,
          costNature: undefined,
        },
        requestId: crypto.randomUUID(),
      });
      if (res.status === "ok") {
        try { localStorage.removeItem(DRAFT_KEYS.asset); } catch { /* ignore */ }
        toast.success("تم تسجيل الأصل");
        if (
          values.wantDepreciation &&
          res.data &&
          typeof res.data === "object" &&
          "id" in res.data
        ) {
          setPendingAsset({
            sourceId: (res.data as { id: string }).id,
            name: values.name,
            date: values.date,
            amountCents: values.amountCents,
          });
          // لا نُغلق المودال الآن — DepreciationPromptModal سيُشغَّل
        } else {
          onSuccess();
          onClose();
        }
      } else {
        toast.error(res.message);
      }
    } finally {
      inFlight.current = false;
    }
  };

  const handleReceivableSubmit = async (values: ReceivableValues) => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      try {
        assertOnline();
      } catch (e) {
        if (e instanceof Error && e.message === "offline") {
          toast.error("لا يوجد اتصال — لم يُحفظ. أعد المحاولة.");
          return;
        }
        throw e;
      }

      const res = await createReceivable.mutateAsync({
        data: {
          personName: values.personName,
          amountCents: values.amountCents,
          date: values.date,
          accountId: values.accountId,
          notes: values.notes || undefined,
        },
        requestId: crypto.randomUUID(),
      });
      if (res.status === "ok") {
        try { localStorage.removeItem(DRAFT_KEYS.receivable); } catch { /* ignore */ }
        toast.success("تم تسجيل الدَّين بنجاح");
        onSuccess();
        onClose();
      } else {
        toast.error(res.message);
      }
    } finally {
      inFlight.current = false;
    }
  };

  const handleConfirmSpread = async (months: number) => {
    if (!pendingAsset) return;
    const res = await addCapitalAsset.mutateAsync({
      sourceType: "expense",
      sourceId: pendingAsset.sourceId,
      name: pendingAsset.name,
      purchaseDate: pendingAsset.date,
      purchaseAmountCents: pendingAsset.amountCents,
      usefulLifeMonths: months,
    });
    if (res.status === "ok") {
      toast.success(
        `إهلاك ${formatFilsToJod(res.data.monthlyDepreciationCents)} شهرياً لمدة ${res.data.usefulLifeMonths} شهراً`,
      );
    } else {
      toast.error(res.message);
    }
    setPendingAsset(null);
    onSuccess();
    onClose();
  };

  const handleConfirmDeductOnce = () => {
    toast.info("تم تسجيل الأصل كإضافة رأسمالية — لا إهلاك شهري");
    setPendingAsset(null);
    onSuccess();
    onClose();
  };

  // ── render ─────────────────────────────────────────────────────────────────
  // في وضع التعديل، حالة الانتظار تعتمد على الـ mutation المُحدِّث لا المُنشِئ.
  const isExpensePending = isEditing ? updateExpense.isPending : createExpense.isPending;
  const isPurchasePending = isEditing
    ? updatePurchase.isPending
    : createPurchase.isPending;

  return (
    <>
      {/* مسودة غير محفوظة (Issue #7) — تُعرَض للوضع النشط فقط */}
      {draftOffer[mode] && (
        <div className="mb-4 p-3 rounded-lg border border-warn/30 bg-warn-soft text-warn-deep flex items-start gap-3 flex-wrap">
          <span className="text-sm flex-1">
            لديك مسودة غير محفوظة من إدخال سابق. هل تريد استرجاعها؟
          </span>
          <div className="flex gap-2 shrink-0">
            <Button
              type="button"
              variant="ink"
              className="min-h-[44px]"
              onClick={handleRestoreDraft}
            >
              استرجاع
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="min-h-[44px]"
              onClick={handleDiscardDraft}
            >
              تجاهل
            </Button>
          </div>
        </div>
      )}

      {/* السيلكتور — أربعة أوضاع */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1.5 bg-canvas rounded-xl mb-3"
        role="tablist"
        aria-label="نوع العملية"
      >
        {MODES.map(({ id: mId, label, icon }) => (
          <button
            key={mId}
            type="button"
            role="tab"
            aria-selected={mode === mId}
            onClick={() => handleModeChange(mId)}
            className={`flex items-center justify-center gap-2 py-2.5 px-2 rounded-lg text-xs font-bold transition-all min-h-[44px] ${
              mode === mId
                ? "bg-paper text-ink shadow-sm ring-1 ring-hairline"
                : "text-ink/60 hover:text-ink/90 hover:bg-paper/50"
            }`}
          >
            <span className={mode === mId ? "text-info" : ""}>{icon}</span>
            <span className="leading-tight text-center">{label}</span>
          </button>
        ))}
      </div>

      {/* سطر توضيحي لأثر الوضع المختار على الربح */}
      <div className="mb-5 px-3.5 py-2.5 rounded-lg bg-canvas/70 border border-hairline text-xs text-ink/75 flex items-center gap-2.5">
        <span className="shrink-0 w-2 h-2 rounded-full bg-info" aria-hidden="true" />
        <p className="leading-relaxed font-medium">
          {mode === "expense" && "يُخصم من ربح هذا الشهر كاملاً."}
          {mode === "purchase" && "مادة تدخل منتجاتك. إن ربطتها بصنف متتبَّع، تُخصم تكلفتها عند البيع لا عند الشراء."}
          {mode === "asset" && "لا يُخصم من ربح هذا الشهر. يُوزَّع إهلاكاً على عمره النافع."}
          {mode === "receivable" && "لا يُخصم من ربحك — مالك ما زال لك، لكن عند غيرك."}
        </p>
      </div>

      {/* ── وضع 1: مصروف يومي ─────────────────────────────────────────────── */}
      {mode === "expense" && (
        <form
          onSubmit={expenseForm.handleSubmit(handleExpenseSubmit)}
          className="space-y-4"
        >
          <div className="space-y-2 flex flex-col">
            <label className="text-sm font-bold text-ink/75">التاريخ</label>
            <input
              type="date"
              {...expenseForm.register("date")}
              className={`flex h-12 w-full rounded-md border bg-paper px-3 py-2 text-base text-ink focus:outline-none focus:ring-2 focus:ring-ink ${expenseForm.formState.errors.date ? "border-alert" : "border-hairline"}`}
            />
            {expenseForm.formState.errors.date && (
              <p className="text-xs text-alert">{expenseForm.formState.errors.date.message}</p>
            )}
          </div>

          {/* الفئة */}
          <div className="space-y-2 flex flex-col">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-ink/75">الفئة</label>
              {categoryOptions.length > 0 && isCustomCategory && (
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomCategory(false);
                    expenseForm.setValue("category", "");
                  }}
                  className="text-xs text-info font-bold hover:underline"
                >
                  اختر من القائمة
                </button>
              )}
            </div>
            {!isCustomCategory && categoryOptions.length > 0 ? (
              <Select
                value={expenseForm.watch("category")}
                onChange={(e) => {
                  if (e.target.value === "__custom__") {
                    setIsCustomCategory(true);
                    expenseForm.setValue("category", "");
                  } else {
                    expenseForm.setValue("category", e.target.value);
                  }
                }}
                error={expenseForm.formState.errors.category?.message}
              >
                <option value="">-- اختر الفئة --</option>
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option value="__custom__">أخرى (إدخال يدوي)...</option>
              </Select>
            ) : (
              <input
                type="text"
                placeholder="أدخل اسم الفئة..."
                {...expenseForm.register("category")}
                className={`flex h-12 w-full rounded-md border bg-paper px-4 py-2 text-base text-ink focus:outline-none focus:ring-2 focus:ring-ink ${
                  expenseForm.formState.errors.category ? "border-alert" : "border-hairline"
                }`}
              />
            )}
            {expenseForm.formState.errors.category && (
              <p className="text-xs text-alert">
                {expenseForm.formState.errors.category.message}
              </p>
            )}
          </div>

          {/* المبلغ */}
          <div className="space-y-2 flex flex-col">
            <label className="text-sm font-bold text-ink/75">المبلغ</label>
            <Controller
              name="amountCents"
              control={expenseForm.control}
              render={({ field }) => (
                <MoneyInput
                  value={Number(field.value) || 0}
                  onChange={field.onChange}
                  error={expenseForm.formState.errors.amountCents?.message}
                />
              )}
            />
          </div>

          {/* ملاحظة */}
          <TextArea
            label="ملاحظة (اختياري)"
            id={`${id}-expense-notes`}
            placeholder=""
            {...expenseForm.register("description")}
          />

          <Button
            type="submit"
            variant="ink"
            isLoading={isExpensePending}
            className="w-full"
          >
            {isEditing ? "حفظ التعديلات" : "تسجيل المصروف"}
          </Button>
        </form>
      )}

      {/* ── وضع 2: شراء مواد ──────────────────────────────────────────────── */}
      {mode === "purchase" && (
        <form
          onSubmit={purchaseForm.handleSubmit(handlePurchaseSubmit)}
          className="space-y-4"
        >
          <div className="space-y-2 flex flex-col">
            <label className="text-sm font-bold text-ink/75">تاريخ الشراء</label>
            <input
              type="date"
              {...purchaseForm.register("date")}
              className={`flex h-12 w-full rounded-md border bg-paper px-3 py-2 text-base text-ink focus:outline-none focus:ring-2 focus:ring-ink ${purchaseForm.formState.errors.date ? "border-alert" : "border-hairline"}`}
            />
            {purchaseForm.formState.errors.date && (
              <p className="text-xs text-alert">{purchaseForm.formState.errors.date.message}</p>
            )}
          </div>

          {/* الصنف — من الكتالوج المتتبَّع */}
          <div className="space-y-2 flex flex-col">
            <label className="text-sm font-bold text-ink/75">الصنف</label>

            {!isCustomItem && (trackedItems.length > 0 || dbPurchaseItems.length > 0) ? (
              <Select
                value={selectedCatalogId ? `inv-${selectedCatalogId}` : (purchaseForm.watch("itemName") || "")}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "__custom__") {
                    setIsCustomItem(true);
                    setSelectedCatalogId(null);
                    purchaseForm.setValue("catalogId", null);
                    purchaseForm.setValue("itemName", "");
                  } else if (val.startsWith("inv-")) {
                    const id = val.replace("inv-", "");
                    const item = trackedItems.find((i) => i.id === id);
                    setSelectedCatalogId(id || null);
                    purchaseForm.setValue("catalogId", id || null);
                    purchaseForm.setValue("itemName", item?.name ?? "");
                  } else {
                    // Finance item (not linked to inventory)
                    setSelectedCatalogId(null);
                    purchaseForm.setValue("catalogId", null);
                    purchaseForm.setValue("itemName", val);
                  }
                }}
                error={purchaseForm.formState.errors.itemName?.message}
              >
                <option value="">-- اختر صنفاً --</option>
                
                {trackedItems.length > 0 && (
                  <optgroup label="أصناف المخزون المتتبعة">
                    {trackedItems.map((c) => (
                      <option key={`inv-${c.id}`} value={`inv-${c.id}`}>
                        {c.name} ({c.unit})
                      </option>
                    ))}
                  </optgroup>
                )}

                {dbPurchaseItems.length > 0 && (
                  <optgroup label="أصناف المشتريات العامة">
                    {dbPurchaseItems.map((c) => (
                      <option key={`fin-${c.id}`} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                
                <option value="__custom__">أخرى (إدخال يدوي)...</option>
              </Select>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="اسم الصنف..."
                  {...purchaseForm.register("itemName")}
                  className={`flex h-12 w-full rounded-md border bg-paper px-4 py-2 text-base text-ink focus:outline-none focus:ring-2 focus:ring-ink ${
                    purchaseForm.formState.errors.itemName ? "border-alert" : "border-hairline"
                  }`}
                />
                {(trackedItems.length > 0 || dbPurchaseItems.length > 0) && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomItem(false);
                      purchaseForm.setValue("itemName", "");
                      purchaseForm.setValue("catalogId", null);
                    }}
                    className="text-xs text-info hover:underline"
                  >
                    ← اختر من الكتالوج
                  </button>
                )}
              </div>
            )}
            {purchaseForm.formState.errors.itemName && (
              <p className="text-xs text-alert">
                {purchaseForm.formState.errors.itemName.message}
              </p>
            )}
            {trackedItems.length === 0 && dbPurchaseItems.length === 0 && (
              <p className="text-[11px] text-ink/50 mt-1">
                لا توجد أصناف متتبَّعة — فعِّل تتبّع صنف من صفحة الكتالوج أولاً.
              </p>
            )}

            {/* معاينة تأثير الربط على المخزون والأثر المحاسبي */}
            {selectedItem ? (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 space-y-1.5 text-xs text-emerald-900">
                <div className="flex items-center justify-between gap-2 font-bold">
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden="true">📦</span>
                    سيُضاف {purchaseForm.watch("quantity") || 0} {selectedItem.unit} إلى المخزون
                  </span>
                  <span className="text-emerald-700 text-[11px] font-normal">
                    الرصيد الحالي: <strong>{currentStock ?? 0}</strong>
                  </span>
                </div>
                <p className="text-[11px] text-emerald-800 leading-relaxed">
                  ✓ <strong>لن تُخصم التكلفة من ربح هذا الشهر</strong> — تُضاف لقيمة أصول المخزون وتُخصم كتكلفة بضاعة مباعة (COGS) عند بيع وتسليم المنتجات.
                </p>
              </div>
            ) : isCustomItem || selectedCatalogId === null ? (
              <div className="p-2.5 rounded-lg bg-canvas border border-hairline text-xs text-ink/70">
                <p className="text-[11px] leading-relaxed">
                  ℹ️ شراء مباشر غير متتبَّع — سيُخصم المبلغ كاملاً من أرباح هذا الشهر.
                </p>
              </div>
            ) : null}
          </div>

          {/* المورّد (اختياري) */}
          <div className="space-y-2 flex flex-col">
            <label className="text-sm font-bold text-ink/75">المورد (اختياري)</label>
            <input
              type="text"
              placeholder="اسم المورد أو المحل..."
              {...purchaseForm.register("supplier")}
              className={`flex h-12 w-full rounded-md border bg-paper px-4 py-2 text-base text-ink focus:outline-none focus:ring-2 focus:ring-ink ${
                purchaseForm.formState.errors.supplier ? "border-alert" : "border-hairline"
              }`}
            />
            {purchaseForm.formState.errors.supplier && (
              <p className="text-xs text-alert">
                {purchaseForm.formState.errors.supplier.message}
              </p>
            )}
          </div>

          {/* الكمية + الإجمالي */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2 flex flex-col">
              <label className="text-sm font-bold text-ink/75">الكمية</label>
              <input
                type="number"
                inputMode="numeric"
                step="1"
                min="1"
                {...purchaseForm.register("quantity", { valueAsNumber: true })}
                className={`flex h-12 w-full rounded-md border bg-paper px-4 py-2 text-base text-ink focus:outline-none focus:ring-2 focus:ring-ink ${
                  purchaseForm.formState.errors.quantity ? "border-alert" : "border-hairline"
                }`}
              />
              {purchaseForm.formState.errors.quantity && (
                <p className="text-xs text-alert">
                  {purchaseForm.formState.errors.quantity.message}
                </p>
              )}
            </div>

            <div className="space-y-2 flex flex-col">
              <label className="text-sm font-bold text-ink/75">إجمالي التكلفة</label>
              <Controller
                name="totalCents"
                control={purchaseForm.control}
                render={({ field }) => (
                  <MoneyInput
                    value={Number(field.value) || 0}
                    onChange={field.onChange}
                    error={purchaseForm.formState.errors.totalCents?.message}
                  />
                )}
              />
            </div>
          </div>

          {/* سعر الوحدة — للعرض فقط */}
          {(() => {
            const qty = purchaseForm.watch("quantity") || 0;
            const total = purchaseForm.watch("totalCents") || 0;
            return qty > 0 && total > 0 ? (
              <div className="p-3 bg-canvas/40 rounded-lg border border-hairline flex items-center justify-between text-sm">
                <span className="text-ink/60">سعر الوحدة:</span>
                <strong className="text-info" dir="ltr">
                  {formatFilsToJod(Math.round(total / qty))}
                </strong>
              </div>
            ) : null;
          })()}

          {/* ملاحظات */}
          <TextArea
            label="ملاحظات (اختياري)"
            id={`${id}-purchase-notes`}
            placeholder=""
            {...purchaseForm.register("notes")}
          />

          <Button
            type="submit"
            variant="ink"
            isLoading={isPurchasePending}
            className="w-full"
          >
            {isEditing ? "حفظ التعديلات" : "تسجيل الشراء"}
          </Button>
        </form>
      )}

      {/* ── وضع 3: أصل للورشة ─────────────────────────────────────────────── */}
      {mode === "asset" && (
        <form
          onSubmit={assetForm.handleSubmit(handleAssetSubmit)}
          className="space-y-4"
        >
          <div className="space-y-2 flex flex-col">
            <label className="text-sm font-bold text-ink/75">تاريخ الشراء</label>
            <input
              type="date"
              {...assetForm.register("date")}
              className={`flex h-12 w-full rounded-md border bg-paper px-3 py-2 text-base text-ink focus:outline-none focus:ring-2 focus:ring-ink ${assetForm.formState.errors.date ? "border-alert" : "border-hairline"}`}
            />
            {assetForm.formState.errors.date && (
              <p className="text-xs text-alert">{assetForm.formState.errors.date.message}</p>
            )}
          </div>

          {/* اسم الأصل */}
          <div className="space-y-2 flex flex-col">
            <label className="text-sm font-bold text-ink/75">اسم الأصل</label>
            <input
              type="text"
              placeholder="مثال: ثلاجة العرض، آلة الري..."
              {...assetForm.register("name")}
              className={`flex h-12 w-full rounded-md border bg-paper px-4 py-2 text-base text-ink focus:outline-none focus:ring-2 focus:ring-ink ${
                assetForm.formState.errors.name ? "border-alert" : "border-hairline"
              }`}
            />
            {assetForm.formState.errors.name && (
              <p className="text-xs text-alert">
                {assetForm.formState.errors.name.message}
              </p>
            )}
          </div>

          {/* قيمة الشراء */}
          <div className="space-y-2 flex flex-col">
            <label className="text-sm font-bold text-ink/75">قيمة الشراء</label>
            <Controller
              name="amountCents"
              control={assetForm.control}
              render={({ field }) => (
                <MoneyInput
                  value={Number(field.value) || 0}
                  onChange={field.onChange}
                  error={assetForm.formState.errors.amountCents?.message}
                />
              )}
            />
          </div>

          {/* ملاحظات */}
          <TextArea
            label="ملاحظات (اختياري)"
            id={`${id}-asset-desc`}
            placeholder="تفاصيل إضافية عن الأصل..."
            {...assetForm.register("description")}
          />

          {/* إهلاك شهري */}
          <div className="p-3.5 bg-canvas/30 rounded-lg border border-hairline">
            <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
              <input
                type="checkbox"
                {...assetForm.register("wantDepreciation")}
                className="h-5 w-5 rounded border-hairline text-info focus:ring-info shrink-0"
              />
              <span className="text-sm font-bold text-ink/75">
                توزيع الإهلاك شهرياً
              </span>
            </label>
            {assetForm.watch("wantDepreciation") && (
              <p className="text-[11px] text-ink/50 mt-1.5 leading-relaxed pe-2">
                مثلاً: ثلاجة بـ 600 دينار / 24 شهر = 25 دينار تُخصم من ربحك شهرياً
              </p>
            )}
          </div>

          <Button
            type="submit"
            variant="ink"
            isLoading={isExpensePending}
            className="w-full min-h-[44px]"
          >
            {isEditing ? "حفظ التعديلات" : "تسجيل الأصل"}
          </Button>
        </form>
      )}

      {/* ── وضع 4: دَين لشخص ─────────────────────────────────────────────── */}
      {mode === "receivable" && (
        <form
          onSubmit={receivableForm.handleSubmit(handleReceivableSubmit)}
          className="space-y-4"
        >
          {/* التاريخ */}
          <div className="space-y-2 flex flex-col">
            <label className="text-sm font-bold text-ink/75">تاريخ الدَّين</label>
            <input
              type="date"
              {...receivableForm.register("date")}
              className={`flex h-12 w-full rounded-md border bg-paper px-3 py-2 text-base text-ink focus:outline-none focus:ring-2 focus:ring-ink ${
                receivableForm.formState.errors.date ? "border-alert" : "border-hairline"
              }`}
            />
            {receivableForm.formState.errors.date && (
              <p className="text-xs text-alert">{receivableForm.formState.errors.date.message}</p>
            )}
          </div>

          {/* اسم الشخص */}
          <div className="space-y-2 flex flex-col">
            <label className="text-sm font-bold text-ink/75">اسم الشخص المستدين</label>
            <input
              type="text"
              placeholder="مثال: أحمد، محمد، ورشة الجيران..."
              {...receivableForm.register("personName")}
              className={`flex h-12 w-full rounded-md border bg-paper px-4 py-2 text-base text-ink focus:outline-none focus:ring-2 focus:ring-ink ${
                receivableForm.formState.errors.personName ? "border-alert" : "border-hairline"
              }`}
            />
            {receivableForm.formState.errors.personName && (
              <p className="text-xs text-alert">
                {receivableForm.formState.errors.personName.message}
              </p>
            )}
          </div>

          {/* المبلغ */}
          <div className="space-y-2 flex flex-col">
            <label className="text-sm font-bold text-ink/75">مبلغ الدَّين</label>
            <Controller
              name="amountCents"
              control={receivableForm.control}
              render={({ field }) => (
                <MoneyInput
                  value={Number(field.value) || 0}
                  onChange={field.onChange}
                  error={receivableForm.formState.errors.amountCents?.message}
                />
              )}
            />
          </div>

          {/* الصندوق / الحساب المالي */}
          <div className="space-y-2 flex flex-col">
            <label className="text-sm font-bold text-ink/75">دُفع من صندوق / حساب</label>
            <Controller
              name="accountId"
              control={receivableForm.control}
              render={({ field }) => (
                <Select
                  value={field.value}
                  onChange={field.onChange}
                  error={receivableForm.formState.errors.accountId?.message}
                >
                  <option value="">-- اختر الحساب المالي --</option>
                  {activeAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.type === "cash" ? "صندوق كاش" : "بنك"})
                    </option>
                  ))}
                </Select>
              )}
            />
          </div>

          {/* ملاحظات */}
          <TextArea
            label="ملاحظات (اختياري)"
            id={`${id}-rec-notes`}
            placeholder="سبب الدَّين أو أي تفاصيل إضافية..."
            {...receivableForm.register("notes")}
          />

          <Button
            type="submit"
            variant="ink"
            isLoading={createReceivable.isPending}
            className="w-full min-h-[44px]"
          >
            تسجيل الدَّين
          </Button>
        </form>
      )}

      {/* مودال الإهلاك — يُفتح بعد حفظ «أصل للورشة» مع تفعيل الإهلاك */}
      <DepreciationPromptModal
        isOpen={pendingAsset !== null}
        onClose={handleConfirmDeductOnce}
        assetName={pendingAsset?.name ?? ""}
        purchaseAmountCents={pendingAsset?.amountCents ?? 0}
        onConfirmDeductOnce={handleConfirmDeductOnce}
        onConfirmSpread={handleConfirmSpread}
        isSubmitting={addCapitalAsset.isPending}
      />
    </>
  );
}
