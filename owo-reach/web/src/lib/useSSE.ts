import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Subscribes to /api/events and invalidates run queries when money moves.
 * EventSource reconnects automatically — no socket lifecycle to manage.
 */
export function useLiveEvents(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const source = new EventSource("/api/events");

    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ["runs"] });
      void queryClient.invalidateQueries({ queryKey: ["run"] });
    };

    source.addEventListener("beneficiary.updated", refresh);
    source.addEventListener("run.updated", refresh);
    source.addEventListener("webhook.received", refresh);

    return () => source.close();
  }, [queryClient]);
}
