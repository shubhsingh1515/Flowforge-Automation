"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { WorkflowEditor } from "../../../components/canvas/WorkflowEditor";
import { api } from "../../../lib/api";

export default function EditWorkflowPage() {
  const params = useParams();
  const id = params.id as string;
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["workflow", id],
    queryFn: () => api.workflows.get(id),
  });

  const saveMutation = useMutation({
    mutationFn: (workflowData: any) => api.workflows.update(id, workflowData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflow", id] });
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-indigo-600 border-t-transparent" />
          <p className="text-xs text-slate-500 font-medium">Loading workflow canvas...</p>
        </div>
      </div>
    );
  }

  if (error || !data?.workflow) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50 p-6">
        <div className="rounded-xl border border-rose-200 bg-white p-8 text-center max-w-md shadow-sm">
          <h2 className="text-base font-bold text-slate-900">Workflow Not Found</h2>
          <p className="mt-2 text-xs text-slate-500">
            This workflow could not be found or you do not have permission to view it.
          </p>
          <a
            href="/workflows"
            className="mt-5 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white"
          >
            Back to Workflows
          </a>
        </div>
      </div>
    );
  }

  return (
    <WorkflowEditor
      initialWorkflow={data.workflow}
      onSave={async (updatedData) => {
        await saveMutation.mutateAsync(updatedData);
      }}
    />
  );
}
