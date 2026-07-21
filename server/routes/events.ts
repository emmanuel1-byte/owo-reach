import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { subscribe } from "../lib/sse";

export const eventsRoute = new Hono();

/**
 * GET /api/events — the dashboard's live wire.
 * SSE over WebSockets on purpose: traffic is strictly server→client,
 * EventSource reconnects automatically, and it's ~20 lines instead of a
 * socket server. Heartbeat every 25s keeps proxies from closing the stream.
 */
eventsRoute.get("/", (c) => {
  return streamSSE(c, async (stream) => {
    let id = 0;
    const unsubscribe = subscribe((event) => {
      void stream.writeSSE({
        id: String(id++),
        event: event.type,
        data: JSON.stringify(event),
      });
    });

    const heartbeat = setInterval(() => {
      void stream.writeSSE({ event: "ping", data: "{}" });
    }, 25_000);

    stream.onAbort(() => {
      clearInterval(heartbeat);
      unsubscribe();
    });

    // Hold the stream open until the client disconnects.
    await new Promise<void>((resolve) => stream.onAbort(resolve));
  });
});
