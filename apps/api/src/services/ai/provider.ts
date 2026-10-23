import { config } from "../../config.js";
import { redactSensitiveData } from "../tracing.js";

export interface AiPromptOptions {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
}

export interface AiProviderResponse<T = any> {
  data: T;
  rawText: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  provider: string;
  model: string;
  isSimulated: boolean;
}

export interface IAiProvider {
  name: string;
  isConfigured(): boolean;
  generateStructured<T>(options: AiPromptOptions): Promise<AiProviderResponse<T>>;
}

/**
 * Deterministic Mock AI Provider
 * Grounds responses in authentic FlowForge node and integration specifications.
 * Ensures 100% reliable, zero-flakiness automated testing without external API calls or network fees.
 */
export class MockAiProvider implements IAiProvider {
  name = "mock";

  isConfigured(): boolean {
    return true;
  }

  async generateStructured<T>(options: AiPromptOptions): Promise<AiProviderResponse<T>> {
    const { userPrompt, systemPrompt } = options;
    const lower = userPrompt.toLowerCase();

    // 1. Workflow Generation Detection
    if (systemPrompt.includes("Generate a complete, syntactically valid FlowForge workflow")) {
      const isLeadRouting = lower.includes("lead") || lower.includes("sales") || lower.includes("hubspot") || lower.includes("crm");
      const isOrderProcessing = lower.includes("order") || lower.includes("payment") || lower.includes("invoice") || lower.includes("stripe");
      const isApproval = lower.includes("approval") || lower.includes("review") || lower.includes("manager");

      const nodes: any[] = [];
      const edges: any[] = [];
      const requiredIntegrations: string[] = [];
      const requiredVariables: string[] = [];

      // Step 1: Trigger Node
      const triggerId = "node_trigger_1";
      nodes.push({
        id: triggerId,
        type: "custom",
        position: { x: 100, y: 150 },
        data: {
          label: isOrderProcessing ? "Stripe Payment Webhook" : isLeadRouting ? "Inbound Lead Webhook" : "Event Webhook Trigger",
          description: "Receives inbound webhook payload",
          nodeType: "TRIGGER",
          config: {
            triggerType: "WEBHOOK",
            httpMethod: "POST",
          },
          isValid: true,
          status: "configured",
        },
      });

      let lastNodeId = triggerId;
      let nextX = 350;

      // Step 2: Filter / Condition Node
      const filterId = "node_filter_2";
      nodes.push({
        id: filterId,
        type: "custom",
        position: { x: nextX, y: 150 },
        data: {
          label: isLeadRouting ? "Filter Valid Company Domain" : "Validate Payload Integrity",
          description: "Ensures required attributes are present",
          nodeType: "FILTER",
          config: {
            field: isLeadRouting ? "email" : "status",
            operator: "contains",
            value: isLeadRouting ? "@" : "active",
          },
          isValid: true,
          status: "configured",
        },
      });
      edges.push({
        id: `edge_${lastNodeId}_${filterId}`,
        source: lastNodeId,
        target: filterId,
      });
      lastNodeId = filterId;
      nextX += 250;

      // Step 3: Approval Node if requested
      if (isApproval) {
        const approvalId = "node_approval_3";
        nodes.push({
          id: approvalId,
          type: "custom",
          position: { x: nextX, y: 150 },
          data: {
            label: "Manager Approval Gate",
            description: "Requires workspace approval before continuing",
            nodeType: "APPROVAL",
            config: {
              title: "High-value Transaction Review",
              approverRole: "ADMIN",
            },
            isValid: true,
            status: "configured",
          },
        });
        edges.push({
          id: `edge_${lastNodeId}_${approvalId}`,
          source: lastNodeId,
          target: approvalId,
        });
        lastNodeId = approvalId;
        nextX += 250;
      }

      // Step 4: Action Node (Slack or Google Sheets)
      const actionId = "node_action_slack";
      nodes.push({
        id: actionId,
        type: "custom",
        position: { x: nextX, y: 150 },
        data: {
          label: "Notify Slack Channel",
          description: "Sends notification to #operations",
          nodeType: "ACTION",
          integrationKey: "slack",
          config: {
            operationId: "sendMessage",
            channel: "#automation-alerts",
            message: "Automation executed successfully: {{ trigger.body.id }}",
          },
          isValid: true,
          status: "configured",
        },
      });
      edges.push({
        id: `edge_${lastNodeId}_${actionId}`,
        source: lastNodeId,
        target: actionId,
      });
      requiredIntegrations.push("slack");
      lastNodeId = actionId;
      nextX += 250;

      // Step 5: Terminal Node
      const endId = "node_end";
      nodes.push({
        id: endId,
        type: "custom",
        position: { x: nextX, y: 150 },
        data: {
          label: "Workflow End",
          description: "Marks completion of workflow execution",
          nodeType: "WORKFLOW_END",
          config: {},
          isValid: true,
          status: "configured",
        },
      });
      edges.push({
        id: `edge_${lastNodeId}_${endId}`,
        source: lastNodeId,
        target: endId,
      });

      requiredVariables.push("ALERT_WEBHOOK_SECRET");

      const proposal = {
        name: isLeadRouting ? "Lead Qualification & Routing" : isOrderProcessing ? "E-commerce Order Processing" : "Automated Notification Pipeline",
        description: `Generated from prompt: "${userPrompt.substring(0, 80)}..."`,
        triggerType: "WEBHOOK",
        nodes,
        edges,
        requiredIntegrations,
        requiredVariables,
        assumptions: [
          "Assumes inbound webhook contains a JSON body with valid identifier.",
          "Requires a connected Slack account with permission to post to channels.",
        ],
        suggestedTests: [
          {
            name: "Standard Inbound Test",
            description: "Verifies successful payload ingestion and filter passage",
            mockPayload: { id: "test_123", email: "alice@acme-corp.com", status: "active" },
            assertions: [
              { target: "node_action_slack.status", operator: "EQUALS", expected: "SUCCESS" },
            ],
            targetScenario: "HAPPY_PATH",
          },
        ],
      };

      return {
        data: proposal as unknown as T,
        rawText: JSON.stringify(proposal),
        provider: "mock",
        model: "mock-deterministic-v1",
        isSimulated: true,
        usage: { promptTokens: 120, completionTokens: 450, totalTokens: 570 },
      };
    }

    // 2. Workflow Refinement Detection
    if (systemPrompt.includes("Refine and modify a FlowForge workflow")) {
      const currentNodes = options.userPrompt ? JSON.parse(options.userPrompt).currentNodes || [] : [];
      const currentEdges = options.userPrompt ? JSON.parse(options.userPrompt).currentEdges || [] : [];

      // Add a filter or condition node to demonstrate refinement
      const newFilterId = `node_filter_refine_${Date.now()}`;
      const updatedNodes = [...currentNodes];
      const updatedEdges = [...currentEdges];

      const newNode = {
        id: newFilterId,
        type: "custom",
        position: { x: 300, y: 300 },
        data: {
          label: "Refined Validation Filter",
          description: "Added condition based on user instruction",
          nodeType: "FILTER",
          config: { field: "domain", operator: "equals", value: "flowforge.dev" },
          isValid: true,
          status: "configured",
        },
      };
      updatedNodes.push(newNode);

      const refinement = {
        summary: `Refined workflow based on instruction: "${userPrompt.substring(0, 60)}"`,
        explanation: "Appended validation filter node to ensure strict payload criteria prior to downstream actions.",
        diff: {
          addedNodes: [{ id: newFilterId, label: newNode.data.label, nodeType: "FILTER" }],
          removedNodes: [],
          modifiedNodes: [],
          edgeChanges: { added: 0, removed: 0 },
        },
        proposedNodes: updatedNodes,
        proposedEdges: updatedEdges,
      };

      return {
        data: refinement as unknown as T,
        rawText: JSON.stringify(refinement),
        provider: "mock",
        model: "mock-deterministic-v1",
        isSimulated: true,
        usage: { promptTokens: 150, completionTokens: 300, totalTokens: 450 },
      };
    }

    // 3. Workflow Explanation
    if (systemPrompt.includes("Explain a FlowForge workflow")) {
      const explanation = {
        summary: "This workflow ingests external events, evaluates conditional filter rules, and publishes notifications to downstream communication channels.",
        triggerDetails: "Begins execution upon receiving an HTTP POST request at the registered inbound webhook endpoint.",
        mainExecutionPath: [
          "1. Inbound Webhook receives raw payload.",
          "2. Filter node verifies domain and required properties.",
          "3. Action node dispatches alert message.",
          "4. Execution completes gracefully at Workflow End node.",
        ],
        branchingAndConditions: ["Contains 1 filtering check; execution halts safely if criteria is not satisfied."],
        loopsAndApprovals: ["No looping structures or human approval gates detected in current topology."],
        integrationDependencies: ["Slack integration requires an active, authorized Connected Account."],
        dataFlowAndTransformations: ["Extracts customer identifiers and maps event variables into Slack notification template."],
        errorAndRetryBehavior: "External HTTP and integration actions retry up to 3 times with exponential backoff before failing.",
        securityAndReliabilityNotes: [
          "Sensitive environment variables and webhook secrets are redacted during runtime logging.",
          "Webhook endpoint enforces HTTPS and payload size limits (max 5MB).",
        ],
      };

      return {
        data: explanation as unknown as T,
        rawText: JSON.stringify(explanation),
        provider: "mock",
        model: "mock-deterministic-v1",
        isSimulated: true,
      };
    }

    // 4. Execution Failure Debugging
    if (systemPrompt.includes("Analyze an execution failure")) {
      const debugReport = {
        conciseSummary: "Downstream Slack API rejected dispatch due to an expired OAuth token or revoked channel permission.",
        probableCause: "The connected account credential associated with Slack integration is expired or was revoked by the workspace administrator.",
        supportingEvidence: [
          "Step 'node_action_slack' reported status 'FAILED' with errorCategory 'AUTH_FAILURE'.",
          "HTTP response returned status 401 Unauthorized from api.slack.com/chat.postMessage.",
        ],
        uncertaintyLevel: "LOW",
        remediationSteps: [
          "Navigate to Settings > Connected Accounts.",
          "Locate the Slack connection and click 'Reconnect' or refresh OAuth tokens.",
          "Re-run the failed execution in DRY_RUN mode to verify connectivity.",
        ],
        suggestedPatch: {
          action: "UPDATE_CONFIG",
          nodeId: "node_action_slack",
          patchDescription: "Verify connected account binding and channel authorization",
          modifiedConfig: {
            retryOnAuthError: true,
          },
        },
      };

      return {
        data: debugReport as unknown as T,
        rawText: JSON.stringify(debugReport),
        provider: "mock",
        model: "mock-deterministic-v1",
        isSimulated: true,
      };
    }

    // 5. Workflow Optimization
    if (systemPrompt.includes("Analyze workflow performance and optimization")) {
      const optimizationReport = {
        recommendations: [
          {
            id: "opt_retry_backoff",
            type: "MISSING_RETRY",
            title: "Add Exponential Backoff to Outbound HTTP Request",
            targetNodeId: "node_action_http",
            targetNodeLabel: "HTTP Request",
            evidence: "12% of executions in the past 14 days failed on transient 503 gateway errors that succeeded on immediate manual retry.",
            analyzedPeriod: "Past 14 days (142 executions)",
            estimatedImpact: "Reduces transient failure rate by approximately ~80%.",
            riskAssessment: "Low risk. Idempotent GET/POST endpoints safely absorb retries.",
            suggestedFix: "Configure retryCount: 3 with backoffFactor: 2 in node settings.",
          },
          {
            id: "opt_batching",
            type: "BATCHING_OPPORTUNITY",
            title: "Batch Google Sheets Line Items",
            targetNodeId: "node_action_sheets",
            targetNodeLabel: "Append Row to Google Sheet",
            evidence: "Workflow executes inside a loop writing 1 row per API call, resulting in rate limit throttles.",
            analyzedPeriod: "Past 14 days",
            estimatedImpact: "Decreases total execution duration from 4.2s to 0.8s.",
            riskAssessment: "Medium risk. Requires transforming loop payload into a 2D array.",
            suggestedFix: "Use batchAppendRows operation outside the loop.",
          },
        ],
      };

      return {
        data: optimizationReport as unknown as T,
        rawText: JSON.stringify(optimizationReport),
        provider: "mock",
        model: "mock-deterministic-v1",
        isSimulated: true,
      };
    }

    // 6. Test Case Generation
    if (systemPrompt.includes("Generate automated test cases")) {
      const testCases = {
        testCases: [
          {
            name: "Valid Payload Smoke Test",
            description: "Verifies correct routing when company email is supplied",
            mockPayload: { name: "Sarah Connor", email: "sarah@cyberdyne.com", companySize: "50-200" },
            assertions: [
              { target: "node_filter_2.status", nodeId: "node-1", fieldPath: "status", operator: "EQUALS", expected: "SUCCESS", expectedValue: "SUCCESS" },
              { target: "node_action_slack.status", nodeId: "node-2", fieldPath: "status", operator: "EXISTS", expectedValue: "" },
            ],
            targetScenario: "HAPPY_PATH",
          },
          {
            name: "Invalid Missing Email Edge Case",
            description: "Verifies that empty email payload is intercepted at filter stage",
            mockPayload: { name: "Anonymous Visitor", email: "" },
            assertions: [
              { target: "node_filter_2.status", nodeId: "node-1", fieldPath: "status", operator: "EQUALS", expected: "FILTERED", expectedValue: "FILTERED" },
            ],
            targetScenario: "EDGE_CASE",
          },
        ],
      };

      return {
        data: testCases as unknown as T,
        rawText: JSON.stringify(testCases),
        provider: "mock",
        model: "mock-deterministic-v1",
        isSimulated: true,
      };
    }

    return {
      data: {} as unknown as T,
      rawText: "{}",
      provider: "mock",
      model: "mock-deterministic-v1",
      isSimulated: true,
    };
  }
}

