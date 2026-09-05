import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..");

// The guard runs against a sourceable library so the CI gate's per-file loop is
// observable without executing the whole gate. REPO_HARNESS_CI_RUN_TESTS_LIB
// lets the pre-fix capture point the same assertions at a copy of the previous
// inlined implementation.
const LIB_PATH = resolve(
  REPO_ROOT,
  process.env.REPO_HARNESS_CI_RUN_TESTS_LIB ?? "scripts/lib/ci-run-tests.sh"
);

type RunResult = {
  status: number;
  output: string;
};

function writeTestFile(dir: string, name: string, passing: boolean): string {
  const path = join(dir, name);
  const body = passing
    ? 'import { expect, test } from "bun:test";\ntest("passes", () => {\n  expect(1).toBe(1);\n});\n'
    : 'import { expect, test } from "bun:test";\ntest("fails", () => {\n  expect(1).toBe(2);\n});\n';
  writeFileSync(path, body, "utf-8");
  return path;
}

function runIsolatedGate(files: string[]): RunResult {
  // `set -euo pipefail` mirrors scripts/check-ci.sh: without it the shell would
  // not fail fast, so the guard would not observe the gate's real behaviour.
  const script = `set -euo pipefail; source ${JSON.stringify(LIB_PATH)}; run_bun_tests`;
  const result = spawnSync("bash", ["-c", script], {
    cwd: REPO_ROOT,
    encoding: "utf-8",
    env: {
      ...process.env,
      BUN_TEST_ISOLATE_FILES: "1",
      BUN_TEST_FILES: files.join(" "),
      BUN_TEST_TIMEOUT_MS: "60000",
      BUN_TEST_MAX_CONCURRENCY: "1",
    },
  });
  return {
    status: typeof result.status === "number" ? result.status : -1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

function summaryEntries(output: string): string[] {
  const lines = output.split("\n");
  const headerIndex = lines.findIndex((line) => line.startsWith("[ci] failed test files ("));
  if (headerIndex < 0) {
    return [];
  }
  const entries: string[] = [];
  for (const line of lines.slice(headerIndex + 1)) {
    if (!line.startsWith("  ")) {
      break;
    }
    entries.push(line.trim());
  }
  return entries;
}

describe("ci isolate-mode test loop", () => {
  test("runs every selected file and reports each failing file once", () => {
    const dir = mkdtempSync(join(tmpdir(), "rh-ci-isolate-"));
    try {
      const failing = writeTestFile(dir, "aggregate-failing.test.ts", false);
      const passing = writeTestFile(dir, "aggregate-passing.test.ts", true);

      // The failing file sorts first so a fail-fast loop would never reach the
      // passing file — that is exactly the CI blind spot this guard protects.
      const result = runIsolatedGate([failing, passing]);

      expect(result.output).toContain(`[ci] test ${failing}`);
      expect(result.output).toContain(`[ci] test ${passing}`);
      expect(result.output).toContain("[ci] failed test files (1):");
      expect(summaryEntries(result.output)).toEqual([`${failing} (exit 1)`]);
      expect(result.status).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("stays silent and succeeds when every selected file passes", () => {
    const dir = mkdtempSync(join(tmpdir(), "rh-ci-isolate-"));
    try {
      const first = writeTestFile(dir, "aggregate-first.test.ts", true);
      const second = writeTestFile(dir, "aggregate-second.test.ts", true);

      const result = runIsolatedGate([first, second]);

      expect(result.output).toContain(`[ci] test ${first}`);
      expect(result.output).toContain(`[ci] test ${second}`);
      expect(result.output).not.toContain("[ci] failed test files (");
      expect(result.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
