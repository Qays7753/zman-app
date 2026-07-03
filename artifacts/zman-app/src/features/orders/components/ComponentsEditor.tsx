"use client";

import { Boxes, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { ResponsiveModal } from "@/components/shared/ResponsiveModal";
import { useCallback, useEffect, useRef, useState } from "react";
import { Controller, useFieldArray } from "react-hook-form";
import { toast } from "sonner";
import { MoneyInput } from "@/components/shared/MoneyInput";
import { useCatalogComponents } from "@/features/catalog/hooks";
import type { CatalogComponent } from "@/features/catalog/db";

interface ComponentsEditorProps {
  // biome-ignore lint/suspicious/noExplicitAny: react-hook-form control binding
  control: any;
  // biome-ignore lint/suspicious/noExplicitAny: react-hook-form register binding
  register: any;
  // biome-ignore lint/suspicious/noExplicitAny: react-hook-form getValues binding
  getValues: any;
  // biome-ignore lint/suspicious/noExplicitAny: react-hook-form errors binding
  errors: any;
}

export function ComponentsEditor({
  control,
  register,
  getValues,
  errors,
}: ComponentsEditorProps) {
  const { fields, append, remove, insert } = useFieldArray({
    control,
    name: "components",
  });

  // ===== منتقي الكتالوج =====
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: catalogItems = [], isLoading: isCatalogLoading } = useCatalogComponents(debouncedSearch);

  useEffect(() => {
    if (isPickerOpen) {
      setTimeout(() => searchRef.current?.focus(), 100);
    } else {
      setCatalogSearch("");
      setDebouncedSearch("");
    }
  }, [isPickerOpen]);

  const handleSearchChange = (q: string) => {
    setCatalogSearch(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(q);
    }, 300);
  };

  const handleSelectCatalogItem = (item: CatalogComponent) => {
    append({ name: item.name, costCents: item.defaultCostCents, quantity: 1 });
    toast.success(`تمت إضافة "${item.name}" من المكوّنات`);
  };

  // ===== حذف مع تراجع =====
  const handleRemove = (index: number) => {
    const valueToRestore = getValues(`components.${index}`);
    remove(index);
    toast.error("تم حذف المكوّن", {
      action: {
        label: "تراجع",
        onClick: () => insert(index, valueToRestore),
      },
      duration: 5000,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-base font-semibold text-ink-2">
          مكوّنات الطلب وتكلفة المواد
        </h4>
        <span className="text-xs text-ink-3 hidden sm:block">
          تكلفة كل قطعة فرعية
        </span>
      </div>

      {fields.length === 0 ? (
        <div className="border border-dashed border-hairline-2 rounded-lg p-6 text-center bg-paper">
          <p className="text-sm text-ink-3">لا توجد مكوّنات مضافة بعد.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {fields.map((field, index) => {
            const nameError = errors?.components?.[index]?.name?.message;
            const costError = errors?.components?.[index]?.costCents?.message;
            const qtyError = errors?.components?.[index]?.quantity?.message;

            return (
              <div
                key={field.id}
                className="p-4 rounded-lg bg-paper border border-hairline shadow-sm flex flex-col gap-3"
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1">
                    <label
                      htmlFor={`comp-name-${field.id}`}
                      className="text-xs font-semibold text-ink-3 block mb-1"
                    >
                      اسم المكوّن
                    </label>
                    <input
                      id={`comp-name-${field.id}`}
                      type="text"
                      inputMode="text"
                      placeholder=""
                      {...register(`components.${index}.name`)}
                      className="w-full h-12 px-4 rounded-md border border-hairline-2 focus:outline-none focus:ring-2 focus:ring-ink bg-paper text-base py-2.5 transition-colors"
                    />
                    {nameError && (
                      <span className="text-xs text-alert mt-1 block">{nameError}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemove(index)}
                    className="mt-5 p-2 rounded-md hover:bg-alert-soft text-alert transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center border border-hairline"
                    aria-label="حذف المكون"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Controller
                    control={control}
                    name={`components.${index}.costCents`}
                    render={({ field: { value, onChange } }) => (
                      <MoneyInput
                        label="تكلفة المكوّن"
                        value={value}
                        onChange={onChange}
                        placeholder="0.000"
                        error={costError}
                      />
                    )}
                  />
                  <div>
                    <label
                      htmlFor={`comp-qty-${field.id}`}
                      className="text-xs font-semibold text-ink-3 block mb-1"
                    >
                      الكمية
                    </label>
                    <input
                      id={`comp-qty-${field.id}`}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="1"
                      {...register(`components.${index}.quantity`, { valueAsNumber: true })}
                      className="w-full h-12 px-4 rounded-md border border-hairline-2 focus:outline-none focus:ring-2 focus:ring-ink bg-paper text-base py-2.5 transition-colors"
                    />
                    {qtyError && (
                      <span className="text-xs text-alert mt-1 block">{qtyError}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* أزرار الإضافة */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => append({ name: "", costCents: 0, quantity: 1 })}
          className="min-h-[44px] py-3 rounded-md border border-dashed border-hairline-2 text-ink-2 hover:bg-canvas transition-colors flex items-center justify-center gap-2 font-semibold text-sm bg-paper"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة يدوية</span>
        </button>
        <button
          type="button"
          onClick={() => setIsPickerOpen(true)}
          className="min-h-[44px] py-3 rounded-md border border-info/30 text-info hover:bg-info-soft transition-colors flex items-center justify-center gap-2 font-semibold text-sm bg-paper"
        >
          <Boxes className="w-4 h-4" />
          <span>من المكوّنات</span>
        </button>
      </div>

      {/* ===== مودال منتقي الكتالوج ===== */}
      <ResponsiveModal
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        title="اختر من المكوّنات"
      >
        <div className="space-y-4">
          {/* حقل البحث */}
          <div className="relative">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink/40 pointer-events-none" />
            <input
              ref={searchRef}
              type="text"
              value={catalogSearch}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="ابحث في المكوّنات…"
              className="w-full h-11 ps-10 pe-4 rounded-md border border-hairline bg-canvas text-sm focus:outline-none focus:ring-2 focus:ring-ink"
            />
          </div>

          {/* قائمة العناصر */}
          <div className="max-h-[40vh] overflow-y-auto divide-y divide-hairline -mx-5 px-5">
            {isCatalogLoading ? (
              <div className="flex items-center justify-center py-10 text-ink/40 gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-info" />
                <span className="text-sm">جارٍ التحميل…</span>
              </div>
            ) : catalogItems.length === 0 ? (
              <div className="text-center py-10 px-4">
                <p className="text-sm text-ink/50">
                  {catalogSearch ? `لا نتائج لـ "${catalogSearch}"` : "المكوّنات فارغة — أضف مكوّنات من صفحة المكوّنات"}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-hairline">
                {catalogItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectCatalogItem(item)}
                    className="w-full flex items-center gap-4 py-3.5 hover:bg-info-soft transition-colors text-start group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-ink group-hover:text-info truncate">
                        {item.name}
                      </p>
                      <p className="text-xs text-ink/45 mt-0.5">
                        {item.unit}
                        {item.notes ? ` — ${item.notes}` : ""}
                      </p>
                    </div>
                    <div className="text-end flex-shrink-0">
                      <p className="text-sm font-bold text-info">
                        {(item.defaultCostCents / 1000).toLocaleString("en-JO", {
                          minimumFractionDigits: 3,
                          maximumFractionDigits: 3,
                        })}
                      </p>
                      <p className="text-[10px] text-ink/40">د.أ</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* تذييل */}
          <div className="pt-3 border-t border-hairline text-center">
            <p className="text-xs text-ink/40">
              اضغط على أي عنصر لإضافته إلى مكوّنات الطلب
            </p>
          </div>
        </div>
      </ResponsiveModal>
    </div>
  );
}
