import { DecryptedCredentials } from "../types.js";

export function getGoogleAuthorizationUrl(params: {
  scopes: string[];
  state: string;
  redirectUri: string;
  codeChallenge?: string;
}): string {
  const clientId = process.env.GOOGLE_CLIENT_ID || "mock_google_client_id";
  const searchParams = new URLSearchParams({
    client_id: clientId,
    redirect_uri: params.redirectUri,
    response_type: "code",
    scope: params.scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
    state: params.state,
  });

  if (params.codeChallenge) {
    searchParams.set("code_challenge", params.codeChallenge);
    searchParams.set("code_challenge_method", "S256");
  }

  return `https://accounts.google.com/o/oauth2/v2/auth?${searchParams.toString()}`;
}

export async function exchangeGoogleCode(params: {
  code: string;
  redirectUri: string;
  codeVerifier?: string;
}): Promise<{
  credentials: DecryptedCredentials;
  accountName: string;
  expiresAt: Date;
  metadata?: Record<string, any>;
}> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  // Development/Mock fallback
  if (!clientId || !clientSecret || clientId === "mock_google_client_id") {
    return {
      credentials: {
        accessToken: `ya29.mock-${Date.now()}-${params.code}`,
        refreshToken: `1//mock-refresh-token-${Date.now()}`,
        userEmail: "demo-user@gmail.com",
        userName: "Demo Google Account",
        scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/drive.readonly",
      },
      accountName: "Demo Google Account (demo-user@gmail.com)",
      expiresAt: new Date(Date.now() + 3600 * 1000),
      metadata: {
        email: "demo-user@gmail.com",
        name: "Demo Google Account",
      },
    };
  }

  const postBody: Record<string, string> = {
    client_id: clientId,
    client_secret: clientSecret,
    code: params.code,
    grant_type: "authorization_code",
    redirect_uri: params.redirectUri,
  };

  if (params.codeVerifier) {
    postBody.code_verifier = params.codeVerifier;
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(postBody),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(`Google OAuth exchange failed: ${data.error_description || data.error || res.statusText}`);
  }

  // Attempt to fetch profile info
  let userEmail = "Google User";
  let userName = "Google Account";
  try {
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    if (userRes.ok) {
      const userInfo = await userRes.json();
      userEmail = userInfo.email || userEmail;
      userName = userInfo.name || userName;
    }
  } catch {
    // Non-fatal if userinfo fails
  }

  const expiresIn = data.expires_in || 3600;
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  return {
    credentials: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      scope: data.scope,
      tokenType: data.token_type,
      userEmail,
      userName,
    },
    accountName: `${userName} (${userEmail})`,
    expiresAt,
    metadata: {
      email: userEmail,
      name: userName,
    },
  };
}

export async function refreshGoogleToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
}> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret || clientId === "mock_google_client_id") {
    return {
      accessToken: `ya29.mock-refreshed-${Date.now()}`,
      expiresAt: new Date(Date.now() + 3600 * 1000),
    };
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(`Google token refresh failed: ${data.error_description || data.error || res.statusText}`);
  }

  const expiresIn = data.expires_in || 3600;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken, // May rotate or stay same
    expiresAt: new Date(Date.now() + expiresIn * 1000),
  };
}
