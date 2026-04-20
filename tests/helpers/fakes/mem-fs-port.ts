import { dirname, posix } from "node:path";
import type { FsPort } from "../../../src/adapters/ports/fs.port.ts";

/**
 * In-memory FsPort. Stores file contents as `Buffer`s keyed by absolute path
 * (POSIX-normalized); `realpath` is the identity (no symlink resolution).
 *
 * Designed for unit tests that want deterministic filesystem behaviour
 * without touching disk. Suitable for the JsonlHistoryStore + crash-recovery
 * tests.
 */
export class MemFsPort implements FsPort {
  private readonly files = new Map<string, Buffer>();

  private norm(p: string): string {
    return posix.normalize(p);
  }

  async readFile(p: string): Promise<Buffer> {
    const key = this.norm(p);
    const b = this.files.get(key);
    if (!b) throw Object.assign(new Error(`ENOENT: ${key}`), { code: "ENOENT" });
    return Buffer.from(b);
  }

  async writeFile(p: string, data: Buffer | string): Promise<void> {
    const key = this.norm(p);
    await this.mkdirp(dirname(key));
    this.files.set(key, typeof data === "string" ? Buffer.from(data) : Buffer.from(data));
  }

  async appendLine(p: string, line: string): Promise<void> {
    const key = this.norm(p);
    await this.mkdirp(dirname(key));
    const prev = this.files.get(key) ?? Buffer.alloc(0);
    this.files.set(key, Buffer.concat([prev, Buffer.from(`${line}\n`)]));
  }

  async mkdirp(_p: string): Promise<void> {
    // No directory entries are tracked; paths are implicit.
  }

  async realpath(p: string): Promise<string> {
    return this.norm(p);
  }

  async exists(p: string): Promise<boolean> {
    return this.files.has(this.norm(p));
  }

  async unlink(p: string): Promise<void> {
    this.files.delete(this.norm(p));
  }

  async listDir(p: string): Promise<string[]> {
    const prefix = this.norm(p).replace(/\/?$/, "/");
    const names = new Set<string>();
    for (const k of this.files.keys()) {
      if (!k.startsWith(prefix)) continue;
      const rest = k.slice(prefix.length);
      const first = rest.split("/", 1)[0];
      if (first) names.add(first);
    }
    return [...names].sort();
  }

  /** Test-only helper — exposes raw bytes under a path. */
  _read(p: string): Buffer | undefined {
    return this.files.get(this.norm(p));
  }
}
