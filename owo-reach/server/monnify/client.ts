import { env } from "../env";
import { MONNIFY, type MonnifyResponse } from "./config";

/**
 * Thin Monnify HTTP client.
 * - Caches the bearer token until 60s before expiry (re-authing per request is
 *   the classic hidden 300ms tax).
 * - Retries exactly once on a 401 with a fresh token.
 * - Throws MonnifyError with the API's responseMessage/responseCode so failures
 *   are debuggable, not mysterious.
 */

export class MonnifyError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "MonnifyError";
  }
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function login(): Promise<string> {
  const basic = Buffer.from(`${env.MONNIFY_API_KEY}:${env.MONNIFY_SECRET_KEY}`).toString("base64");
  const res = await fetch(`${env.MONNIFY_BASE_URL}${MONNIFY.AUTH_LOGIN}`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}` },
  });
  const json = (await res.json()) as MonnifyResponse<{ accessToken: string; expiresIn: number }>;
  if (!res.ok || !json.requestSuccessful) {
    throw new MonnifyError(
      `Auth failed: ${json.responseMessage ?? res.statusText}`,
      json.responseCode,
      res.status,
    );
  }
  cachedToken = {
    token: json.responseBody.accessToken,
    // refresh 60s early
    expiresAt: Date.now() + (json.responseBody.expiresIn - 60) * 1000,
  };
  return cachedToken.token;
}

export async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;
  return login();
}

/** Test-only: clears the cached auth token so tests can exercise the re-auth path. */
export function __resetAuthTokenForTests(): void {
  cachedToken = null;
}

export async function monnify<T>(
  path: string,
  init: { method?: string; body?: unknown; query?: Record<string, string> } = {},
): Promise<T> {
  const doFetch = async (token: string) => {
    const url = new URL(`${env.MONNIFY_BASE_URL}${path}`);
    for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
    return fetch(url, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  };

  let res = await doFetch(await getToken());
  if (res.status === 401) {
    cachedToken = null; // token revoked/expired server-side — retry once fresh
    res = await doFetch(await getToken());
  }

  const json = (await res.json().catch(() => null)) as MonnifyResponse<T> | null;
  if (!json) throw new MonnifyError(`Non-JSON response from ${path}`, undefined, res.status);
  if (!res.ok || !json.requestSuccessful) {
    throw new MonnifyError(
      `${path} → ${json.responseMessage ?? res.statusText}`,
      json.responseCode,
      res.status,
    );
  }
  return json.responseBody;
}
