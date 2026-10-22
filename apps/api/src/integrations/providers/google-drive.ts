import { IntegrationProvider } from "../types.js";
import {
  getGoogleAuthorizationUrl,
  exchangeGoogleCode,
  refreshGoogleToken,
} from "./google-base.js";
import { interpolateString } from "../../engine/mapping/resolver.js";

const SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
];

export const googleDriveProvider: IntegrationProvider = {
  key: "google-drive",
  name: "Google Drive",
  description: "Search, list, and inspect file metadata in your Google Drive folders.",
  category: "STORAGE",
  iconName: "HardDrive",
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
      id: "list_files",
      name: "List Files",
      description: "Search and list files accessible to the connected Google account.",
      type: "ACTION",
      parameters: [
        {
          name: "query",
          label: "Search Query",
          type: "string",
          required: false,
          description: "Drive query filter (e.g. name contains 'Invoice' and trashed = false)",
          placeholder: "trashed = false",
        },
        {
          name: "pageSize",
          label: "Max Results",
          type: "number",
          required: false,
          default: 10,
          description: "Number of files to return (1-100)",
        },
      ],
      async execute(ctx) {
        const { credentials, parameters, stepContext } = ctx;
        if (!credentials?.accessToken) {
          return {
            status: "FAILED",
            errorCategory: "AUTH_FAILURE",
            errorMessage: "Google Drive action requires an authorized Google account.",
          };
        }

        const rawQuery = parameters.query || "trashed = false";
        const pageSize = Math.min(Math.max(Number(parameters.pageSize) || 10, 1), 100);
        const query = interpolateString(rawQuery, stepContext.context).trim();

        // Mock test execution if using mock token
        if (credentials.accessToken.startsWith("ya29.mock-")) {
          return {
            status: "SUCCESS",
            outputData: {
              files: [
                {
                  id: "mock_drive_file_1",
                  name: "Q4_Revenue_Report.pdf",
                  mimeType: "application/pdf",
                  size: "245089",
                  webViewLink: "https://drive.google.com/file/d/mock_drive_file_1/view",
                  createdTime: new Date().toISOString(),
                },
                {
                  id: "mock_drive_file_2",
                  name: "Customer_List_2026.csv",
                  mimeType: "text/csv",
                  size: "18204",
                  webViewLink: "https://drive.google.com/file/d/mock_drive_file_2/view",
                  createdTime: new Date().toISOString(),
                },
              ],
              totalCount: 2,
              simulated: true,
            },
          };
        }

        try {
          const urlParams = new URLSearchParams({
            pageSize: String(pageSize),
            fields: "files(id,name,mimeType,size,webViewLink,createdTime,modifiedTime)",
          });
          if (query) {
            urlParams.set("q", query);
          }

          const res = await fetch(`https://www.googleapis.com/drive/v3/files?${urlParams.toString()}`, {
            headers: { Authorization: `Bearer ${credentials.accessToken}` },
          });

          const data = await res.json().catch(() => ({}));

          if (!res.ok) {
            const status = res.status;
            let errorCategory = "EXTERNAL_API_ERROR" as any;
            if (status === 401 || status === 403) {
              errorCategory = "AUTH_FAILURE";
            } else if (status === 429) {
              errorCategory = "RATE_LIMIT";
            }

            return {
              status: "FAILED",
              errorCategory,
              errorMessage: `Google Drive API error (${status}): ${data.error?.message || res.statusText}`,
            };
          }

          return {
            status: "SUCCESS",
            outputData: {
              files: data.files || [],
              totalCount: (data.files || []).length,
            },
          };
        } catch (err: any) {
          return {
            status: "FAILED",
            errorCategory: "NETWORK_ERROR",
            errorMessage: `Failed to query Google Drive: ${err.message}`,
          };
        }
      },
    },
    {
      id: "get_file_metadata",
      name: "Get File Metadata",
      description: "Retrieve metadata for a specific Google Drive file by ID.",
      type: "ACTION",
      parameters: [
        {
          name: "fileId",
          label: "Drive File ID",
          type: "string",
          required: true,
          description: "ID of the target Drive file",
          placeholder: "1AbCdEfGhIjKlMnOpQrStUvWxYz",
        },
      ],
      async execute(ctx) {
        const { credentials, parameters, stepContext } = ctx;
        if (!credentials?.accessToken) {
          return {
            status: "FAILED",
            errorCategory: "AUTH_FAILURE",
            errorMessage: "Google Drive action requires an authorized Google account.",
          };
        }

        const rawFileId = parameters.fileId || "";
        const fileId = interpolateString(rawFileId, stepContext.context).trim();

        if (!fileId) {
          return {
            status: "FAILED",
            errorCategory: "INVALID_INPUT",
            errorMessage: "Google Drive File ID parameter is required.",
          };
        }

        // Mock test execution if using mock token
        if (credentials.accessToken.startsWith("ya29.mock-")) {
          return {
            status: "SUCCESS",
            outputData: {
              id: fileId,
              name: "Sample_Document.docx",
              mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              size: "1048576",
              webViewLink: `https://drive.google.com/file/d/${fileId}/view`,
              createdTime: new Date().toISOString(),
              simulated: true,
            },
          };
        }

        try {
          const fields = "id,name,mimeType,size,webViewLink,createdTime,modifiedTime,owners";
          const res = await fetch(
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=${fields}`,
            {
              headers: { Authorization: `Bearer ${credentials.accessToken}` },
            }
          );

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
              errorMessage: `Google Drive API error (${status}): ${data.error?.message || res.statusText}`,
            };
          }

          return {
            status: "SUCCESS",
            outputData: data,
          };
        } catch (err: any) {
          return {
            status: "FAILED",
            errorCategory: "NETWORK_ERROR",
            errorMessage: `Failed to inspect Google Drive file: ${err.message}`,
          };
        }
      },
    },
  ],
};
