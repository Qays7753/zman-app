"use client";

import { Edit, Plus, Search, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ResponsiveModal } from "@/components/shared/ResponsiveModal";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/shared/Button";
import { SkeletonList } from "@/components/shared/SkeletonList";
import {
  usePurchaseItemCatalog,
  useCreatePurchaseItemCatalog,
  useUpdatePurchaseItemCatalog,
  useDeletePurchaseItemCatalog,
  useExpenseCategoryCatalog,
  useCreateExpenseCategoryCatalog,
  useUpdateExpenseCategoryCatalog,
  useDeleteExpenseCategoryCatalog,
} from "../hooks";

interface FinanceCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: "purchases" | "expenses";
}

export function FinanceCatalogModal({
  isOpen,
  onClose,
  type,
}: FinanceCatalogModalProps) {
  const isPurchases = type === "purchases";
  const title = isPurchases ? "أصناف الشراء" : "إدارة فئات المصاريف";
  const searchPlaceholder = isPurchases ? "بحث عن صنف..." : "بحث عن فئة...";
  const addLabel = isPurchases ? "إضافة صنف جديد" : "إضافة فئة جديدة";
  const emptyLabel = isPurchases ? "لا توجد أصناف شراء" : "لا توجد فئات مصاريف";

  // State
  const [search, setSearch] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Queries & Mutations
  const purchasesQuery = usePurchaseItemCatalog();
  const expensesQuery = useExpenseCategoryCatalog();
  
  const createPurchaseItem = useCreatePurchaseItemCatalog();
  const updatePurchaseItem = useUpdatePurchaseItemCatalog();
  const deletePurchaseItem = useDeletePurchaseItemCatalog();

  const createExpenseCategory = useCreateExpenseCategoryCatalog();
  const updateExpenseCategory = useUpdateExpenseCategoryCatalog();
  const deleteExpenseCategory = useDeleteExpenseCategoryCatalog();

  const query = isPurchases ? purchasesQuery : expensesQuery;
  const items = query.data || [];

  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim()) return;

    try {
      if (editingId) {
        // Edit Mode
        const res = isPurchases
          ? await updatePurchaseItem.mutateAsync({ id: editingId, name: nameInput })
          : await updateExpenseCategory.mutateAsync({ id: editingId, name: nameInput });

        if (res.status === "ok") {
          toast.success("تم التعديل بنجاح");
          setEditingId(null);
          setNameInput("");
        } else {
          toast.error(res.message);
        }
      } else {
        // Create Mode
        const res = isPurchases
          ? await createPurchaseItem.mutateAsync(nameInput)
          : await createExpenseCategory.mutateAsync(nameInput);

        if (res.status === "ok") {
          toast.success("تمت الإضافة بنجاح");
          setNameInput("");
        } else {
          toast.error(res.message);
        }
      }
    } catch {
      toast.error("حدث خطأ أثناء العملية");
    }
  };

  const handleEditClick = (item: { id: string; name: string }) => {
    setEditingId(item.id);
    setNameInput(item.name);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setNameInput("");
  };

  const handleDeleteClick = (id: string) => {
    setDeleteId(id);
  };

  const handleConfirmDelete = async () => {
    if (!deleteId) return;
    const id = deleteId;
    setDeleteId(null);
    try {
      const res = isPurchases
        ? await deletePurchaseItem.mutateAsync(id)
        : await deleteExpenseCategory.mutateAsync(id);

      if (res.status === "ok") {
        toast.success("تم الحذف بنجاح");
        if (editingId === id) {
          handleCancelEdit();
        }
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("حدث خطأ أثناء الحذف");
    }
  };

  return (
    <ResponsiveModal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-4">
        {/* نموذج الإدخال (إضافة / تعديل) */}
        <form onSubmit={handleSubmit} className="bg-canvas/50 p-3 rounded-lg border border-hairline flex flex-col gap-2">
          <label htmlFor="catalog-name-input" className="text-xs font-bold text-ink-2">
            {editingId ? "تعديل الاسم الحالي" : addLabel}
          </label>
          <div className="flex gap-2">
            <input
              id="catalog-name-input"
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="مثال: علب كرتون، أجور نقل..."
              className="flex-1 h-10 px-3 rounded border border-hairline bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-ink"
              required
            />
            <Button
              type="submit"
              variant="ink"
              disabled={createPurchaseItem.isPending || updatePurchaseItem.isPending || createExpenseCategory.isPending || updateExpenseCategory.isPending}
              className="h-12 min-h-12 shrink-0 px-4"
            >
              {editingId ? "حفظ" : "إضافة"}
            </Button>
            {editingId && (
              <Button
                variant="icon"
                onClick={handleCancelEdit}
                className="h-12 w-12 min-h-12 min-w-12 shrink-0"
                title="إلغاء التعديل"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </form>

        {/* حقل البحث */}
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/40 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full h-12 ps-9 pe-4 rounded border border-hairline bg-paper text-base focus:outline-none focus:ring-2 focus:ring-ink"
          />
        </div>

        {/* القائمة */}
        <div className="max-h-[300px] overflow-y-auto divide-y divide-hairline border border-hairline rounded-lg">
          {query.isLoading ? (
            <div className="p-3">
              <SkeletonList count={3} />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-8 text-center text-sm text-ink-3">
              {search ? "لا توجد نتائج للبحث" : emptyLabel}
            </div>
          ) : (
            filteredItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 hover:bg-canvas/30 transition-colors"
              >
                <span className="font-semibold text-ink text-sm truncate pe-2">
                  {item.name}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="icon"
                    onClick={() => handleEditClick(item)}
                    title="تعديل"
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="icon"
                    onClick={() => handleDeleteClick(item.id)}
                    className="hover:bg-alert-soft text-alert"
                    title="حذف"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      <ConfirmDialog
        isOpen={deleteId !== null}
        title="تأكيد الحذف"
        message="هل أنت متأكد من حذف هذا العنصر؟"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteId(null)}
      />
    </ResponsiveModal>
  );
}
