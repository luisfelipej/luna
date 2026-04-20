import { join } from "node:path";
import type { CrashRecoveryPort } from "../../adapters/ports/crash-recovery.port.ts";
import type { FsPort } from "../../adapters/ports/fs.port.ts";

/**
 * FsPort-backed CrashRecoveryPort.
 *
 * Writes a zero-byte flag at `<baseDir>/crash/<chatId>.flag` when a chat's
 * send starts streaming; deletes it on completion. `listPending()` scans
 * the directory at boot so RestoreOnStart can notify those chats.
 *
 * The directory is created lazily on first `mark`. Boot `listPending` does
 * not require the directory to exist (returns `[]`).
 */
export class FsCrashRecoveryPort implements CrashRecoveryPort {
  private readonly dir: string;

  constructor(
    private readonly fs: FsPort,
    baseDir: string,
  ) {
    this.dir = join(baseDir, "crash");
  }

  async mark(chatId: number): Promise<void> {
    await this.fs.mkdirp(this.dir);
    await this.fs.writeFile(this.flagPath(chatId), "");
  }

  async clear(chatId: number): Promise<void> {
    const path = this.flagPath(chatId);
    if (await this.fs.exists(path)) {
      await this.fs.unlink(path);
    }
  }

  async listPending(): Promise<number[]> {
    let names: string[];
    try {
      names = await this.fs.listDir(this.dir);
    } catch {
      return [];
    }
    const ids: number[] = [];
    for (const name of names) {
      if (!name.endsWith(".flag")) continue;
      const num = Number.parseInt(name.slice(0, -".flag".length), 10);
      if (Number.isFinite(num)) ids.push(num);
    }
    ids.sort((a, b) => a - b);
    return ids;
  }

  private flagPath(chatId: number): string {
    return join(this.dir, `${chatId}.flag`);
  }
}
