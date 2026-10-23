"use client";

import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import {
  LifeBuoy,
  Download,
  Send,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  MessageSquare,
  Star,
} from "lucide-react";

export function SupportFeedbackTab() {
  const queryClient = useQueryClient();

  // Export Bundle State
  const [bundleNotes, setBundleNotes] = useState("");
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Feedback State
  const [category, setCategory] = useState<"BUG" | "FEATURE_REQUEST" | "USABILITY" | "GENERAL">("GENERAL");
  const [rating, setRating] = useState<number>(5);
  const [comment, setComment] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // Create & download bundle mutation
  const bundleMutation = useMutation({
    mutationFn: async () => {
      const res = await api.support.createBundle({ notes: bundleNotes });
      const payload = await api.support.downloadBundle(res.id);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `flowforge-support-bundle-${res.id.slice(0, 8)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return res;
    },
    onSuccess: (res) => {
      setDownloadSuccess(`Support bundle generated (${res.sizeBytes} bytes) and downloaded.`);
      setDownloadError(null);
      setBundleNotes("");
      setTimeout(() => setDownloadSuccess(null), 5000);
    },
    onError: (err: any) => {
      setDownloadError(err.message || "Failed to generate support diagnostics bundle");
    },
  });

  // Feedback submission mutation
  const feedbackMutation = useMutation({
    mutationFn: (data: any) => api.support.submitFeedback(data),
    onSuccess: (res) => {
      setFeedbackSuccess(res.message || "Feedback submitted successfully!");
      setFeedbackError(null);
      setComment("");
      setTimeout(() => setFeedbackSuccess(null), 5000);
    },
    onError: (err: any) => {
      setFeedbackError(err.message || "Failed to submit feedback");
    },
  });

  const handleFeedbackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment || comment.trim().length < 5) {
      setFeedbackError("Please provide a comment with at least 5 characters.");
      return;
    }
    feedbackMutation.mutate({
      category,
      rating,
      comment: comment.trim(),
      contactEmail: contactEmail.trim() || undefined,
    });
  };

  return (
    <div className="space-y-6 max-w-4xl" data-testid="support-feedback-tab">
      {/* Header */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-2xs">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <LifeBuoy className="h-5 w-5 text-indigo-600" />
              <h3 className="text-base font-bold text-slate-900">
                Customer Support & Self-Service Diagnostics
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              Generate sanitized diagnostic bundles for technical support inquiries or submit feedback directly to the engineering team.
            </p>
          </div>
        </div>
      </div>

      {/* Section 1: Support Bundle Export */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-2xs space-y-4 text-xs">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Download className="h-4 w-4 text-indigo-600" />
              Export Sanitized Support Diagnostics Bundle
            </h4>
            <p className="text-slate-500 mt-0.5">
              Generates an encrypted, secret-scrubbed JSON package containing recent error summaries, workflow metadata, and connection states.
            </p>
          </div>
        </div>

        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3.5 space-y-2">
          <div className="flex items-center gap-2 text-slate-700 font-semibold">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span>Guaranteed Privacy & Secret Scrubbing</span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            All API keys, OAuth tokens, passwords, webhook signing secrets, and SSO client credentials are strictly excluded and replaced with <code className="text-rose-600">[REDACTED]</code> before bundle export.
          </p>
        </div>

        {downloadSuccess && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{downloadSuccess}</span>
          </div>
        )}

        {downloadError && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{downloadError}</span>
          </div>
        )}

        <div>
          <label className="block font-semibold text-slate-700 mb-1">
            Optional Notes for Engineering / Support Case
          </label>
          <input
            type="text"
            placeholder="e.g. Investigating intermittent 429 rate limits on Slack action"
            value={bundleNotes}
            onChange={(e) => setBundleNotes(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-indigo-600 focus:outline-none"
          />
        </div>

        <div className="flex justify-end pt-1">
          <button
            onClick={() => bundleMutation.mutate()}
            disabled={bundleMutation.isPending}
            data-testid="btn-generate-support-bundle"
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-2 shadow-2xs transition disabled:opacity-50"
          >
            {bundleMutation.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            <span>{bundleMutation.isPending ? "Generating Bundle..." : "Download Support Diagnostics Bundle"}</span>
          </button>
        </div>
      </div>

      {/* Section 2: Customer Feedback Submission */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-2xs space-y-4 text-xs">
        <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-indigo-600" />
          Submit Product Feedback or Bug Report
        </h4>
        <p className="text-slate-500">
          Have an idea for a new automation trigger, found an issue, or have a suggestion? Send your feedback directly to the product team.
        </p>

        {feedbackSuccess && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{feedbackSuccess}</span>
          </div>
        )}

        {feedbackError && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{feedbackError}</span>
          </div>
        )}

        <form onSubmit={handleFeedbackSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Feedback Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                data-testid="select-feedback-category"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-indigo-600 focus:outline-none"
              >
                <option value="GENERAL">General Feedback</option>
                <option value="BUG">Report a Defect / Bug</option>
                <option value="FEATURE_REQUEST">Feature / Integration Request</option>
                <option value="USABILITY">Usability & Navigation</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Overall Satisfaction (1–5)</label>
              <div className="flex items-center gap-2 pt-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className="p-1 focus:outline-none"
                  >
                    <Star
                      className={`h-5 w-5 ${
                        star <= rating ? "fill-amber-400 text-amber-400" : "text-slate-300"
                      }`}
                    />
                  </button>
                ))}
                <span className="text-slate-500 font-medium ml-1">{rating} / 5</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Your Comments or Reproduction Steps *</label>
            <textarea
              required
              rows={4}
              placeholder="Describe what happened or the feature you'd like to see..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              data-testid="textarea-feedback-comment"
              className="w-full rounded-lg border border-slate-300 p-3 text-xs focus:border-indigo-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Optional Follow-up Email</label>
            <input
              type="email"
              placeholder="you@company.com"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-indigo-600 focus:outline-none"
            />
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={feedbackMutation.isPending || !comment.trim()}
              data-testid="btn-submit-feedback"
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-2 shadow-2xs transition disabled:opacity-50"
            >
              {feedbackMutation.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              <span>{feedbackMutation.isPending ? "Submitting..." : "Submit Feedback"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
