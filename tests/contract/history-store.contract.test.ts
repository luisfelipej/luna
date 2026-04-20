import { describe, expect, test } from "bun:test";
import { JsonlHistoryStore } from "../../src/infra/fs/jsonl-history-store.ts";
import type { MessageLine } from "../../src/entities/message.ts";
import { MemFsPort } from "../helpers/fakes/mem-fs-port.ts";
import { VirtualClock } from "../helpers/virtual-clock.ts";

function sampleLine(over: Partial<MessageLine> = {}): MessageLine {
  return {
    chatId: 1,
    text: "hi",
    dir: "user",
    ts: "2025-01-01T00:00:00Z",
    ...over,
  };
}

describe("JsonlHistoryStore", () => {
  test("appends to YYYY-MM-DD.jsonl by UTC day", async () => {
    const fs = new MemFsPort();
    const clock = new VirtualClock(Date.UTC(2025, 0, 1, 12, 0, 0));
    const store = new JsonlHistoryStore(fs, clock, "/data/history");
    await store.append(1, sampleLine({ text: "a" }));
    const buf = fs._read("/data/history/1/2025-01-01.jsonl");
    expect(buf?.toString()).toContain('"a"');
  });

  test("UTC day rollover creates a new file", async () => {
    const fs = new MemFsPort();
    const clock = new VirtualClock(Date.UTC(2025, 0, 1, 23, 59, 59));
    const store = new JsonlHistoryStore(fs, clock, "/h");
    await store.append(1, sampleLine({ text: "jan1" }));
    clock.advance(2000);
    await store.append(1, sampleLine({ text: "jan2" }));
    expect(fs._read("/h/1/2025-01-01.jsonl")?.toString()).toContain("jan1");
    expect(fs._read("/h/1/2025-01-02.jsonl")?.toString()).toContain("jan2");
  });

  test("tail walks backwards across daily files", async () => {
    const fs = new MemFsPort();
    const clock = new VirtualClock(Date.UTC(2025, 0, 1, 0, 0, 0));
    const store = new JsonlHistoryStore(fs, clock, "/h");
    await store.append(1, sampleLine({ text: "d1-a" }));
    await store.append(1, sampleLine({ text: "d1-b" }));
    clock.setNow(Date.UTC(2025, 0, 2, 0, 0, 0));
    await store.append(1, sampleLine({ text: "d2-a" }));
    const last3 = await store.tail(1, 3);
    expect(last3.map((l) => l.text)).toEqual(
      ["d1-b", "d2-a"].concat([]).length === 2
        ? ["d1-a", "d1-b", "d2-a"]
        : ["d1-a", "d1-b", "d2-a"],
    );
    // equivalent simpler assertion (kept defensive above):
    expect(last3.map((l) => l.text)).toEqual(["d1-a", "d1-b", "d2-a"]);
  });

  test("appends do not interleave (sequential ordering)", async () => {
    const fs = new MemFsPort();
    const clock = new VirtualClock(Date.UTC(2025, 0, 1, 0, 0, 0));
    const store = new JsonlHistoryStore(fs, clock, "/h");
    await Promise.all([
      store.append(1, sampleLine({ text: "x1" })),
      store.append(1, sampleLine({ text: "x2" })),
      store.append(1, sampleLine({ text: "x3" })),
    ]);
    const buf = fs._read("/h/1/2025-01-01.jsonl")?.toString() ?? "";
    const lines = buf.split("\n").filter(Boolean);
    expect(lines).toHaveLength(3);
    for (const l of lines) {
      // Each line parses cleanly — no concat garbage.
      expect(() => JSON.parse(l)).not.toThrow();
    }
  });

  test("tail on empty chat returns []", async () => {
    const fs = new MemFsPort();
    const clock = new VirtualClock(Date.UTC(2025, 0, 1, 0, 0, 0));
    const store = new JsonlHistoryStore(fs, clock, "/h");
    expect(await store.tail(99, 5)).toEqual([]);
  });
});
