"use client";

import React from "react";
import { cn } from "../../lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300/90 bg-white/70 p-12 text-center backdrop-blur-xs ring-1 ring-slate-900/5 shadow-2xs",
        className
      )}
    >
      {icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-50 to-indigo-100/50 border border-indigo-200/60 text-[#6558E8] shadow-sm">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-bold text-slate-900 tracking-tight">{title}</h3>
      <p className="mt-1.5 max-w-sm text-xs text-slate-500 leading-relaxed font-normal">
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
