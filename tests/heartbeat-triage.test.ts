import { describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "..");

function makeRepo(prefix = "heartbeat-triage-"): string {
  const repo = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(repo, ".ai/harness/sprint"), { recursive: true });
  mkdirSync(join(repo, ".ai/harness/runs"), { recursive: true });
  mkdirSync(join(repo, "docs/architecture/requests"), { recursive: true });
  mkdirSync(join(repo, "plans/sprints"), { recursive: true });
  writeFileSync(
    join(repo, ".ai/harness/policy.json"),
    `${JSON.stringify({ harness: { helper_runtime_dir: ".ai/harness/scripts" } }, null, 2)}\n`,
  );
  return repo;
}

function writeExecutable(repo: string, relPath: string, body: string) {
  const path = join(repo, relPath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
  chmodSync(path, 0o755);
}

function helperSourcePath(repo: string): string {
  return join(repo, ".test-helper-source", "heartbeat-triage.sh");
}

function writeSprint(repo: string) {
  const sprintPath = "plans/sprints/demo.sprint.md";
  writeFileSync(
    join(repo, sprintPath),
    [
      "# Sprint: Demo",
      "",
      "> **Status**: Executing",
      "",
      "## Backlog",
      "",
      "| # | Status | Task | Mode | Acceptance | Plan |",
      "|---|--------|------|------|------------|------|",
      "| 1 | [x] | done-task | contract | done | `plans/archive/done.md` |",
      "| 2 | [ ] | next-heartbeat-task | contract | next acceptance | (pending) |",
      "",
    ].join("\n"),
  );
  writeFileSync(join(repo, ".ai/harness/sprint/active-sprint"), sprintPath);
}

function writeWorkflowHelpers(repo: string, workflowExit = 0) {
  writeExecutable(repo, ".test-helper-source/heartbeat-triage.sh", "#!/bin/bash\n");
  writeExecutable(
    repo,
    ".test-helper-source/check-task-workflow.sh",
    [
      "#!/bin/bash",
      workflowExit === 0 ? "echo '[workflow] OK'" : "echo '[workflow] failed' >&2",
      `exit ${workflowExit}`,
      "",
    ].join("\n"),
  );
  writeExecutable(
    repo,
    ".test-helper-source/sprint-backlog.sh",
    [
      "#!/bin/bash",
      "set -euo pipefail",
      "if [[ \"${1:-}\" != \"next\" ]]; then exit 2; fi",
      "cat <<'NEXT_EOF'",
      "index: 2",
      "task: next-heartbeat-task",
      "mode: contract",
      "acceptance: next acceptance",
      "plan: (pending)",
      "NEXT_EOF",
      "",
    ].join("\n"),
  );
}

function runHeartbeat(repo: string, args: string[] = []) {
  return spawnSync("bash", ["scripts/heartbeat-triage.sh", "run", "--repo", repo, ...args], {
    cwd: ROOT,
    encoding: "utf-8",
    env: { ...process.env, FORCE_COLOR: "0", REPO_HARNESS_HELPER_SOURCE_PATH: helperSourcePath(repo) },
  });
}

function parseJson(stdout: string): Record<string, unknown> {
  return JSON.parse(stdout) as Record<string, unknown>;
}

describe("heartbeat triage runner", () => {
  test("three scheduled runs append workflow, sprint-next, and drift entries", () => {
    const repo = makeRepo();
    try {
      writeSprint(repo);
      writeWorkflowHelpers(repo);
      writeFileSync(join(repo, "docs/architecture/requests/request-one.md"), "# Request\n");

      for (const idx of [1, 2, 3]) {
        const res = runHeartbeat(repo, ["--source", "scheduled", "--run-id", `scheduled-${idx}`, "--json"]);
        expect(res.status).toBe(0);
        const manifest = parseJson(res.stdout);
        expect(manifest.kind).toBe("repo-harness-heartbeat-triage");
        expect(manifest.source).toBe("scheduled");
        expect((manifest.entries as Array<{ kind: string; status: string }>)).toEqual([
          expect.objectContaining({ kind: "workflow-check", status: "pass" }),
          expect.objectContaining({ kind: "sprint-next", status: "action" }),
          expect.objectContaining({ kind: "drift-requests", status: "action" }),
        ]);
      }

      const inbox = readFileSync(join(repo, ".ai/harness/triage/inbox.md"), "utf-8");
      expect((inbox.match(/^## Run scheduled-/gm) ?? [])).toHaveLength(3);
      expect((inbox.match(/workflow-check/g) ?? [])).toHaveLength(3);
      expect((inbox.match(/sprint-next/g) ?? [])).toHaveLength(3);
      expect((inbox.match(/drift-requests/g) ?? [])).toHaveLength(3);
      expect(inbox).toContain("next-heartbeat-task");
      expect(inbox).toContain("docs/architecture/requests/request-one.md");
      expect(inbox).toContain("Adoption review due:");
      expect(existsSync(join(repo, ".ai/harness/runs/scheduled-3-heartbeat-triage.json"))).toBe(true);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("workflow check failure is recorded as an inbox finding without failing the runner", () => {
    const repo = makeRepo("heartbeat-triage-fail-");
    try {
      writeSprint(repo);
      writeWorkflowHelpers(repo, 1);

      const res = runHeartbeat(repo, ["--run-id", "workflow-failure", "--json"]);
      expect(res.status).toBe(0);
      const manifest = parseJson(res.stdout);
      expect((manifest.entries as Array<{ kind: string; status: string; summary: string }>)[0]).toEqual(
        expect.objectContaining({
          kind: "workflow-check",
          status: "fail",
          summary: "[workflow] failed",
        }),
      );
      const inbox = readFileSync(join(repo, ".ai/harness/triage/inbox.md"), "utf-8");
      expect(inbox).toContain("[fail] workflow-check: [workflow] failed");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("fallback finds the next pending row when no active-sprint marker exists", () => {
    const repo = makeRepo("heartbeat-triage-fallback-");
    try {
      writeSprint(repo);
      rmSync(join(repo, ".ai/harness/sprint/active-sprint"), { force: true });
      writeWorkflowHelpers(repo);

      const res = runHeartbeat(repo, ["--run-id", "fallback", "--json"]);
      expect(res.status).toBe(0);
      const manifest = parseJson(res.stdout);
      expect((manifest.entries as Array<{ kind: string; summary: string }>)[1]).toEqual(
        expect.objectContaining({
          kind: "sprint-next",
          summary: "next sprint task: next-heartbeat-task",
        }),
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("unknown flags exit with usage error", () => {
    const res = spawnSync("bash", ["scripts/heartbeat-triage.sh", "run", "--bogus"], {
      cwd: ROOT,
      encoding: "utf-8",
    });
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("unknown argument: --bogus");
  });
});
