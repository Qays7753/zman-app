"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface ResponsiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function ResponsiveModal({
  isOpen,
  onClose,
  title,
  children,
}: ResponsiveModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-modal flex items-end justify-center lg:items-center"
      role="dialog"
      aria-modal="true"
    >
      {/* الخلفية الداكنة */}
      <div
        className="absolute inset-0 bg-ink/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* نافذة المودال */}
      <div
        className={cn(
          "relative w-full bg-paper z-modal flex flex-col focus:outline-none",
          // موبايل: شيت من الأسفل — يترك مسافة 4rem للنافبار السفلي
          "rounded-t-2xl max-h-[calc(100dvh-4.5rem)]",
          // ديسكتوب: مودال متمركز
          "lg:rounded-xl lg:max-w-[480px] lg:w-full lg:max-h-[85vh] lg:shadow-xl",
        )}
      >
        {/* مقبض السحب (موبايل فقط) */}
        <div className="flex justify-center pt-2.5 pb-1 lg:hidden flex-shrink-0">
          <div className="w-10 h-1 bg-ink/20 rounded-full" />
        </div>

        {/* الترويسة */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-hairline flex-shrink-0">
          <h3 className="text-base font-bold text-ink leading-tight">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -me-2 rounded-full hover:bg-canvas text-ink-2 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* المحتوى — المودال يغطي النافبار كلياً (z-modal=40 > z-sticky=10) */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-5 pb-6">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
