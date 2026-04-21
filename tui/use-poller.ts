import { useEffect, useRef, useState } from "react";

export type PollState<T> =
  | { status: "loading"; data: null; error: null }
  | { status: "ok"; data: T; error: null }
  | { status: "error"; data: T | null; error: string };

/**
 * Generic polling hook. Calls `fetcher` immediately on mount, then every
 * `intervalMs` milliseconds. Each panel gets its own poller so one failing
 * endpoint doesn't block others.
 *
 * On error, retains the last successful `data` value (stale-while-error).
 */
export function usePoller<T>(fetcher: () => Promise<T>, intervalMs: number): PollState<T> {
  const [state, setState] = useState<PollState<T>>({ status: "loading", data: null, error: null });
  // Use ref to always have the latest data in the interval callback without
  // causing unnecessary re-subscriptions.
  const lastDataRef = useRef<T | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const data = await fetcher();
        if (cancelled) return;
        lastDataRef.current = data;
        setState({ status: "ok", data, error: null });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setState({ status: "error", data: lastDataRef.current, error: message });
      }
    }

    // Fire immediately, then on interval.
    void tick();
    const timer = setInterval(tick, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [fetcher, intervalMs]);

  return state;
}
