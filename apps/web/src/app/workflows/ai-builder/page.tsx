"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { AppShell } from "../../../components/layout/AppShell";
import {
  Sparkles,
  Play,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Boxes,
  Key,
  ShieldCheck,
  RefreshCw,
  GitCompare,
  FileCode2,
  Workflow,
  HelpCircle,
  ExternalLink,
  Info,
} from "lucide-react";
import { cn } from "../../../lib/utils";

const STARTER_PROMPTS = [
  {
    title: "Inbound Lead Qualification & Slack Alert",
    prompt: "When a new lead arrives via webhook, filter valid business emails, verify company domain, and notify our #sales-alerts Slack channel.",
  },
  {
    title: "E-Commerce Stripe Order Ingestion",
    prompt: "When an order webhook is received, validate the status is PAID, append a row to our Google Sheet, and send an email receipt.",
  },
  {
    title: "High-Value Transaction Approval Gate",
    prompt: "When a transaction exceeds $1,000, trigger an admin approval workflow before executing the payment capture HTTP request.",
  },
  {
    title: "Data Sync & Transformation Pipeline",
    prompt: "Receive webhook batch data, transform payload phone numbers into E.164 format, and sync to downstream CRM integration.",
  },
];

export default function AiWorkflowBuilderPage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [refinePrompt, setRefinePrompt] = useState("");
  const [proposal, setProposal] = useState<any | null>(null);
  const [diff, setDiff] = useState<any | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 1. Fetch AI Subsystem status & quotas
  const { data: statusData, isLoading: statusLoading } = useQuery({
    queryKey: ["ai-subsystem-status"],
    queryFn: () => api.ai.status(),
  });
  const aiStatus = statusData?.data;

  // 2. Generate Workflow Proposal Mutation
  const generateMutation = useMutation({
    mutationFn: (userPrompt: string) =>
      api.ai.generateWorkflow({ prompt: userPrompt }),
    onSuccess: (res: any) => {
      setProposal(res.data);
      setDiff(null);
      setSuccessMsg("Structured workflow proposal generated and validated against registry!");
      setTimeout(() => setSuccessMsg(null), 5000);
    },
    onError: (err: any) => {
      setErrorMsg(err.message || "Failed to generate workflow proposal.");
    },
  });

  // 3. Refine Proposal Mutation
  const refineMutation = useMutation({
    mutationFn: (instruction: string) =>
      api.ai.refineWorkflow({
        prompt: instruction,
        currentNodes: proposal?.nodes || [],
        currentEdges: proposal?.edges || [],
      }),
    onSuccess: (res: any) => {
      const data = res.data;
      setProposal((prev: any) => ({
        ...prev,
        nodes: data.proposedNodes,
        edges: data.proposedEdges,
        validation: data.validation,
      }));
      setDiff(data.diff);
      setRefinePrompt("");
      setSuccessMsg(`Proposal refined: ${data.summary}`);
      setTimeout(() => setSuccessMsg(null), 5000);
    },
    onError: (err: any) => {
      setErrorMsg(err.message || "Failed to refine workflow proposal.");
    },
  });

  // 4. Save as Draft Mutation (Never auto-activate or auto-deploy!)
  const saveDraftMutation = useMutation({
    mutationFn: () => {
      if (!proposal) throw new Error("No proposal to save");
      return api.workflows.create({
        name: proposal.name,
        description: proposal.description,
        nodes: proposal.nodes,
        edges: proposal.edges,
        status: "DRAFT",
      });
    },
    onSuccess: (res: any) => {
      const wfId = res.workflow?.id;
      setSuccessMsg("Workflow saved as DRAFT! Redirecting to canvas editor...");
      setTimeout(() => {
        if (wfId) router.push(`/workflows/${wfId}`);
        else router.push("/workflows");
      }, 1500);
    },
    onError: (err: any) => {
      setErrorMsg(err.message || "Failed to save workflow draft.");
    },
  });

  return (
    <AppShell
      title="AI-Assisted Workflow Builder"
      description="Describe your automation in natural language. FlowForge AI produces a structured, registry-grounded proposal for your review."
      action={
        <div className="flex items-center gap-2">
          {aiStatus && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-semibold text-slate-700">AI Engine:</span>
              <span className="font-mono text-slate-500 capitalize">{aiStatus.provider} ({aiStatus.model})</span>
              <span className="text-slate-300">|</span>
              <span className="text-indigo-600 font-semibold">{aiStatus.quotaRemaining} runs remaining</span>
            </div>
          )}
        </div>
      }
    >
      <div className="max-w-6xl mx-auto space-y-6" data-testid="ai-builder-page">
        {/* Feedback Banners */}
        {successMsg && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3.5 text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 p-3.5 text-xs text-rose-800 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="ml-auto text-rose-600 font-bold">×</button>
          </div>
        )}

        {/* 1. Prompt Input Section */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">What automation would you like to build?</h2>
              <p className="text-xs text-slate-500">FlowForge will select supported nodes, extract required variables, and assemble a Directed Acyclic Graph.</p>
            </div>
          </div>

          <div>
            <textarea
              data-testid="ai-prompt-input"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. When a new lead arrives through a webhook, validate the email, check whether the lead already exists, and notify our sales channel when a new qualified lead is found."
              rows={4}
              className="w-full rounded-lg border border-slate-300 p-3 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600 placeholder:text-slate-400"
            />
          </div>

          {/* Quick Starters */}
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-500">Or choose a starter template:</span>
            <div className="flex flex-wrap gap-2">
              {STARTER_PROMPTS.map((starter, idx) => (
                <button
                  key={idx}
                  onClick={() => setPrompt(starter.prompt)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-2xs text-slate-700 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-colors"
                >
                  {starter.title}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              data-testid="btn-generate-workflow"
              onClick={() => generateMutation.mutate(prompt)}
              disabled={generateMutation.isPending || prompt.trim().length < 5}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-xs font-semibold flex items-center gap-2 shadow-xs disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              <span>{generateMutation.isPending ? "Generating Proposal..." : "Generate Workflow Proposal"}</span>
            </button>
          </div>
        </div>

        {/* 2. Proposal Overview & Review Section */}
        {proposal && (
          <div className="space-y-6" data-testid="proposal-preview">
            {/* Header Card */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-2xs font-semibold uppercase bg-indigo-100 text-indigo-700">
                      {proposal.triggerType} Trigger
                    </span>
                    <span className="px-2 py-0.5 rounded text-2xs font-semibold uppercase bg-emerald-100 text-emerald-700 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> DAG Validated
                    </span>
                    {proposal.isSimulated && (
                      <span className="px-2 py-0.5 rounded text-2xs font-semibold bg-amber-100 text-amber-800">
                        Deterministic Simulation
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-semibold text-slate-900 mt-1">{proposal.name}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{proposal.description}</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    data-testid="btn-save-draft"
                    onClick={() => saveDraftMutation.mutate()}
                    disabled={saveDraftMutation.isPending}
                    className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-semibold flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>{saveDraftMutation.isPending ? "Saving..." : "Save as Draft"}</span>
                  </button>
                </div>
              </div>

              {/* Topology Nodes Grid */}
              <div>
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Proposed Graph Execution Pipeline ({proposal.nodes.length} Nodes)
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  {proposal.nodes.map((node: any, idx: number) => (
                    <div key={node.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-2xs font-semibold font-mono text-indigo-600">Step {idx + 1}</span>
                        <span className="px-1.5 py-0.5 rounded text-2xs font-bold bg-slate-200 text-slate-700">
                          {node.data?.nodeType}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-slate-900 line-clamp-1">{node.data?.label}</p>
                      <p className="text-2xs text-slate-500 line-clamp-2">{node.data?.description || "Configured node step"}</p>
                      {node.data?.integrationKey && (
                        <div className="pt-1 flex items-center gap-1 text-2xs text-indigo-600 font-semibold">
                          <Boxes className="h-3 w-3" />
                          <span>Integration: {node.data.integrationKey}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Requirements & Dependencies */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="rounded-lg border border-slate-200 p-3 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                    <Boxes className="h-4 w-4 text-indigo-600" />
                    <span>Required Connected Accounts</span>
                  </div>
                  {proposal.requiredIntegrations.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {proposal.requiredIntegrations.map((i: string) => (
                        <span key={i} className="px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-2xs font-semibold text-indigo-700 uppercase">
                          {i}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-2xs text-slate-500">No external integrations required.</p>
                  )}
                </div>

                <div className="rounded-lg border border-slate-200 p-3 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                    <Key className="h-4 w-4 text-amber-600" />
                    <span>Required Environment Variables</span>
                  </div>
                  {proposal.requiredVariables.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {proposal.requiredVariables.map((v: string) => (
                        <span key={v} className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-2xs font-mono font-semibold text-amber-800">
                          {v}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-2xs text-slate-500">No scoped environment variables required.</p>
                  )}
                </div>
              </div>

              {/* Suggested Test Cases */}
              {proposal.suggestedTests?.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Synthesized Pre-Deployment Test Cases ({proposal.suggestedTests.length})
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {proposal.suggestedTests.map((tc: any, idx: number) => (
                      <div key={idx} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-900">{tc.name}</span>
                          <span className="text-2xs px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                            {tc.targetScenario}
                          </span>
                        </div>
                        <p className="text-2xs text-slate-500">{tc.description}</p>
                        <div className="pt-1 flex items-center gap-1 text-2xs text-slate-600">
                          <ShieldCheck className="h-3 w-3 text-emerald-600" />
                          <span>{tc.assertions?.length || 0} assertions verified in DRY_RUN</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 3. Conversational Refinement & Diff Section */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4" data-testid="refinement-section">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                  <RefreshCw className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Conversational Refinement</h3>
                  <p className="text-xs text-slate-500">Instruct AI to add filters, conditions, approval gates, or format transformations.</p>
                </div>
              </div>

              <div className="flex gap-2">
                <input
                  data-testid="input-refine-prompt"
                  type="text"
                  value={refinePrompt}
                  onChange={(e) => setRefinePrompt(e.target.value)}
                  placeholder="e.g. Add a condition that ignores leads without a company email"
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600"
                />
                <button
                  data-testid="btn-refine-proposal"
                  onClick={() => refineMutation.mutate(refinePrompt)}
                  disabled={refineMutation.isPending || refinePrompt.trim().length < 5}
                  className="px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", refineMutation.isPending && "animate-spin")} />
                  <span>{refineMutation.isPending ? "Refining..." : "Refine Proposal"}</span>
                </button>
              </div>

              {/* Structural Diff Viewer */}
              {diff && (
                <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-3.5 space-y-2" data-testid="structural-diff-viewer">
                  <div className="flex items-center gap-2 text-xs font-bold text-indigo-900">
                    <GitCompare className="h-4 w-4 text-indigo-600" />
                    <span>Structural Diff: Refinement Applied</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-2xs">
                    <div className="p-2 rounded bg-white border border-indigo-100">
                      <span className="font-semibold text-emerald-700">+{diff.addedNodes?.length || 0} Nodes Added</span>
                      {diff.addedNodes?.map((n: any) => (
                        <p key={n.id} className="text-slate-600 truncate mt-0.5">• {n.label}</p>
                      ))}
                    </div>
                    <div className="p-2 rounded bg-white border border-indigo-100">
                      <span className="font-semibold text-rose-700">-{diff.removedNodes?.length || 0} Nodes Removed</span>
                    </div>
                    <div className="p-2 rounded bg-white border border-indigo-100">
                      <span className="font-semibold text-indigo-700">{diff.modifiedNodes?.length || 0} Nodes Modified</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
