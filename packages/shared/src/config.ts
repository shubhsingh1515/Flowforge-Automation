/**
 * FlowForge Automation - Global Product Configuration
 * Single source of truth for product branding and metadata.
 */
export const APP_CONFIG = {
  name: "FlowForge Automation",
  tagline: "Custom workflow automation platform inspired by IFTTT, n8n, Make, and Zapier",
  shortName: "FlowForge",
  version: "1.0.0-phase1",
  supportEmail: "support@flowforge.dev",
  copyright: "© 2026 FlowForge Automation Inc. All rights reserved.",
  defaultWorkspaceName: "Personal Workspace",
  apiPrefix: "/api/v1",
  navigation: [
    { label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
    { label: "Workflows", href: "/workflows", icon: "Workflow" },
    { label: "Create Workflow", href: "/workflows/new", icon: "PlusCircle" },
    { label: "Integrations", href: "/integrations", icon: "Boxes" },
    { label: "Connections", href: "/connections", icon: "Link" },
    { label: "Execution History", href: "/executions", icon: "History" },
    { label: "Templates", href: "/templates", icon: "FolderGit2" },
    { label: "Settings", href: "/settings", icon: "Settings" },
  ]
} as const;

export type AppConfig = typeof APP_CONFIG;
