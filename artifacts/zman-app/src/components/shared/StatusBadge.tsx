import { cn } from "@/lib/utils";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/status-colors";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const colorClass = STATUS_COLORS[status] || "bg-info-soft text-info border-info/20";
  const label = STATUS_LABELS[status] || status;

  return (
    <span
      className={cn(
        "px-2.5 py-0.5 rounded-full text-xs font-semibold border leading-none inline-flex items-center justify-center h-5 transition-colors duration-200",
        colorClass,
        className
      )}
    >
      {label}
    </span>
  );
}
