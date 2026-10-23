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
        "bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 shadow-sm shadow-indigo-200/50 border border-transparent focus-visible:ring-indigo-600",
      secondary:
        "bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 border border-slate-200/90 shadow-2xs active:bg-slate-100 focus-visible:ring-slate-400",
      outline:
        "bg-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-900 border border-slate-300 active:bg-slate-200",
      ghost:
        "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent",
      danger:
        "bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800 shadow-sm border border-transparent focus-visible:ring-rose-600",
      cyan:
        "bg-cyan-600 text-white hover:bg-cyan-700 active:bg-cyan-800 shadow-sm shadow-cyan-200/50 border border-transparent focus-visible:ring-cyan-600",
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
          "inline-flex items-center justify-center transition-all duration-150 select-none disabled:opacity-50 disabled:pointer-events-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
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
