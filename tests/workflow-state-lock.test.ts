import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawn, spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "..");
let cwd: string;

function shell(script: string) {
  return spawnSync("bash", ["-c", script], { cwd, encoding: "utf-8" });
}

function shellAsync(script: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("bash", ["-c", script], { cwd, stdio: "ignore" });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

const SOURCE_LIB = '. .ai/hooks/lib/workflow-state.sh';

beforeAll(() => {
  cwd = mkdtempSync(join(tmpdir(), "workflow-lock-"));
  mkdirSync(join(cwd, ".ai"), { recursive: true });
  cpSync(join(ROOT, "assets/hooks"), join(cwd, ".ai/hooks"), { recursive: true });
});

afterAll(() => {
  rmSync(cwd, { recursive: true, force: true });
});

describe("workflow-state locking", () => {
  test("concurrent event appends produce complete, valid JSONL", async () => {
    const workers = 4;
    const perWorker = 5;
    const jobs: Promise<number>[] = [];
    for (let i = 0; i < workers; i += 1) {
      jobs.push(
        shellAsync(
          `${SOURCE_LIB}; for n in $(seq ${perWorker}); do workflow_append_event "lock_test" "worker-${i}-event-$n" '{}'; done`,
        ),
      );
    }
    const codes = await Promise.all(jobs);
    expect(codes.every((code) => code === 0)).toBe(true);

    const eventsFile = join(cwd, ".ai/harness/events.jsonl");
    const lines = readFileSync(eventsFile, "utf-8")
      .split("\n")
      .filter((line) => line.includes('"lock_test"'));
    expect(lines.length).toBe(workers * perWorker);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  }, 60000);

  test("stale lock from a crashed holder is broken instead of deadlocking", () => {
    const res = shell(
      [
        SOURCE_LIB,
        'lock_root="$(dirname "$(workflow_events_file)")/.locks"',
        'mkdir -p "$lock_root/stale-test.lock"',
        // Backdate the lock beyond the 60s stale threshold.
        'touch -t 202601010000 "$lock_root/stale-test.lock"',
        'workflow_with_lock stale-test echo "ran-after-stale-break"',
      ].join("\n"),
    );
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("ran-after-stale-break");
    expect(existsSync(join(cwd, ".ai/harness/.locks/stale-test.lock"))).toBe(false);
  }, 30_000);
});
