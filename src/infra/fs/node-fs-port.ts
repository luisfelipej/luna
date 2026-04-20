import {
  appendFile,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
  readdir,
  stat,
} from "node:fs/promises";
import { dirname } from "node:path";
import type { FsPort } from "../../adapters/ports/fs.port.ts";

/**
 * Real-disk FsPort backed by `node:fs/promises`. `appendLine` creates the
 * parent directory on demand and appends a single `line + "\n"` so callers
 * don't have to remember the delimiter.
 */
export class NodeFsPort implements FsPort {
  async readFile(p: string): Promise<Buffer> {
    return readFile(p);
  }
  async writeFile(p: string, data: Buffer | string): Promise<void> {
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data);
  }
  async appendLine(p: string, line: string): Promise<void> {
    await mkdir(dirname(p), { recursive: true });
    await appendFile(p, `${line}\n`, { encoding: "utf8" });
  }
  async mkdirp(p: string): Promise<void> {
    await mkdir(p, { recursive: true });
  }
  async realpath(p: string): Promise<string> {
    return realpath(p);
  }
  async exists(p: string): Promise<boolean> {
    try {
      await stat(p);
      return true;
    } catch {
      return false;
    }
  }
  async unlink(p: string): Promise<void> {
    await rm(p, { force: true });
  }
  async listDir(p: string): Promise<string[]> {
    return readdir(p);
  }
}
