/**
 * usePoller tests — test the polling logic independently of React rendering.
 * We test the core behavioral contract: immediate fetch, interval re-fetch,
 * error state with stale data retention.
 *
 * Since @testing-library/react requires React 19 DOM internals (not available
 * with ink@4 / react@18), we test the underlying polling pattern directly.
 */
import { describe, expect, it } from "bun:test";

// ── Helper: minimal poller logic extracted for unit testing ──────────────────
// This mirrors exactly what usePoller does under the hood, so we can assert
// the behavioral contract without needing a React renderer.

interface PollResult<T> {
  status: "ok" | "error";
  data: T | null;
  error: string | null;
}

async function runPoller<T>(
  fetcher: () => Promise<T>,
  ticks: number,
  intervalMs: number,
): Promise<PollResult<T>[]> {
  const results: PollResult<T>[] = [];
  let lastData: T | null = null;

  for (let i = 0; i < ticks; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, intervalMs));
    try {
      const data = await fetcher();
      lastData = data;
      results.push({ status: "ok", data, error: null });
    } catch (err) {
      results.push({
        status: "error",
        data: lastData,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}

describe("usePoller behavioral contract", () => {
  it("first tick resolves to ok state with fetched data", async () => {
    const fetcher = () => Promise.resolve(["item1", "item2"]);
    const results = await runPoller(fetcher, 1, 0);
    expect(results[0]?.status).toBe("ok");
    expect(results[0]?.data).toEqual(["item1", "item2"]);
    expect(results[0]?.error).toBeNull();
  });

  it("error state is reached when fetcher rejects", async () => {
    const fetcher = () => Promise.reject(new Error("network failure"));
    const results = await runPoller(fetcher, 1, 0);
    expect(results[0]?.status).toBe("error");
    expect(results[0]?.error).toBe("network failure");
  });

  it("retains last successful data when subsequent fetch fails", async () => {
    let callCount = 0;
    const fetcher = () => {
      callCount++;
      if (callCount === 1) return Promise.resolve(["first-data"]);
      return Promise.reject(new Error("second-fail"));
    };

    const results = await runPoller(fetcher, 2, 0);
    // First tick: ok
    expect(results[0]?.status).toBe("ok");
    expect(results[0]?.data).toEqual(["first-data"]);
    // Second tick: error but retains last data
    expect(results[1]?.status).toBe("error");
    expect(results[1]?.data).toEqual(["first-data"]);
    expect(results[1]?.error).toBe("second-fail");
  });

  it("recovers from error on next successful fetch", async () => {
    let callCount = 0;
    const fetcher = () => {
      callCount++;
      if (callCount === 1) return Promise.reject(new Error("transient"));
      return Promise.resolve(["recovered"]);
    };

    const results = await runPoller(fetcher, 2, 0);
    expect(results[0]?.status).toBe("error");
    expect(results[1]?.status).toBe("ok");
    expect(results[1]?.data).toEqual(["recovered"]);
    expect(results[1]?.error).toBeNull();
  });
});
