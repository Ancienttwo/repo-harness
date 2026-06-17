import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
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
  test("concurrent counter increments lose no updates", async () => {
    const counter = join(cwd, ".claude-test-counter");
    const workers = 6;
    const perWorker = 8;
    const jobs: Promise<number>[] = [];
    for (let i = 0; i < workers; i += 1) {
      jobs.push(
        shellAsync(
          `${SOURCE_LIB}; for _ in $(seq ${perWorker}); do workflow_increment_counter "${counter}" >/dev/null; done`,
        ),
      );
    }
    const codes = await Promise.all(jobs);
    expect(codes.every((code) => code === 0)).toBe(true);
    expect(readFileSync(counter, "utf-8").trim()).toBe(String(workers * perWorker));
  }, 60000);

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
  });

  test("rotation keeps the newest lines and archives the rest", () => {
    const file = join(cwd, ".ai/harness/rotation-test.jsonl");
    const lines = Array.from({ length: 2500 }, (_, i) => `{"n":${i}}`).join("\n");
    writeFileSync(file, `${lines}\n`);

    const res = shell(`${SOURCE_LIB}; workflow_rotate_events_file "${file}" 2000 524288 500`);
    expect(res.status).toBe(0);

    const kept = readFileSync(file, "utf-8").trim().split("\n");
    expect(kept.length).toBe(500);
    expect(kept[0]).toBe('{"n":2000}');
    expect(kept[kept.length - 1]).toBe('{"n":2499}');

    const archive = readFileSync(join(cwd, ".ai/harness/archive/rotation-test-" + archiveStamp() + ".jsonl"), "utf-8")
      .trim()
      .split("\n");
    expect(archive.length).toBe(2000);
    expect(archive[0]).toBe('{"n":0}');
  });

  test("rotation is a no-op under the thresholds", () => {
    const file = join(cwd, ".ai/harness/small-test.jsonl");
    writeFileSync(file, '{"n":1}\n{"n":2}\n');
    const res = shell(`${SOURCE_LIB}; workflow_rotate_events_file "${file}" 2000 524288 500`);
    expect(res.status).toBe(0);
    expect(readFileSync(file, "utf-8").trim().split("\n").length).toBe(2);
  });
});

function archiveStamp(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
}
