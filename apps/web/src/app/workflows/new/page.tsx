"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { WorkflowEditor } from "../../../components/canvas/WorkflowEditor";
import { api } from "../../../lib/api";

export default function NewWorkflowPage() {
  const router = useRouter();

  // Initial default starter graph with a Trigger node
  const defaultStarter = {
    name: "New Automation Flow",
    description: "Describe what this automation will do...",
    status: "DRAFT" as const,
    nodes: [
      {
        id: "node_trigger_1",
        type: "custom",
        position: { x: 150, y: 150 },
        data: {
          label: "Webhook Trigger",
          description: "Incoming HTTP request receiver",
          nodeType: "TRIGGER",
          integrationKey: "webhook",
          config: { method: "POST", path: "/hook" },
          isValid: true,
          status: "configured",
        },
      },
    ],
    edges: [],
  };

  const handleSave = async (data: any) => {
    const res = await api.workflows.create(data);
    if (res?.workflow?.id) {
      router.push(`/workflows/${res.workflow.id}`);
    }
    return res;
  };

  return <WorkflowEditor initialWorkflow={defaultStarter} onSave={handleSave} />;
}
