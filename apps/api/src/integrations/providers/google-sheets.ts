import { IntegrationProvider } from "../types.js";
import {
  getGoogleAuthorizationUrl,
  exchangeGoogleCode,
  refreshGoogleToken,
} from "./google-base.js";
import { resolveDeep, interpolateString } from "../../engine/mapping/resolver.js";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

export const googleSheetsProvider: IntegrationProvider = {
  key: "google-sheets",
  name: "Google Sheets",
  description: "Read, append, update, and search rows in Google Spreadsheets.",
  category: "PRODUCTIVITY",
  iconName: "FileSpreadsheet",
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
      id: "append_row",
      name: "Append Row",
      description: "Appends a new row of values to a selected Google Spreadsheet worksheet.",
      type: "ACTION",
      parameters: [
        {
          name: "spreadsheetId",
          label: "Spreadsheet ID",
          type: "string",
          required: true,
          description: "ID extracted from spreadsheet URL: https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit",
          placeholder: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
        },
        {
          name: "range",
          label: "Worksheet Range",
          type: "string",
          required: false,
          description: "Target worksheet name and range (default: Sheet1!A:Z)",
          placeholder: "Sheet1!A:Z",
          default: "Sheet1!A:Z",
        },
        {
          name: "values",
          label: "Row Values",
          type: "json",
          required: true,
          description: "Array of cell values (e.g. ['{{trigger.body.name}}', '{{trigger.body.email}}', 100]) or Key-Value map.",
          placeholder: '["{{trigger.body.name}}", "{{trigger.body.email}}", "{{trigger.body.amount}}"]',
        },
      ],
      async execute(ctx) {
        const { credentials, parameters, stepContext } = ctx;
        if (!credentials?.accessToken) {
          return {
            status: "FAILED",
            errorCategory: "AUTH_FAILURE",
            errorMessage: "Google Sheets action requires an authorized Google account.",
          };
        }

        const rawSpreadsheetId = parameters.spreadsheetId || "";
        const rawRange = parameters.range || "Sheet1!A:Z";
        const rawValues = parameters.values;

        const spreadsheetId = interpolateString(rawSpreadsheetId, stepContext.context).trim();
        const range = interpolateString(rawRange, stepContext.context).trim() || "Sheet1!A:Z";

        if (!spreadsheetId) {
          return {
            status: "FAILED",
            errorCategory: "INVALID_INPUT",
            errorMessage: "Spreadsheet ID is required.",
          };
        }

        // Resolve row values
        const resolvedValues = resolveDeep(rawValues, stepContext.context);

        // Normalize values into 1D row array
        let rowArray: any[] = [];
        if (Array.isArray(resolvedValues)) {
          rowArray = resolvedValues;
        } else if (typeof resolvedValues === "object" && resolvedValues !== null) {
          rowArray = Object.values(resolvedValues);
        } else if (typeof resolvedValues === "string") {
          try {
            const parsed = JSON.parse(resolvedValues);
            rowArray = Array.isArray(parsed) ? parsed : Object.values(parsed);
          } catch {
            rowArray = [resolvedValues];
          }
        } else {
          rowArray = [resolvedValues];
        }

        // Mock test execution if using mock token
        if (credentials.accessToken.startsWith("ya29.mock-")) {
          return {
            status: "SUCCESS",
            outputData: {
              spreadsheetId,
              tableRange: range,
              updates: {
                spreadsheetId,
                updatedRange: `${range}!A2:C2`,
                updatedRows: 1,
                updatedColumns: rowArray.length,
                updatedCells: rowArray.length,
              },
              appendedValues: rowArray,
              simulated: true,
            },
          };
        }

        try {
          const encodedRange = encodeURIComponent(range);
          const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
            spreadsheetId
          )}/values/${encodedRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

          const res = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${credentials.accessToken}`,
            },
            body: JSON.stringify({
              values: [rowArray],
            }),
          });

          const data = await res.json().catch(() => ({}));

          if (!res.ok) {
            const status = res.status;
            let errorCategory = "EXTERNAL_API_ERROR" as any;
            if (status === 401 || status === 403) {
              errorCategory = "AUTH_FAILURE";
            } else if (status === 404) {
              errorCategory = "INVALID_INPUT";
            } else if (status === 429) {
              errorCategory = "RATE_LIMIT";
            }

            return {
              status: "FAILED",
              errorCategory,
              errorMessage: `Google Sheets API error (${status}): ${data.error?.message || res.statusText}`,
            };
          }

          return {
            status: "SUCCESS",
            outputData: {
              spreadsheetId: data.spreadsheetId || spreadsheetId,
              tableRange: data.tableRange,
              updates: data.updates,
              appendedValues: rowArray,
            },
          };
        } catch (err: any) {
          return {
            status: "FAILED",
            errorCategory: "NETWORK_ERROR",
            errorMessage: `Failed to communicate with Google Sheets: ${err.message}`,
          };
        }
      },
    },
  ],
};