/**
 * OpenAI / Compatible Provider Implementation
 */
export class OpenAiCompatibleProvider implements IAiProvider {
  name = "openai";

  isConfigured(): boolean {
    return Boolean(config.aiApiKey && config.aiApiKey.trim().length > 0);
  }

  async generateStructured<T>(options: AiPromptOptions): Promise<AiProviderResponse<T>> {
    if (!this.isConfigured()) {
      throw new Error("AI provider is not configured. Missing AI_API_KEY environment variable.");
    }

    const endpoint = config.aiApiEndpoint || "https://api.openai.com/v1/chat/completions";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.aiTimeoutMs || 30000);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.aiApiKey}`,
        },
        body: JSON.stringify({
          model: config.aiModel || "gpt-4o-mini",
          messages: [
            { role: "system", content: options.systemPrompt },
            { role: "user", content: options.userPrompt },
          ],
          response_format: options.jsonMode !== false ? { type: "json_object" } : undefined,
          temperature: options.temperature ?? 0.2,
          max_tokens: options.maxTokens ?? 2000,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`AI Provider HTTP Error (${res.status}): ${errorText.substring(0, 200)}`);
      }

      const json = await res.json();
      const content = json.choices?.[0]?.message?.content || "{}";
      const parsedData = JSON.parse(content);

      return {
        data: parsedData as T,
        rawText: content,
        usage: {
          promptTokens: json.usage?.prompt_tokens,
          completionTokens: json.usage?.completion_tokens,
          totalTokens: json.usage?.total_tokens,
        },
        provider: "openai",
        model: config.aiModel || "gpt-4o-mini",
        isSimulated: false,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

let activeProvider: IAiProvider | null = null;

export function getAiProvider(): IAiProvider {
  if (activeProvider) return activeProvider;

  if (config.aiProvider === "openai") {
    activeProvider = new OpenAiCompatibleProvider();
  } else {
    activeProvider = new MockAiProvider();
  }
  return activeProvider;
}

export function setAiProviderForTesting(provider: IAiProvider | null) {
  activeProvider = provider;
}
