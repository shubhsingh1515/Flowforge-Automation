import { prisma } from "@flowforge/database";

export class OnboardingService {
  /**
   * Get the current onboarding progress for a workspace, dynamically aggregating
   * both persisted progress flags and live database milestones.
   */
  async getProgress(workspaceId: string) {
    let record = await prisma.workspaceOnboarding.findUnique({
      where: { workspaceId },
    });

    if (!record) {
      record = await prisma.workspaceOnboarding.create({
        data: { workspaceId },
      });
    }

    // Check live database state
    const [totalWorkflows, activeWorkflows, executionsCount, connectionsCount, membersCount] =
      await Promise.all([
        prisma.workflow.count({ where: { workspaceId } }),
        prisma.workflow.count({ where: { workspaceId, status: "ACTIVE" } }),
        prisma.workflowExecution.count({ where: { workflow: { workspaceId } } }),
        prisma.connectedAccount.count({ where: { workspaceId } }),
        prisma.workspaceMembership.count({ where: { workspaceId } }),
      ]);

    const hasCreatedWorkflow = record.hasCreatedWorkflow || totalWorkflows > 0;
    const hasActivatedWorkflow = record.hasActivatedWorkflow || activeWorkflows > 0;
    const hasTestedWorkflow = record.hasTestedWorkflow || executionsCount > 0;
    const hasConnectedAccount = record.hasConnectedAccount || connectionsCount > 0;
    const hasInvitedMember = record.hasInvitedMember || membersCount > 1;
    const hasUsedTemplate = record.hasUsedTemplate;

    // Persist if any auto-detected state changed
    if (
      hasCreatedWorkflow !== record.hasCreatedWorkflow ||
      hasActivatedWorkflow !== record.hasActivatedWorkflow ||
      hasTestedWorkflow !== record.hasTestedWorkflow ||
      hasConnectedAccount !== record.hasConnectedAccount ||
      hasInvitedMember !== record.hasInvitedMember
    ) {
      record = await prisma.workspaceOnboarding.update({
        where: { workspaceId },
        data: {
          hasCreatedWorkflow,
          hasActivatedWorkflow,
          hasTestedWorkflow,
          hasConnectedAccount,
          hasInvitedMember,
        },
      });
    }

    const steps = [
      { id: "create_workflow", title: "Create your first workflow", completed: hasCreatedWorkflow, href: "/workflows/new" },
      { id: "use_template", title: "Explore and instantiate a template", completed: hasUsedTemplate, href: "/templates" },
      { id: "test_workflow", title: "Run a test execution in canvas", completed: hasTestedWorkflow, href: "/workflows" },
      { id: "connect_account", title: "Connect an external app account", completed: hasConnectedAccount, href: "/integrations" },
      { id: "activate_workflow", title: "Activate a workflow pipeline", completed: hasActivatedWorkflow, href: "/workflows" },
      { id: "invite_member", title: "Invite a team collaborator", completed: hasInvitedMember, href: "/settings?tab=members" },
    ];

    const completedSteps = steps.filter((s) => s.completed).length;
    const completionPercentage = Math.round((completedSteps / steps.length) * 100);

    return {
      workspaceId,
      dismissed: record.dismissed,
      completedSteps,
      totalSteps: steps.length,
      completionPercentage,
      isComplete: completedSteps === steps.length,
      steps,
    };
  }

  /**
   * Update onboarding settings (e.g. dismiss guide banner).
   */
  async updateProgress(
    workspaceId: string,
    updates: {
      dismissed?: boolean;
      hasUsedTemplate?: boolean;
      hasTestedWorkflow?: boolean;
    }
  ) {
    const record = await prisma.workspaceOnboarding.upsert({
      where: { workspaceId },
      update: updates,
      create: { workspaceId, ...updates },
    });

    return this.getProgress(workspaceId);
  }
}

export const onboardingService = new OnboardingService();
