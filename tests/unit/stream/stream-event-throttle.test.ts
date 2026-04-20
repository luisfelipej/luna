import { describe, expect, it } from "bun:test";
import type { StreamChunk } from "../../../src/entities/stream-chunk.ts";
import {
  makeStreamEventThrottle,
  type ThrottleEmit,
} from "../../../src/usecases/stream/stream-event-throttle.ts";
import { VirtualClock } from "../../helpers/virtual-clock.ts";

async function* fromArray<T>(xs: T[]): AsyncIterable<T> {
  for (const x of xs) yield x;
}

function emitRecorder() {
  const emits: ThrottleEmit[] = [];
  return {
    emits,
    emit: async (e: ThrottleEmit) => {
      emits.push(e);
    },
  };
}

const done = (textSoFar: string): StreamChunk => ({
  textSoFar,
  done: true,
  response: { sessionId: "s", costUsd: 0, durationMs: 0 },
});
const delta = (textSoFar: string): StreamChunk => ({ textSoFar, done: false });

describe("StreamEventThrottle", () => {
  it("single terminal chunk → exactly one `send`, zero edits", async () => {
    const rec = emitRecorder();
    const clock = new VirtualClock();
    const run = makeStreamEventThrottle({ clock, emit: rec.emit });
    await run(fromArray([done("hello")]));
    expect(rec.emits).toEqual([{ kind: "send", text: "hello" }]);
  });

  it("first delta + terminal chunk emits send + single trailing edit", async () => {
    const rec = emitRecorder();
    const clock = new VirtualClock();
    const run = makeStreamEventThrottle({ clock, emit: rec.emit });
    await run(fromArray([delta("h"), done("hi!")]));
    expect(rec.emits).toEqual([
      { kind: "send", text: "h" },
      { kind: "edit", text: "hi!" },
    ]);
  });

  it("rapid deltas within window → coalesced (no mid-stream edit)", async () => {
    const rec = emitRecorder();
    const clock = new VirtualClock();
    const run = makeStreamEventThrottle({ clock, emit: rec.emit, windowMs: 2000 });

    async function* drive(): AsyncIterable<StreamChunk> {
      yield delta("h");
      clock.advance(100);
      yield delta("he");
      clock.advance(200);
      yield delta("hello");
      clock.advance(300);
      yield done("hello!");
    }

    await run(drive());
    expect(rec.emits.map((e) => e.kind)).toEqual(["send", "edit"]);
    expect(rec.emits[1]).toEqual({ kind: "edit", text: "hello!" });
  });

  it("silence past window + final flush → send + one mid edit + trailing edit", async () => {
    const rec = emitRecorder();
    const clock = new VirtualClock();
    const run = makeStreamEventThrottle({ clock, emit: rec.emit, windowMs: 2000 });

    async function* drive(): AsyncIterable<StreamChunk> {
      yield delta("hi");
      clock.advance(2500);
      yield delta("hi there");
      clock.advance(500);
      yield done("hi there, friend");
    }

    await run(drive());
    expect(rec.emits).toEqual([
      { kind: "send", text: "hi" },
      { kind: "edit", text: "hi there" },
      { kind: "edit", text: "hi there, friend" },
    ]);
  });

  it("window boundary exactly at 1999/2000/2001 ms", async () => {
    const below = emitRecorder();
    const at = emitRecorder();
    const above = emitRecorder();

    async function driveAt(offsetMs: number, rec: ReturnType<typeof emitRecorder>) {
      const clock = new VirtualClock();
      const run = makeStreamEventThrottle({ clock, emit: rec.emit, windowMs: 2000 });
      async function* drive(): AsyncIterable<StreamChunk> {
        yield delta("a");
        clock.advance(offsetMs);
        yield delta("ab");
        yield done("abc");
      }
      await run(drive());
    }

    await driveAt(1999, below);
    await driveAt(2000, at);
    await driveAt(2001, above);

    expect(below.emits.map((e) => e.kind)).toEqual(["send", "edit"]); // only trailing
    expect(at.emits.map((e) => e.kind)).toEqual(["send", "edit", "edit"]); // mid + trailing
    expect(above.emits.map((e) => e.kind)).toEqual(["send", "edit", "edit"]);
  });

  it("trailing edit is suppressed when text did not change", async () => {
    const rec = emitRecorder();
    const clock = new VirtualClock();
    const run = makeStreamEventThrottle({ clock, emit: rec.emit, windowMs: 2000 });

    async function* drive(): AsyncIterable<StreamChunk> {
      yield delta("same");
      clock.advance(3000);
      yield delta("same"); // triggers mid-edit? no text change → skip
      yield done("same");
    }
    await run(drive());
    expect(rec.emits).toEqual([{ kind: "send", text: "same" }]);
  });
});
