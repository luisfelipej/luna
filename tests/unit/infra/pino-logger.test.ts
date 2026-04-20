import { describe, expect, it } from "bun:test";
import { PinoLogger } from "../../../src/infra/logger/pino-logger.ts";

function parseLines(buf: string): Record<string, unknown>[] {
  return buf
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

describe("PinoLogger", () => {
  it("writes JSON lines with level + msg", () => {
    const chunks: string[] = [];
    const stream = {
      write(s: string) {
        chunks.push(s);
      },
    };
    const logger = new PinoLogger({ level: "debug", stream });
    logger.info("hello", { chatId: 42 });
    logger.warn("heads up");
    logger.error("kaboom", { err: "stringified" });

    const lines = parseLines(chunks.join(""));
    expect(lines).toHaveLength(3);
    expect(lines[0]!.msg).toBe("hello");
    expect(lines[0]!.level).toBe(30); // pino: info=30
    expect(lines[0]!.chatId).toBe(42);
    expect(lines[1]!.level).toBe(40); // warn=40
    expect(lines[2]!.level).toBe(50); // error=50
  });

  it("child logger inherits bindings", () => {
    const chunks: string[] = [];
    const logger = new PinoLogger({
      level: "info",
      stream: { write: (s) => chunks.push(s) },
    });
    const child = logger.child({ component: "scheduler", jobId: 7 });
    child.info("registered");

    const lines = parseLines(chunks.join(""));
    expect(lines).toHaveLength(1);
    expect(lines[0]!.component).toBe("scheduler");
    expect(lines[0]!.jobId).toBe(7);
    expect(lines[0]!.msg).toBe("registered");
  });

  it("respects level threshold", () => {
    const chunks: string[] = [];
    const logger = new PinoLogger({
      level: "warn",
      stream: { write: (s) => chunks.push(s) },
    });
    logger.info("should be filtered");
    logger.warn("kept");
    const lines = parseLines(chunks.join(""));
    expect(lines).toHaveLength(1);
    expect(lines[0]!.msg).toBe("kept");
  });
});
