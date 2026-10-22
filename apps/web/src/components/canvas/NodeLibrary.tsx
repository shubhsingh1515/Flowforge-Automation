"use client";

import React from "react";
import {
  Webhook,
  Play,
  GitBranch,
  Globe,
  Flag,
  Plus,
  Clock,
  MessageSquare,
  FileSpreadsheet,
  Inbox,
  HardDrive,
  Info,
  Filter,
  Sparkles,
  RotateCw,
  Split,
  GitMerge,
  ShieldCheck,
} from "lucide-react";
import { NodeType } from "@flowforge/shared";

interface NodeLibraryProps {
  onAddNode: (
    type: NodeType,
    label: string,
    description: string,
    integrationKey?: string,
    initialConfig?: any
  ) => void;
}

interface PaletteNode {
  type: NodeType;
  label: string;
  description: string;
  icon: any;
  color: string;
  bg: string;
  integrationKey?: string;
  initialConfig?: any;
  category: "Primitives" | "Flow Control" | "Integrations";
}

const AVAILABLE_NODES: PaletteNode[] = [
  // Core Primitives
  {
    type: "TRIGGER",
    label: "Webhook Trigger",
    description: "Start workflow on incoming HTTP webhook payload.",
    icon: Webhook,
    color: "text-indigo-600",
    bg: "bg-indigo-50",
    category: "Primitives",
  },
  {
    type: "TRIGGER",
    label: "Schedule Trigger",
    description: "Trigger workflow periodically using a cron schedule.",
    icon: Clock,
    color: "text-purple-600",
    bg: "bg-purple-50",
    category: "Primitives",
  },
  {
    type: "HTTP_REQUEST",
    label: "HTTP / REST Call",
    description: "Dispatch outgoing HTTP request to any external API.",
    icon: Globe,
    color: "text-sky-600",
    bg: "bg-sky-50",
    category: "Primitives",
  },

  // Advanced Flow Control & Logic
  {
    type: "CONDITION",
    label: "Condition Filter",
    description: "Branch execution with If/Else logic based on values.",
    icon: GitBranch,
    color: "text-amber-600",
    bg: "bg-amber-50",
    initialConfig: { field: "trigger.body.status", operator: "equals", value: "active" },
    category: "Flow Control",
  },
  {
    type: "FILTER",
    label: "Array Filter",
    description: "Filter individual items in an array based on conditions.",
    icon: Filter,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    initialConfig: { inputArray: "{{trigger.body.items}}", field: "status", operator: "equals", value: "active" },
    category: "Flow Control",
  },
  {
    type: "TRANSFORM",
    label: "Data Transform",
    description: "Declaratively map, convert, format, or restructure JSON.",
    icon: Sparkles,
    color: "text-purple-600",
    bg: "bg-purple-50",
    initialConfig: {
      fieldRules: [
        { targetField: "fullName", sourceExpression: "{{trigger.body.firstName}} {{trigger.body.lastName}}" },
      ],
    },
    category: "Flow Control",
  },
  {
    type: "LOOP",
    label: "For Each Loop",
    description: "Iterate over an array with bounded execution safety.",
    icon: RotateCw,
    color: "text-orange-600",
    bg: "bg-orange-50",
    initialConfig: { arrayExpression: "{{trigger.body.items}}", maxIterations: 50, errorPolicy: "STOP_ON_ERROR" },
    category: "Flow Control",
  },
  {
    type: "FORK",
    label: "Fork Branches",
    description: "Split execution across parallel concurrent branches.",
    icon: Split,
    color: "text-sky-600",
    bg: "bg-sky-50",
    initialConfig: {},
    category: "Flow Control",
  },
  {
    type: "JOIN",
    label: "Join Branches",
    description: "Wait for parallel branches to finish and synchronize output.",
    icon: GitMerge,
    color: "text-teal-600",
    bg: "bg-teal-50",
    initialConfig: { joinPolicy: "WAIT_ALL" },
    category: "Flow Control",
  },
  {
    type: "APPROVAL",
    label: "Human Approval",
    description: "Pause execution until an authorized reviewer approves.",
    icon: ShieldCheck,
    color: "text-rose-600",
    bg: "bg-rose-50",
    initialConfig: {
      title: "Approval required for operation",
      description: "Review and approve to continue execution.",
      timeoutSeconds: 86400,
    },
    category: "Flow Control",
  },

  // Third-Party Integrations
  {
    type: "ACTION",
    label: "Slack: Post Message",
    description: "Send formatted text or alert messages to a Slack channel.",
    icon: MessageSquare,
    color: "text-pink-600",
    bg: "bg-pink-50",
    integrationKey: "slack",
    initialConfig: { operationId: "post_message", channel: "general", text: "" },
    category: "Integrations",
  },
  {
    type: "ACTION",
    label: "Google Sheets: Append",
    description: "Append a new row of values to a Google Spreadsheet.",
    icon: FileSpreadsheet,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    integrationKey: "google-sheets",
    initialConfig: { operationId: "append_row", range: "Sheet1!A:Z", values: [] },
    category: "Integrations",
  },
  {
    type: "ACTION",
    label: "Gmail: Send Email",
    description: "Send an email message via your connected Gmail account.",
    icon: Inbox,
    color: "text-rose-600",
    bg: "bg-rose-50",
    integrationKey: "gmail",
    initialConfig: { operationId: "send_email", to: "", subject: "", body: "" },
    category: "Integrations",
  },
  {
    type: "ACTION",
    label: "Google Drive: Files",
    description: "Search, list, and retrieve file metadata in Google Drive.",
    icon: HardDrive,
    color: "text-blue-600",
    bg: "bg-blue-50",
    integrationKey: "google-drive",
    initialConfig: { operationId: "list_files", query: "trashed = false", pageSize: 10 },
    category: "Integrations",
  },

  // Terminal
  {
    type: "WORKFLOW_END",
    label: "Workflow End",
    description: "Mark successful termination of the automation pipeline.",
    icon: Flag,
    color: "text-slate-600",
    bg: "bg-slate-50",
    category: "Primitives",
  },
];

