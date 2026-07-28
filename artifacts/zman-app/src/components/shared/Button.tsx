import { cn } from "@/lib/utils";
import React from "react";
import { Check } from "lucide-react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "destructive" | "ink" | "icon";
  size?: "sm" | "md" | "lg" | "icon";
  isLoading?: boolean;
  isSuccess?: boolean;
  icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      isLoading = false,
      isSuccess = false,
      icon,
      children,
      disabled,
      type = "button",
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center rounded-md font-semibold transition-all duration-[120ms] ease-out active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none";

    const variants = {
      primary: "bg-info text-paper hover:bg-info/90 focus-visible:ring-info",
      secondary: "bg-paper border border-hairline-2 text-ink hover:bg-canvas focus-visible:ring-ink",
      ghost: "bg-transparent text-ink hover:bg-canvas focus-visible:ring-ink",
      destructive: "bg-alert text-paper hover:bg-alert/90 focus-visible:ring-alert",
      ink: "bg-ink text-paper hover:bg-ink/90 focus-visible:ring-ink",
      icon: "bg-transparent border border-hairline text-ink-3 hover:text-ink hover:bg-canvas focus-visible:ring-ink p-0 rounded-lg",
    };

    const sizes = {
      // SA2 (Round 4 — B-2 system decision): all touch-surface buttons MUST be ≥ 44×44 px.
      // `sm` was 36 px (h-9) without min-h — measured live at 36×50 on /reports «تحميل» and
      // 36×100 on catalog «تسوية يدوية». Now raised to 44 px (min-h + h-11) to match the
      // baseline mandate. Trade-off: visual density slightly looser on tight headers; verified
      // at 360 + 390 that /reports header (SegmentedControl + DownloadBtn) still fits.
      sm: "h-11 px-3 text-xs gap-1.5 min-h-[44px]",
      md: "h-11 px-4 text-sm gap-2 min-h-[44px]", // Minimum 44px touch target
      lg: "h-12 px-6 text-base gap-2 min-h-[44px]",
      icon: "h-11 w-11 p-0 min-h-[44px] min-w-[44px]",
    };

    const sizeStyle = size === "icon" || variant === "icon" ? sizes.icon : sizes[size];

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading || isSuccess}
        className={cn(baseStyles, variants[variant], sizeStyle, className)}
        {...props}
      >
        {isSuccess ? (
          <Check className="h-4.5 w-4.5 text-current shrink-0 scale-up-center animate-fadeIn" />
        ) : isLoading ? (
          <svg
            className="animate-spin h-4 w-4 text-current shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <title>تحميل</title>
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : (
          icon && <span className="shrink-0">{icon}</span>
        )}
        {(!isSuccess && children) && <span className={cn(icon && "ms-1")}>{children}</span>}
      </button>
    );
  }
);

Button.displayName = "Button";
