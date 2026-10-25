import { describe, expect, test } from "bun:test";
import { spawn } from "child_process";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { capProcessOutput, runProcess } from "../src/effects/process-runner";
import {
  processGroupExists,
  taskkillAttemptSucceeded,
  terminateProcessGroup,
  terminateProcessGroupSync,
} from "../src/effects/process-group-termination";

describe("process runner", () => {
  test("captures status and redacts common secrets from output and command args", () => {
    const result = runProcess(
      process.execPath,
      ["-e", "console.log('api_key=super-secret'); console.error('Bearer abc123')", "token=hidden"],
      { maxOutputBytes: 1024 },
    );

    expect(result.ok).toBe(true);
    expect(result.stdout).toContain("api_key=[redacted]");
    expect(result.stdout).not.toContain("super-secret");
    expect(result.stderr).toContain("Bearer [redacted]");
    expect(result.stderr).not.toContain("abc123");
    expect(result.command.join(" ")).toContain("token=[redacted]");
    expect(result.command.join(" ")).not.toContain("hidden");
  });

  test("caps output with an explicit truncation marker", () => {
    expect(capProcessOutput("0123456789", 5)).toBe("01234\n[output truncated after 5 bytes]");
  });

  test("can execute with an exact environment instead of inheriting the caller", () => {
    const inheritedKey = "REPO_HARNESS_PROCESS_RUNNER_INHERITED";
    const previous = process.env[inheritedKey];
    process.env[inheritedKey] = "caller-value";
    try {
      const result = runProcess(
        process.execPath,
        ["-e", `console.log(process.env.${inheritedKey} ?? "missing")`],
        { env: { PATH: process.env.PATH }, inheritEnv: false },
      );

      expect(result.ok).toBe(true);
      expect(result.stdout.trim()).toBe("missing");
    } finally {
      if (previous === undefined) delete process.env[inheritedKey];
      else process.env[inheritedKey] = previous;
    }
  });

  test("reports timed out processes without throwing", () => {
    const result = runProcess(process.execPath, ["-e", "setTimeout(() => {}, 1000)"], { timeoutMs: 20 });

    expect(result.ok).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(result.error).toContain("process timed out after 20ms");
    expect(result.stderr).toContain("process timed out after 20ms");
  });

  test("supervised runs stop at an absolute deadline", () => {
    const result = runProcess(process.execPath, ["-e", "setTimeout(() => {}, 5000)"], {
      processGroup: true,
      deadlineMs: Date.now() + 200,
    });

    expect(result.ok).toBe(false);
    expect(result.timedOut).toBe(true);
  });

  test("an expired deadline refuses to start the supervised command", () => {
    const root = mkdtempSync(join(tmpdir(), "process-runner-expired-"));
    try {
      const marker = join(root, "started");
      const result = runProcess(process.execPath, ["-e", `require("fs").writeFileSync(${JSON.stringify(marker)}, "yes")`], {
        processGroup: true,
        deadlineMs: Date.now() - 1,
      });

      expect(result.ok).toBe(false);
      expect(result.timedOut).toBe(true);
      expect(existsSync(marker)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a supervised deadline stays active after the group leader exits", async () => {
    if (process.platform === "win32") return;
    const root = mkdtempSync(join(tmpdir(), "process-runner-leader-exit-"));
    try {
      const started = join(root, "started");
      const sentinel = join(root, "descendant-survived");
      // The deadline leaves room for supervisor startup, so the leader really
      // exits first and only the TERM-ignoring descendant holds the group.
      const result = runProcess("bash", ["-c", `touch "${started}"; (trap '' TERM; sleep 3; touch "${sentinel}") & exit 0`], {
        processGroup: true,
        deadlineMs: Date.now() + 1_500,
      });

      expect(existsSync(started)).toBe(true);
      expect(result.ok).toBe(false);
      expect(result.timedOut).toBe(true);
      await Bun.sleep(3_000);
      expect(existsSync(sentinel)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);

  test("rejects a relative timeout combined with an absolute deadline", () => {
    expect(() => runProcess(process.execPath, ["-e", ""], { timeoutMs: 100, deadlineMs: Date.now() + 100 }))
      .toThrow("timeoutMs or deadlineMs, not both");
  });

  test("treats only a zero taskkill exit status as confirmed termination", () => {
    expect(taskkillAttemptSucceeded({ status: 0 })).toBe(true);
    expect(taskkillAttemptSucceeded({ status: 1 })).toBe(false);
    expect(taskkillAttemptSucceeded({ status: null })).toBe(false);
    expect(() => taskkillAttemptSucceeded({ status: null, error: new Error("spawn failed") })).toThrow("spawn failed");
  });
});

// The leader exits on SIGTERM; its background grandchild ignores SIGTERM and
// keeps the group alive. The launcher exits after readiness, so the group is
// orphaned and reaped by init, as an abandoned supervised group is.
const TERM_RESISTANT_GRANDCHILD = `trap 'exit 0' TERM; (trap '' TERM; exec sh -c 'echo "$PPID $$"; while :; do sleep 0.05; done') & wait`;
const TERM_HONORING_GROUP = `echo "$$ $$"; while :; do sleep 0.05; done`;

async function startOrphanedGroup(script: string): Promise<{ readonly pgid: number; readonly member: number }> {
  const launcher = spawn(process.execPath, ["-e", [
    "const { spawn } = require('child_process');",
    `const group = spawn('bash', ['-c', ${JSON.stringify(script)}], { detached: true, stdio: ['ignore', 'pipe', 'ignore'] });`,
    "group.stdout.once('data', (line) => { process.stdout.write(String(line)); process.exit(0); });",
  ].join("\n")], { stdio: ["ignore", "pipe", "inherit"] });
  const ready = await new Promise<string>((resolve, reject) => {
    let buffered = "";
    launcher.stdout!.on("data", (chunk: Buffer) => {
      buffered += chunk.toString("utf8");
      if (buffered.includes("\n")) resolve(buffered.trim());
    });
    launcher.once("error", reject);
    launcher.once("close", () => reject(new Error(`launcher closed before readiness: ${buffered}`)));
  });
  const [pgid, member] = ready.split(" ").map(Number);
  return { pgid: pgid!, member: member! };
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killGroup(pgid: number): void {
  try { process.kill(-pgid, "SIGKILL"); } catch { /* already gone */ }
}

const drivers = [
  ["terminateProcessGroup", (pgid: number, graceMs: number) => terminateProcessGroup(pgid, graceMs)],
  ["terminateProcessGroupSync", async (pgid: number, graceMs: number) => terminateProcessGroupSync(pgid, graceMs)],
] as const;

describe.skipIf(process.platform === "win32")("process group termination", () => {
  for (const [name, terminate] of drivers) {
    test(`${name} kills a TERM-resistant grandchild after its leader exits on SIGTERM`, async () => {
      const { pgid, member: grandchild } = await startOrphanedGroup(TERM_RESISTANT_GRANDCHILD);
      try {
        expect(processExists(grandchild)).toBe(true);

        const termination = await terminate(pgid, 200);

        expect(termination).toEqual({ confirmed: true, forced: true });
        expect(processGroupExists(pgid)).toBe(false);
        expect(processExists(pgid)).toBe(false);
        expect(processExists(grandchild)).toBe(false);
      } finally {
        killGroup(pgid);
      }
    }, 20_000);
  }

  test("ends the grace period when the whole group exits on SIGTERM", async () => {
    const { pgid } = await startOrphanedGroup(TERM_HONORING_GROUP);
    try {
      const started = Date.now();

      const termination = await terminateProcessGroup(pgid, 10_000);

      expect(termination).toEqual({ confirmed: true, forced: false });
      expect(Date.now() - started).toBeLessThan(10_000);
      expect(processGroupExists(pgid)).toBe(false);
    } finally {
      killGroup(pgid);
    }
  }, 20_000);

  test("a throwing beforeForce hook stops the escalation", async () => {
    const { pgid, member: grandchild } = await startOrphanedGroup(TERM_RESISTANT_GRANDCHILD);
    try {
      await expect(terminateProcessGroup(pgid, 100, {
        beforeForce: () => { throw new Error("identity lost"); },
      })).rejects.toThrow("identity lost");
      expect(processExists(grandchild)).toBe(true);
    } finally {
      killGroup(pgid);
    }
  }, 20_000);

  test("does not send SIGKILL when the group exits during the beforeForce hook", async () => {
    const { pgid } = await startOrphanedGroup(TERM_RESISTANT_GRANDCHILD);
    try {
      const termination = await terminateProcessGroup(pgid, 100, {
        // A blocking identity check can outlast the group; it exits here before the hook returns.
        beforeForce: () => {
          process.kill(-pgid, "SIGKILL");
          const deadline = Date.now() + 5_000;
          while (processGroupExists(pgid) && Date.now() < deadline) {
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
          }
        },
      });

      expect(termination).toEqual({ confirmed: true, forced: false });
    } finally {
      killGroup(pgid);
    }
  }, 20_000);

  test("does not signal a group that already exited", async () => {
    const child = spawn("true", [], { detached: true, stdio: "ignore" });
    await new Promise((resolve) => child.once("exit", resolve));

    expect(await terminateProcessGroup(child.pid!, 10_000)).toEqual({ confirmed: true, forced: false });
  });
});
