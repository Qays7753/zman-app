import { cn } from "@/lib/utils";
import React from "react";
import { Check } from "lucide-react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "primary"
    | "secondary"
    | "ghost"
    | "destructive"
    | "destructive-solid"
    | "ink"
    | "icon";
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
    ref,
  ) => {
    const baseStyles =
      "relative inline-flex items-center justify-center rounded-md font-semibold transition-colors duration-[120ms] ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none";

    const variants = {
      primary:
        "bg-brand text-paper hover:bg-brand-hover active:bg-brand-pressed focus-visible:ring-brand",
      secondary:
        "bg-paper border border-brand text-brand-deep hover:bg-brand-soft focus-visible:ring-brand",
      ghost:
        "bg-transparent text-brand-deep hover:bg-canvas focus-visible:ring-brand",
      destructive:
        "bg-paper border border-alert-deep text-alert-deep hover:bg-alert-soft focus-visible:ring-alert-deep",
      "destructive-solid":
        "bg-alert-deep text-paper hover:bg-alert focus-visible:ring-alert-deep",
      ink: "bg-ink text-paper hover:bg-ink/90 focus-visible:ring-ink",
      icon: "bg-paper border border-border-field text-ink-2 hover:text-ink hover:bg-canvas focus-visible:ring-brand p-0 rounded-lg",
    };

    const sizes = {
      // sm keeps a compact visual scale but retains a 48px touch surface.
      sm: "h-12 min-h-12 px-3 text-xs gap-1.5",
      md: "h-12 min-h-12 px-4 text-sm gap-2",
      lg: "min-h-[52px] h-auto px-6 py-3 text-base gap-2",
      icon: "h-12 w-12 min-h-12 min-w-12 p-0",
    };

    const sizeStyle = size === "icon" || variant === "icon" ? sizes.icon : sizes[size];
    const isBusy = isLoading || isSuccess;

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isBusy}
        aria-busy={isLoading || undefined}
        className={cn(baseStyles, variants[variant], sizeStyle, className)}
        {...props}
      >
        {isSuccess ? (
          <Check className="h-5 w-5 text-current shrink-0" aria-hidden="true" />
        ) : isLoading ? (
          <span
            className="absolute inset-0 flex items-center justify-center"
            aria-hidden="true"
          >
            <svg
              className="h-4 w-4 animate-spin text-current shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
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
          </span>
        ) : (
          icon && <span className="shrink-0" aria-hidden="true">{icon}</span>
        )}
        {children && (
          <span className={cn(icon && "ms-1", isLoading && "opacity-0")}>
            {children}
          </span>
        )}
      </button>
    );
  },
);

Button.displayName = "Button";
