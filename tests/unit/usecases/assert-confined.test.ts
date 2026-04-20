import { describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeFsPort } from "../../../src/infra/fs/node-fs-port.ts";
import { MemFsPort } from "../../helpers/fakes/mem-fs-port.ts";
import { PathConfinementError } from "../../../src/entities/errors.ts";
import { assertConfined } from "../../../src/usecases/workspace/assert-confined.ts";

describe("assertConfined", () => {
  it("accepts a nested path inside base (MemFs)", async () => {
    const fs = new MemFsPort();
    await expect(assertConfined({ fs, target: "/base/proj/sub", base: "/base" })).resolves.toBe(
      "/base/proj/sub",
    );
  });

  it("rejects a `..` traversal attempt", async () => {
    const fs = new MemFsPort();
    await expect(
      assertConfined({ fs, target: "/base/../etc", base: "/base" }),
    ).rejects.toBeInstanceOf(PathConfinementError);
  });

  it("rejects a sibling path outside base", async () => {
    const fs = new MemFsPort();
    await expect(
      assertConfined({ fs, target: "/other/evil", base: "/base" }),
    ).rejects.toBeInstanceOf(PathConfinementError);
  });

  it("accepts base itself", async () => {
    const fs = new MemFsPort();
    await expect(assertConfined({ fs, target: "/base", base: "/base" })).resolves.toBe("/base");
  });

  it("rejects a symlink escape (real NodeFsPort + temp dir)", async () => {
    const root = mkdtempSync(join(tmpdir(), "luna-confine-"));
    const base = join(root, "ws");
    const outside = join(root, "outside");
    mkdirSync(base);
    mkdirSync(outside);
    writeFileSync(join(outside, "secret.txt"), "x");
    const evil = join(base, "evil");
    symlinkSync(outside, evil);

    const fs = new NodeFsPort();
    await expect(assertConfined({ fs, target: evil, base })).rejects.toBeInstanceOf(
      PathConfinementError,
    );
  });

  it("accepts a nested real path (NodeFsPort + temp dir)", async () => {
    const root = mkdtempSync(join(tmpdir(), "luna-confine-"));
    const base = join(root, "ws");
    const proj = join(base, "proj");
    mkdirSync(proj, { recursive: true });

    const fs = new NodeFsPort();
    const out = await assertConfined({ fs, target: proj, base });
    // Real realpath may resolve /var → /private/var on macOS; the important
    // invariant is that the returned path starts with the realpath of base.
    const { realpath } = await import("node:fs/promises");
    const baseReal = await realpath(base);
    expect(out.startsWith(baseReal)).toBe(true);
  });
});
