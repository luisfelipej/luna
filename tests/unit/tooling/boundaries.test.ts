import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * These tests drive the real eslint binary against the real `eslint.config.js`
 * to prove the dependency rule is actually enforced.
 */

const ROOT = new URL("../../..", import.meta.url).pathname;

function runEslint(target: string): { exitCode: number; stdout: string; stderr: string } {
  const res = Bun.spawnSync({
    cmd: ["bunx", "eslint", "--no-warn-ignored", target],
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: res.exitCode ?? 0,
    stdout: new TextDecoder().decode(res.stdout),
    stderr: new TextDecoder().decode(res.stderr),
  };
}

describe("boundaries rule", () => {
  let plantedFile: string | null = null;

  afterEach(() => {
    if (plantedFile && existsSync(plantedFile)) {
      rmSync(plantedFile);
      plantedFile = null;
    }
  });

  it("passes on the real src tree", () => {
    const { exitCode, stdout, stderr } = runEslint("src");
    if (exitCode !== 0) {
      console.error("eslint stdout:", stdout);
      console.error("eslint stderr:", stderr);
    }
    expect(exitCode).toBe(0);
  });

  it("fails when an entity imports from infra", () => {
    const bad = join(ROOT, "src/entities/_bad-boundaries-probe.ts");
    plantedFile = bad;
    writeFileSync(
      bad,
      `// Transient file — the boundaries test plants this and then removes it.\n` +
        `import { PinoLogger } from "../infra/logger/pino-logger.ts";\n` +
        `export const _leak = PinoLogger;\n`,
    );
    const { exitCode, stdout } = runEslint(bad);
    expect(exitCode).not.toBe(0);
    expect(stdout).toMatch(/boundaries\/element-types/);
  });
});
