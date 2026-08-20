"use client";
import { ResponsiveModal } from "./ResponsiveModal";
import { Button } from "./Button";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
  variant?: "danger" | "primary";
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = "تأكيد الحذف",
  cancelLabel = "إلغاء",
  onConfirm,
  onCancel,
  isLoading,
  variant = "danger",
}: ConfirmDialogProps) {
  return (
    <ResponsiveModal isOpen={isOpen} onClose={onCancel} title={title}>
      <div className="space-y-4">
        <p className="text-sm text-ink-2 leading-relaxed text-start">{message}</p>
        <div className="flex flex-col gap-3 pt-2 sm:flex-row">
          <Button
            variant="secondary"
            onClick={onCancel}
            isLoading={isLoading}
            className="min-h-12 w-full flex-1"
          >
            {cancelLabel}
          </Button>
          <Button
            variant={variant === "danger" ? "destructive-solid" : "primary"}
            onClick={onConfirm}
            isLoading={isLoading}
            className="min-h-12 w-full flex-1"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
