import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { computeLogPath, readLastN } from "../log-tail.ts";

// ── computeLogPath ────────────────────────────────────────────────────────────

describe("computeLogPath", () => {
  it("returns path with YYYY-MM-DD date and .jsonl extension", () => {
    const result = computeLogPath("/data", new Date("2026-04-21T00:01:00Z"));
    expect(result).toBe("/data/history/2026-04-21.jsonl");
  });

  it("uses UTC date (not local time)", () => {
    // 2026-04-21T23:59:00Z is still Apr 21 UTC
    const result = computeLogPath("/data", new Date("2026-04-21T23:59:00Z"));
    expect(result).toBe("/data/history/2026-04-21.jsonl");
  });

  it("handles midnight rotation (new date after 00:00:00Z)", () => {
    const before = computeLogPath("/data", new Date("2026-04-20T23:59:59Z"));
    const after = computeLogPath("/data", new Date("2026-04-21T00:00:01Z"));
    expect(before).toBe("/data/history/2026-04-20.jsonl");
    expect(after).toBe("/data/history/2026-04-21.jsonl");
  });
});

// ── readLastN ─────────────────────────────────────────────────────────────────

describe("readLastN", () => {
  it("returns [] when file does not exist", async () => {
    const result = await readLastN("/nonexistent/path/to/file.jsonl", 20);
    expect(result).toEqual([]);
  });

  it("returns [] when path is a directory", async () => {
    const result = await readLastN(tmpdir(), 20);
    expect(result).toEqual([]);
  });

  it("returns last N lines from a file with content", async () => {
    const dir = join(tmpdir(), `luna-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, "test.jsonl");

    const lines = Array.from({ length: 30 }, (_, i) =>
      JSON.stringify({ msg: `line ${i + 1}`, level: "info" }),
    );
    writeFileSync(filePath, lines.join("\n") + "\n");

    try {
      const result = await readLastN(filePath, 20);
      expect(result.length).toBe(20);
      // Last line should be line 30
      expect(result[19]?.parsed?.msg).toBe("line 30");
      // First returned line should be line 11
      expect(result[0]?.parsed?.msg).toBe("line 11");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns all lines when file has fewer than N lines", async () => {
    const dir = join(tmpdir(), `luna-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, "short.jsonl");
    writeFileSync(filePath, '{"msg":"only one"}\n');

    try {
      const result = await readLastN(filePath, 20);
      expect(result.length).toBe(1);
      expect(result[0]?.parsed?.msg).toBe("only one");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns raw text for malformed JSON lines without throwing", async () => {
    const dir = join(tmpdir(), `luna-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, "mixed.jsonl");
    writeFileSync(filePath, '{"valid":true}\nnot json at all\n{"also":"valid"}\n');

    try {
      const result = await readLastN(filePath, 20);
      expect(result.length).toBe(3);
      expect(result[0]?.parsed?.valid).toBe(true);
      expect(result[1]?.raw).toBe("not json at all");
      expect(result[1]?.parsed).toBeUndefined();
      expect(result[2]?.parsed?.also).toBe("valid");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ignores empty lines", async () => {
    const dir = join(tmpdir(), `luna-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, "sparse.jsonl");
    writeFileSync(filePath, '\n{"msg":"a"}\n\n{"msg":"b"}\n\n');

    try {
      const result = await readLastN(filePath, 20);
      expect(result.length).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
