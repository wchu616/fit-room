import { forwardRef, InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "prefix"> {
  prefix?: ReactNode;
  suffix?: ReactNode;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, prefix, suffix, error, ...props }, ref) => {
    return (
      <div className="space-y-1">
        <div
          className={cn(
            "flex h-10 items-center rounded-md border border-black/10 bg-white shadow-sm transition",
            "focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-500 focus-within:ring-offset-1",
            error && "border-red-400 focus-within:border-red-500 focus-within:ring-red-500",
            className
          )}
        >
          {prefix ? <span className="px-3 text-sm text-black/60">{prefix}</span> : null}
          <input
            ref={ref}
            className="flex-1 bg-transparent px-3 text-sm text-black outline-none placeholder:text-black/40"
            {...props}
          />
          {suffix ? <span className="px-3 text-sm text-black/60">{suffix}</span> : null}
        </div>
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>
    );
  }
);

Input.displayName = "Input";
