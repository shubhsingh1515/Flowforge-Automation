"use client";

import React from "react";
import { cn } from "../../lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "cyan";
  size?: "sm" | "md" | "lg" | "icon";
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading = false,
      icon,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const variantStyles = {
      primary:
        "bg-gradient-to-b from-[#6558E8] to-[#5345D8] text-white hover:from-[#5C4FE0] hover:to-[#4A3CCF] active:from-[#4A3CCF] active:to-[#3F32BD] shadow-sm shadow-[#6558E8]/25 border border-indigo-700/40 ring-1 ring-inset ring-white/20 focus-visible:ring-[#6558E8]",
      secondary:
        "bg-white text-slate-700 hover:bg-slate-50/90 hover:text-slate-900 border border-slate-200/90 shadow-2xs active:bg-slate-100 hover:border-slate-300/80 focus-visible:ring-slate-400",
      outline:
        "bg-transparent text-slate-700 hover:bg-slate-100/80 hover:text-slate-900 border border-slate-300 active:bg-slate-200/90",
      ghost:
        "bg-transparent text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 border border-transparent",
      danger:
        "bg-gradient-to-b from-rose-600 to-rose-700 text-white hover:from-rose-500 hover:to-rose-600 active:from-rose-700 active:to-rose-800 shadow-sm shadow-rose-600/25 border border-rose-800/40 ring-1 ring-inset ring-white/20 focus-visible:ring-rose-600",
      cyan:
        "bg-gradient-to-b from-[#22B8CF] to-[#129EA3] text-white hover:from-[#31C1D6] hover:to-[#17A5AA] active:from-[#129EA3] active:to-[#0F868B] shadow-sm shadow-cyan-500/25 border border-cyan-700/40 ring-1 ring-inset ring-white/20 focus-visible:ring-cyan-600",
    };

    const sizeStyles = {
      sm: "h-8 px-2.5 text-xs font-medium rounded-lg gap-1.5",
      md: "h-9 px-3.5 text-xs font-semibold rounded-lg gap-2",
      lg: "h-11 px-5 text-sm font-semibold rounded-xl gap-2.5",
      icon: "h-9 w-9 p-0 rounded-lg justify-center",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center transition-all duration-150 select-none disabled:opacity-50 disabled:pointer-events-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 active:scale-[0.98]",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {loading ? (
          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          icon && <span className="shrink-0">{icon}</span>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
