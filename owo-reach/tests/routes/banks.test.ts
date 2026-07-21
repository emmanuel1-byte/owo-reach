import { describe, it, expect, afterEach } from "bun:test";
import { Hono } from "hono";
import { banksRoute } from "../../server/routes/banks";
import { mockMonnifyFetch } from "../helpers/fetchMock";
import { __resetAuthTokenForTests } from "../../server/monnify/client";

const app = new Hono();
app.route("/banks", banksRoute);

afterEach(() => __resetAuthTokenForTests());

describe("GET /banks", () => {
  it("returns the Monnify bank list", async () => {
    const restore = mockMonnifyFetch({
      "/api/v1/banks": () => ({
        body: { requestSuccessful: true, responseMessage: "ok", responseCode: "0", responseBody: [{ name: "Guaranty Trust Bank", code: "058" }] },
      }),
    });
    try {
      const res = await app.request("/banks");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([{ name: "Guaranty Trust Bank", code: "058" }]);
    } finally {
      restore();
    }
  });
});
