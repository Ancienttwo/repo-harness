import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { tmpdir } from "node:os";

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
  stdout: string;
  stderr: string;
};

type GateOptions = {
  /** Left unset so the gate keeps running with its own `BUN_TEST_JOBS` default. */
  jobs?: string;
  /** Prepended to PATH so a case can substitute a deterministic fake `bun`. */
  binDir?: string;
};

function writeTestFile(dir: string, name: string, passing: boolean): string {
  const path = join(dir, name);
  const body = passing
    ? 'import { expect, test } from "bun:test";\ntest("passes", () => {\n  expect(1).toBe(1);\n});\n'
    : 'import { expect, test } from "bun:test";\ntest("fails", () => {\n  expect(1).toBe(2);\n});\n';
  writeFileSync(path, body, "utf-8");
  return path;
}

// CI exports BUN_TEST_JOBS to the whole Test job, so an inherited value would
// silently decide which loop each case exercises. Every case states the job
// count it means to test, and the absence of the variable is itself a case.
function gateEnv(overrides: Record<string, string>): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env };
  delete env.BUN_TEST_JOBS;
  return { ...env, ...overrides };
}

function runIsolatedGate(files: string[], options: GateOptions = {}): RunResult {
  // `set -euo pipefail` mirrors scripts/check-ci.sh: without it the shell would
  // not fail fast, so the guard would not observe the gate's real behaviour.
  const script = `set -euo pipefail; source ${JSON.stringify(LIB_PATH)}; run_bun_tests`;
  const result = spawnSync("bash", ["-c", script], {
    cwd: REPO_ROOT,
    encoding: "utf-8",
    env: gateEnv({
      ...(options.binDir ? { PATH: `${options.binDir}${delimiter}${process.env.PATH ?? ""}` } : {}),
      ...(options.jobs === undefined ? {} : { BUN_TEST_JOBS: options.jobs }),
      BUN_TEST_ISOLATE_FILES: "1",
      BUN_TEST_FILES: files.join(" "),
      BUN_TEST_TIMEOUT_MS: "60000",
      BUN_TEST_MAX_CONCURRENCY: "1",
    }),
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  return {
    status: typeof result.status === "number" ? result.status : -1,
    output: `${stdout}${stderr}`,
    stdout,
    stderr,
  };
}

// Discovery mode drops BUN_TEST_FILES so the loop falls through to the lib's
// own `find tests` scan. That scan is relative to the working directory, so the
// gate is exercised from a throwaway `tests`-shaped root while the library is
// still sourced by absolute path.
function runDiscoveredGate(cwd: string): RunResult {
  const script = `set -euo pipefail; source ${JSON.stringify(LIB_PATH)}; run_bun_tests`;
  const result = spawnSync("bash", ["-c", script], {
    cwd,
    encoding: "utf-8",
    env: gateEnv({
      BUN_TEST_ISOLATE_FILES: "1",
      BUN_TEST_FILES: "",
      BUN_TEST_TIMEOUT_MS: "60000",
      BUN_TEST_MAX_CONCURRENCY: "1",
    }),
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  return {
    status: typeof result.status === "number" ? result.status : -1,
    output: `${stdout}${stderr}`,
    stdout,
    stderr,
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

  test("discovers .test.tsx files alongside .test.ts files", () => {
    const root = mkdtempSync(join(tmpdir(), "rh-ci-discover-"));
    try {
      const testsDir = join(root, "tests");
      mkdirSync(testsDir);
      writeTestFile(testsDir, "a.test.ts", true);
      writeTestFile(testsDir, "b.test.tsx", true);

      const result = runDiscoveredGate(root);

      expect(result.output).toContain("[ci] test tests/a.test.ts");
      // bun discovers .test.tsx on its own, so a loop that skips it hides those
      // suites from the gate while they still pass locally.
      expect(result.output).toContain("[ci] test tests/b.test.tsx");
      expect(result.status).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// A fake `bun` keeps the byte-for-byte baseline comparison meaningful: the real
// runner prints per-run timings, so two identical serial runs would never match
// literally even when the loop behaves identically.
function writeFakeBun(root: string): string {
  const binDir = join(root, "bin");
  mkdirSync(binDir, { recursive: true });
  const path = join(binDir, "bun");
  const script = [
    "#!/usr/bin/env bash",
    "set -u",
    'file="${!#}"',
    'echo "fake-bun stdout ${file##*/}"',
    'echo "fake-bun stderr ${file##*/}" >&2',
    'case "$file" in',
    "  *failing*) exit 1 ;;",
    "esac",
    "exit 0",
    "",
  ].join("\n");
  writeFileSync(path, script, "utf-8");
  chmodSync(path, 0o755);
  return binDir;
}

// Each file logs a unique begin/end pair around a barrier that only clears once
// every peer has started, so a pool that serialises the files fails the barrier
// and a pool that streams worker output interleaves the pairs.
function writeBarrierTestFile(dir: string, id: string, barrier: string, expected: number): string {
  const path = join(dir, `barrier-${id}.test.ts`);
  const body = [
    'import { expect, test } from "bun:test";',
    'import { appendFileSync, readFileSync } from "node:fs";',
    `const barrier = ${JSON.stringify(barrier)};`,
    'test("barrier", async () => {',
    `  console.log("BLOCK ${id} BEGIN");`,
    `  appendFileSync(barrier, "${id}\\n");`,
    "  const deadline = Date.now() + 10000;",
    "  let started = 0;",
    "  while (Date.now() < deadline) {",
    '    started = readFileSync(barrier, "utf-8").split("\\n").filter(Boolean).length;',
    `    if (started >= ${expected}) break;`,
    "    await Bun.sleep(25);",
    "  }",
    `  console.log("BLOCK ${id} END");`,
    `  expect(started).toBeGreaterThanOrEqual(${expected});`,
    "});",
    "",
  ].join("\n");
  writeFileSync(path, body, "utf-8");
  return path;
}

function outputBlocks(output: string): { file: string; body: string }[] {
  const blocks: { file: string; body: string }[] = [];
  for (const line of output.split("\n")) {
    if (line.startsWith("[ci] test ")) {
      blocks.push({ file: line.slice("[ci] test ".length), body: "" });
      continue;
    }
    if (blocks.length > 0) {
      blocks[blocks.length - 1]!.body += `${line}\n`;
    }
  }
  return blocks;
}

describe("ci isolate-mode job pool", () => {
  test("BUN_TEST_JOBS=1 reproduces the serial baseline byte for byte", () => {
    const root = mkdtempSync(join(tmpdir(), "rh-ci-jobs-"));
    try {
      const binDir = writeFakeBun(root);
      const files = [
        join(root, "pool-failing-a.test.ts"),
        join(root, "pool-passing-b.test.ts"),
        join(root, "pool-failing-c.test.ts"),
      ];
      for (const file of files) {
        writeFileSync(file, "", "utf-8");
      }

      const baseline = runIsolatedGate(files, { binDir });
      const explicit = runIsolatedGate(files, { binDir, jobs: "1" });

      expect(baseline.status).toBe(1);
      expect(explicit.stdout).toBe(baseline.stdout);
      expect(explicit.stderr).toBe(baseline.stderr);
      expect(explicit.status).toBe(baseline.status);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("BUN_TEST_JOBS=3 aggregates the same failing files, sorted by path", () => {
    const root = mkdtempSync(join(tmpdir(), "rh-ci-jobs-"));
    try {
      const binDir = writeFakeBun(root);
      const failingFirst = join(root, "pool-a-failing.test.ts");
      const passing = join(root, "pool-b-passing.test.ts");
      const failingLast = join(root, "pool-c-failing.test.ts");
      for (const file of [failingFirst, passing, failingLast]) {
        writeFileSync(file, "", "utf-8");
      }
      // Selection order is reversed so the summary can only come out sorted if
      // the pool sorts it rather than echoing completion or selection order.
      const selection = [failingLast, passing, failingFirst];

      const serial = runIsolatedGate(selection, { binDir, jobs: "1" });
      const pooled = runIsolatedGate(selection, { binDir, jobs: "3" });

      expect(pooled.status).toBe(1);
      expect(pooled.output).toContain("[ci] failed test files (2):");
      expect(summaryEntries(pooled.output)).toEqual([
        `${failingFirst} (exit 1)`,
        `${failingLast} (exit 1)`,
      ]);
      expect(summaryEntries(serial.output).slice().sort()).toEqual(summaryEntries(pooled.output));
      for (const file of selection) {
        expect(pooled.output).toContain(`[ci] test ${file}`);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("BUN_TEST_JOBS=3 runs files concurrently and keeps each file's output contiguous", () => {
    const root = mkdtempSync(join(tmpdir(), "rh-ci-jobs-"));
    try {
      const barrier = join(root, "barrier.txt");
      writeFileSync(barrier, "", "utf-8");
      const ids = ["one", "two", "three"];
      const files = ids.map((id) => writeBarrierTestFile(root, id, barrier, ids.length));

      const result = runIsolatedGate(files, { jobs: "3" });

      expect(result.status).toBe(0);
      const blocks = outputBlocks(result.output);
      expect(blocks.map((block) => block.file).sort()).toEqual(files.slice().sort());
      for (const block of blocks) {
        const id = ids.find((candidate) => block.file.endsWith(`barrier-${candidate}.test.ts`));
        expect(id).toBeDefined();
        expect(block.body).toContain(`BLOCK ${id} BEGIN`);
        expect(block.body).toContain(`BLOCK ${id} END`);
        for (const other of ids.filter((candidate) => candidate !== id)) {
          expect(block.body).not.toContain(`BLOCK ${other} `);
        }
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects a BUN_TEST_JOBS value that is not a positive integer", () => {
    const root = mkdtempSync(join(tmpdir(), "rh-ci-jobs-"));
    try {
      const binDir = writeFakeBun(root);
      const file = join(root, "pool-passing.test.ts");
      writeFileSync(file, "", "utf-8");

      const result = runIsolatedGate([file], { binDir, jobs: "0" });

      expect(result.status).toBe(1);
      expect(result.output).toContain("[ci] BUN_TEST_JOBS must be a positive integer");
      expect(result.output).not.toContain("[ci] test ");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
