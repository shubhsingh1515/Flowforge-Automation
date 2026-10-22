"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { Check, Zap, Sparkles, Building2, ArrowRight, ShieldCheck, HelpCircle } from "lucide-react";
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
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Top Navigation */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold">
              F
            </div>
            <span className="font-bold text-lg text-slate-900">FlowForge</span>
          </Link>

          <nav className="flex items-center gap-4">
            {user ? (
              <Link
                href="/dashboard"
                className="text-xs font-semibold px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition"
              >
                Go to Dashboard
              </Link>
            ) : (
              <>
                <Link href="/login" className="text-xs font-semibold text-slate-600 hover:text-slate-900">
                  Sign In
                </Link>
                <Link
                  href="/register"
                  className="text-xs font-semibold px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition"
                >
                  Start Free
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <div className="max-w-5xl mx-auto px-4 pt-16 pb-12 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold mb-4">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Simple, transparent pricing for teams of all sizes</span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight">
          Automate workflows at scale without surprise bills
        </h1>
        <p className="mt-4 text-base sm:text-lg text-slate-600 max-w-2xl mx-auto">
          Choose the plan that fits your growth. Upgrade, downgrade, or cancel anytime with predictable execution quotas.
        </p>

        {errorMessage && (
          <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs max-w-md mx-auto">
            {errorMessage}
          </div>
        )}
      </div>

      {/* Pricing Cards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
          {plansList.map((p) => {
            const isCurrent = user && currentTier === p.tier;
            const isPopular = p.tier === "PRO";

            return (
              <div
                key={p.tier}
                className={`relative rounded-2xl flex flex-col justify-between p-8 bg-white border transition-all ${
                  isPopular
                    ? "border-indigo-600 shadow-xl ring-2 ring-indigo-600/20"
                    : "border-slate-200 shadow-sm hover:shadow-md"
                }`}
              >
                {isPopular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-indigo-600 text-white text-[11px] font-bold tracking-wide uppercase">
                    Most Popular
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold text-slate-900">{p.name}</h3>
                    {p.tier === "BUSINESS" ? (
                      <Building2 className="h-6 w-6 text-slate-400" />
                    ) : (
                      <Zap className={`h-6 w-6 ${isPopular ? "text-indigo-600" : "text-slate-400"}`} />
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-2 min-h-[32px]">{p.description}</p>

                  <div className="mt-6 flex items-baseline gap-1">
                    <span className="text-4xl font-extrabold text-slate-900">
                      ${p.priceMonthlyCents / 100}
                    </span>
                    <span className="text-xs text-slate-500">/ month</span>
                  </div>

                  <hr className="my-6 border-slate-100" />

                  {/* Quotas Summary */}
                  <div className="space-y-2 mb-6 text-xs text-slate-700 font-medium">
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Executions / mo</span>
                      <span className="font-semibold text-slate-900">{p.maxExecutionsPerMonth.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Active Workflows</span>
                      <span className="font-semibold text-slate-900">{p.maxActiveWorkflows}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Workspace Members</span>
                      <span className="font-semibold text-slate-900">{p.maxWorkspaceMembers}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Connected Accounts</span>
                      <span className="font-semibold text-slate-900">{p.maxConnectedAccounts}</span>
                    </div>
                  </div>

                  {/* Highlights List */}
                  <div className="space-y-2.5">
                    <p className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">Included Features</p>
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
                    className={`w-full py-2.5 px-4 rounded-xl font-semibold text-xs transition flex items-center justify-center gap-2 ${
                      isCurrent
                        ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
                        : isPopular
                        ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
                        : "bg-slate-900 text-white hover:bg-slate-800"
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
        <div className="mt-20 border border-slate-200 rounded-2xl bg-white p-8 overflow-x-auto shadow-sm">
          <h2 className="text-2xl font-bold text-slate-900 mb-6">Detailed Feature Comparison</h2>
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Capability</th>
                <th className="py-3 px-4">Free</th>
                <th className="py-3 px-4">Pro</th>
                <th className="py-3 px-4 text-indigo-600">Business</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              <tr>
                <td className="py-3 px-4 font-semibold text-slate-900">Visual Node Canvas (React Flow)</td>
                <td className="py-3 px-4"><Check className="h-4 w-4 text-emerald-500" /></td>
                <td className="py-3 px-4"><Check className="h-4 w-4 text-emerald-500" /></td>
                <td className="py-3 px-4"><Check className="h-4 w-4 text-emerald-500" /></td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-semibold text-slate-900">OAuth Integrations (Slack, Google, HTTP)</td>
                <td className="py-3 px-4"><Check className="h-4 w-4 text-emerald-500" /></td>
                <td className="py-3 px-4"><Check className="h-4 w-4 text-emerald-500" /></td>
                <td className="py-3 px-4"><Check className="h-4 w-4 text-emerald-500" /></td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-semibold text-slate-900">Branching & Conditional Logic</td>
                <td className="py-3 px-4 text-slate-400">—</td>
                <td className="py-3 px-4"><Check className="h-4 w-4 text-emerald-500" /></td>
                <td className="py-3 px-4"><Check className="h-4 w-4 text-emerald-500" /></td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-semibold text-slate-900">Array Looping & Data Transformations</td>
                <td className="py-3 px-4 text-slate-400">—</td>
                <td className="py-3 px-4"><Check className="h-4 w-4 text-emerald-500" /></td>
                <td className="py-3 px-4"><Check className="h-4 w-4 text-emerald-500" /></td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-semibold text-slate-900">Human-in-the-Loop Approvals</td>
                <td className="py-3 px-4 text-slate-400">—</td>
                <td className="py-3 px-4 text-slate-400">—</td>
                <td className="py-3 px-4"><Check className="h-4 w-4 text-emerald-500" /></td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-semibold text-slate-900">Audit Logging & 99.9% SLA</td>
                <td className="py-3 px-4 text-slate-400">—</td>
                <td className="py-3 px-4 text-slate-400">—</td>
                <td className="py-3 px-4"><Check className="h-4 w-4 text-emerald-500" /></td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-semibold text-slate-900">Execution Timeout Cap</td>
                <td className="py-3 px-4">60s</td>
                <td className="py-3 px-4">300s</td>
                <td className="py-3 px-4">900s</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
