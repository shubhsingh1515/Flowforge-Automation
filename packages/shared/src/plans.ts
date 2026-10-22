export type PlanTier = "FREE" | "PRO" | "BUSINESS";

export interface PlanFeatures {
  advancedFlowControl: boolean;
  approvalWorkflows: boolean;
  priorityQueue: boolean;
  customWebhooks: boolean;
  sla: boolean;
}

export interface PlanDefinition {
  tier: PlanTier;
  name: string;
  description: string;
  priceMonthlyCents: number;
  currency: string;
  stripePriceId?: string;
  maxExecutionsPerMonth: number;
  maxActiveWorkflows: number;
  maxWorkspaceMembers: number;
  maxConnectedAccounts: number;
  features: PlanFeatures;
  highlights: string[];
}

export const PLANS: Record<PlanTier, PlanDefinition> = {
  FREE: {
    tier: "FREE",
    name: "Free",
    description: "Ideal for individuals starting out with workflow automation.",
    priceMonthlyCents: 0,
    currency: "USD",
    maxExecutionsPerMonth: 100,
    maxActiveWorkflows: 3,
    maxWorkspaceMembers: 2,
    maxConnectedAccounts: 2,
    features: {
      advancedFlowControl: false,
      approvalWorkflows: false,
      priorityQueue: false,
      customWebhooks: false,
      sla: false,
    },
    highlights: [
      "100 workflow executions / month",
      "Up to 3 active workflows",
      "2 connected accounts",
      "Standard execution speed",
      "Community support",
    ],
  },
  PRO: {
    tier: "PRO",
    name: "Pro",
    description: "For professionals and fast-growing teams needing higher scale and power.",
    priceMonthlyCents: 2900, // $29.00
    currency: "USD",
    stripePriceId: process.env.STRIPE_PRICE_PRO || "price_pro_monthly",
    maxExecutionsPerMonth: 10000,
    maxActiveWorkflows: 25,
    maxWorkspaceMembers: 10,
    maxConnectedAccounts: 15,
    features: {
      advancedFlowControl: true,
      approvalWorkflows: false,
      priorityQueue: true,
      customWebhooks: true,
      sla: false,
    },
    highlights: [
      "10,000 workflow executions / month",
      "Up to 25 active workflows",
      "15 connected accounts",
      "10 workspace team members",
      "Branching, Loops & Data Transforms",
      "Priority execution queue",
      "Standard email support",
    ],
  },
  BUSINESS: {
    tier: "BUSINESS",
    name: "Business",
    description: "Enterprise-grade automation with advanced governance and human approvals.",
    priceMonthlyCents: 9900, // $99.00
    currency: "USD",
    stripePriceId: process.env.STRIPE_PRICE_BUSINESS || "price_business_monthly",
    maxExecutionsPerMonth: 100000,
    maxActiveWorkflows: 500,
    maxWorkspaceMembers: 50,
    maxConnectedAccounts: 100,
    features: {
      advancedFlowControl: true,
      approvalWorkflows: true,
      priorityQueue: true,
      customWebhooks: true,
      sla: true,
    },
    highlights: [
      "100,000 workflow executions / month",
      "Unlimited active workflows (500 cap)",
      "100 connected accounts",
      "50 workspace team members",
      "Human-in-the-Loop Approvals",
      "Audit logging & 99.9% uptime SLA",
      "Dedicated account manager",
    ],
  },
};

export function getPlan(tier?: string | null): PlanDefinition {
  if (tier && tier in PLANS) {
    return PLANS[tier as PlanTier];
  }
  return PLANS.FREE;
}

export function getAllPlans(): PlanDefinition[] {
  return [PLANS.FREE, PLANS.PRO, PLANS.BUSINESS];
}
