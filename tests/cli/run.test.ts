import { describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import { listHelpers, resolveHelper, runHelper } from "../../src/cli/runtime/helper-runner";

const ROOT = join(import.meta.dir, "..", "..");
const CLI = join(ROOT, "src/cli/index.ts");

function packageRuntimeEnv(): NodeJS.ProcessEnv {
  return { ...process.env, REPO_HARNESS_SOURCE_ROOT: undefined };
}

function writeSourceHelper(tmp: string, fileName: string, content: string): string {
  const sourceRoot = join(tmp, "source-root");
  mkdirSync(join(sourceRoot, "assets"), { recursive: true });
  mkdirSync(join(sourceRoot, "scripts"), { recursive: true });
  writeFileSync(
    join(sourceRoot, "assets", "workflow-contract.v1.json"),
    `${JSON.stringify({ helpers: { scripts: [fileName] } }, null, 2)}\n`,
  );
  const helperPath = join(sourceRoot, "scripts", fileName);
  writeFileSync(helperPath, content);
  chmodSync(helperPath, 0o755);
  return sourceRoot;
}

function writeActiveSprintFixture(cwd: string) {
  const sprintRelPath = "plans/sprints/20991231-2359-run-helper-root.sprint.md";
  mkdirSync(join(cwd, "plans/sprints"), { recursive: true });
  mkdirSync(join(cwd, ".ai/harness/sprint"), { recursive: true });
  writeFileSync(
    join(cwd, sprintRelPath),
    [
      "# Sprint: Run Helper Root",
      "",
      "> **Status**: Approved",
      "",
      "## Backlog",
      "",
      "| # | Status | Task | Mode | Acceptance | Plan |",
      "|---|--------|------|------|------------|------|",
      "| 1 | [ ] | root-task | inline | package run reads target repo | (pending) |",
      "",
    ].join("\n")
  );
  writeFileSync(join(cwd, ".ai/harness/sprint/active-sprint"), sprintRelPath);
  return sprintRelPath;
}

describe("run command", () => {
  test("passes unknown options through to the selected helper", () => {
    const tmp = mkdtempSync(join(tmpdir(), "repo-harness-run-cli-"));
    const logFile = join(tmp, "args.log");
    try {
      const sourceRoot = writeSourceHelper(
        tmp,
        "echo-args.sh",
        `#!/bin/bash\nprintf '%s\\n' "$*" > "${logFile}"\n`,
      );

      const res = spawnSync("bun", [CLI, "run", "echo-args", "--strict", "--flag", "value"], {
        cwd: tmp,
        encoding: "utf-8",
        env: {
          ...process.env,
          REPO_HARNESS_SOURCE_ROOT: sourceRoot,
        },
      });

      expect(res.status).toBe(0);
      expect(readFileSync(logFile, "utf-8").trim()).toBe("--strict --flag value");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("resolves bundled helpers from the package by default", () => {
    const tmp = mkdtempSync(join(tmpdir(), "repo-harness-run-package-"));
    try {
      const resolved = resolveHelper("check-task-workflow", tmp, packageRuntimeEnv());

      expect(resolved?.source).toBe("package");
      expect(resolved?.fileName).toBe("check-task-workflow.sh");
      expect(resolved?.path).toContain("assets/templates/helpers/check-task-workflow.sh");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("source checkout override resolves only helpers declared by its contract", () => {
    const tmp = mkdtempSync(join(tmpdir(), "repo-harness-run-source-contract-"));
    try {
      const sourceRoot = writeSourceHelper(tmp, "known.sh", "#!/bin/bash\nexit 0\n");
      writeFileSync(join(sourceRoot, "scripts", "unlisted.sh"), "#!/bin/bash\nexit 0\n");
      chmodSync(join(sourceRoot, "scripts", "unlisted.sh"), 0o755);
      const env = { REPO_HARNESS_SOURCE_ROOT: sourceRoot };

      expect(resolveHelper("known", tmp, env)?.source).toBe("source");
      expect(resolveHelper("known.sh", tmp, env)?.fileName).toBe("known.sh");
      expect(resolveHelper("known.ts", tmp, env)).toBeNull();
      expect(resolveHelper("unlisted", tmp, env)).toBeNull();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("official run ignores source override and caller shell hooks for protected helpers", () => {
    const tmp = mkdtempSync(join(tmpdir(), "repo-harness-run-protected-"));
    const marker = join(tmp, "bypass-marker");
    try {
      const sourceRoot = join(tmp, "source-root");
      mkdirSync(join(sourceRoot, "assets"), { recursive: true });
      mkdirSync(join(sourceRoot, "scripts"), { recursive: true });
      const protectedFiles = ["contract-worktree.sh", "ship-worktrees.sh", "merge-gate.ts"];
      writeFileSync(
        join(sourceRoot, "assets", "workflow-contract.v1.json"),
        `${JSON.stringify({ helpers: { scripts: protectedFiles } }, null, 2)}\n`,
      );
      for (const fileName of protectedFiles) {
        const helperPath = join(sourceRoot, "scripts", fileName);
        writeFileSync(helperPath, `#!/bin/bash\ntouch "${marker}"\n`);
        chmodSync(helperPath, 0o755);
        const resolved = resolveHelper(fileName, tmp, { REPO_HARNESS_SOURCE_ROOT: sourceRoot });
        expect(resolved?.source).toBe("package");
        expect(resolved?.path).toContain("assets/templates/helpers/");
      }

      const fakeBin = join(tmp, "fake-bin");
      mkdirSync(fakeBin);
      for (const binary of ["bash", "git", "bun"]) {
        const fake = join(fakeBin, binary);
        writeFileSync(fake, `#!/bin/sh\ntouch "${marker}"\nexit 99\n`);
        chmodSync(fake, 0o755);
      }

      const bashEnv = join(tmp, "bash-env-injection.sh");
      writeFileSync(bashEnv, `#!/bin/sh\ntouch "${marker}"\n`);
      const direct = runHelper({
        helper: "ship-worktrees",
        args: ["--help"],
        cwd: tmp,
        env: {
          ...process.env,
          PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
          BASH_ENV: bashEnv,
          REPO_HARNESS_SOURCE_ROOT: sourceRoot,
        },
        stdio: "pipe",
      });
      expect(direct.exitCode, direct.stderr).toBe(0);
      expect(direct.stdout).toContain("Usage:");
      expect(existsSync(marker)).toBe(false);

      const res = spawnSync(process.execPath, [CLI, "run", "ship-worktrees", "--help"], {
        cwd: tmp,
        encoding: "utf-8",
        env: {
          ...process.env,
          PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
          BASH_ENV: join(fakeBin, "bash"),
          GIT_EXEC_PATH: fakeBin,
          GH_REPO: "attacker/redirect",
          REPO_HARNESS_SOURCE_ROOT: sourceRoot,
          REPO_HARNESS_BASH_BIN: join(fakeBin, "bash"),
          REPO_HARNESS_GIT_BIN: join(fakeBin, "git"),
          REPO_HARNESS_BUN_BIN: join(fakeBin, "bun"),
        },
      });
      expect(res.status, res.stderr).toBe(0);
      expect(res.stdout).toContain("Usage:");
      expect(existsSync(marker)).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("source checkout override fails closed for missing and malformed authority", () => {
    const tmp = mkdtempSync(join(tmpdir(), "repo-harness-run-source-invalid-"));
    try {
      const sourceRoot = join(tmp, "source-root");
      mkdirSync(join(sourceRoot, "assets"), { recursive: true });
      mkdirSync(join(sourceRoot, "scripts"), { recursive: true });
      const env = { REPO_HARNESS_SOURCE_ROOT: sourceRoot };

      expect(() => resolveHelper("known", tmp, env)).toThrow("helper contract not found");

      writeFileSync(join(sourceRoot, "assets", "workflow-contract.v1.json"), "{broken\n");
      expect(() => resolveHelper("known", tmp, env)).toThrow("malformed JSON");

      writeFileSync(
        join(sourceRoot, "assets", "workflow-contract.v1.json"),
        `${JSON.stringify({ helpers: { scripts: ["known.sh"] } })}\n`,
      );
      expect(() => resolveHelper("known", tmp, env)).toThrow("contract helper is missing");
      expect(() => resolveHelper("known", tmp, { REPO_HARNESS_SOURCE_ROOT: "relative/source" })).toThrow(
        "must be an absolute path",
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("listHelpers fails closed for missing, malformed, and mismatched descriptions", () => {
    const tmp = mkdtempSync(join(tmpdir(), "repo-harness-run-descriptions-invalid-"));
    try {
      const sourceRoot = join(tmp, "source-root");
      mkdirSync(join(sourceRoot, "assets"), { recursive: true });
      const env = { REPO_HARNESS_SOURCE_ROOT: sourceRoot };
      const contractPath = join(sourceRoot, "assets", "workflow-contract.v1.json");

      writeFileSync(contractPath, `${JSON.stringify({ helpers: { scripts: ["known.sh"] } })}\n`);
      expect(() => listHelpers(env)).toThrow("helpers.descriptions must be an object");

      writeFileSync(
        contractPath,
        `${JSON.stringify({
          helpers: { scripts: ["known.sh"], descriptions: { known: "Do the known thing", ghost: "Unknown helper" } },
        })}\n`,
      );
      expect(() => listHelpers(env)).toThrow('helpers.descriptions has unknown helper id "ghost"');

      writeFileSync(
        contractPath,
        `${JSON.stringify({ helpers: { scripts: ["known.sh"], descriptions: { known: "   " } } })}\n`,
      );
      expect(() => listHelpers(env)).toThrow("must be a non-empty string");

      writeFileSync(
        contractPath,
        `${JSON.stringify({ helpers: { scripts: ["known.sh"], descriptions: {} } })}\n`,
      );
      expect(() => listHelpers(env)).toThrow('helpers.descriptions is missing entry for helper id "known"');

      writeFileSync(
        contractPath,
        `${JSON.stringify({ helpers: { scripts: ["known.sh"], descriptions: { known: "Do the known thing" } } })}\n`,
      );
      expect(listHelpers(env)).toEqual([{ id: "known", description: "Do the known thing" }]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("run --help enumerates bundled helpers with one-line descriptions from the contract", () => {
    const res = spawnSync("bun", [CLI, "run", "--help"], {
      cwd: ROOT,
      encoding: "utf-8",
      env: packageRuntimeEnv(),
    });

    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Helpers:");
    expect(res.stdout).toMatch(
      /check-task-workflow\s+Check workflow contract and policy compliance for the current repo/,
    );
  });

  test("package sprint-backlog helper resolves the target repo root from runHelper", () => {
    const tmp = mkdtempSync(join(tmpdir(), "repo-harness-run-sprint-root-"));
    try {
      const sprintRelPath = writeActiveSprintFixture(tmp);

      const status = spawnSync("bun", [CLI, "run", "sprint-backlog", "status"], {
        cwd: tmp,
        encoding: "utf-8",
        env: packageRuntimeEnv(),
      });

      expect(status.status).toBe(0);
      expect(status.stdout).toContain(`sprint: ${sprintRelPath}`);
      expect(status.stdout).toContain("next_task: root-task");

      const next = spawnSync("bun", [CLI, "run", "sprint-backlog", "next"], {
        cwd: tmp,
        encoding: "utf-8",
        env: packageRuntimeEnv(),
      });

      expect(next.status).toBe(0);
      expect(next.stdout).toContain("task: root-task");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("ignores repo-local helper runtime when helper_source is repo pinned", () => {
    const tmp = mkdtempSync(join(tmpdir(), "repo-harness-run-repo-pin-"));
    try {
      mkdirSync(join(tmp, ".ai/harness/scripts"), { recursive: true });
      writeFileSync(join(tmp, ".ai/harness/policy.json"), JSON.stringify({ harness: { helper_source: "repo" } }, null, 2));
      writeFileSync(join(tmp, ".ai/harness/scripts/check-task-workflow.sh"), "#!/bin/bash\necho repo\n");

      const resolved = resolveHelper("check-task-workflow", tmp, packageRuntimeEnv());

      expect(resolved?.source).toBe("package");
      expect(resolved?.path).toContain("assets/templates/helpers/check-task-workflow.sh");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("runHelper pipe mode redacts common secrets from helper output", () => {
    const tmp = mkdtempSync(join(tmpdir(), "repo-harness-run-redact-"));
    try {
      const sourceRoot = writeSourceHelper(
        tmp,
        "leaky.sh",
        "#!/bin/bash\necho 'api_key=super-secret'\necho 'Authorization: Bearer token-value' >&2\n",
      );

      const res = runHelper({
        helper: "leaky",
        cwd: tmp,
        env: { REPO_HARNESS_SOURCE_ROOT: sourceRoot },
        stdio: "pipe",
      });

      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain("api_key=[redacted]");
      expect(res.stderr).toContain("Authorization: [redacted]");
      expect(`${res.stdout}\n${res.stderr}`).not.toContain("super-secret");
      expect(`${res.stdout}\n${res.stderr}`).not.toContain("token-value");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("runHelper pipe mode caps helper output with a marker", () => {
    const tmp = mkdtempSync(join(tmpdir(), "repo-harness-run-cap-"));
    try {
      const sourceRoot = writeSourceHelper(tmp, "chatty.sh", "#!/bin/bash\nprintf '0123456789'\n");

      const res = runHelper({
        helper: "chatty",
        cwd: tmp,
        env: { REPO_HARNESS_SOURCE_ROOT: sourceRoot },
        stdio: "pipe",
        maxOutputBytes: 5,
      });

      expect(res.exitCode).toBe(0);
      expect(res.stdout).toBe("01234\n[output truncated after 5 bytes]");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("runHelper reports timed out helpers distinctly", () => {
    const tmp = mkdtempSync(join(tmpdir(), "repo-harness-run-timeout-"));
    try {
      const sourceRoot = writeSourceHelper(tmp, "sleepy.sh", "#!/bin/bash\nsleep 1\n");

      const res = runHelper({
        helper: "sleepy",
        cwd: tmp,
        env: { REPO_HARNESS_SOURCE_ROOT: sourceRoot },
        stdio: "pipe",
        timeoutMs: 20,
      });

      expect(res.exitCode).toBe(1);
      expect(res.reason).toBe("timeout");
      expect(res.stderr).toContain("process timed out after 20ms");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("bundled workstream-sync resolves bundled sibling helpers", () => {
    const tmp = mkdtempSync(join(tmpdir(), "repo-harness-run-workstream-package-"));
    try {
      mkdirSync(join(tmp, ".ai/context"), { recursive: true });
      mkdirSync(join(tmp, "apps/extension"), { recursive: true });
      writeFileSync(join(tmp, "apps/extension/AGENTS.md"), "# Extension Contract\n\nManual extension rule.\n");
      writeFileSync(join(tmp, ".ai/context/capabilities.json"), JSON.stringify({
        version: 1,
        capabilities: [
          {
            id: "extension-runtime",
            domain: "surface",
            name: "extension-runtime",
            prefixes: ["apps/extension"],
            contract_files: {
              agents: "apps/extension/AGENTS.md",
              claude: "apps/extension/CLAUDE.md",
            },
            architecture_module: "docs/architecture/modules/surface/extension-runtime.md",
            workstream_dir: "tasks/workstreams/surface/extension-runtime",
            lsp_profile: "typescript-lsp",
            verification_hints: ["bun --filter @devision/extension build"],
          },
        ],
      }, null, 2) + "\n");

      const res = runHelper({
        helper: "workstream-sync",
        cwd: tmp,
        args: ["ensure", "--block", "apps/extension", "--slug", "extension-runtime-closure"],
        env: packageRuntimeEnv(),
        stdio: "pipe",
      });

      expect(res.exitCode).toBe(0);
      expect(res.resolved?.source).toBe("package");
      expect(res.stdout).toContain("[WorkstreamSync] Ensured tasks/workstreams/surface/extension-runtime/extension-runtime-closure.md");
      expect(existsSync(join(tmp, "tasks/workstreams/surface/extension-runtime/extension-runtime-closure.md"))).toBe(true);
      expect(existsSync(join(tmp, "scripts/capability-resolver.ts"))).toBe(false);

      const agents = readFileSync(join(tmp, "apps/extension/AGENTS.md"), "utf-8");
      const claude = readFileSync(join(tmp, "apps/extension/CLAUDE.md"), "utf-8");
      expect(agents).toBe(claude);
      expect(agents).toContain("Manual extension rule.");
      expect(agents).toContain("`tasks/workstreams/surface/extension-runtime/extension-runtime-closure.md`");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
