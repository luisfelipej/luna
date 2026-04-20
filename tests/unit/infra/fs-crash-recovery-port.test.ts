import { describe, expect, it } from "bun:test";
import { FsCrashRecoveryPort } from "../../../src/infra/fs/fs-crash-recovery-port.ts";
import { MemFsPort } from "../../helpers/fakes/mem-fs-port.ts";

describe("FsCrashRecoveryPort", () => {
  it("mark writes a <chatId>.flag; clear removes it", async () => {
    const fs = new MemFsPort();
    const crash = new FsCrashRecoveryPort(fs, "/data");
    await crash.mark(42);
    expect(await fs.exists("/data/crash/42.flag")).toBe(true);
    await crash.clear(42);
    expect(await fs.exists("/data/crash/42.flag")).toBe(false);
  });

  it("listPending returns pending chat ids, sorted", async () => {
    const fs = new MemFsPort();
    const crash = new FsCrashRecoveryPort(fs, "/data");
    await crash.mark(99);
    await crash.mark(7);
    await crash.mark(42);
    expect(await crash.listPending()).toEqual([7, 42, 99]);
  });

  it("listPending returns [] when no crash dir exists", async () => {
    const fs = new MemFsPort();
    const crash = new FsCrashRecoveryPort(fs, "/data");
    expect(await crash.listPending()).toEqual([]);
  });

  it("clear is a no-op when the flag isn't present", async () => {
    const fs = new MemFsPort();
    const crash = new FsCrashRecoveryPort(fs, "/data");
    await crash.clear(42); // should not throw
    expect(await crash.listPending()).toEqual([]);
  });

  it("ignores non-flag files in the crash directory", async () => {
    const fs = new MemFsPort();
    const crash = new FsCrashRecoveryPort(fs, "/data");
    await crash.mark(1);
    await fs.writeFile("/data/crash/notes.txt", "x");
    expect(await crash.listPending()).toEqual([1]);
  });
});
