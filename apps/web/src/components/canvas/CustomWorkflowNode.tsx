"use client";

import React, { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import {
  Webhook,
  Play,
  GitBranch,
  Filter,
  Sparkles,
  RotateCw,
  Split,
  GitMerge,
  ShieldCheck,
  Globe,
  Flag,
} from "lucide-react";
import { cn } from "../../lib/utils";

const NODE_CONFIG: Record<
  string,
  { icon: any; color: string; bgColor: string; borderColor: string; label: string }
> = {
  TRIGGER: {
    icon: Webhook,
    color: "text-indigo-600",
    bgColor: "bg-indigo-50",
    borderColor: "border-indigo-200",
    label: "Trigger",
  },
  ACTION: {
    icon: Play,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    label: "Action",
  },
  CONDITION: {
    icon: GitBranch,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
    label: "Condition",
  },
  FILTER: {
    icon: Filter,
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-200",
    label: "Filter",
  },
  TRANSFORM: {
    icon: Sparkles,
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
    label: "Transform",
  },
  LOOP: {
    icon: RotateCw,
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
    label: "For Each",
  },
  FORK: {
    icon: Split,
    color: "text-sky-600",
    bgColor: "bg-sky-50",
    borderColor: "border-sky-200",
    label: "Fork",
  },
  JOIN: {
    icon: GitMerge,
    color: "text-teal-600",
    bgColor: "bg-teal-50",
    borderColor: "border-teal-200",
    label: "Join",
  },
  APPROVAL: {
    icon: ShieldCheck,
    color: "text-rose-600",
    bgColor: "bg-rose-50",
    borderColor: "border-rose-200",
    label: "Approval",
  },
  HTTP_REQUEST: {
    icon: Globe,
    color: "text-sky-600",
    bgColor: "bg-sky-50",
    borderColor: "border-sky-200",
    label: "HTTP Request",
  },
  WORKFLOW_END: {
    icon: Flag,
    color: "text-slate-600",
    bgColor: "bg-slate-50",
    borderColor: "border-slate-200",
    label: "Workflow End",
  },
};

function CustomWorkflowNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as any;
  const nodeType = (nodeData?.nodeType as string) || "ACTION";
  const config = NODE_CONFIG[nodeType] || NODE_CONFIG.ACTION;
  const Icon = config.icon;

  const isTrigger = nodeType === "TRIGGER";
  const isEnd = nodeType === "WORKFLOW_END";
  const isCondition = nodeType === "CONDITION";
  const isApproval = nodeType === "APPROVAL";

  return (
    <div
      className={cn(
        "relative min-w-[220px] max-w-[260px] rounded-2xl border bg-white p-3.5 shadow-card ring-1 ring-slate-900/5 transition-all duration-200",
        selected
          ? "border-[#6558E8] ring-2 ring-[#6558E8]/40 shadow-card-hover scale-[1.02]"
          : "border-slate-200/90 hover:border-slate-300 hover:shadow-card-hover"
      )}
    >
      {/* Target Handle (Input) - Triggers don't need input */}
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-3 !w-3 !bg-slate-400 !border-2 !border-white hover:!bg-[#6558E8] transition-colors"
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-xl border shadow-2xs",
              config.bgColor,
              config.color,
              config.borderColor
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {config.label}
            </span>
            <h4 className="text-xs font-bold text-slate-900 leading-tight">
              {(nodeData?.label as string) || config.label}
            </h4>
          </div>
        </div>

        {/* Status Indicator */}
        <div
          className={cn(
            "h-2 w-2 rounded-full ring-2 ring-white shadow-2xs",
            nodeData?.isValid !== false ? "bg-emerald-500" : "bg-rose-500 animate-pulse"
          )}
          title={nodeData?.isValid !== false ? "Configured" : "Requires Configuration"}
        />
      </div>

      {/* Description */}
      {Boolean(nodeData?.description) && (
        <p className="mt-2 text-[11px] text-slate-500 line-clamp-2 leading-relaxed font-normal">
          {nodeData.description}
        </p>
      )}

      {/* Specific Branch Outputs */}
      {isApproval ? (
        <div className="mt-3 flex justify-between border-t border-slate-100 pt-2 text-[10px] font-bold text-slate-500">
          <div className="relative flex items-center gap-1">
            <span className="text-emerald-600">Approved</span>
            <Handle
              type="source"
              position={Position.Right}
              id="approved"
              style={{ top: "auto", bottom: 10 }}
              className="!h-2.5 !w-2.5 !bg-emerald-500 !border-2 !border-white"
            />
          </div>
          <div className="relative flex items-center gap-1">
            <span className="text-rose-500">Rejected</span>
            <Handle
              type="source"
              position={Position.Right}
              id="rejected"
              style={{ top: "auto", bottom: 26 }}
              className="!h-2.5 !w-2.5 !bg-rose-500 !border-2 !border-white"
            />
          </div>
        </div>
      ) : isCondition ? (
        <div className="mt-3 flex justify-between border-t border-slate-100 pt-2 text-[10px] font-bold text-slate-500">
          <div className="relative flex items-center gap-1">
            <span className="text-emerald-600">True</span>
            <Handle
              type="source"
              position={Position.Right}
              id="true"
              style={{ top: "auto", bottom: 10 }}
              className="!h-2.5 !w-2.5 !bg-emerald-500 !border-2 !border-white"
            />
          </div>
          <div className="relative flex items-center gap-1">
            <span className="text-rose-500">False</span>
            <Handle
              type="source"
              position={Position.Right}
              id="false"
              style={{ top: "auto", bottom: 26 }}
              className="!h-2.5 !w-2.5 !bg-rose-500 !border-2 !border-white"
            />
          </div>
        </div>
      ) : (
        /* Source Handle (Output) - End nodes don't need output */
        !isEnd && (
          <Handle
            type="source"
            position={Position.Right}
            className="!h-3 !w-3 !bg-[#6558E8] !border-2 !border-white hover:!bg-[#5345D8] transition-colors"
          />
        )
      )}
    </div>
  );
}

export const CustomWorkflowNode = memo(CustomWorkflowNodeComponent);
