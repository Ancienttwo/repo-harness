import { describe, test, expect } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, relative } from "path";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "..");
const SCAFFOLD_PARITY_TIMEOUT_MS = 15000;

function collectFiles(root: string, current = root): string[] {
  const entries = readdirSync(current).sort();
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(current, entry);
    const relPath = `./${relative(root, fullPath)}`.replaceAll("\\", "/");
    if (statSync(fullPath).isDirectory()) {
      files.push(...collectFiles(root, fullPath));
      continue;
    }
    files.push(relPath);
  }

  return files;
}

describe("create-project-dirs scaffold parity", () => {
  test("matches the known-good file tree snapshot", () => {
    const cwd = mkdtempSync(join(tmpdir(), "scaffold-parity-"));

    try {
      const res = spawnSync("bash", [join(ROOT, "scripts/create-project-dirs.sh")], {
        cwd,
        encoding: "utf-8",
      });

      expect(res.status).toBe(0);
      expect(collectFiles(cwd)).toEqual([
        "./.ai/context/capabilities.json",
        "./.ai/context/capability-source-map.json",
        "./.ai/context/context-map.json",
        "./.ai/harness/brain-manifest.json",
        "./.ai/harness/events.jsonl",
        "./.ai/harness/failures/latest.jsonl",
        "./.ai/harness/handoff/current.md",
        "./.ai/harness/handoff/resume.md",
        "./.ai/harness/planning/.gitkeep",
        "./.ai/harness/policy.json",
        "./.ai/harness/runs/.gitkeep",
        "./.ai/harness/security/.gitkeep",
        "./.ai/harness/triage/.gitkeep",
        "./.ai/harness/worktrees/.gitkeep",
        "./.ai/hooks/README.md",
        "./.claude/templates/design-brief.template.md",
        "./.claude/templates/research.template.md",
        "./.claude/templates/spec.template.md",
        "./.gitignore",
        "./deploy/README.md",
        "./deploy/env/.gitkeep",
        "./deploy/release-checklists/.gitkeep",
        "./deploy/runbooks/.gitkeep",
        "./deploy/scripts/.gitkeep",
        "./deploy/sql/.gitkeep",
        "./deploy/submissions/.gitkeep",
        "./docs/CHANGELOG.md",
        "./docs/architecture/diagrams/.gitkeep",
        "./docs/architecture/domains/.gitkeep",
        "./docs/architecture/index.md",
        "./docs/architecture/modules/.gitkeep",
        "./docs/architecture/snapshots/.gitkeep",
        "./docs/prds/prd.template.md",
        "./docs/reference-configs/agentic-development-flow.md",
        "./docs/reference-configs/design-options.md",
        "./docs/reference-configs/document-generation.md",
        "./docs/reference-configs/external-tooling.md",
        "./docs/reference-configs/global-working-rules.md",
        "./docs/reference-configs/harness-overview.md",
        "./docs/reference-configs/heartbeat-triage.md",
        "./docs/reference-configs/minimal-change-hooks.md",
        "./docs/reference-configs/ux-feature-guard.md",
        "./docs/researches/README.md",
        "./docs/spec.md",
        "./interfaces/types.ts",
        "./package.json",
        "./tasks/lessons.md",
        "./tests/README.md",
      ]);

      const gitignore = readFileSync(join(cwd, ".gitignore"), "utf-8");
      expect(gitignore).toContain("# BEGIN: repo-harness generated-runtime");
      expect(gitignore).not.toContain(".claude/.codegraph-state/");
      expect(gitignore).toContain(".ai/harness/checks/*.latest.json");
      expect(gitignore).toContain(".ai/harness/checks/*.latest.md");
      expect(gitignore).not.toContain(".ai/harness/chatgpt/bridge-extension/");
      expect(gitignore).toContain(".repo-harness/");
      expect(gitignore).not.toContain(".repo-harness/chatgpt-browser.local.json");
      expect(gitignore).toContain(".codex/*");
      expect(gitignore).not.toContain("!.codex/hooks.json");
      expect(gitignore).toContain("_ref/");
      expect(gitignore).toContain(".codegraph/");
      expect(gitignore).toContain("_ops/");
      expect(gitignore).not.toContain("_ops/secrets/");
      expect(gitignore).not.toContain("!_ops/env/.env.example");

      expect(JSON.parse(readFileSync(join(cwd, "package.json"), "utf-8")).scripts["check:task-workflow"]).toBeUndefined();

      const template = readFileSync(join(cwd, "docs/prds/prd.template.md"), "utf-8");
      expect(template).toBe(readFileSync(join(ROOT, "assets/templates/prd.template.md"), "utf-8"));
      expect(template).toContain("docs/prds/<YYYYMMDD>-<HHMM>-<slug>.prd.md");
      expect(existsSync(join(cwd, ".claude/templates/plan.template.md"))).toBe(false);
      expect(existsSync(join(cwd, ".claude/templates/sprint.template.md"))).toBe(false);
      expect(existsSync(join(cwd, "tasks/current.md"))).toBe(false);
      expect(existsSync(join(cwd, "plans"))).toBe(false);
      expect(existsSync(join(cwd, "tasks/workstreams"))).toBe(false);

      const runtimeConsole = readFileSync(
        join(ROOT, "assets/project-structures/ai-native-runtime-console.txt"),
        "utf-8"
      );
      const productCopilot = readFileSync(
        join(ROOT, "assets/project-structures/ai-native-product-copilot.txt"),
        "utf-8"
      );
      const collaborativeEditor = readFileSync(
        join(ROOT, "assets/project-structures/ai-native-collaborative-editor.txt"),
        "utf-8"
      );
      const sidecarKernel = readFileSync(
        join(ROOT, "assets/project-structures/ai-native-sidecar-kernel.txt"),
        "utf-8"
      );
      const startWorkers = readFileSync(
        join(ROOT, "assets/project-structures/tanstack-start-workers.txt"),
        "utf-8"
      );
      expect(runtimeConsole).toContain("Bun/Hono");
      expect(productCopilot).toContain("business action");
      expect(collaborativeEditor).toContain("Plate");
      expect(collaborativeEditor).toContain("Loro");
      expect(sidecarKernel).toContain("MCP/HTTP");
      expect(startWorkers).toContain("apps/web");
      expect(startWorkers).toContain("index.tsx           # / SSR");
      expect(startWorkers).toContain("app.tsx             # /app client-only");
      expect(startWorkers).toContain("ssr: false");
      expect(startWorkers).toContain("wrangler.jsonc");
      expect(startWorkers).toContain("wrangler deploy");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, SCAFFOLD_PARITY_TIMEOUT_MS);

  test("legacy package refresh removes the generated strict workflow script and stops seeding task sync", () => {
    const cwd = mkdtempSync(join(tmpdir(), "scaffold-workflow-script-"));
    try {
      for (const command of ["repo-harness run check-task-workflow --strict", "bun run custom-workflow.ts"]) {
        writeFileSync(join(cwd, "package.json"), JSON.stringify({
          scripts: { test: "bun test", "check:task-workflow": command },
        }));
        const result = spawnSync("bash", ["-c", 'source "$1"; pi_ensure_task_sync "$2" 0 apply',
          "bash", join(ROOT, "scripts/lib/project-init-lib.sh"), cwd], { cwd, encoding: "utf-8" });
        expect(result.status).toBe(0);
        const scripts = JSON.parse(readFileSync(join(cwd, "package.json"), "utf-8")).scripts;
        expect(scripts.test).toBe("bun test");
        expect(scripts["check:task-sync"]).toBeUndefined();
        expect(scripts["check:task-workflow"]).toBe(command.startsWith("repo-harness") ? undefined : command);
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
