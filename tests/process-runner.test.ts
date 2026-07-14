import { describe, expect, test } from "bun:test";
import { capProcessOutput, runProcess } from "../src/effects/process-runner";

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
});
