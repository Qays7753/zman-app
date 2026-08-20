"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
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
  const titleId = useId();
  const modalRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = Array.from(
        modalRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
      );

      if (focusable.length === 0) {
        event.preventDefault();
        modalRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    const focusFrame = window.requestAnimationFrame(() => {
      const first = modalRef.current?.querySelector<HTMLElement>(focusableSelector);
      first?.focus();
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocusedRef.current?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-modal flex items-end justify-center lg:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      {/* الخلفية الداكنة */}
      <div
        className="absolute inset-0 z-overlay bg-ink/45 animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* نافذة المودال */}
      <div
        ref={modalRef}
        tabIndex={-1}
        className={cn(
          "relative z-sheet w-full bg-paper flex flex-col animate-slide-up",
          // موبايل: شيت من الأسفل — يترك مسافة 4rem للنافبار السفلي
          "rounded-t-2xl max-h-[calc(var(--app-height)-env(safe-area-inset-bottom))]",
          // ديسكتوب: مودال متمركز
          "lg:rounded-xl lg:max-w-[480px] lg:w-full lg:max-h-[85vh] lg:shadow-elev-2",
        )}
      >
        {/* مقبض السحب (موبايل فقط) */}
        <div className="flex justify-center pt-2.5 pb-1 lg:hidden flex-shrink-0">
          <div className="w-9 h-1 bg-hairline rounded-full" />
        </div>

        {/* الترويسة */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-hairline flex-shrink-0">
          <h3 id={titleId} className="text-lg font-bold text-ink leading-tight">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="h-12 w-12 -me-2 rounded-full hover:bg-canvas text-ink-2 transition-colors flex items-center justify-center focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* المحتوى — الشيت فوق الشريط السفلي مع safe-area مستقل. */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
