import { describe, expect, it } from "bun:test";
import type { ClockPort } from "../../src/adapters/ports/clock.port.ts";
import { SystemClock } from "../../src/infra/clock/system-clock.ts";
import { VirtualClock } from "../helpers/virtual-clock.ts";

function clockContract(name: string, make: () => ClockPort) {
  describe(`ClockPort contract — ${name}`, () => {
    it("now() returns a Date", () => {
      const clock = make();
      const t = clock.now();
      expect(t).toBeInstanceOf(Date);
    });

    it("nowMs() matches now().getTime()", () => {
      const clock = make();
      const ms = clock.nowMs();
      const dateMs = clock.now().getTime();
      // Allow 5 ms drift for SystemClock between the two calls.
      expect(Math.abs(dateMs - ms)).toBeLessThanOrEqual(5);
    });

    it("nowMs() is monotonically non-decreasing", async () => {
      const clock = make();
      const a = clock.nowMs();
      await new Promise((r) => setTimeout(r, 2));
      const b = clock.nowMs();
      expect(b).toBeGreaterThanOrEqual(a);
    });
  });
}

clockContract("SystemClock", () => new SystemClock());
clockContract("VirtualClock", () => new VirtualClock(1_700_000_000_000));

describe("VirtualClock advance", () => {
  it("advance(ms) moves nowMs deterministically", () => {
    const clock = new VirtualClock(1_000);
    expect(clock.nowMs()).toBe(1_000);
    clock.advance(500);
    expect(clock.nowMs()).toBe(1_500);
    clock.advance(250);
    expect(clock.nowMs()).toBe(1_750);
    expect(clock.now().getTime()).toBe(1_750);
  });

  it("setNow jumps instantly", () => {
    const clock = new VirtualClock(0);
    clock.setNow(42_000);
    expect(clock.nowMs()).toBe(42_000);
  });

  it("rejects negative advance", () => {
    const clock = new VirtualClock(0);
    expect(() => clock.advance(-1)).toThrow();
  });
});
