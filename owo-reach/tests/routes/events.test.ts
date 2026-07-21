import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { eventsRoute } from "../../server/routes/events";
import { publish } from "../../server/lib/sse";

const app = new Hono();
app.route("/events", eventsRoute);

describe("GET /events", () => {
  it("streams a published event as SSE to a connected client", async () => {
    const res = await app.request("/events");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    // give the handler a tick to call subscribe() before we publish
    await new Promise((resolve) => setTimeout(resolve, 10));
    publish("beneficiary.updated", { beneficiaryId: "ben_x", status: "COMPLETED" });

    let received = "";
    const deadline = Date.now() + 2000;
    while (!received.includes("beneficiary.updated") && Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      received += decoder.decode(value, { stream: true });
    }

    expect(received).toContain("event: beneficiary.updated");
    expect(received).toContain("ben_x");
    expect(received).toContain("COMPLETED");

    await reader.cancel();
  });
});
