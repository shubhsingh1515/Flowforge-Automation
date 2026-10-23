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
    success: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
    warning: "bg-amber-50 text-amber-700 border-amber-200/80",
    danger: "bg-rose-50 text-rose-700 border-rose-200/80",
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-200/80",
    cyan: "bg-cyan-50 text-cyan-800 border-cyan-200/80",
    neutral: "bg-slate-100 text-slate-700 border-slate-200/80",
    outline: "bg-white text-slate-600 border-slate-300",
  };

  const dotStyles: Record<BadgeVariant, string> = {
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    danger: "bg-rose-500",
    indigo: "bg-indigo-500",
    cyan: "bg-cyan-500",
    neutral: "bg-slate-400",
    outline: "bg-slate-400",
  };

  const sizeStyles = {
    sm: "px-2 py-0.5 text-[11px]",
    md: "px-2.5 py-1 text-xs",
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
