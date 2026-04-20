import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FsPort } from "../../src/adapters/ports/fs.port.ts";
import { NodeFsPort } from "../../src/infra/fs/node-fs-port.ts";
import { MemFsPort } from "../helpers/fakes/mem-fs-port.ts";

function fsPortContract(name: string, make: () => { fs: FsPort; base: string }): void {
  describe(`FsPort contract [${name}]`, () => {
    test("writeFile + readFile roundtrip", async () => {
      const { fs, base } = make();
      const p = join(base, "sub", "a.txt");
      await fs.writeFile(p, "hello");
      const buf = await fs.readFile(p);
      expect(buf.toString()).toBe("hello");
    });
    test("appendLine adds newline per call", async () => {
      const { fs, base } = make();
      const p = join(base, "log.jsonl");
      await fs.appendLine(p, "one");
      await fs.appendLine(p, "two");
      const buf = await fs.readFile(p);
      expect(buf.toString()).toBe("one\ntwo\n");
    });
    test("exists reflects writes + unlinks", async () => {
      const { fs, base } = make();
      const p = join(base, "x.txt");
      expect(await fs.exists(p)).toBe(false);
      await fs.writeFile(p, "x");
      expect(await fs.exists(p)).toBe(true);
      await fs.unlink(p);
      expect(await fs.exists(p)).toBe(false);
    });
  });
}

fsPortContract("node", () => {
  const base = mkdtempSync(join(tmpdir(), "luna-fs-"));
  return { fs: new NodeFsPort(), base };
});
fsPortContract("mem", () => ({ fs: new MemFsPort(), base: "/luna-fs" }));
