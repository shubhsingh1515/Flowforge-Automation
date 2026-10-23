"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useAuth } from "../context/AuthContext";
import { APP_CONFIG } from "@flowforge/shared";
import {
  Layers,
  ArrowRight,
  Workflow,
  Sparkles,
  ShieldCheck,
  Zap,
  Activity,
  Boxes,
  Radio,
  Database,
  Brain,
  CheckCircle2,
  ChevronDown,
  Terminal,
  Lock,
  GitBranch,
  History,
  FileCheck,
  Server,
  Code2,
  Copy,
  Check,
  BarChart3,
  ExternalLink,
} from "lucide-react";
import { cn } from "../lib/utils";

export default function LandingPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"canvas" | "executions" | "events" | "intelligence" | "operations">("canvas");
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [copiedCode, setCopiedCode] = useState(false);

  const sdkCodeSnippet = `import { FlowForgeClient } from "@flowforge/sdk";

// Initialize client with tenant credentials
const client = new FlowForgeClient({
  baseUrl: "https://api.flowforge.internal/api/v1",
  apiKey: process.env.FLOWFORGE_API_KEY,
  workspaceId: "ws_prod_enterprise_01",
});

// Trigger a governed workflow execution
const execution = await client.workflows.trigger("wf_lead_enrichment", {
  leadId: "lead_9841",
  email: "executive@enterprise.com",
  tier: "ENTERPRISE",
});

console.log("Execution initiated with ID:", execution.id);`;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(sdkCodeSnippet);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const faqs = [
    {
      q: "How does FlowForge ensure tenant data isolation?",
      a: "Every workspace operates in strict tenant isolation. Workflow graphs, execution telemetry, credential secrets, event streams, and audit trails are scoped to the workspace ID, enforced by server-authoritative middleware and database row-level guarantees.",
    },
    {
      q: "What makes the execution engine reliable under high volume?",
      a: "FlowForge utilizes an asynchronous distributed worker architecture powered by BullMQ and Redis, featuring idempotent step checkpoints, transactional outbox pattern delivery, automatic exponential backoff, and dead-letter queues (DLQ) for failed jobs.",
    },
    {
      q: "Can we test workflows before activating them in production?",
      a: "Yes. FlowForge features an integrated Digital Twin and simulation workbench. You can dry-run workflows with sample payloads, inspect step-by-step state transitions, test error recovery paths, and conduct safe chaos resilience evaluations without mutating live systems.",
    },
    {
      q: "How are sensitive credentials and API tokens protected?",
      a: "Third-party tokens, OAuth secrets, and API credentials are encrypted at rest using AES-256-GCM. Credential values are never stored in plain text and are strictly redacted from client-facing execution logs and trace outputs.",
    },
    {
      q: "Does FlowForge support human-in-the-loop approvals?",
      a: "Yes. Workflows can include designated approval gates that pause execution until authorized workspace members approve or reject the request via the in-app Approvals console or automated webhook notifications.",
    },
    {
      q: "Can we integrate FlowForge with custom enterprise backends?",
      a: "FlowForge provides bidirectional connectivity: trigger workflows via custom webhooks, subscribe to the Event-Driven Integration Fabric, query real-time execution states via our OpenAPI-compliant REST APIs, or integrate directly using the official TypeScript SDK.",
    },
  ];

  return (
    <div className="min-h-screen bg-[#F5F7FB] text-slate-900 font-sans antialiased selection:bg-[#6558E8]/20">
      {/* =========================================================================
          1. PUBLIC NAVIGATION HEADER
         ========================================================================= */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#6558E8] to-[#4336BE] text-white shadow-md shadow-[#6558E8]/30">
              <Layers className="h-5 w-5 text-white" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-base font-bold tracking-tight text-slate-900">
                  {APP_CONFIG.shortName}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6558E8] bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded">
                  Platform
                </span>
              </div>
              <span className="text-[10px] text-slate-500 font-medium">Enterprise Automation SaaS</span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-600">
            <a href="#showcase" className="hover:text-[#6558E8] transition-colors">Product</a>
            <a href="#capabilities" className="hover:text-[#6558E8] transition-colors">Capabilities</a>
            <a href="#how-it-works" className="hover:text-[#6558E8] transition-colors">How It Works</a>
            <a href="#use-cases" className="hover:text-[#6558E8] transition-colors">Solutions</a>
            <a href="#developers" className="hover:text-[#6558E8] transition-colors">Developers</a>
            <a href="#security" className="hover:text-[#6558E8] transition-colors">Security</a>
            <Link href="/pricing" className="hover:text-[#6558E8] transition-colors">Pricing</Link>
            <Link href="/status" className="hover:text-[#6558E8] transition-colors">Status</Link>
          </nav>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-3">
            {user ? (
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-xl bg-[#6558E8] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#5345D8] transition-all"
              >
                <span>Console Dashboard</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="hidden sm:inline-flex rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href="/register"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#6558E8] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#5345D8] transition-all"
                >
                  <span>Get Started</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* =========================================================================
          2. HERO SECTION
         ========================================================================= */}
      <section className="relative overflow-hidden pt-12 pb-20 sm:pt-20 sm:pb-28">
        {/* Subtle Atmospheric Gradient Blobs */}
        <div className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-96 w-96 -translate-x-1/2 rounded-full bg-gradient-to-tr from-indigo-300/30 to-cyan-200/30 blur-3xl" />

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          {/* Eyebrow Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white px-3.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
            <span>Enterprise Automation Fabric v25.0</span>
            <span className="text-slate-300">|</span>
            <span className="text-[#6558E8]">Production Ready</span>
          </div>

          {/* Primary Headline */}
          <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-6xl sm:leading-tight max-w-4xl mx-auto">
            Automate workflows. <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-[#6558E8] via-[#4F46E5] to-[#22B8CF] bg-clip-text text-transparent">
              Orchestrate your business.
            </span>{" "}
            Stay in control.
          </h1>

          {/* Supporting Copy */}
          <p className="mt-6 text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Connect your tools, coordinate complex business processes, and gain visibility into every execution with governed automation built for growing teams and enterprise operations.
          </p>

          {/* Action CTAs */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href={user ? "/dashboard" : "/register"}
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-[#6558E8] px-6 py-3 text-sm font-semibold text-white shadow-md shadow-[#6558E8]/25 hover:bg-[#5345D8] transition-all"
            >
              <span>{user ? "Open Console Dashboard" : "Get Started Free"}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>

            <a
              href="#showcase"
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-all"
            >
              <span>Explore Platform</span>
            </a>
          </div>

          {/* Trust Highlights */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-xs font-semibold text-slate-500">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Tenant Isolated Workspaces
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Idempotent Checkpoint Recovery
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              AES-256-GCM Credential Encryption
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Immutable Release Controls
            </span>
          </div>
        </div>
      </section>

      {/* =========================================================================
          3. PRODUCT SHOWCASE (Interactive Studio Previews)
         ========================================================================= */}
      <section id="showcase" className="py-16 sm:py-24 border-t border-slate-200/80 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#6558E8]">Platform Showcase</h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Engineered for operational clarity
            </p>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">
              Experience the power of a modern visual workflow engine combined with deterministic execution tracing and event governance.
            </p>
          </div>

          {/* Interactive Preview Tabs */}
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {[
              { id: "canvas", label: "Workflow Studio", icon: Workflow },
              { id: "executions", label: "Execution Tracing", icon: History },
              { id: "events", label: "Event Fabric", icon: Radio },
              { id: "intelligence", label: "AI Decisioning", icon: Brain },
              { id: "operations", label: "Operations Health", icon: Activity },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all",
                    activeTab === tab.id
                      ? "bg-[#101522] text-white shadow-md shadow-slate-900/10"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Showcase Container Window */}
          <div className="mt-8 rounded-3xl border border-slate-200/90 bg-[#101522] p-4 sm:p-6 shadow-2xl text-slate-200">
            {/* Window Chrome */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-5">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-rose-500/80" />
                <span className="h-3 w-3 rounded-full bg-amber-500/80" />
                <span className="h-3 w-3 rounded-full bg-emerald-500/80" />
                <span className="ml-3 font-mono text-xs text-slate-400">
                  flowforge.console // {activeTab.toUpperCase()}
                </span>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/70 border border-emerald-500/30 px-2 py-0.5 rounded">
                LIVE DEMO ENVIRONMENT
              </span>
            </div>

            {/* Tab 1: Workflow Studio */}
            {activeTab === "canvas" && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 bg-[#171F31] p-3 rounded-xl border border-white/5">
                  <div className="flex items-center gap-2.5">
                    <span className="font-bold text-white text-xs">Customer_Onboarding_Pipeline</span>
                    <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.2 rounded">
                      ACTIVE v3.1
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-400">Validation:</span>
                    <span className="text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Graph Valid (5 Nodes)
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-xl bg-[#171F31] border border-white/10 p-4 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-amber-400 font-semibold">1. Webhook Trigger</span>
                      <Zap className="h-3.5 w-3.5 text-amber-400" />
                    </div>
                    <p className="text-[11px] text-slate-400">Inbound event payload validation & schema check</p>
                  </div>
                  <div className="rounded-xl bg-[#171F31] border border-white/10 p-4 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-cyan-400 font-semibold">2. CRM Enrichment</span>
                      <Boxes className="h-3.5 w-3.5 text-cyan-400" />
                    </div>
                    <p className="text-[11px] text-slate-400">HubSpot & Salesforce contact synchronization</p>
                  </div>
                  <div className="rounded-xl bg-[#171F31] border border-white/10 p-4 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-emerald-400 font-semibold">3. Slack Alert & Log</span>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    </div>
                    <p className="text-[11px] text-slate-400">Deterministic outbox dispatch to #deal-desk</p>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Execution Tracing */}
            {activeTab === "executions" && (
              <div className="space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between bg-[#171F31] p-3 rounded-xl border border-white/5">
                  <span className="text-slate-300">exec_89412_prod // Duration: 420ms</span>
                  <span className="text-emerald-400 font-bold">STATUS: COMPLETED</span>
                </div>
                <div className="rounded-xl bg-slate-950 p-4 border border-white/5 space-y-1.5 text-[11px] text-slate-300">
                  <p className="text-slate-500">[2026-10-23T22:14:02.102Z] → Inbound webhook received with valid HMAC seal</p>
                  <p className="text-slate-500">[2026-10-23T22:14:02.140Z] → Step 1 (Trigger): Executed in 38ms (State saved)</p>
                  <p className="text-slate-500">[2026-10-23T22:14:02.260Z] → Step 2 (CRM Sync): Idempotent checkpoint committed</p>
                  <p className="text-emerald-400 font-semibold">[2026-10-23T22:14:02.522Z] ✓ All 5 steps completed successfully with zero retries.</p>
                </div>
              </div>
            )}

            {/* Tab 3: Event Fabric */}
            {activeTab === "events" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl bg-[#171F31] border border-white/10 p-4 space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase">Registered Topics</span>
                  <p className="text-xl font-bold text-white">24</p>
                  <p className="text-[10px] text-emerald-400">100% schema compatible</p>
                </div>
                <div className="rounded-xl bg-[#171F31] border border-white/10 p-4 space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase">24h Event Volume</span>
                  <p className="text-xl font-bold text-white">1,482,900</p>
                  <p className="text-[10px] text-cyan-400">Avg delivery latency: 18ms</p>
                </div>
                <div className="rounded-xl bg-[#171F31] border border-white/10 p-4 space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase">Dead Letter Queue</span>
                  <p className="text-xl font-bold text-emerald-400">0 Pending</p>
                  <p className="text-[10px] text-slate-400">Safe replay engine active</p>
                </div>
              </div>
            )}

            {/* Tab 4: AI Decisioning */}
            {activeTab === "intelligence" && (
              <div className="space-y-3">
                <div className="rounded-xl bg-[#171F31] border border-white/10 p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-indigo-400">Proposal #418: Rate Limiting Adaptation</span>
                    <span className="bg-amber-500/20 text-amber-300 text-[10px] px-2 py-0.5 rounded font-semibold">
                      APPROVAL_REQUIRED
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Evidence shows 14% latency increase on third-party webhook destination. Proposed mitigation: increase worker batch delay to 250ms.
                  </p>
                  <div className="flex items-center gap-3 pt-2 text-[11px] text-slate-400">
                    <span>Evidence Confidence: 94%</span>
                    <span>Policy Check: Passed</span>
                    <span>Deterministic Execution: Enabled</span>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 5: Operations Health */}
            {activeTab === "operations" && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="rounded-xl bg-[#171F31] border border-white/10 p-3 text-center">
                  <span className="text-[10px] text-slate-400">System SLO</span>
                  <p className="text-xl font-bold text-emerald-400">99.98%</p>
                  <span className="text-[10px] text-emerald-500">Error Budget: Healthy</span>
                </div>
                <div className="rounded-xl bg-[#171F31] border border-white/10 p-3 text-center">
                  <span className="text-[10px] text-slate-400">Worker Queues</span>
                  <p className="text-xl font-bold text-white">4 Active</p>
                  <span className="text-[10px] text-cyan-400">0 backlogged</span>
                </div>
                <div className="rounded-xl bg-[#171F31] border border-white/10 p-3 text-center">
                  <span className="text-[10px] text-slate-400">Database & Redis</span>
                  <p className="text-xl font-bold text-emerald-400">Optimal</p>
                  <span className="text-[10px] text-slate-400">Replica sync: 2ms</span>
                </div>
                <div className="rounded-xl bg-[#171F31] border border-white/10 p-3 text-center">
                  <span className="text-[10px] text-slate-400">Autonomy Mode</span>
                  <p className="text-xl font-bold text-cyan-400">SAFE</p>
                  <span className="text-[10px] text-slate-400">Policy Guardrails Active</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* =========================================================================
          4. CORE PLATFORM CAPABILITIES (Grid)
         ========================================================================= */}
      <section id="capabilities" className="py-16 sm:py-24 bg-[#F5F7FB]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#6558E8]">Core Capabilities</h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Everything required for mission-critical automation
            </p>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">
              From visual drag-and-drop authoring to event streaming and enterprise governance, FlowForge unites all automation capabilities in one cohesive platform.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Workflow,
                title: "Visual Workflow Studio",
                desc: "Intuitive node canvas with conditional branching, parallel executions, loops, sub-workflows, and real-time graph validation.",
              },
              {
                icon: Boxes,
                title: "Certified Connectors & OAuth",
                desc: "Pre-integrated connectors for Slack, GitHub, SendGrid, webhooks, and REST APIs with secure credential lifecycle management.",
              },
              {
                icon: Radio,
                title: "Event-Driven Integration Fabric",
                desc: "Real-time event schema registry, subscription routing, high-throughput delivery, automatic retries, and dead-letter queue (DLQ) replay.",
              },
              {
                icon: Database,
                title: "Governed Data Products & Lineage",
                desc: "Transform operational telemetry into reusable, trustworthy data assets with end-to-end provenance and data quality validation.",
              },
              {
                icon: Brain,
                title: "Evidence-Grounded AI Intelligence",
                desc: "Predictive execution forecasting, bottleneck anomaly detection, and policy-governed recommendations with human-in-the-loop approvals.",
              },
              {
                icon: ShieldCheck,
                title: "Enterprise Governance & Audit",
                desc: "Immutable workflow releases, cryptographic execution seals, detailed audit logging, role-based access control, and data retention policies.",
              },
            ].map((cap, i) => {
              const Icon = cap.icon;
              return (
                <div
                  key={i}
                  className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-card hover:shadow-card-hover transition-all duration-200 space-y-3"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 border border-indigo-100 text-[#6558E8]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900">{cap.title}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">{cap.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* =========================================================================
          5. HOW IT WORKS (4 Step Visual Flow)
         ========================================================================= */}
      <section id="how-it-works" className="py-16 sm:py-24 border-t border-slate-200/80 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#6558E8]">Workflow Lifecycle</h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              From concept to resilient production in four steps
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                step: "01",
                title: "Connect Systems",
                desc: "Configure authenticated connections via OAuth 2.0 or encrypted API keys with zero secret leakage.",
              },
              {
                step: "02",
                title: "Author Graph",
                desc: "Compose triggers, logic, transformations, and human approval gates using the visual canvas or AI prompt builder.",
              },
              {
                step: "03",
                title: "Simulate & Validate",
                desc: "Run deterministic tests using the Digital Twin workbench to verify edge cases and failure behaviors safely.",
              },
              {
                step: "04",
                title: "Deploy & Monitor",
                desc: "Promote to immutable releases and monitor live executions, latencies, and SLA health in real-time.",
              },
            ].map((s) => (
              <div key={s.step} className="rounded-2xl border border-slate-200/90 bg-[#F5F7FB] p-6 space-y-3 relative">
                <span className="font-mono text-2xl font-bold text-[#6558E8]">{s.step}</span>
                <h3 className="text-sm font-bold text-slate-900">{s.title}</h3>
                <p className="text-xs text-slate-600 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* =========================================================================
          6. REAL ENTERPRISE USE CASES
         ========================================================================= */}
      <section id="use-cases" className="py-16 sm:py-24 bg-[#F5F7FB]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#6558E8]">Solutions & Use Cases</h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Built for technical teams with complex workflows
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: "Multi-System Data Synchronization",
                desc: "Keep records synchronized across CRM, billing, and databases with guaranteed idempotency and conflict resolution.",
              },
              {
                title: "Lead-to-Cash Automation",
                desc: "Enrich new customer leads, create billing accounts, and notify sales engineering via automated Slack and webhook triggers.",
              },
              {
                title: "Incident Remediation & Recovery",
                desc: "Listen for production alert webhooks, evaluate severity, and execute automated diagnostic playbooks under policy supervision.",
              },
              {
                title: "Event Fabric & DLQ Management",
                desc: "Reliably route millions of asynchronous events across distributed services with automatic retry and dead-letter replay.",
              },
              {
                title: "Governed Approval Operations",
                desc: "Gate high-stakes database mutations or financial adjustments behind multi-factor authorized approvals.",
              },
              {
                title: "Continuous Data Quality Pipelines",
                desc: "Validate batch telemetry against defined quality thresholds and alert data engineering when anomalies arise.",
              },
            ].map((uc, idx) => (
              <div key={idx} className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-card space-y-2.5">
                <h3 className="text-sm font-bold text-slate-900">{uc.title}</h3>
                <p className="text-xs text-slate-600 leading-relaxed">{uc.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* =========================================================================
          7. ENTERPRISE TRUST & SECURITY
         ========================================================================= */}
      <section id="security" className="py-16 sm:py-24 border-t border-slate-200/80 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#6558E8]">Enterprise Security</h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Security and governance built into every layer
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200/90 bg-[#F5F7FB] p-5 space-y-2">
              <Lock className="h-5 w-5 text-[#6558E8]" />
              <h3 className="text-xs font-bold text-slate-900">AES-256-GCM Encryption</h3>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                All credentials, tokens, and OAuth keys encrypted at rest with envelope key management.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200/90 bg-[#F5F7FB] p-5 space-y-2">
              <ShieldCheck className="h-5 w-5 text-[#6558E8]" />
              <h3 className="text-xs font-bold text-slate-900">Tenant Isolation & RBAC</h3>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Strict workspace isolation, granular API scopes, and role-based permissions (Owner, Admin, Member).
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200/90 bg-[#F5F7FB] p-5 space-y-2">
              <FileCheck className="h-5 w-5 text-[#6558E8]" />
              <h3 className="text-xs font-bold text-slate-900">Cryptographic Audit Logs</h3>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Immutable audit trails documenting every configuration change, release promotion, and approval.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200/90 bg-[#F5F7FB] p-5 space-y-2">
              <Server className="h-5 w-5 text-[#6558E8]" />
              <h3 className="text-xs font-bold text-slate-900">Regional Data Residency</h3>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Multi-region data routing rules with GDPR/CCPA compliance and automated legal hold capabilities.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          8. DEVELOPERS & SDK SECTION
         ========================================================================= */}
      <section id="developers" className="py-16 sm:py-24 bg-[#101522] text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-400">
                <Terminal className="h-3.5 w-3.5" />
                <span>Developer Platform & SDK</span>
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Automate via code with full API & SDK control
              </h2>
              <p className="text-sm text-slate-400 leading-relaxed">
                FlowForge exposes its entire engine via OpenAPI-compliant REST APIs and a first-class TypeScript SDK. Trigger executions, register event listeners, manage immutable releases, and query audit logs programmatically.
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <a
                  href="http://localhost:4000/api/v1/docs"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#6558E8] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#5345D8] transition-all"
                >
                  <Code2 className="h-4 w-4" />
                  <span>Interactive OpenAPI Docs</span>
                </a>
                <Link
                  href="/settings"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#171F31] px-4 py-2.5 text-xs font-semibold text-slate-300 hover:text-white hover:bg-[#24304A] transition-all"
                >
                  <Zap className="h-4 w-4 text-amber-400" />
                  <span>Generate API Keys</span>
                </Link>
              </div>
            </div>

            {/* Code Snippet Box */}
            <div className="rounded-2xl border border-white/10 bg-[#0B0F19] overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/10 bg-[#171F31] px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-slate-600" />
                  <span className="font-mono text-xs text-slate-300">workflow-trigger.ts</span>
                </div>
                <button
                  onClick={handleCopyCode}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#101522] px-2 py-1 text-[11px] font-medium text-slate-300 hover:text-white transition-colors"
                >
                  {copiedCode ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3 text-slate-400" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="p-4 text-xs font-mono text-indigo-300 overflow-x-auto leading-relaxed">
                <code>{sdkCodeSnippet}</code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          9. TRANSPARENT PRICING
         ========================================================================= */}
      <section id="pricing" className="py-16 sm:py-24 bg-[#F5F7FB]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#6558E8]">Plans & Pricing</h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Transparent, server-authoritative tiers
            </p>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">
              Scale from early developer automation to multi-region enterprise operations with predictable pricing.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3 max-w-5xl mx-auto">
            {/* Free Developer */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-card space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Developer</h3>
                <p className="text-xs text-slate-500">For prototyping and small workflows</p>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-slate-900">$0</span>
                <span className="text-xs text-slate-400">/month</span>
              </div>
              <ul className="space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-4">
                <li className="flex items-center gap-2">✓ 1,000 executions / month</li>
                <li className="flex items-center gap-2">✓ 5 active workflows</li>
                <li className="flex items-center gap-2">✓ Community integrations</li>
                <li className="flex items-center gap-2">✓ 7-day log retention</li>
              </ul>
              <Link
                href="/register"
                className="block text-center rounded-xl border border-slate-300 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Start Free
              </Link>
            </div>

            {/* Team Tier (Featured) */}
            <div className="rounded-2xl border-2 border-[#6558E8] bg-white p-6 shadow-xl space-y-4 relative">
              <span className="absolute -top-3 right-6 rounded-full bg-[#6558E8] px-3 py-0.5 text-[10px] font-bold text-white shadow-sm">
                MOST POPULAR
              </span>
              <div>
                <h3 className="text-base font-bold text-slate-900">Team</h3>
                <p className="text-xs text-slate-500">For scaling SaaS businesses</p>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-slate-900">$49</span>
                <span className="text-xs text-slate-400">/month</span>
              </div>
              <ul className="space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-4">
                <li className="flex items-center gap-2">✓ 50,000 executions / month</li>
                <li className="flex items-center gap-2">✓ Unlimited active workflows</li>
                <li className="flex items-center gap-2">✓ Event Fabric & Webhooks</li>
                <li className="flex items-center gap-2">✓ Human approval gates</li>
                <li className="flex items-center gap-2">✓ 30-day log retention</li>
              </ul>
              <Link
                href="/register"
                className="block text-center rounded-xl bg-[#6558E8] py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#5345D8] transition-colors"
              >
                Upgrade to Team
              </Link>
            </div>

            {/* Enterprise Tier */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-card space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Enterprise</h3>
                <p className="text-xs text-slate-500">For mission-critical operations</p>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-slate-900">$199</span>
                <span className="text-xs text-slate-400">/month</span>
              </div>
              <ul className="space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-4">
                <li className="flex items-center gap-2">✓ 1,000,000+ executions / month</li>
                <li className="flex items-center gap-2">✓ Digital Twin & Chaos workbench</li>
                <li className="flex items-center gap-2">✓ AI Intelligence & Process mining</li>
                <li className="flex items-center gap-2">✓ SSO (SAML/OIDC) & SCIM</li>
                <li className="flex items-center gap-2">✓ 365-day audit retention & SLA</li>
              </ul>
              <Link
                href="/pricing"
                className="block text-center rounded-xl border border-slate-300 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                View Full Entitlements
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          10. FREQUENTLY ASKED QUESTIONS (FAQ Accordion)
         ========================================================================= */}
      <section className="py-16 sm:py-24 border-t border-slate-200/80 bg-white">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#6558E8]">Frequently Asked Questions</h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
              Clear answers to architectural questions
            </p>
          </div>

          <div className="mt-10 divide-y divide-slate-200/80">
            {faqs.map((faq, i) => {
              const isOpen = openFaq === i;
              return (
                <div key={i} className="py-4">
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    className="flex w-full items-center justify-between text-left text-sm font-semibold text-slate-900 hover:text-[#6558E8] transition-colors"
                  >
                    <span>{faq.q}</span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 text-slate-400 shrink-0 transition-transform duration-200",
                        isOpen && "rotate-180 text-[#6558E8]"
                      )}
                    />
                  </button>
                  {isOpen && (
                    <p className="mt-2.5 text-xs text-slate-600 leading-relaxed animate-fade-in">
                      {faq.a}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* =========================================================================
          11. FINAL CALL TO ACTION
         ========================================================================= */}
      <section className="py-16 sm:py-20 bg-gradient-to-br from-[#101522] to-[#171F31] text-white text-center">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 space-y-5">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Start automating with enterprise confidence
          </h2>
          <p className="text-sm text-slate-400 max-w-xl mx-auto leading-relaxed">
            Create workflows, connect your systems, and simulate execution behavior with zero risk to production.
          </p>
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href={user ? "/dashboard" : "/register"}
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-[#6558E8] px-6 py-3 text-sm font-semibold text-white shadow-md shadow-[#6558E8]/30 hover:bg-[#5345D8] transition-all"
            >
              <span>{user ? "Open Console Dashboard" : "Create Free Account"}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-300 hover:text-white hover:bg-white/10 transition-all"
            >
              <span>Explore Plans</span>
            </Link>
          </div>
        </div>
      </section>

      {/* =========================================================================
          12. PUBLIC FOOTER
         ========================================================================= */}
      <footer className="border-t border-slate-200/80 bg-white py-12 text-xs text-slate-500">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#6558E8] text-white">
                  <Layers className="h-4 w-4" />
                </div>
                <span className="font-bold text-slate-900">{APP_CONFIG.shortName}</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Enterprise workflow automation and governed orchestration platform.
              </p>
            </div>

            <div className="space-y-2">
              <p className="font-bold uppercase tracking-wider text-slate-900 text-[10px]">Product</p>
              <ul className="space-y-1.5">
                <li><Link href="/workflows" className="hover:text-slate-900 transition-colors">Workflows</Link></li>
                <li><Link href="/templates" className="hover:text-slate-900 transition-colors">Templates</Link></li>
                <li><Link href="/integrations" className="hover:text-slate-900 transition-colors">Integrations</Link></li>
                <li><Link href="/marketplace" className="hover:text-slate-900 transition-colors">Marketplace</Link></li>
              </ul>
            </div>

            <div className="space-y-2">
              <p className="font-bold uppercase tracking-wider text-slate-900 text-[10px]">Resources</p>
              <ul className="space-y-1.5">
                <li><a href="http://localhost:4000/api/v1/docs" target="_blank" rel="noreferrer" className="hover:text-slate-900 transition-colors">OpenAPI Reference</a></li>
                <li><Link href="/pricing" className="hover:text-slate-900 transition-colors">Pricing</Link></li>
                <li><Link href="/status" className="hover:text-slate-900 transition-colors">System Status</Link></li>
                <li><Link href="/settings" className="hover:text-slate-900 transition-colors">Security Settings</Link></li>
              </ul>
            </div>

            <div className="space-y-2">
              <p className="font-bold uppercase tracking-wider text-slate-900 text-[10px]">Account</p>
              <ul className="space-y-1.5">
                <li><Link href="/login" className="hover:text-slate-900 transition-colors">Sign In</Link></li>
                <li><Link href="/register" className="hover:text-slate-900 transition-colors">Register</Link></li>
                <li><Link href="/dashboard" className="hover:text-slate-900 transition-colors">Console Dashboard</Link></li>
              </ul>
            </div>
          </div>

          <div className="mt-8 border-t border-slate-100 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-400">
            <p>© {new Date().getFullYear()} FlowForge Automation SaaS. All rights reserved.</p>
            <p>Protected by tenant isolation, cryptographic logs, and AES-256-GCM encryption.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
