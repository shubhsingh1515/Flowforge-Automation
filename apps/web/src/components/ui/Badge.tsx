"use client";

import React from "react";
import { cn } from "../../lib/utils";

export type BadgeVariant =
  | "success"
  | "warning"
  | "danger"
  | "indigo"
  | "cyan"
  | "neutral"
  | "outline";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  dot?: boolean;
  size?: "sm" | "md";
  children: React.ReactNode;
}

export function Badge({
  variant = "neutral",
  dot = false,
  size = "sm",
  className,
  children,
  ...props
}: BadgeProps) {
  const variantStyles: Record<BadgeVariant, string> = {
    success: "bg-emerald-50/90 text-emerald-800 border-emerald-200/90",
    warning: "bg-amber-50/90 text-amber-800 border-amber-200/90",
    danger: "bg-rose-50/90 text-rose-800 border-rose-200/90",
    indigo: "bg-indigo-50/90 text-indigo-700 border-indigo-200/90",
    cyan: "bg-cyan-50/90 text-cyan-800 border-cyan-200/90",
    neutral: "bg-slate-100/90 text-slate-700 border-slate-200/90",
    outline: "bg-white text-slate-700 border-slate-300/90 shadow-2xs",
  };

  const dotStyles: Record<BadgeVariant, string> = {
    success: "bg-emerald-500 ring-2 ring-emerald-200/60",
    warning: "bg-amber-500 ring-2 ring-amber-200/60",
    danger: "bg-rose-500 ring-2 ring-rose-200/60",
    indigo: "bg-indigo-500 ring-2 ring-indigo-200/60",
    cyan: "bg-cyan-500 ring-2 ring-cyan-200/60",
    neutral: "bg-slate-400 ring-2 ring-slate-200/60",
    outline: "bg-slate-400 ring-2 ring-slate-200/60",
  };

  const sizeStyles = {
    sm: "px-2.5 py-0.5 text-[11px] font-semibold tracking-tight",
    md: "px-3 py-1 text-xs font-semibold tracking-tight",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-medium rounded-full border transition-colors",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {dot && (
        <span
          className={cn("h-1.5 w-1.5 rounded-full shrink-0", dotStyles[variant])}
          aria-hidden="true"
        />
      )}
      <span>{children}</span>
    </span>
  );
}
