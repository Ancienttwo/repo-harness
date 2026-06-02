import { describe, test, expect } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "..");

function childEnvWithoutNpmLifecycle(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key === "INIT_CWD" || key.startsWith("npm_")) {
      delete env[key];
    }
  }
  return env;
}

describe("Hook recursive copy", () => {
  test("migrate-project-template keeps nested hook libraries under .ai only", () => {
    const repo = mkdtempSync(join(tmpdir(), "hook-recursive-migrate-"));

    try {
      mkdirSync(join(repo, ".claude"), { recursive: true });
      writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "demo", scripts: {} }, null, 2));

      const res = spawnSync("bash", [join(ROOT, "scripts/migrate-project-template.sh"), "--repo", repo, "--apply"], {
        cwd: ROOT,
        env: childEnvWithoutNpmLifecycle(),
        encoding: "utf-8",
      });
      if (res.status !== 0) {
        throw new Error(
          [
            `migrate-project-template exited ${res.status}`,
            "--- stdout ---",
            res.stdout,
            "--- stderr ---",
            res.stderr,
          ].join("\n")
        );
      }

      expect(existsSync(join(repo, ".ai/hooks/lib/workflow-state.sh"))).toBe(true);
      expect(existsSync(join(repo, ".ai/hooks/lib/session-state.sh"))).toBe(true);
      expect(existsSync(join(repo, ".claude/hooks/lib/workflow-state.sh"))).toBe(false);
      expect(existsSync(join(repo, ".claude/hooks/lib/session-state.sh"))).toBe(false);
      expect(existsSync(join(repo, ".claude/hooks/hook-input.sh"))).toBe(false);
      expect(existsSync(join(repo, ".claude/hooks/run-hook.sh"))).toBe(false);
      expect(existsSync(join(repo, ".claude/hooks/lib/memory-state.sh"))).toBe(false);
      expect(existsSync(join(repo, ".claude/hooks/lib/skill-factory.sh"))).toBe(false);
      expect(existsSync(join(repo, ".ai/hooks/lib/memory-state.sh"))).toBe(false);
      expect(existsSync(join(repo, ".ai/hooks/lib/skill-factory.sh"))).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }, 15000);
});
