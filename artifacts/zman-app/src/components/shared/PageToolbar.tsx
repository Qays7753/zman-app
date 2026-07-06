"use client";

import { Search, X, Filter, Settings2, Check } from "lucide-react";
import React, { useRef, useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { HeaderIconButton } from "./HeaderIconButton";
import { useClickOutside } from "./useClickOutside";

export interface ToolbarFilterOption {
  value: string;
  label: string;
}

export interface ToolbarFilterGroup {
  key: string;
  label: string;
  value: string;
  options: ToolbarFilterOption[];
  onChange: (value: string) => void;
}

export interface ToolbarMenuItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
}

interface PageToolbarProps {
  /** البحث — مرّره لتظهر أيقونة البحث المتوسّعة */
  search?: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
  };
  /** مجموعات الفلاتر — تظهر في قائمة منسدلة واحدة */
  filters?: ToolbarFilterGroup[];
  /** إجراءات ثانوية — تظهر في قائمة "إعدادات" منسدلة */
  menuItems?: ToolbarMenuItem[];
  /** فلتر مخصّص يحلّ محلّ زر الفلتر الافتراضي (نفس الموضع) — مثل StatusFilterSheet */
  filterSlot?: React.ReactNode;
  /** يحجز مساحة زر الفلتر حتى لو غاب (يمنع قفز التخطيط بين تبويبات مختلفة) */
  reserveFilterSpace?: boolean;
  /** يحجز مساحة زر الإعدادات حتى لو غاب */
  reserveMenuSpace?: boolean;
  /** عناصر تظهر أول الشريط (مثل مبدّل قائمة/تقويم) */
  leading?: React.ReactNode;
  /** الإجراء الأساسي (زر الإضافة) — يظهر آخر الشريط */
  trailing?: React.ReactNode;
}

/**
 * شريط أدوات موحّد لهيدر الصفحات. كل صفحة تمرّر ما يلزمها فقط:
 * بحث متوسّع + قائمة فلاتر منسدلة + قائمة إعدادات + إجراء أساسي.
 * يلتزم RTL، أهداف لمس 44px، وإغلاق عند الضغط خارجاً / Escape.
 */
