"use client";

import React from "react";
import {
  Webhook,
  Play,
  GitBranch,
  Globe,
  Flag,
  Plus,
  Info,
} from "lucide-react";
import { NodeType } from "@flowforge/shared";

interface NodeLibraryProps {
  onAddNode: (type: NodeType, label: string, description: string) => void;
}

const AVAILABLE_NODES: Array<{
  type: NodeType;
  label: string;
  description: string;
  icon: any;
  color: string;
  bg: string;
}> = [
  {
    type: "TRIGGER",
    label: "Webhook Trigger",
    description: "Start workflow on incoming HTTP webhook payload.",
    icon: Webhook,
    color: "text-indigo-600",
    bg: "bg-indigo-50",
  },
  {
    type: "ACTION",
    label: "Transform Action",
    description: "Execute a data transformation or step operation.",
    icon: Play,
    color: "text-blue-600",
    bg: "bg-blue-50",
  },
  {
    type: "CONDITION",
    label: "Condition Filter",
    description: "Branch execution with If/Else logic based on values.",
    icon: GitBranch,
    color: "text-amber-600",
    bg: "bg-amber-50",
  },
  {
    type: "HTTP_REQUEST",
    label: "HTTP / REST Call",
    description: "Dispatch outgoing HTTP GET, POST, or PUT to an API.",
    icon: Globe,
    color: "text-sky-600",
    bg: "bg-sky-50",
  },
  {
    type: "WORKFLOW_END",
    label: "Workflow End",
    description: "Mark successful termination of the automation pipeline.",
    icon: Flag,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
  },
];

export function NodeLibrary({ onAddNode }: NodeLibraryProps) {
  return (
    <div className="w-64 border-r border-slate-200 bg-white flex flex-col h-full select-none z-10">
      <div className="border-b border-slate-100 p-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Node Palette
        </h3>
        <p className="mt-0.5 text-[11px] text-slate-400">
          Click a node to add it to your canvas
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {AVAILABLE_NODES.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              onClick={() => onAddNode(item.type, item.label, item.description)}
              className="group flex w-full items-start gap-3 rounded-xl border border-slate-200/80 bg-white p-3 text-left transition-all hover:border-indigo-300 hover:shadow-xs"
            >
              <div
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${item.bg} ${item.color} border-slate-200/60`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                    {item.label}
                  </h4>
                  <Plus className="h-3.5 w-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <p className="mt-0.5 text-[10px] text-slate-500 line-clamp-2 leading-relaxed">
                  {item.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="p-3 border-t border-slate-100 bg-slate-50/50">
        <div className="flex items-start gap-2 rounded-lg bg-indigo-50/70 p-2 text-[10px] text-indigo-900">
          <Info className="h-3.5 w-3.5 shrink-0 text-indigo-600 mt-0.5" />
          <span>Connect output handles (right) to input handles (left) to form directed graphs.</span>
        </div>
      </div>
    </div>
  );
}
