import { IntegrationProvider, DecryptedCredentials } from "../types.js";
import { interpolateString } from "../../engine/mapping/resolver.js";

export const slackProvider: IntegrationProvider = {
  key: "slack",
  name: "Slack",
  description: "Send messages, alerts, and notifications to authorized Slack conversations.",
  category: "COMMUNICATION",
  iconName: "MessageSquare",
  authType: "OAUTH2",

  getAuthorizationUrl({ state, redirectUri }) {
    const clientId = process.env.SLACK_CLIENT_ID || "mock_slack_client_id";
    const scopes = ["chat:write", "channels:read", "groups:read", "chat:write.public"].join(",");
    const params = new URLSearchParams({
      client_id: clientId,
      scope: scopes,
      redirect_uri: redirectUri,
      state,
    });
    return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
  },

  async exchangeCode({ code, redirectUri }) {
    const clientId = process.env.SLACK_CLIENT_ID;
    const clientSecret = process.env.SLACK_CLIENT_SECRET;

    // Development or Mock Mode when credentials not configured
    if (!clientId || !clientSecret || clientId === "mock_slack_client_id") {
      return {
        credentials: {
          accessToken: `xoxb-mock-${Date.now()}-${code}`,
          teamId: "T_MOCK_WORKSPACE",
          teamName: "FlowForge Dev Slack",
          botUserId: "U_FLOWFORGE_BOT",
          scope: "chat:write,channels:read",
        },
        accountName: "Dev Slack Workspace (Mocked)",
        metadata: {
          teamId: "T_MOCK_WORKSPACE",
          teamName: "FlowForge Dev Slack",
          botUserId: "U_FLOWFORGE_BOT",
        },
      };
    }

    const res = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!data.ok) {
      throw new Error(`Slack OAuth authorization failed: ${data.error || "Unknown provider error"}`);
    }

    return {
      credentials: {
        accessToken: data.access_token,
        tokenType: data.token_type,
        scope: data.scope,
        botUserId: data.bot_user_id,
        teamId: data.team?.id,
        teamName: data.team?.name,
        accountId: data.authed_user?.id,
      },
      accountName: data.team?.name ? `Slack (${data.team.name})` : "Slack Connected Account",
      metadata: {
        teamId: data.team?.id,
        teamName: data.team?.name,
        botUserId: data.bot_user_id,
      },
    };
  },

  operations: [
    {
      id: "post_message",
      name: "Send Message",
      description: "Post a message to an authorized Slack channel or direct conversation.",
      type: "ACTION",
      parameters: [
        {
          name: "channel",
          label: "Channel ID or Name",
          type: "string",
          required: true,
          description: "Target conversation ID (e.g. C01234567) or channel name (e.g. #general)",
          placeholder: "C01234567 or general",
        },
        {
          name: "text",
          label: "Message Text",
          type: "string",
          required: true,
          description: "Content of the message. Supports markdown formatting and {{variables}}.",
          placeholder: "Hello from FlowForge! New lead: {{trigger.body.email}}",
        },
      ],
      async execute(ctx) {
        const { credentials, parameters, stepContext } = ctx;
        if (!credentials?.accessToken) {
          return {
            status: "FAILED",
            errorCategory: "AUTH_FAILURE",
            errorMessage: "Slack action requires an authorized Connected Account with valid access token.",
          };
        }

        const rawChannel = parameters.channel || "";
        const rawText = parameters.text || "";

        // Resolve template variables
        const channel = interpolateString(rawChannel, stepContext.context).trim();
        const text = interpolateString(rawText, stepContext.context);

        if (!channel) {
          return {
            status: "FAILED",
            errorCategory: "INVALID_INPUT",
            errorMessage: "Slack channel parameter is required.",
          };
        }

        if (!text) {
          return {
            status: "FAILED",
            errorCategory: "INVALID_INPUT",
            errorMessage: "Slack message text parameter cannot be empty.",
          };
        }

        // Mock test execution if using mock token
        if (credentials.accessToken.startsWith("xoxb-mock-")) {
          return {
            status: "SUCCESS",
            outputData: {
              ok: true,
              channel,
              ts: `${Date.now() / 1000}.000100`,
              message: {
                text,
                user: credentials.botUserId || "U_BOT",
              },
              simulated: true,
            },
          };
        }

        try {
          const res = await fetch("https://slack.com/api/chat.postMessage", {
            method: "POST",
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              Authorization: `Bearer ${credentials.accessToken}`,
            },
            body: JSON.stringify({
              channel,
              text,
            }),
          });

          const data = await res.json().catch(() => ({}));

          if (!res.ok || !data.ok) {
            const errCode = data.error || `HTTP_${res.status}`;
            let errorCategory = "EXTERNAL_API_ERROR" as any;
            if (errCode === "invalid_auth" || errCode === "account_inactive" || errCode === "token_revoked") {
              errorCategory = "AUTH_FAILURE";
            } else if (errCode === "channel_not_found") {
              errorCategory = "INVALID_INPUT";
            } else if (errCode === "ratelimited") {
              errorCategory = "RATE_LIMIT";
            }

            return {
              status: "FAILED",
              errorCategory,
              errorMessage: `Slack API error: ${errCode}`,
            };
          }

          return {
            status: "SUCCESS",
            outputData: {
              ok: true,
              channel: data.channel,
              ts: data.ts,
              message: {
                text: data.message?.text || text,
                botId: data.message?.bot_id,
              },
            },
          };
        } catch (err: any) {
          return {
            status: "FAILED",
            errorCategory: "NETWORK_ERROR",
            errorMessage: `Failed to reach Slack API: ${err.message}`,
          };
        }
      },
    },
  ],
};
