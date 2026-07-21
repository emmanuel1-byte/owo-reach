import { describe, it, expect, afterEach } from "bun:test";
import { getToken, monnify, MonnifyError, __resetAuthTokenForTests } from "../../server/monnify/client";
import { mockMonnifyFetch } from "../helpers/fetchMock";

describe("monnify/client", () => {
  afterEach(() => {
    __resetAuthTokenForTests();
  });

  it("getToken authenticates and caches the token across calls", async () => {
    let loginCalls = 0;
    const restore = mockMonnifyFetch({
      "/api/v1/auth/login": () => {
        loginCalls++;
        return {
          body: {
            requestSuccessful: true,
            responseMessage: "success",
            responseCode: "0",
            responseBody: { accessToken: "token-abc", expiresIn: 3600 },
          },
        };
      },
    });
    try {
      const first = await getToken();
      const second = await getToken();
      expect(first).toBe("token-abc");
      expect(second).toBe("token-abc");
      expect(loginCalls).toBe(1); // second call served from cache
    } finally {
      restore();
    }
  });

  it("monnify() sends a Bearer token and returns responseBody on success", async () => {
    const restore = mockMonnifyFetch({
      "/api/v1/banks": (_url, init) => {
        expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
        return {
          body: { requestSuccessful: true, responseMessage: "success", responseCode: "0", responseBody: [{ code: "058", name: "GTBank" }] },
        };
      },
    });
    try {
      const result = await monnify<{ code: string }[]>("/api/v1/banks");
      expect(result).toEqual([{ code: "058", name: "GTBank" }]);
    } finally {
      restore();
    }
  });

  it("monnify() throws MonnifyError with the API's code and message on failure", async () => {
    const restore = mockMonnifyFetch({
      "/api/v1/banks": () => ({
        status: 400,
        body: { requestSuccessful: false, responseMessage: "Something went wrong", responseCode: "99" },
      }),
    });
    try {
      await expect(monnify("/api/v1/banks")).rejects.toThrow(MonnifyError);
      await expect(monnify("/api/v1/banks")).rejects.toThrow(/Something went wrong/);
    } finally {
      restore();
    }
  });

  it("monnify() retries once on a 401 with a fresh token, then succeeds", async () => {
    let bankCalls = 0;
    let loginCalls = 0;
    const restore = mockMonnifyFetch({
      "/api/v1/auth/login": () => {
        loginCalls++;
        return {
          body: {
            requestSuccessful: true,
            responseMessage: "success",
            responseCode: "0",
            responseBody: { accessToken: `token-${loginCalls}`, expiresIn: 3600 },
          },
        };
      },
      "/api/v1/banks": () => {
        bankCalls++;
        if (bankCalls === 1) return { status: 401, body: { requestSuccessful: false, responseMessage: "expired", responseCode: "401" } };
        return { body: { requestSuccessful: true, responseMessage: "success", responseCode: "0", responseBody: [] } };
      },
    });
    try {
      const result = await monnify("/api/v1/banks");
      expect(result).toEqual([]);
      expect(bankCalls).toBe(2);
      expect(loginCalls).toBe(2); // initial auth + re-auth after the 401
    } finally {
      restore();
    }
  });

  it("monnify() throws on a non-JSON response instead of crashing", async () => {
    const original = global.fetch;
    global.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
      if (url.pathname === "/api/v1/auth/login") {
        return new Response(
          JSON.stringify({ requestSuccessful: true, responseMessage: "ok", responseCode: "0", responseBody: { accessToken: "t", expiresIn: 3600 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("<html>not json</html>", { status: 200 });
    }) as unknown as typeof fetch;
    try {
      await expect(monnify("/api/v1/banks")).rejects.toThrow(MonnifyError);
    } finally {
      global.fetch = original;
    }
  });
});
