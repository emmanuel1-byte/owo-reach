import { mock } from "bun:test";

type MockResponse = { status?: number; body: unknown };
type Handler = (url: URL, init: RequestInit | undefined) => MockResponse;

const defaultAuthHandler: Handler = () => ({
  body: {
    requestSuccessful: true,
    responseMessage: "success",
    responseCode: "0",
    responseBody: { accessToken: "test-token", expiresIn: 3600 },
  },
});

/**
 * Replaces global fetch with a router keyed by URL pathname. `/api/v1/auth/login`
 * is handled automatically (always succeeds) unless overridden. Returns a
 * restore function — always call it (e.g. in `afterEach`) so mocks don't leak
 * across test files sharing the same process.
 */
export function mockMonnifyFetch(handlers: Record<string, Handler>): () => void {
  const original = global.fetch;
  global.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(raw);
    const handler = handlers[url.pathname] ?? (url.pathname === "/api/v1/auth/login" ? defaultAuthHandler : undefined);
    if (!handler) throw new Error(`mockMonnifyFetch: no handler registered for ${url.pathname}`);
    const { status = 200, body } = handler(url, init);
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  return () => {
    global.fetch = original;
  };
}
