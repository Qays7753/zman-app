"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Search, ClipboardList, Package, ArrowDownRight, X, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useOrders } from "@/features/orders/hooks";
import { useCatalogComponents } from "@/features/catalog/hooks";
import { useInfiniteExpenses } from "@/features/finance/hooks";

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: ordersData } = useOrders({ limit: 100 });
  const { data: catalogData } = useCatalogComponents();
  const { data: expensesData } = useInfiniteExpenses({ limit: 100 });

  const allExpenses = useMemo(() => {
    return expensesData?.pages.flatMap((p) => p.items) || [];
  }, [expensesData]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return { orders: [], catalog: [], expenses: [] };

    const matchingOrders = (ordersData?.items || [])
      .filter((o: { customerName: string; productName: string }) => 
        o.customerName.toLowerCase().includes(q) || o.productName.toLowerCase().includes(q)
      )
      .slice(0, 4);

    const matchingCatalog = (catalogData || [])
      .filter((c: { name: string }) => c.name.toLowerCase().includes(q))
      .slice(0, 4);

    const matchingExpenses = allExpenses
      .filter((e: { description: string; category: string }) => 
        e.description.toLowerCase().includes(q) || e.category.toLowerCase().includes(q)
      )
      .slice(0, 4);

    return {
      orders: matchingOrders,
      catalog: matchingCatalog,
      expenses: matchingExpenses,
    };
  }, [query, ordersData, catalogData, allExpenses]);

  const totalCount = results.orders.length + results.catalog.length + results.expenses.length;

  return (
    <div ref={containerRef} className="relative w-full z-20">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="بحث شامل في النظام (اسم زبون، مادة، مصروف...)"
          className="w-full h-11 min-h-[44px] ps-10 pe-12 bg-paper border border-hairline rounded-xl text-xs sm:text-sm font-medium text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all shadow-sm"
        />
        <Search className="w-4 h-4 text-ink-3 absolute start-3.5 top-3.5 pointer-events-none" />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setIsOpen(false);
            }}
            className="absolute end-1 top-1 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-ink-3 hover:text-ink hover:bg-canvas transition-colors"
            aria-label="مسح البحث"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Instant Dropdown Results */}
      {isOpen && query.trim().length > 0 && (
        <div className="absolute top-12 inset-x-0 bg-paper border border-hairline rounded-xl shadow-xl max-h-[380px] overflow-y-auto no-scrollbar py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          {totalCount === 0 ? (
            <div className="p-4 text-center text-xs text-ink-3 font-medium">
              لا توجد نتائج تطابق "{query}"
            </div>
          ) : (
            <div className="space-y-3">
              {/* الطلبات */}
              {results.orders.length > 0 && (
                <div>
                  <div className="px-3 py-1 text-[11px] font-bold text-ink-3 bg-canvas border-y border-hairline/50 flex items-center gap-1.5">
                    <ClipboardList className="w-3.5 h-3.5 text-brand" />
                    <span>الطلبات والزبائن</span>
                  </div>
                  {results.orders.map((o: { id: string; customerName: string; productName: string }) => (
                    <Link
                      key={o.id}
                      href={`/orders?view=${encodeURIComponent(o.id)}`}
                      onClick={() => setIsOpen(false)}
                      className="flex items-center justify-between px-4 py-3 min-h-[44px] hover:bg-canvas text-xs transition-colors border-b border-hairline/30 last:border-0"
                    >
                      <div>
                        <p className="font-bold text-ink">{o.customerName}</p>
                        <p className="text-[11px] text-ink-3">{o.productName}</p>
                      </div>
                      <ChevronLeft className="w-4 h-4 text-ink-3 shrink-0" />
                    </Link>
                  ))}
                </div>
              )}

              {/* أصناف الكتالوج */}
              {results.catalog.length > 0 && (
                <div>
                  <div className="px-3 py-1 text-[11px] font-bold text-ink-3 bg-canvas border-y border-hairline/50 flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-alert" />
                    <span>المخزون والكتالوج</span>
                  </div>
                  {results.catalog.map((c: { id: string; name: string; unit: string }) => (
                    <Link
                      key={c.id}
                      href="/inventory"
                      onClick={() => setIsOpen(false)}
                      className="flex items-center justify-between px-4 py-3 min-h-[44px] hover:bg-canvas text-xs transition-colors border-b border-hairline/30 last:border-0"
                    >
                      <div>
                        <p className="font-bold text-ink">{c.name}</p>
                        <p className="text-[11px] text-ink-3">وحدة القياس: {c.unit}</p>
                      </div>
                      <ChevronLeft className="w-4 h-4 text-ink-3 shrink-0" />
                    </Link>
                  ))}
                </div>
              )}

              {/* المصاريف */}
              {results.expenses.length > 0 && (
                <div>
                  <div className="px-3 py-1 text-[11px] font-bold text-ink-3 bg-canvas border-y border-hairline/50 flex items-center gap-1.5">
                    <ArrowDownRight className="w-3.5 h-3.5 text-alert" />
                    <span>المصاريف والعمليات</span>
                  </div>
                  {results.expenses.map((e: { id: string; description: string; category: string }) => (
                    <Link
                      key={e.id}
                      href={`/finance?tab=payments&filter=expense&search=${encodeURIComponent(e.description)}`}
                      onClick={() => setIsOpen(false)}
                      className="flex items-center justify-between px-4 py-3 min-h-[44px] hover:bg-canvas text-xs transition-colors border-b border-hairline/30 last:border-0"
                    >
                      <div>
                        <p className="font-bold text-ink">{e.description}</p>
                        <p className="text-[11px] text-ink-3">{e.category}</p>
                      </div>
                      <ChevronLeft className="w-4 h-4 text-ink-3 shrink-0" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
