import { describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import { resolveHelper, runHelper } from "../../src/cli/runtime/helper-runner";

const ROOT = join(import.meta.dir, "..", "..");
const CLI = join(ROOT, "src/cli/index.ts");

describe("run command", () => {
  test("passes unknown options through to the selected helper", () => {
    const tmp = mkdtempSync(join(tmpdir(), "repo-harness-run-cli-"));
    const helpers = join(tmp, "helpers");
    const logFile = join(tmp, "args.log");
    try {
      mkdirSync(helpers, { recursive: true });
      const helper = join(helpers, "echo-args.sh");
      writeFileSync(helper, `#!/bin/bash\nprintf '%s\\n' "$*" > "${logFile}"\n`);
      chmodSync(helper, 0o755);

      const res = spawnSync("bun", [CLI, "run", "echo-args", "--strict", "--flag", "value"], {
        cwd: tmp,
        encoding: "utf-8",
        env: {
          ...process.env,
          REPO_HARNESS_HELPER_SOURCE: helpers,
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
      const resolved = resolveHelper("check-task-workflow", tmp);

      expect(resolved?.source).toBe("package");
      expect(resolved?.fileName).toBe("check-task-workflow.sh");
      expect(resolved?.path).toContain("assets/templates/helpers/check-task-workflow.sh");
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

      const resolved = resolveHelper("check-task-workflow", tmp);

      expect(resolved?.source).toBe("package");
      expect(resolved?.path).toContain("assets/templates/helpers/check-task-workflow.sh");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("runHelper pipe mode redacts common secrets from helper output", () => {
    const tmp = mkdtempSync(join(tmpdir(), "repo-harness-run-redact-"));
    const helpers = join(tmp, "helpers");
    try {
      mkdirSync(helpers, { recursive: true });
      const helper = join(helpers, "leaky.sh");
      writeFileSync(helper, "#!/bin/bash\necho 'api_key=super-secret'\necho 'Authorization: Bearer token-value' >&2\n");
      chmodSync(helper, 0o755);

      const res = runHelper({
        helper: "leaky",
        cwd: tmp,
        env: { REPO_HARNESS_HELPER_SOURCE: helpers },
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
    const helpers = join(tmp, "helpers");
    try {
      mkdirSync(helpers, { recursive: true });
      const helper = join(helpers, "chatty.sh");
      writeFileSync(helper, "#!/bin/bash\nprintf '0123456789'\n");
      chmodSync(helper, 0o755);

      const res = runHelper({
        helper: "chatty",
        cwd: tmp,
        env: { REPO_HARNESS_HELPER_SOURCE: helpers },
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
    const helpers = join(tmp, "helpers");
    try {
      mkdirSync(helpers, { recursive: true });
      const helper = join(helpers, "sleepy.sh");
      writeFileSync(helper, "#!/bin/bash\nsleep 1\n");
      chmodSync(helper, 0o755);

      const res = runHelper({
        helper: "sleepy",
        cwd: tmp,
        env: { REPO_HARNESS_HELPER_SOURCE: helpers },
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
