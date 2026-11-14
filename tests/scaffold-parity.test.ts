import { describe, test, expect } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, relative } from "path";
import { spawnSync } from "child_process";
import { planAdoption } from "../src/effects/adoption/plan";
import { applyAdoptionPlan } from "../src/effects/fs-transaction";
import { MANAGED_PACKAGE_SCRIPTS, RETIRED_PACKAGE_SCRIPT_KEYS } from "../src/core/adoption/package-scripts";

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
        "./.ai/context/capability-source-map.json",
        "./.ai/harness/events.jsonl",
        "./.ai/harness/failures/latest.jsonl",
        "./.ai/harness/planning/.gitkeep",
        "./.ai/harness/runs/.gitkeep",
        "./.ai/harness/security/.gitkeep",
        "./.ai/harness/triage/.gitkeep",
        "./.ai/harness/worktrees/.gitkeep",
        "./.ai/hooks/README.md",
        "./.claude/templates/design-brief.template.md",
        "./.claude/templates/research.template.md",
        "./.claude/templates/spec.template.md",
        "./deploy/env/.gitkeep",
        "./deploy/release-checklists/.gitkeep",
        "./deploy/runbooks/.gitkeep",
        "./deploy/scripts/.gitkeep",
        "./deploy/sql/.gitkeep",
        "./deploy/submissions/.gitkeep",
        "./docs/CHANGELOG.md",
        "./docs/architecture/diagrams/.gitkeep",
        "./docs/architecture/modules/.gitkeep",
        "./docs/prds/prd.template.md",
        "./interfaces/types.ts",
        "./tasks/lessons.md",
        "./tests/README.md",
      ]);

      // rh init is the only writer of the managed parts.
      expect(existsSync(join(cwd, ".gitignore"))).toBe(false);
      expect(existsSync(join(cwd, "package.json"))).toBe(false);
      expect(readdirSync(join(cwd, "docs/reference-configs"))).toEqual([]);

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

  test("scaffold then rh init writes the same managed parts and seed files as rh init on a fresh directory", () => {
    // One repo name in both parents: the brain manifest seeds the directory name.
    const parents = [mkdtempSync(join(tmpdir(), "scaffold-then-init-")), mkdtempSync(join(tmpdir(), "init-fresh-"))];
    const [scaffolded, fresh] = parents.map((parent) => join(parent, "demo")) as [string, string];
    try {
      for (const repo of [scaffolded, fresh]) mkdirSync(repo);
      expect(spawnSync("bash", [join(ROOT, "scripts/create-project-dirs.sh")], { cwd: scaffolded, encoding: "utf-8" }).status).toBe(0);
      for (const repo of [scaffolded, fresh]) {
        expect(spawnSync("git", ["init", "-q", "-b", "main"], { cwd: repo }).status).toBe(0);
        // A stack generator writes package.json; rh init only edits an existing one.
        writeFileSync(join(repo, "package.json"), `${JSON.stringify({ name: "demo", scripts: { "check:task-workflow": "repo-harness run check-task-workflow --strict" } }, null, 2)}\n`);
        expect(applyAdoptionPlan(planAdoption({ repoRoot: repo, mode: "standard", apply: true })).ok).toBe(true);
      }
      const seeds = ["deploy/README.md", "docs/architecture/index.md", "docs/researches/README.md", "docs/spec.md", ".ai/context/context-map.json", ".ai/context/capabilities.json", ".ai/harness/brain-manifest.json"];
      const managed = (repo: string) => [".gitignore", "package.json", ...seeds, ...readdirSync(join(repo, "docs/reference-configs")).sort().map((name) => `docs/reference-configs/${name}`)]
        .map((path) => [path, readFileSync(join(repo, path), "utf-8")]);
      expect(managed(scaffolded)).toEqual(managed(fresh));

      const gitignore = readFileSync(join(scaffolded, ".gitignore"), "utf-8");
      expect(gitignore).toContain("# BEGIN: repo-harness generated-runtime");
      expect(gitignore).toContain(".claude/.codegraph-state/");
      // The checks cache rules live in the user-level runtime-state block, not the tracked block.
      const runtimeState = readFileSync(join(ROOT, "assets/templates/runtime-state.gitignore"), "utf-8");
      expect(runtimeState).toContain(".ai/harness/checks/*.latest.json");
      expect(runtimeState).toContain(".ai/harness/checks/*.latest.md");
      expect(gitignore).not.toContain(".ai/harness/checks/*.latest.json");
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

      expect(gitignore).not.toContain("tasks/.current.md.tmp.*");
      expect(gitignore).not.toContain("tasks/current.md");
      expect(gitignore).not.toContain(".claude/.plan-state/");
      expect(gitignore).not.toContain(".ai/harness/state/");
      expect(gitignore).toContain(".archcontext/");
      expect(gitignore).not.toContain("# repo-harness generated helper wrappers");
      expect(gitignore).not.toContain("scripts/check-task-workflow.sh");
      expect(gitignore).not.toContain("scripts/prepare-codex-handoff.sh");
      expect(gitignore).not.toContain("scripts/repo-harness/");
      expect(gitignore).not.toContain("tasks/notes");
      expect(gitignore).not.toContain("docs/researches");

      expect(existsSync(join(scaffolded, "docs/reference-configs/spa-day-protocol.md"))).toBe(false);
      expect(existsSync(join(scaffolded, "docs/reference-configs/handoff-protocol.md"))).toBe(false);
      expect(existsSync(join(scaffolded, "docs/reference-configs/harness-overview.md"))).toBe(true);
      expect(existsSync(join(scaffolded, "docs/reference-configs/hook-operations.md"))).toBe(false);
      expect(existsSync(join(scaffolded, "docs/reference-configs/evaluator-rubric.md"))).toBe(false);
      expect(existsSync(join(scaffolded, "docs/reference-configs/agentic-development-flow.md"))).toBe(true);
      expect(existsSync(join(scaffolded, "docs/reference-configs/external-tooling.md"))).toBe(true);
      expect(existsSync(join(scaffolded, "docs/reference-configs/sprint-contracts.md"))).toBe(false);
      expect(existsSync(join(scaffolded, "docs/reference-configs/heartbeat-triage.md"))).toBe(true);
      expect(existsSync(join(scaffolded, "docs/reference-configs/document-generation.md"))).toBe(true);
      expect(existsSync(join(scaffolded, "docs/reference-configs/global-working-rules.md"))).toBe(true);
      expect(existsSync(join(scaffolded, "docs/reference-configs/minimal-change-hooks.md"))).toBe(true);
      for (const docId of ["harness-overview", "agentic-development-flow", "external-tooling"]) {
        const stub = readFileSync(join(scaffolded, "docs/reference-configs", `${docId}.md`), "utf-8");
        expect(stub).toContain("<!-- repo-harness: reference-config-stub v1 -->");
        expect(stub).toContain(`> **Doc ID**: ${docId}`);
        expect(stub).toContain(`rh docs path ${docId}`);
        expect(stub).toContain(`rh docs show ${docId}`);
      }

      const scripts = JSON.parse(readFileSync(join(scaffolded, "package.json"), "utf-8")).scripts;
      expect(scripts).toEqual(MANAGED_PACKAGE_SCRIPTS);
      for (const key of RETIRED_PACKAGE_SCRIPT_KEYS) expect(scripts[key]).toBeUndefined();
    } finally {
      for (const parent of parents) rmSync(parent, { recursive: true, force: true });
    }
  }, SCAFFOLD_PARITY_TIMEOUT_MS);
});
