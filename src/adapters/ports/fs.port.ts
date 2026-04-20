/**
 * Filesystem abstraction. Wraps node:fs/promises with a single audited
 * surface — any usecase that needs disk I/O goes through this port so tests
 * can swap in an in-memory fake.
 */
export interface FsPort {
  readFile(p: string): Promise<Buffer>;
  writeFile(p: string, data: Buffer | string): Promise<void>;
  appendLine(p: string, line: string): Promise<void>;
  mkdirp(p: string): Promise<void>;
  realpath(p: string): Promise<string>;
  exists(p: string): Promise<boolean>;
  unlink(p: string): Promise<void>;
  listDir(p: string): Promise<string[]>;
}
