import { prisma } from "@flowforge/database";
import { decryptCredentials, encryptCredentials } from "../security/encryption.js";
import { DecryptedCredentials } from "./types.js";
import { integrationRegistry } from "./registry.js";

export class TokenManager {
  /**
   * Retrieves and optionally refreshes credentials for a connected account.
   * Enforces tenant isolation by verifying workspaceId.
   */
  async getValidCredentials(
    workspaceId: string,
    connectedAccountId: string
  ): Promise<DecryptedCredentials> {
    const connection = await prisma.connectedAccount.findFirst({
      where: {
        id: connectedAccountId,
        workspaceId,
      },
    });

    if (!connection) {
      throw new Error(
        `Connected account not found or access denied for workspace ${workspaceId}.`
      );
    }

    if (connection.status === "REVOKED") {
      throw new Error(
        `Connected account '${connection.name}' has been revoked. Please reconnect the account.`
      );
    }

    let credentials: DecryptedCredentials;
    try {
      credentials = decryptCredentials<DecryptedCredentials>(connection.credentials as any);
    } catch (err: any) {
      throw new Error(`Failed to decrypt credentials for connection ${connectedAccountId}: ${err.message}`);
    }

    // Check if token expiration check and refresh is needed
    const isExpiringSoon =
      connection.expiresAt &&
      connection.expiresAt.getTime() - Date.now() < 5 * 60 * 1000; // 5 minutes before expiry

    if (isExpiringSoon && credentials.refreshToken) {
      const provider = integrationRegistry.getProvider(connection.integrationKey);
      if (provider?.refreshToken) {
        try {
          console.log(`Refreshing access token for ${connection.integrationKey} connection ${connection.id}...`);
          const refreshResult = await provider.refreshToken(credentials.refreshToken);

          credentials.accessToken = refreshResult.accessToken;
          if (refreshResult.refreshToken) {
            credentials.refreshToken = refreshResult.refreshToken;
          }

          const newEncrypted = encryptCredentials(credentials);
          await prisma.connectedAccount.update({
            where: { id: connection.id },
            data: {
              credentials: newEncrypted as any,
              expiresAt: refreshResult.expiresAt || null,
              lastVerifiedAt: new Date(),
              status: "ACTIVE",
            },
          });
        } catch (err: any) {
          console.error(`Token refresh failed for ${connection.id}:`, err.message);
          await prisma.connectedAccount.update({
            where: { id: connection.id },
            data: { status: "EXPIRED" },
          });
          throw new Error(
            `Access token for '${connection.name}' expired and could not be refreshed. Please reconnect the account.`
          );
        }
      }
    }

    return credentials;
  }
}

export const tokenManager = new TokenManager();
