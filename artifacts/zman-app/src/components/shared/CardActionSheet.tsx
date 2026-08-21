"use client";

import type { ReactNode } from "react";
import { ResponsiveModal } from "./ResponsiveModal";
import { cn } from "@/lib/utils";

export interface CardActionSheetAction {
  /** نص الصف العربي — مثل «تعديل» / «حذف». */
  label: string;
  /** أيقونة 20×20 (lucide-react) — تُعرض قبل النص. */
  icon: ReactNode;
  /** يُستدعى عند الضغط على الصف. المُستدعي مسؤول عن إغلاق الشيت. */
  onClick: () => void;
  /** افتراضي «default»؛ «danger» يلوّن الصف بالأحمر (للحذف). */
  variant?: "default" | "danger";
  /** معرّف ARIA وصفة. */
  ariaLabel?: string;
}

interface CardActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: ReactNode;
  actions: CardActionSheetAction[];
}

/**
 * Issue #15 — شيت إجراءات سفلي موحّد لكل البطاقات في التطبيق (مصاريف/مشتريات/
 * أصول رأسمالية/كتالوج). يُغلّف `ResponsiveModal` (الذي هو أصلاً شيت سفلي على
 * الموبايل) بصفوف لمس بحدّ أدنى 56 بكسل وأهداف لمس 44 بكسل.
 *
 * القيود:
 * - RTL فقط: نستخدم `text-start`/`px-4` لا خصائص فيزيائية.
 * - المُستدعي يمرّر قائمة الإجراءات التي تختلف حسب نوع البطاقة (حذف للقراءة فقط،
 *   حذف+تعديل، إيقاف إهلاك+تعديل، …).
 */
export function CardActionSheet({
  isOpen,
  onClose,
  title = "إجراءات",
  subtitle,
  actions,
}: CardActionSheetProps) {
  return (
    <ResponsiveModal isOpen={isOpen} onClose={onClose} title={title}>
      {subtitle && (
        <div className="px-4 pb-2 text-xs font-medium text-ink-3">
          {subtitle}
        </div>
      )}
      <div className="flex flex-col gap-1">
        {actions.map((action, idx) => (
          <button
            key={`${action.label}-${idx}`}
            type="button"
            aria-label={action.ariaLabel ?? action.label}
            onClick={() => {
              action.onClick();
            }}
            className={cn(
              "min-h-[56px] flex items-center gap-3 px-4 rounded-lg transition-colors text-start",
              action.variant === "danger"
                ? "hover:bg-alert-soft text-alert"
                : "hover:bg-canvas text-ink",
            )}
          >
            <span
              className={cn(
                "flex-shrink-0",
                action.variant === "danger" ? "text-alert" : "text-ink-2",
              )}
            >
              {action.icon}
            </span>
            <span className="text-sm font-medium">{action.label}</span>
          </button>
        ))}
      </div>
    </ResponsiveModal>
  );
}
