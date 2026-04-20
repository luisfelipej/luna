import { expect, it } from "bun:test";
import type { TelegramTransport } from "../../src/adapters/ports/telegram-transport.port.ts";

/**
 * Shared contract for every `TelegramTransport` implementation. The fixture
 * exposes the observable outputs the port must guarantee regardless of
 * whether a fake or the real grammY-backed transport is under test.
 */
export interface TransportFixture {
  readonly transport: TelegramTransport;
  sent(): ReadonlyArray<{ chatId: number; text: string }>;
  edits(): ReadonlyArray<{ chatId: number; messageId: number; text: string }>;
  files(): ReadonlyArray<{ chatId: number; path: string; caption?: string }>;
}

export type TransportFactory = () => Promise<TransportFixture> | TransportFixture;

/**
 * Runs the full port contract. Call once per implementation inside a
 * describe block.
 */
export function runTelegramTransportContract(make: TransportFactory): void {
  it("sendMessage returns a numeric message_id", async () => {
    const f = await make();
    const id = await f.transport.sendMessage(42, "hello");
    expect(typeof id).toBe("number");
    expect(id).toBeGreaterThan(0);
    expect(f.sent()).toEqual([{ chatId: 42, text: "hello" }]);
  });

  it("sendMessage returns distinct ids for successive messages", async () => {
    const f = await make();
    const a = await f.transport.sendMessage(42, "a");
    const b = await f.transport.sendMessage(42, "b");
    expect(a).not.toBe(b);
  });

  it("editMessage records chatId + messageId + new text", async () => {
    const f = await make();
    const id = await f.transport.sendMessage(42, "v1");
    await f.transport.editMessage(42, id, "v2");
    expect(f.edits()).toEqual([{ chatId: 42, messageId: id, text: "v2" }]);
  });

  it("sendFile forwards the path + optional caption", async () => {
    const f = await make();
    await f.transport.sendFile(42, "/tmp/x.txt", "caption");
    expect(f.files()).toEqual([{ chatId: 42, path: "/tmp/x.txt", caption: "caption" }]);
  });

  it("start/stop are idempotent", async () => {
    const f = await make();
    await f.transport.start();
    await f.transport.start();
    await f.transport.stop();
    await f.transport.stop();
  });
}
