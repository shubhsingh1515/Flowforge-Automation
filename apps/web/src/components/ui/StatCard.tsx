"use client";

import React from "react";
import { cn } from "../../lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: {
    value: string | number;
    direction: "up" | "down" | "neutral";
    label?: string;
  };
  className?: string;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200/85 bg-white p-5 shadow-card hover:shadow-card-hover ring-1 ring-slate-900/5 transition-all duration-200 group",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
          {title}
        </span>
        {icon && (
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 border border-slate-200/70 text-slate-700 shadow-2xs group-hover:scale-105 group-hover:border-slate-300 transition-all">
            {icon}
          </div>
        )}
      </div>

      <div className="mt-3.5 flex items-baseline gap-2.5">
        <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 tabular-nums">
          {value}
        </div>
        {trend && (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border shadow-2xs",
              trend.direction === "up" && "bg-emerald-50 text-emerald-800 border-emerald-200/80",
              trend.direction === "down" && "bg-rose-50 text-rose-800 border-rose-200/80",
              trend.direction === "neutral" && "bg-slate-100 text-slate-700 border-slate-200/80"
            )}
          >
            {trend.direction === "up" && <TrendingUp className="h-3 w-3 stroke-[2.5]" />}
            {trend.direction === "down" && <TrendingDown className="h-3 w-3 stroke-[2.5]" />}
            {trend.direction === "neutral" && <Minus className="h-3 w-3 stroke-[2.5]" />}
            <span>{trend.value}</span>
          </span>
        )}
      </div>

      {(subtitle || trend?.label) && (
        <p className="mt-1.5 text-xs text-slate-500 truncate leading-relaxed">
          {trend?.label ? `${trend.label} ` : ""}
          {subtitle}
        </p>
      )}
    </div>
  );
}