export function NodeLibrary({ onAddNode }: NodeLibraryProps) {
  const primitives = AVAILABLE_NODES.filter((n) => n.category === "Primitives");
  const flowControl = AVAILABLE_NODES.filter((n) => n.category === "Flow Control");
  const integrations = AVAILABLE_NODES.filter((n) => n.category === "Integrations");

  const renderNodeButton = (item: PaletteNode) => {
    const Icon = item.icon;
    return (
      <button
        key={item.label}
        data-testid={`palette-node-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
        onClick={() =>
          onAddNode(
            item.type,
            item.label,
            item.description,
            item.integrationKey,
            item.initialConfig
          )
        }
        className="group flex w-full items-start gap-3 rounded-xl border border-slate-200/80 bg-white p-2.5 text-left transition-all hover:border-indigo-300 hover:shadow-xs"
      >
        <div
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${item.bg} ${item.color} border-slate-200/60`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
              {item.label}
            </h4>
            <Plus className="h-3.5 w-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </div>
          <p className="mt-0.5 text-[10px] text-slate-500 line-clamp-2 leading-relaxed">
            {item.description}
          </p>
        </div>
      </button>
    );
  };

  return (
    <div className="w-68 border-r border-slate-200 bg-white flex flex-col h-full select-none z-10">
      <div className="border-b border-slate-100 p-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Node Palette
        </h3>
        <p className="mt-0.5 text-[11px] text-slate-400">
          Click any step to place it onto the canvas
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Core Primitives Section */}
        <div>
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 mb-2">
            Triggers & Calls
          </h4>
          <div className="space-y-1.5">{primitives.map(renderNodeButton)}</div>
        </div>

        {/* Logic & Advanced Flow Control Section */}
        <div>
          <div className="flex items-center justify-between px-1 mb-2">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
              Logic & Flow Control
            </h4>
            <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700">
              Phase 4
            </span>
          </div>
          <div className="space-y-1.5">{flowControl.map(renderNodeButton)}</div>
        </div>

        {/* Third-Party Integrations Section */}
        <div>
          <div className="flex items-center justify-between px-1 mb-2">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
              Apps & Integrations
            </h4>
            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
              OAuth 2.0
            </span>
          </div>
          <div className="space-y-1.5">{integrations.map(renderNodeButton)}</div>
        </div>
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
