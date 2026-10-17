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
  test("three scheduled runs append workflow findings", () => {
    const repo = makeRepo();
    try {
      writeWorkflowHelpers(repo);

      for (const idx of [1, 2, 3]) {
        const res = runHeartbeat(repo, ["--source", "scheduled", "--run-id", `scheduled-${idx}`, "--json"]);
        expect(res.status).toBe(0);
        const manifest = parseJson(res.stdout);
        expect(manifest.kind).toBe("repo-harness-heartbeat-triage");
        expect(manifest.source).toBe("scheduled");
        expect((manifest.entries as Array<{ kind: string; status: string }>)).toEqual([
          expect.objectContaining({ kind: "workflow-check", status: "pass" }),
        ]);
      }

      const inbox = readFileSync(join(repo, ".ai/harness/triage/inbox.md"), "utf-8");
      expect((inbox.match(/^## Run scheduled-/gm) ?? [])).toHaveLength(3);
      expect((inbox.match(/workflow-check/g) ?? [])).toHaveLength(3);
      expect(inbox).not.toContain("drift-requests");
      expect(inbox).toContain("Adoption review due:");
      expect(existsSync(join(repo, ".ai/harness/runs/scheduled-3-heartbeat-triage.json"))).toBe(true);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }, 30_000);

  test("workflow check failure is recorded as an inbox finding without failing the runner", () => {
    const repo = makeRepo("heartbeat-triage-fail-");
    try {
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
  }, 30_000);


  test("unknown flags exit with usage error", () => {
    const res = spawnSync("bash", ["scripts/heartbeat-triage.sh", "run", "--bogus"], {
      cwd: ROOT,
      encoding: "utf-8",
    });
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("unknown argument: --bogus");
  }, 30_000);
});
