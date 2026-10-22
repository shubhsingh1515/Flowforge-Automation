import { IntegrationProvider } from "../types.js";
import {
  getGoogleAuthorizationUrl,
  exchangeGoogleCode,
  refreshGoogleToken,
} from "./google-base.js";
import { interpolateString } from "../../engine/mapping/resolver.js";

const SCOPES = ["https://www.googleapis.com/auth/gmail.send"];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function encodeRfc2822(to: string, subject: string, body: string, isHtml = false): string {
  const mimeLines = [
    `To: ${to}`,
    `Subject: =?utf-8?B?${Buffer.from(subject).toString("base64")}?=`,
    "MIME-Version: 1.0",
    `Content-Type: ${isHtml ? "text/html" : "text/plain"}; charset="UTF-8"`,
    "Content-Transfer-Encoding: 7bit",
    "",
    body,
  ];

  const fullMessage = mimeLines.join("\r\n");
  return Buffer.from(fullMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export const gmailProvider: IntegrationProvider = {
  key: "gmail",
  name: "Gmail",
  description: "Send emails and alerts securely from your connected Gmail account.",
  category: "COMMUNICATION",
  iconName: "Inbox",
  authType: "OAUTH2",

  getAuthorizationUrl({ state, redirectUri, codeChallenge }) {
    return getGoogleAuthorizationUrl({
      scopes: SCOPES,
      state,
      redirectUri,
      codeChallenge,
    });
  },

  exchangeCode: exchangeGoogleCode,
  refreshToken: refreshGoogleToken,

  operations: [
    {
      id: "send_email",
      name: "Send Email",
      description: "Dispatches an email message to a specified recipient from your Gmail account.",
      type: "ACTION",
      parameters: [
        {
          name: "to",
          label: "Recipient Email",
          type: "string",
          required: true,
          description: "Target email address (e.g. client@company.com or {{trigger.body.email}})",
          placeholder: "alex@example.com",
        },
        {
          name: "subject",
          label: "Subject Line",
          type: "string",
          required: true,
          description: "Email subject line",
          placeholder: "Important Update from FlowForge",
        },
        {
          name: "body",
          label: "Email Body",
          type: "string",
          required: true,
          description: "Plain text or HTML content with {{variables}} support",
          placeholder: "Hi {{trigger.body.name}},\n\nYour automation succeeded!",
        },
        {
          name: "isHtml",
          label: "Format as HTML",
          type: "boolean",
          required: false,
          default: false,
          description: "Enable if body contains HTML tags",
        },
      ],
      async execute(ctx) {
        const { credentials, parameters, stepContext } = ctx;
        if (!credentials?.accessToken) {
          return {
            status: "FAILED",
            errorCategory: "AUTH_FAILURE",
            errorMessage: "Gmail action requires an authorized Google account.",
          };
        }

        const rawTo = parameters.to || "";
        const rawSubject = parameters.subject || "";
        const rawBody = parameters.body || "";
        const isHtml = Boolean(parameters.isHtml);

        const to = interpolateString(rawTo, stepContext.context).trim();
        const subject = interpolateString(rawSubject, stepContext.context).trim();
        const body = interpolateString(rawBody, stepContext.context);

        // Validation
        if (!to) {
          return {
            status: "FAILED",
            errorCategory: "INVALID_INPUT",
            errorMessage: "Recipient email is required.",
          };
        }

        // Validate recipient format
        const recipients = to.split(",").map((s) => s.trim());
        for (const recipient of recipients) {
          if (!EMAIL_REGEX.test(recipient)) {
            return {
              status: "FAILED",
              errorCategory: "INVALID_INPUT",
              errorMessage: `Invalid recipient email format: '${recipient}'.`,
            };
          }
        }

        if (!subject) {
          return {
            status: "FAILED",
            errorCategory: "INVALID_INPUT",
            errorMessage: "Email subject cannot be empty.",
          };
        }

        // Mock test execution if using mock token
        if (credentials.accessToken.startsWith("ya29.mock-")) {
          return {
            status: "SUCCESS",
            outputData: {
              id: `mock_msg_${Date.now()}`,
              threadId: `mock_th_${Date.now()}`,
              to,
              subject,
              labelIds: ["SENT"],
              simulated: true,
            },
          };
        }

        try {
          const rawMessage = encodeRfc2822(to, subject, body, isHtml);

          const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${credentials.accessToken}`,
            },
            body: JSON.stringify({ raw: rawMessage }),
          });

          const data = await res.json().catch(() => ({}));

          if (!res.ok) {
            const status = res.status;
            let errorCategory = "EXTERNAL_API_ERROR" as any;
            if (status === 401 || status === 403) {
              errorCategory = "AUTH_FAILURE";
            } else if (status === 400) {
              errorCategory = "INVALID_INPUT";
            } else if (status === 429) {
              errorCategory = "RATE_LIMIT";
            }

            return {
              status: "FAILED",
              errorCategory,
              errorMessage: `Gmail API error (${status}): ${data.error?.message || res.statusText}`,
            };
          }

          return {
            status: "SUCCESS",
            outputData: {
              id: data.id,
              threadId: data.threadId,
              to,
              subject,
              labelIds: data.labelIds,
            },
          };
        } catch (err: any) {
          return {
            status: "FAILED",
            errorCategory: "NETWORK_ERROR",
            errorMessage: `Failed to dispatch email via Gmail: ${err.message}`,
          };
        }
      },
    },
  ],
};
