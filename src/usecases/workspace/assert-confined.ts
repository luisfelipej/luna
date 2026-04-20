import { relative, isAbsolute } from "node:path";
import type { FsPort } from "../../adapters/ports/fs.port.ts";
import { PathConfinementError } from "../../entities/errors.ts";

export interface AssertConfinedInput {
  readonly fs: FsPort;
  /** Target path (may be relative-sounding, but must resolve inside base). */
  readonly target: string;
  /** Confinement root. MUST exist on the filesystem. */
  readonly base: string;
}

/**
 * Canonicalize both `target` and `base` via `FsPort.realpath` and verify that
 * the target lies under base. The check is done via `path.relative(base,
 * target)` — if the result is absolute or starts with `..`, the target
 * escapes and `PathConfinementError` is thrown.
 *
 * This helper is the ONLY path-confinement check in Luna (spec #44). Every
 * workspace / file I/O gate must funnel through it.
 *
 * On success the canonical (realpath-resolved) target path is returned.
 *
 * The target does not need to exist if the parent chain up to `base` exists;
 * `realpath` will resolve as far as it can and throw ENOENT otherwise. In
 * tests using `MemFsPort`, realpath is the identity, so both strings are
 * compared literally.
 */
export async function assertConfined(input: AssertConfinedInput): Promise<string> {
  const { fs, target, base } = input;
  let baseReal: string;
  let targetReal: string;
  try {
    baseReal = await fs.realpath(base);
  } catch (err) {
    throw new PathConfinementError(`base does not resolve: ${base}`, err);
  }
  try {
    targetReal = await fs.realpath(target);
  } catch {
    // If the target itself doesn't exist, fall back to textual canonicalisation
    // — still enough to catch `..` traversal before the path is created.
    targetReal = target;
  }
  const rel = relative(baseReal, targetReal);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new PathConfinementError(`path escapes base: ${target}`);
  }
  return targetReal;
}
