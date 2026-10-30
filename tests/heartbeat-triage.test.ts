import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
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

function runHeartbeat(repo: string, args: string[] = []) {
  return spawnSync("bash", ["scripts/heartbeat-triage.sh", "run", "--repo", repo, ...args], {
    cwd: ROOT,
    encoding: "utf-8",
    env: { ...process.env, FORCE_COLOR: "0" },
  });
}

function parseJson(stdout: string): Record<string, unknown> {
  return JSON.parse(stdout) as Record<string, unknown>;
}

describe("heartbeat triage runner", () => {
  test("three scheduled runs append snapshots", () => {
    const repo = makeRepo();
    try {
      for (const idx of [1, 2, 3]) {
        const res = runHeartbeat(repo, ["--source", "scheduled", "--run-id", `scheduled-${idx}`, "--json"]);
        expect(res.status).toBe(0);
        const manifest = parseJson(res.stdout);
        expect(manifest.kind).toBe("repo-harness-heartbeat-triage");
        expect(manifest.source).toBe("scheduled");
        expect(manifest.entries).toEqual([]);
        expect(manifest.adoption_review_due).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }

      const inbox = readFileSync(join(repo, ".ai/harness/triage/inbox.md"), "utf-8");
      expect((inbox.match(/^## Run scheduled-/gm) ?? [])).toHaveLength(3);
      expect(inbox).toContain("Adoption review due:");
      expect(existsSync(join(repo, ".ai/harness/runs/scheduled-3-heartbeat-triage.json"))).toBe(true);
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
