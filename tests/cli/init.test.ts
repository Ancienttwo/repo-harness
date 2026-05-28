import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
  chmodSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { runInit } from "../../src/cli/commands/init";

function makeExecutable(path: string, body: string): void {
  writeFileSync(path, body);
  chmodSync(path, 0o755);
}

function setupFakeSource(root: string): void {
  mkdirSync(join(root, "scripts"), { recursive: true });
  makeExecutable(
    join(root, "scripts", "sync-codex-installed-copies.sh"),
    "#!/bin/bash\nset -euo pipefail\necho \"sync link=${AGENTIC_DEV_LINK_INSTALLED_COPIES:-unset}\"\n",
  );
  writeFileSync(
    join(root, "scripts", "inspect-project-state.ts"),
    "console.log('mode: initialize')\n",
  );
  makeExecutable(
    join(root, "scripts", "migrate-project-template.sh"),
    [
      "#!/bin/bash",
      "set -euo pipefail",
      "repo=''",
      "mode='dry-run'",
      "while [[ $# -gt 0 ]]; do",
      "  case \"$1\" in",
      "    --repo) repo=\"$2\"; shift 2 ;;",
      "    --apply) mode='apply'; shift ;;",
      "    --dry-run) mode='dry-run'; shift ;;",
      "    *) shift ;;",
      "  esac",
      "done",
      "if [[ \"$mode\" != 'apply' ]]; then",
      "  echo dry-run \"$repo\"",
      "  exit 0",
      "fi",
      "mkdir -p \"$repo/scripts\" \"$repo/.ai/harness\"",
      "printf '{}\\n' > \"$repo/.ai/harness/workflow-contract.json\"",
      "cat > \"$repo/scripts/check-task-workflow.sh\" <<'EOF'",
      "#!/bin/bash",
      "echo '[workflow] OK'",
      "EOF",
      "chmod +x \"$repo/scripts/check-task-workflow.sh\"",
      "echo migrate \"$repo\"",
      "",
    ].join("\n"),
  );
}

describe("init command", () => {
  test("defaults --repo to cwd and applies the existing-repo harness", () => {
    const tmp = join(tmpdir(), `agentic-dev-init-${Date.now()}`);
    const source = join(tmp, "source");
    const repo = join(tmp, "repo");
    const previousCwd = process.cwd();
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(repo, { recursive: true });
      setupFakeSource(source);
      process.chdir(repo);

      const result = runInit({
        sourceRoot: source,
        syncSkill: false,
        hostAdapters: false,
        externalSkills: false,
      });

      expect(result.exitCode).toBe(0);
      expect(realpathSync(result.repoRoot)).toBe(realpathSync(repo));
      expect(result.steps.map((step) => step.step)).toContain("apply repo harness");
      expect(existsSync(join(repo, ".ai", "harness", "workflow-contract.json"))).toBe(true);
    } finally {
      process.chdir(previousCwd);
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("bootstraps Waza and diagram-design for Claude and Codex during init", () => {
    const tmp = join(tmpdir(), `agentic-dev-init-skills-${Date.now()}`);
    const source = join(tmp, "source");
    const repo = join(tmp, "repo");
    const home = join(tmp, "home");
    const fakeBin = join(tmp, "bin");
    const npxLog = join(tmp, "npx.log");
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(repo, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      mkdirSync(join(home, ".codex", "skills", "diagram-design"), { recursive: true });
      setupFakeSource(source);
      writeFileSync(join(home, ".codex", "skills", "diagram-design", "SKILL.md"), "---\nname: diagram-design\n---\n");
      makeExecutable(
        join(fakeBin, "npx"),
        `#!/bin/bash\nprintf '%s\\n' "$*" >> "${npxLog}"\nexit 0\n`,
      );

      const result = runInit({
        repo,
        sourceRoot: source,
        syncSkill: false,
        hostAdapters: false,
        verify: false,
        env: {
          ...process.env,
          HOME: home,
          PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
        },
      });

      expect(result.exitCode).toBe(0);
      expect(readFileSync(npxLog, "utf-8")).toContain(
        "-y skills add tw93/Waza -g -a claude-code codex -s check design health hunt learn read think write -y",
      );
      expect(existsSync(join(home, ".codex", "skills", "diagram-design", "SKILL.md"))).toBe(true);
      expect(existsSync(join(home, ".claude", "skills", "diagram-design", "SKILL.md"))).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("dry-run does not mutate host runtime or apply the target harness", () => {
    const tmp = join(tmpdir(), `agentic-dev-init-dry-run-${Date.now()}`);
    const source = join(tmp, "source");
    const repo = join(tmp, "repo");
    const home = join(tmp, "home");
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(repo, { recursive: true });
      setupFakeSource(source);

      const result = runInit({
        repo,
        sourceRoot: source,
        apply: false,
        target: "codex",
        env: {
          ...process.env,
          HOME: home,
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.steps.find((step) => step.step === "sync agentic-dev skills")?.detail).toBe("dry-run");
      expect(result.steps.find((step) => step.step === "install host adapters")?.detail).toBe("dry-run");
      expect(existsSync(join(home, ".codex", "hooks.json"))).toBe(false);
      expect(existsSync(join(repo, ".ai", "harness", "workflow-contract.json"))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("npx cache sources force copy-based installed skill sync", () => {
    const tmp = join(tmpdir(), `agentic-dev-init-npx-${Date.now()}`);
    const source = join(tmp, "_npx", "abc123", "node_modules", "repo-harness");
    const repo = join(tmp, "repo");
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(repo, { recursive: true });
      setupFakeSource(source);

      const result = runInit({
        repo,
        sourceRoot: source,
        hostAdapters: false,
        externalSkills: false,
        verify: false,
      });

      expect(result.exitCode).toBe(0);
      expect(result.steps.find((step) => step.step === "sync agentic-dev skills")?.stdout).toContain(
        "sync link=0",
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