export function PageToolbar({
  search,
  filters,
  menuItems,
  filterSlot,
  reserveFilterSpace = false,
  reserveMenuSpace = false,
  leading,
  trailing,
}: PageToolbarProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // تركيز تلقائي عند فتح البحث
  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  // البحث يبقى مفتوحاً ما دام فيه نص؛ يُغلق عند الضغط خارجه إن كان فارغاً
  useClickOutside(
    searchRef,
    () => {
      if (!search?.value) setSearchOpen(false);
    },
    searchOpen,
  );
  useClickOutside(filterRef, () => setFilterOpen(false), filterOpen);
  useClickOutside(menuRef, () => setMenuOpen(false), menuOpen);

  const hasActiveFilter = filters?.some(
    (g) => g.value !== g.options[0]?.value,
  );

  // وضع البحث المتوسّع: يأخذ كامل العرض ويخفي بقية الأزرار
  if (search && searchOpen) {
    return (
      <div ref={searchRef} className="flex items-center gap-2 w-full">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-ink/40 pointer-events-none" />
          <input
            ref={inputRef}
            type="search"
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                if (search.value) search.onChange("");
                else setSearchOpen(false);
              }
            }}
            placeholder={search.placeholder ?? "ابحث..."}
            className="w-full h-11 min-h-[44px] ps-10 pe-4 rounded-lg border border-hairline-2 bg-paper text-sm text-ink focus:outline-none focus:ring-2 focus:ring-info"
          />
        </div>
        <HeaderIconButton
          label="إغلاق البحث"
          onClick={() => {
            search.onChange("");
            setSearchOpen(false);
          }}
        >
          <X className="w-5 h-5" />
        </HeaderIconButton>
        {trailing && <div className="flex items-center shrink-0">{trailing}</div>}
      </div>
    );
  }

  return (
    <div className="flex items-center flex-nowrap justify-between w-full gap-2">
      {/* يمين (start في RTL): زر الإضافة (الإجراء الأساسي) */}
      <div className="flex items-center shrink-0">
        {trailing}
      </div>

      {/* الوسط: فلتر + بحث + تبديل العرض (مجموعة متماسكة تتمدد وتتوسط) */}
      <div className="flex items-center justify-center gap-2 flex-nowrap flex-1">
        {/* فلتر مخصّص (يحلّ محلّ الفلتر الافتراضي) */}
        {filterSlot}

        {!filterSlot && filters && filters.length > 0 && (
          <div ref={filterRef} className="relative">
            <HeaderIconButton
              label="تصفية"
              isActive={filterOpen}
              badge={hasActiveFilter}
              onClick={() => setFilterOpen((o) => !o)}
            >
              <Filter className="w-5 h-5" />
            </HeaderIconButton>
            {filterOpen && (
              <div className="absolute start-0 top-full mt-2 z-dropdown w-60 max-w-[calc(100vw-1rem)] max-h-[70vh] overflow-y-auto bg-paper rounded-lg border border-hairline-2 shadow-lg p-3 space-y-4 animate-fade-in">
                {filters.map((group) => (
                  <div key={group.key} className="space-y-1.5">
                    <p className="text-[11px] font-bold text-ink/50 px-1">
                      {group.label}
                    </p>
                    <div className="flex flex-col gap-0.5">
                      {group.options.map((opt) => {
                        const active = group.value === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              group.onChange(opt.value);
                              setFilterOpen(false);
                            }}
                            className={cn(
                              "flex items-center justify-between gap-2 min-h-[40px] px-2.5 rounded-md text-sm text-start transition-colors",
                              active
                                ? "bg-info-soft text-info font-bold"
                                : "text-ink-2 hover:bg-canvas",
                            )}
                          >
                            <span>{opt.label}</span>
                            {active && <Check className="w-4 h-4 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* حجز مساحة زر الفلتر عند غيابه (منع قفز التخطيط بين التبويبات) */}
        {!filterSlot &&
          (!filters || filters.length === 0) &&
          reserveFilterSpace && (
            <span className="w-11 h-11 shrink-0" aria-hidden="true" />
          )}

        {/* فاصل بسيط قبل البحث */}
        {search && <span className="w-2 shrink-0" aria-hidden="true" />}

        {search && (
          <HeaderIconButton
            label="بحث"
            isActive={!!search.value}
            onClick={() => setSearchOpen(true)}
          >
            <Search className="w-5 h-5" />
          </HeaderIconButton>
        )}

        {/* فاصل بسيط قبل مبدّل العرض */}
        {leading && <span className="w-2 shrink-0" aria-hidden="true" />}

        {leading}
      </div>

      {/* يسار (end في RTL): زر الإعدادات */}
      <div className="flex items-center shrink-0 justify-end">
        {menuItems && menuItems.length > 0 ? (
          <div ref={menuRef} className="relative">
            <HeaderIconButton
              label="إعدادات"
              isActive={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              <Settings2 className="w-5 h-5" />
            </HeaderIconButton>
            {menuOpen && (
              <div className="absolute end-0 top-full mt-2 z-dropdown w-56 max-w-[calc(100vw-1rem)] bg-paper rounded-lg border border-hairline-2 shadow-lg p-1.5 animate-fade-in">
                {menuItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      item.onClick();
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 min-h-[44px] px-3 rounded-md text-sm text-ink-2 hover:bg-canvas hover:text-ink transition-colors text-start"
                  >
                    {item.icon && <span className="shrink-0">{item.icon}</span>}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : reserveMenuSpace ? (
          <span className="w-11 h-11 shrink-0" aria-hidden="true" />
        ) : null}
      </div>
    </div>
  );
}
