"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { Check, Zap, Sparkles, Building2, ArrowRight, Layers } from "lucide-react";
import { PLANS, PlanDefinition } from "@flowforge/shared";

export default function PricingPage() {
  const { user } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch current subscription if user is logged in
  const { data: subData } = useQuery({
    queryKey: ["subscription-entitlements"],
    queryFn: () => api.billing.getSubscription(),
    enabled: !!user,
  });

  const currentTier = subData?.plan?.tier || "FREE";

  // Checkout mutation
  const checkoutMutation = useMutation({
    mutationFn: (targetPlan: "PRO" | "BUSINESS") => api.billing.createCheckout(targetPlan),
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (err: any) => {
      setErrorMessage(err.message || "Failed to initiate checkout.");
    },
  });

  const handlePlanAction = (tier: string) => {
    setErrorMessage(null);
    if (!user) {
      window.location.href = `/login?redirect=/pricing`;
      return;
    }
    if (tier === currentTier) {
      return;
    }
    if (tier === "PRO" || tier === "BUSINESS") {
      setSelectedPlan(tier);
      checkoutMutation.mutate(tier);
    }
  };

  const plansList: PlanDefinition[] = [PLANS.FREE, PLANS.PRO, PLANS.BUSINESS];

  return (
    <div className="min-h-screen bg-[#F5F7FB] text-slate-900 font-sans relative overflow-x-hidden">
      {/* Decorative ambient background */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-b from-[#6558E8]/10 via-[#22B8CF]/5 to-transparent blur-3xl pointer-events-none" />

      {/* Top Navigation */}
      <header className="border-b border-slate-200/90 bg-white/90 backdrop-blur-md sticky top-0 z-40 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-[#6558E8] to-[#4336BE] flex items-center justify-center text-white shadow-sm shadow-[#6558E8]/25 group-hover:scale-105 transition-transform">
              <Layers className="h-4 w-4" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-base text-slate-900">FlowForge</span>
              <span className="text-[10px] font-semibold text-[#22B8CF] bg-[#22B8CF]/10 border border-[#22B8CF]/20 px-1.5 py-0.2 rounded uppercase">
                Pricing
              </span>
            </div>
          </Link>

          <nav className="flex items-center gap-3">
            {user ? (
              <Link
                href="/dashboard"
                className="text-xs font-semibold px-4 py-2 rounded-xl bg-[#6558E8] text-white hover:bg-[#5345D8] transition-colors shadow-2xs"
              >
                Go to Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors px-2 py-1"
                >
                  Sign In
                </Link>
                <Link
                  href="/register"
                  className="text-xs font-semibold px-4 py-2 rounded-xl bg-[#6558E8] text-white hover:bg-[#5345D8] transition-colors shadow-2xs"
                >
                  Start Free
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <div className="max-w-5xl mx-auto px-4 pt-16 pb-12 text-center relative z-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200/80 text-[#6558E8] text-xs font-semibold mb-4 shadow-2xs">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Simple, transparent pricing for teams of all sizes</span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">
          Automate workflows at scale without surprise bills
        </h1>
        <p className="mt-4 text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
          Choose the plan that fits your growth. Upgrade, downgrade, or cancel anytime with predictable execution quotas.
        </p>

        {errorMessage && (
          <div className="mt-4 p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs max-w-md mx-auto shadow-2xs">
            {errorMessage}
          </div>
        )}
      </div>

      {/* Pricing Cards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
          {plansList.map((p) => {
            const isCurrent = user && currentTier === p.tier;
            const isPopular = p.tier === "PRO";

            return (
              <div
                key={p.tier}
                className={`relative rounded-3xl flex flex-col justify-between p-8 bg-white border transition-all duration-200 ${
                  isPopular
                    ? "border-[#6558E8] shadow-card-hover ring-2 ring-[#6558E8]/20 scale-[1.02]"
                    : "border-slate-200/90 shadow-card hover:shadow-card-hover"
                }`}
              >
                {isPopular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3.5 py-1 rounded-full bg-gradient-to-r from-[#6558E8] to-[#5345D8] text-white text-[10px] font-bold tracking-wider uppercase shadow-md shadow-[#6558E8]/30">
                    Most Popular
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold text-slate-900">{p.name}</h3>
                    {p.tier === "BUSINESS" ? (
                      <div className="h-9 w-9 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 border border-purple-100">
                        <Building2 className="h-5 w-5" />
                      </div>
                    ) : (
                      <div className={`h-9 w-9 rounded-xl flex items-center justify-center border ${
                        isPopular
                          ? "bg-indigo-50 text-[#6558E8] border-indigo-100"
                          : "bg-slate-50 text-slate-500 border-slate-200"
                      }`}>
                        <Zap className="h-5 w-5" />
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-2 min-h-[32px] leading-relaxed">{p.description}</p>

                  <div className="mt-6 flex items-baseline gap-1.5">
                    <span className="text-4xl font-extrabold text-slate-900 tabular-nums">
                      ${p.priceMonthlyCents / 100}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">/ month</span>
                  </div>

                  <hr className="my-6 border-slate-100" />

                  {/* Quotas Summary */}
                  <div className="space-y-2.5 mb-6 text-xs text-slate-700 font-medium">
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Executions / mo</span>
                      <span className="font-semibold text-slate-900 tabular-nums">{p.maxExecutionsPerMonth.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Active Workflows</span>
                      <span className="font-semibold text-slate-900 tabular-nums">{p.maxActiveWorkflows}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Workspace Members</span>
                      <span className="font-semibold text-slate-900 tabular-nums">{p.maxWorkspaceMembers}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Connected Accounts</span>
                      <span className="font-semibold text-slate-900 tabular-nums">{p.maxConnectedAccounts}</span>
                    </div>
                  </div>

                  {/* Highlights List */}
                  <div className="space-y-2.5">
                    <p className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Included Features</p>
                    {p.highlights.map((h, idx) => (
                      <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-600">
                        <Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                        <span>{h}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-8 pt-4 border-t border-slate-100">
                  <button
                    disabled={isCurrent || (checkoutMutation.isPending && selectedPlan === p.tier)}
                    onClick={() => handlePlanAction(p.tier)}
                    className={`w-full py-2.5 px-4 rounded-xl font-semibold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      isCurrent
                        ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
                        : isPopular
                        ? "bg-[#6558E8] text-white hover:bg-[#5345D8] shadow-sm shadow-[#6558E8]/30"
                        : "bg-[#101522] text-white hover:bg-[#171F31]"
                    }`}
                  >
                    {isCurrent ? (
                      "Current Plan"
                    ) : checkoutMutation.isPending && selectedPlan === p.tier ? (
                      "Redirecting..."
                    ) : (
                      <>
                        <span>{p.tier === "FREE" ? "Get Started" : `Upgrade to ${p.name}`}</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Feature Comparison Table */}
        <div className="mt-16 border border-slate-200/90 rounded-3xl bg-white p-8 overflow-x-auto shadow-card">
          <h2 className="text-xl font-bold text-slate-900 mb-6">Detailed Feature Comparison</h2>
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4">Capability</th>
                <th className="py-3.5 px-4">Free</th>
                <th className="py-3.5 px-4">Pro</th>
                <th className="py-3.5 px-4 text-[#6558E8]">Business</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
              <tr>
                <td className="py-3.5 px-4 font-semibold text-slate-900">Visual Node Canvas (React Flow)</td>
                <td className="py-3.5 px-4"><Check className="h-4 w-4 text-emerald-500" /></td>
                <td className="py-3.5 px-4"><Check className="h-4 w-4 text-emerald-500" /></td>
                <td className="py-3.5 px-4"><Check className="h-4 w-4 text-emerald-500" /></td>
              </tr>
              <tr>
                <td className="py-3.5 px-4 font-semibold text-slate-900">OAuth Integrations (Slack, Google, HTTP)</td>
                <td className="py-3.5 px-4"><Check className="h-4 w-4 text-emerald-500" /></td>
                <td className="py-3.5 px-4"><Check className="h-4 w-4 text-emerald-500" /></td>
                <td className="py-3.5 px-4"><Check className="h-4 w-4 text-emerald-500" /></td>
              </tr>
              <tr>
                <td className="py-3.5 px-4 font-semibold text-slate-900">Branching & Conditional Logic</td>
                <td className="py-3.5 px-4 text-slate-400">—</td>
                <td className="py-3.5 px-4"><Check className="h-4 w-4 text-emerald-500" /></td>
                <td className="py-3.5 px-4"><Check className="h-4 w-4 text-emerald-500" /></td>
              </tr>
              <tr>
                <td className="py-3.5 px-4 font-semibold text-slate-900">Array Looping & Data Transformations</td>
                <td className="py-3.5 px-4 text-slate-400">—</td>
                <td className="py-3.5 px-4"><Check className="h-4 w-4 text-emerald-500" /></td>
                <td className="py-3.5 px-4"><Check className="h-4 w-4 text-emerald-500" /></td>
              </tr>
              <tr>
                <td className="py-3.5 px-4 font-semibold text-slate-900">Human-in-the-Loop Approvals</td>
                <td className="py-3.5 px-4 text-slate-400">—</td>
                <td className="py-3.5 px-4 text-slate-400">—</td>
                <td className="py-3.5 px-4"><Check className="h-4 w-4 text-emerald-500" /></td>
              </tr>
              <tr>
                <td className="py-3.5 px-4 font-semibold text-slate-900">Audit Logging & 99.9% SLA</td>
                <td className="py-3.5 px-4 text-slate-400">—</td>
                <td className="py-3.5 px-4 text-slate-400">—</td>
                <td className="py-3.5 px-4"><Check className="h-4 w-4 text-emerald-500" /></td>
              </tr>
              <tr>
                <td className="py-3.5 px-4 font-semibold text-slate-900">Execution Timeout Cap</td>
                <td className="py-3.5 px-4 font-mono">60s</td>
                <td className="py-3.5 px-4 font-mono">300s</td>
                <td className="py-3.5 px-4 font-mono text-[#6558E8] font-bold">900s</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
