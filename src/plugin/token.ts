import { ANTIGRAVITY_CLIENT_ID, ANTIGRAVITY_CLIENT_SECRET } from "../constants";
import { formatRefreshParts, parseRefreshParts, calculateTokenExpiry } from "./auth";
import { clearCachedAuth, storeCachedAuth } from "./cache";
import { createLogger } from "./logger";
import { invalidateProjectContextCache } from "./project";
import type { OAuthAuthDetails, PluginClient, RefreshParts } from "./types";

const log = createLogger("token");

// Retry configuration for transient failures
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 100;
const MAX_RETRY_DELAY_MS = 2000;

/**
 * Sleeps for the specified duration with optional abort signal support.
 */
async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timeout);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}

/**
 * Calculates exponential backoff delay with jitter.
 */
function getRetryDelay(attempt: number): number {
  const exponentialDelay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, MAX_RETRY_DELAY_MS);
  // Add ±20% jitter to prevent thundering herd
  const jitter = cappedDelay * (0.8 + Math.random() * 0.4);
  return Math.floor(jitter);
}

/**
 * Determines if an error is retryable (transient network/server error).
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof AntigravityTokenRefreshError) {
    // Don't retry auth errors like invalid_grant
    if (error.code === "invalid_grant" || error.code === "invalid_client") {
      return false;
    }
    // Retry server errors (5xx) and rate limits
    return error.status >= 500 || error.status === 429;
  }
  // Retry network errors (fetch failures)
  return error instanceof TypeError || (error instanceof Error && error.message.includes("fetch"));
}

interface OAuthErrorPayload {
  error?:
    | string
    | {
        code?: string;
        status?: string;
        message?: string;
      };
  error_description?: string;
}

/**
 * Parses OAuth error payloads returned by Google token endpoints, tolerating varied shapes.
 */
function parseOAuthErrorPayload(text: string | undefined): { code?: string; description?: string } {
  if (!text) {
    return {};
  }

  try {
    const payload = JSON.parse(text) as OAuthErrorPayload;
    if (!payload || typeof payload !== "object") {
      return { description: text };
    }

    let code: string | undefined;
    if (typeof payload.error === "string") {
      code = payload.error;
    } else if (payload.error && typeof payload.error === "object") {
      code = payload.error.status ?? payload.error.code;
      if (!payload.error_description && payload.error.message) {
        return { code, description: payload.error.message };
      }
    }

    const description = payload.error_description;
    if (description) {
      return { code, description };
    }

    if (payload.error && typeof payload.error === "object" && payload.error.message) {
      return { code, description: payload.error.message };
    }

    return { code };
  } catch {
    return { description: text };
  }
}

export class AntigravityTokenRefreshError extends Error {
  code?: string;
  description?: string;
  status: number;
  statusText: string;

  constructor(options: {
    message: string;
    code?: string;
    description?: string;
    status: number;
    statusText: string;
  }) {
    super(options.message);
    this.name = "AntigravityTokenRefreshError";
    this.code = options.code;
    this.description = options.description;
    this.status = options.status;
    this.statusText = options.statusText;
  }
}

/**
 * Performs a single token refresh attempt.
 */
async function attemptTokenRefresh(
  parts: RefreshParts,
  auth: OAuthAuthDetails,
): Promise<OAuthAuthDetails> {
  const startTime = Date.now();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: parts.refreshToken!,
      client_id: ANTIGRAVITY_CLIENT_ID,
      client_secret: ANTIGRAVITY_CLIENT_SECRET,
    }),
  });

  if (!response.ok) {
    let errorText: string | undefined;
    try {
      errorText = await response.text();
    } catch {
      errorText = undefined;
    }

    const { code, description } = parseOAuthErrorPayload(errorText);
    const details = [code, description ?? errorText].filter(Boolean).join(": ");
    const baseMessage = `Antigravity token refresh failed (${response.status} ${response.statusText})`;
    const message = details ? `${baseMessage} - ${details}` : baseMessage;

    if (code === "invalid_grant") {
      log.warn("Google revoked the stored refresh token - reauthentication required");
      invalidateProjectContextCache(auth.refresh);
      clearCachedAuth(auth.refresh);
    }

    throw new AntigravityTokenRefreshError({
      message,
      code,
      description: description ?? errorText,
      status: response.status,
      statusText: response.statusText,
    });
  }

  const payload = (await response.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };

  // Validate response payload
  if (!payload.access_token || typeof payload.access_token !== "string") {
    throw new AntigravityTokenRefreshError({
      message: "Token refresh response missing access_token",
      status: 500,
      statusText: "Invalid Response",
    });
  }

  if (!payload.expires_in || payload.expires_in <= 0) {
    log.warn("Token refresh response has invalid expires_in, using default 3600", {
      expires_in: payload.expires_in,
    });
    payload.expires_in = 3600;
  }

  const refreshedParts: RefreshParts = {
    refreshToken: payload.refresh_token ?? parts.refreshToken,
    projectId: parts.projectId,
    managedProjectId: parts.managedProjectId,
  };

  return {
    ...auth,
    access: payload.access_token,
    expires: calculateTokenExpiry(startTime, payload.expires_in),
    refresh: formatRefreshParts(refreshedParts),
  };
}

/**
 * Refreshes an Antigravity OAuth access token with retry logic for transient failures.
 * Updates persisted credentials and handles revocation.
 */
export async function refreshAccessToken(
  auth: OAuthAuthDetails,
  client: PluginClient,
  providerId: string,
): Promise<OAuthAuthDetails | undefined> {
  const parts = parseRefreshParts(auth.refresh);
  if (!parts.refreshToken) {
    log.warn("No refresh token available for token refresh");
    return undefined;
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const updatedAuth = await attemptTokenRefresh(parts, auth);

      // Success - cache and return
      storeCachedAuth(updatedAuth);
      invalidateProjectContextCache(auth.refresh);

      if (attempt > 0) {
        log.info("Token refresh succeeded after retry", { attempt });
      }

      return updatedAuth;
    } catch (error) {
      lastError = error;

      // Check if error is retryable
      if (!isRetryableError(error)) {
        if (error instanceof AntigravityTokenRefreshError) {
          log.warn("Token refresh failed with non-retryable error", {
            status: error.status,
            code: error.code,
          });
          throw error;
        }
        log.error("Token refresh failed with unexpected error", { error: String(error) });
        return undefined;
      }

      // Don't retry if we've exhausted attempts
      if (attempt >= MAX_RETRIES) {
        break;
      }

      // Wait before retry with exponential backoff
      const delay = getRetryDelay(attempt);
      log.info("Token refresh failed, retrying", {
        attempt: attempt + 1,
        maxRetries: MAX_RETRIES,
        delayMs: delay,
        error: error instanceof Error ? error.message : String(error),
      });
      await sleep(delay);
    }
  }

  // All retries exhausted
  if (lastError instanceof AntigravityTokenRefreshError) {
    log.error("Token refresh failed after all retries", {
      attempts: MAX_RETRIES + 1,
      status: lastError.status,
      code: lastError.code,
    });
    throw lastError;
  }

  log.error("Token refresh failed after all retries with unexpected error", {
    attempts: MAX_RETRIES + 1,
    error: String(lastError),
  });
  return undefined;
}

