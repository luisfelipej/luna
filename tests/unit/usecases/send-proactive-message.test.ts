import { describe, expect, it } from "bun:test";
import { makeSendProactiveMessage } from "../../../src/usecases/http/send-proactive-message.ts";
import { FakeTelegramTransport } from "../../helpers/fakes/fake-telegram-transport.ts";

describe("SendProactiveMessage", () => {
  it("sends to an allow-listed chat", async () => {
    const transport = new FakeTelegramTransport();
    const send = makeSendProactiveMessage({ transport, allowList: [42] });
    await send({ chatId: 42, text: "hi" });
    expect(transport.sent).toEqual([{ chatId: 42, text: "hi" }]);
  });

  it("rejects a non-allow-listed chat", async () => {
    const transport = new FakeTelegramTransport();
    const send = makeSendProactiveMessage({ transport, allowList: [42] });
    await expect(send({ chatId: 99, text: "hi" })).rejects.toThrow(/not allow-listed/i);
    expect(transport.sent).toHaveLength(0);
  });

  it("sends a file with optional caption", async () => {
    const transport = new FakeTelegramTransport();
    const send = makeSendProactiveMessage({ transport, allowList: [42] });
    await send({ chatId: 42, filePath: "/tmp/x.txt", caption: "see" });
    expect(transport.files).toEqual([{ chatId: 42, path: "/tmp/x.txt", caption: "see" }]);
  });
});
