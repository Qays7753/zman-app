import { CircleCheck, CircleDashed, CircleX, LoaderCircle, Send, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/status-colors";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const STATUS_ICONS: Record<string, LucideIcon> = {
  draft: CircleDashed,
  sent: Send,
  confirmed: LoaderCircle,
  delivered: CircleCheck,
  cancelled: CircleX,
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const colorClass = STATUS_COLORS[status] || "bg-info-soft text-info border-info/20";
  const label = STATUS_LABELS[status] || status;
  const Icon = STATUS_ICONS[status] ?? CircleDashed;

  return (
    <span
      className={cn(
        "inline-flex h-6 items-center justify-center gap-1 rounded-full border px-2.5 text-xs font-semibold leading-none transition-colors duration-[120ms]",
        colorClass,
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
