import { cn } from "@/lib/utils";
import React from "react";

interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
  containerClassName?: string;
}

export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(
  ({ className, label, error, helperText, icon, containerClassName, type = "text", ...props }, ref) => {
    return (
      <div className={cn("w-full space-y-1.5 text-right", containerClassName)}>
        {label && (
          <label className="block text-sm font-bold text-ink-2 select-none">
            {label}
          </label>
        )}
        <div className="relative rounded-md shadow-sm">
          {icon && (
            <div className="absolute inset-y-0 start-0 ps-3.5 flex items-center pointer-events-none text-ink-3">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            type={type}
            className={cn(
              "block w-full h-12 rounded-md border border-hairline-2 bg-paper px-4 text-base text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10 transition-all duration-200",
              icon && "ps-10",
              error && "border-alert focus:border-alert focus:ring-alert/10",
              className
            )}
            {...props}
          />
        </div>
        {error && (
          <p className="text-xs font-semibold text-alert mt-1 select-none animate-fadeIn">
            {error}
          </p>
        )}
        {!error && helperText && (
          <p className="text-xs text-ink-3 mt-1 select-none">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

TextField.displayName = "TextField";
