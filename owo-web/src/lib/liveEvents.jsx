import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "./queries.js";

// Every named SSE event the backend's /api/events stream can emit
// (see server/routes/events.ts + every `publish(...)` call server-side).
const EVENT_TYPES = [
  "ingestion.started",
  "ingestion.parsed",
  "ingestion.verifying",
  "ingestion.brief",
  "run.created",
  "run.updated",
  "beneficiary.updated",
  "beneficiary.paycode_revealed",
  "beneficiary.nudge_sent",
  "webhook.received",
];

const LiveEventsContext = createContext(null);

/**
 * One EventSource for the whole app. Previously each page opened its own, so a
 * single screen could hold several connections to the same stream; now the
 * cache is the shared state and this just tells it what went stale.
 *
 * Pages that need the raw events (the ingestion progress steps on Home) can
 * still subscribe via useLiveEvents without opening a second connection.
 */
export function LiveEventsProvider({ children }) {
  const queryClient = useQueryClient();
  const listenersRef = useRef(new Set());

  useEffect(() => {
    const source = new EventSource("/api/events");

    function invalidate(type) {
      switch (type) {
        case "run.created":
          queryClient.invalidateQueries({ queryKey: qk.runs });
          break;
        case "run.updated":
        case "beneficiary.updated":
          // A beneficiary moving can settle its run and move the float with it,
          // so the run list, the open run, and the ledger all go stale at once.
          queryClient.invalidateQueries({ queryKey: qk.runs });
          queryClient.invalidateQueries({ queryKey: ["run"] });
          queryClient.invalidateQueries({ queryKey: qk.ledger });
          break;
        case "beneficiary.paycode_revealed":
        case "beneficiary.nudge_sent":
          queryClient.invalidateQueries({ queryKey: ["run"] });
          break;
        case "webhook.received":
          // Monnify is the source of truth for both payouts and deposits —
          // after one lands, nothing on screen can be assumed current.
          queryClient.invalidateQueries();
          break;
        default:
          break; // ingestion.* is progress, not state
      }
    }

    const bound = EVENT_TYPES.map((type) => {
      const listener = (e) => {
        let payload = {};
        try {
          payload = JSON.parse(e.data);
        } catch {
          /* ignore malformed payloads rather than crash the dashboard */
        }
        invalidate(type);
        listenersRef.current.forEach((fn) => fn(type, payload));
      };
      source.addEventListener(type, listener);
      return [type, listener];
    });

    return () => {
      bound.forEach(([type, listener]) => source.removeEventListener(type, listener));
      source.close();
    };
  }, [queryClient]);

  const value = useMemo(
    () => ({
      subscribe(fn) {
        listenersRef.current.add(fn);
        return () => listenersRef.current.delete(fn);
      },
    }),
    []
  );

  return <LiveEventsContext.Provider value={value}>{children}</LiveEventsContext.Provider>;
}

export function useLiveEvents(onEvent) {
  const ctx = useContext(LiveEventsContext);
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!ctx) return;
    return ctx.subscribe((type, payload) => handlerRef.current?.(type, payload));
  }, [ctx]);
}
