/**
 * Tiny in-process event bus bridging webhook processing → SSE streams.
 * Every payment state change is published here; every open dashboard
 * subscribes. Single-process by design (fine for this product's scale;
 * swap for Redis pub/sub if you ever go multi-instance).
 */

export interface AppEvent {
  type: string; // e.g. "beneficiary.updated", "run.completed"
  payload: unknown;
  at: string;
}

type Listener = (event: AppEvent) => void;

const listeners = new Set<Listener>();

export function publish(type: string, payload: unknown): AppEvent {
  const event: AppEvent = { type, payload, at: new Date().toISOString() };
  for (const l of listeners) {
    try {
      l(event);
    } catch {
      /* one bad stream must never break the others */
    }
  }
  return event;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
