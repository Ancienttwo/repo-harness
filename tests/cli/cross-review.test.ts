import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

import {
  captureCrossReviewScope,
  runCrossReview,
} from "../../src/effects/review/cross-review-runner";
import { runCrossReviewCommand, formatCrossReviewResult } from "../../src/cli/commands/cross-review";
import {
  buildRecommendation,
  classifyCrossReviewOutcome,
  matchesAuthFailureSignal,
  parseFindings,
  type ProviderInvocationOutcome,
} from "../../src/core/review/cross-review";
import {
  buildOfficialPluginFocus,
  discoverOfficialCodexPlugin,
  parseOfficialCodexPluginReview,
} from "../../src/effects/review/codex-plugin-provider";

// SSD-04: tests/cli/cross-review.test.ts. Every case uses a fixture provider
// script standing in for the real `codex`/official-plugin binaries -- no real
// provider or network call is ever invoked (RunCrossReviewInput.providerCommand
// is the test seam). Scope-only tests (clean/staged/unstaged/untracked/
// degraded/exact-base) invoke captureCrossReviewScope directly without a
// provider process at all.

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.com",
  GIT_COMMITTER_NAME: "Fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.com",
  GIT_AUTHOR_DATE: "2020-01-01T00:00:00Z",
  GIT_COMMITTER_DATE: "2020-01-01T00:00:00Z",
};

function git(cwd: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf-8", env: GIT_ENV });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout;
}

function initRepo(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "cross-review-repo-")));
  git(dir, ["init", "--quiet"]);
  git(dir, ["config", "user.name", "Fixture"]);
  git(dir, ["config", "user.email", "fixture@example.com"]);
  writeFileSync(join(dir, "README.md"), "# fixture\n");
  git(dir, ["add", "."]);
  git(dir, ["commit", "--quiet", "-m", "initial"]);
  return dir;
}

function activateWorkPackage(repo: string): void {
  const plan = "plans/plan-20260820-1436-fixture.md";
  const contract = "tasks/contracts/20260820-1436-fixture.contract.md";
  mkdirSync(join(repo, ".ai", "harness"), { recursive: true });
  mkdirSync(join(repo, "plans"), { recursive: true });
  mkdirSync(join(repo, "tasks", "contracts"), { recursive: true });
  writeFileSync(join(repo, plan), [
    "# Plan: fixture",
    "",
    "> **Status**: Executing",
    `> **Task Contract**: \`${contract}\``,
    "",
  ].join("\n"));
  writeFileSync(join(repo, contract), "# Task Contract: fixture\n");
  writeFileSync(join(repo, ".ai", "harness", "policy.json"), JSON.stringify({
    circuit_breakers: { semantic_reviews_per_work_package: 1 },
  }));
  writeFileSync(join(repo, ".ai", "harness", "active-plan"), `${plan}\n`);
  writeFileSync(join(repo, ".ai", "harness", "active-worktree"), `${repo}\n`);
}

// A tiny stand-in for the direct Codex CLI: behavior selected by the
// CROSS_REVIEW_FIXTURE_MODE env var so one script covers every provider
// outcome case. Never invokes anything real.
const FIXTURE_PROVIDER_LINES = [
  "#!/bin/sh",
  'if [ -n "${CROSS_REVIEW_ARGS_FILE:-}" ]; then printf "%s\\n" "$@" > "$CROSS_REVIEW_ARGS_FILE"; fi',
  // Appending log + invocation counter: lets a test observe how many attempts
  // were actually spent and what argv each attempt used.
  'if [ -n "${CROSS_REVIEW_ARGS_LOG:-}" ]; then printf "%s\\n" "--- attempt ---" "$@" >> "$CROSS_REVIEW_ARGS_LOG"; fi',
  "count=0",
  'if [ -n "${CROSS_REVIEW_COUNTER_FILE:-}" ]; then',
  '  if [ -f "$CROSS_REVIEW_COUNTER_FILE" ]; then count=$(cat "$CROSS_REVIEW_COUNTER_FILE"); fi',
  "  count=$((count + 1))",
  '  echo "$count" > "$CROSS_REVIEW_COUNTER_FILE"',
  "fi",
  'mode="${CROSS_REVIEW_FIXTURE_MODE:-success}"',
  'case "$mode" in',
  "  success)",
  '    echo "[P2] minor: consider renaming this helper for clarity."',
  "    exit 0",
  "    ;;",
  "  success-p1)",
  '    echo "[P1] critical: swallowed error hides a real failure."',
  "    exit 0",
  "    ;;",
  "  empty)",
  "    exit 0",
  "    ;;",
  "  timeout)",
  "    sleep 5",
  "    exit 0",
  "    ;;",
  "  auth)",
  '    echo "Error: not authenticated. Please run claude login first." 1>&2',
  "    exit 1",
  "    ;;",
  "  nonzero)",
  '    echo "boom: internal error" 1>&2',
  "    exit 3",
  "    ;;",
  // Fails the first invocation, succeeds on every later one -- drives the
  // "attempt 1 fails, attempt 2 succeeds" bounded-retry case.
  "  fail-once)",
  '    if [ "$count" -le 1 ]; then',
  '      echo "boom: transient provider error" 1>&2',
  "      exit 3",
  "    fi",
  '    echo "[P2] reviewed on attempt 2."',
  "    exit 0",
  "    ;;",
  "  *)",
  '    echo "unknown fixture mode: $mode" 1>&2',
  "    exit 9",
  "    ;;",
  "esac",
  "",
];

function writeFixtureProvider(dir: string): string {
  const scriptPath = join(dir, "fake-provider.sh");
  writeFileSync(scriptPath, FIXTURE_PROVIDER_LINES.join("\n"));
  chmodSync(scriptPath, 0o755);
  return scriptPath;
}

function withFixture(fn: (repo: string, provider: string) => void): void {
  const repo = initRepo();
  const providerDir = mkdtempSync(join(tmpdir(), "cross-review-provider-"));
  const provider = writeFixtureProvider(providerDir);
  try {
    fn(repo, provider);
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(providerDir, { recursive: true, force: true });
  }
}

function officialPluginPayload(
  findings: readonly Record<string, unknown>[] = [{
    severity: "high",
    title: "Swallowed failure",
    body: "The error path reports success.",
    file: "src/example.ts",
    line_start: 12,
    line_end: 12,
    confidence: 0.98,
    recommendation: "Return the failure.",
  }],
): string {
  const result = {
    verdict: findings.length > 0 ? "needs-attention" : "approve",
    summary: findings.length > 0 ? "Material findings found." : "No material findings.",
    findings,
    next_steps: findings.length > 0 ? ["Address the findings."] : [],
  };
  const rawOutput = JSON.stringify(result);
  return JSON.stringify({
    codex: { status: 0, stderr: "", stdout: rawOutput, reasoning: "" },
    result,
    rawOutput,
    parseError: null,
    reasoningSummary: "",
  });
}

function withOfficialPluginFixture(
  fn: (fixture: {
    repo: string;
    home: string;
    pluginRoot: string;
    claudeCommand: string;
    runtimeCommand: string;
    env: NodeJS.ProcessEnv;
  }) => void,
): void {
  const repo = initRepo();
  const root = mkdtempSync(join(tmpdir(), "cross-review-official-plugin-"));
  const home = join(root, "home");
  const pluginRoot = join(root, "plugin", "1.0.6");
  mkdirSync(join(pluginRoot, "scripts"), { recursive: true });
  mkdirSync(join(pluginRoot, "schemas"), { recursive: true });
  mkdirSync(join(pluginRoot, ".claude-plugin"), { recursive: true });
  mkdirSync(home, { recursive: true });
  writeFileSync(join(pluginRoot, "scripts", "codex-companion.mjs"), "// official companion fixture\n");
  writeFileSync(join(pluginRoot, ".claude-plugin", "plugin.json"), JSON.stringify({
    name: "codex",
    version: "1.0.6",
    author: { name: "OpenAI" },
  }));
  writeFileSync(join(pluginRoot, "schemas", "review-output.schema.json"), JSON.stringify({
    required: ["verdict", "summary", "findings", "next_steps"],
    properties: {
      verdict: { enum: ["approve", "needs-attention"] },
      findings: { items: { properties: { severity: { enum: ["critical", "high", "medium", "low"] } } } },
    },
  }));
  const claudeCommand = join(root, "fake-claude.sh");
  writeFileSync(claudeCommand, [
    "#!/bin/sh",
    'printf "%s\\n" "$CODEX_PLUGIN_INVENTORY"',
  ].join("\n"));
  chmodSync(claudeCommand, 0o755);
  const runtimeCommand = join(root, "fake-node.sh");
  writeFileSync(runtimeCommand, [
    "#!/bin/sh",
    'if [ -n "${CROSS_REVIEW_CWD_FILE:-}" ]; then pwd > "$CROSS_REVIEW_CWD_FILE"; fi',
    'if [ -n "${CROSS_REVIEW_ARGS_FILE:-}" ]; then printf "%s\\n" "$@" > "$CROSS_REVIEW_ARGS_FILE"; fi',
    'if [ -n "${CROSS_REVIEW_COUNTER_FILE:-}" ]; then count=0; [ -f "$CROSS_REVIEW_COUNTER_FILE" ] && count=$(cat "$CROSS_REVIEW_COUNTER_FILE"); echo $((count + 1)) > "$CROSS_REVIEW_COUNTER_FILE"; fi',
    'if [ -n "${CROSS_REVIEW_MUTATE_FILE:-}" ]; then printf "changed during review\\n" >> "$CROSS_REVIEW_MUTATE_FILE"; fi',
    'printf "%s\\n" "$CROSS_REVIEW_PLUGIN_PAYLOAD"',
  ].join("\n"));
  chmodSync(runtimeCommand, 0o755);
  const env = {
    ...process.env,
    HOME: home,
    CODEX_PLUGIN_INVENTORY: JSON.stringify([{
      id: "codex@openai-codex",
      version: "1.0.6",
      enabled: true,
      installPath: pluginRoot,
    }]),
    CROSS_REVIEW_PLUGIN_PAYLOAD: officialPluginPayload(),
    // The fixture HOME is the only plugin-data authority here. An explicit
    // undefined survives discoverOfficialCodexPlugin's `{ ...process.env,
    // ...opts.env }` merge, so an ambient CLAUDE_PLUGIN_DATA cannot outrank
    // the HOME-based default and point discovery outside the fixture.
    CLAUDE_PLUGIN_DATA: undefined,
  };
  try {
    fn({ repo, home, pluginRoot, claudeCommand, runtimeCommand, env });
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  }
}

describe("captureCrossReviewScope (scope capture, no provider invoked)", () => {
  test("clean tree: no diffs at all yields an empty path set", () => {
    const repo = initRepo();
    try {
      const scope = captureCrossReviewScope(repo, { baseRevision: "HEAD" });
      expect(scope.status).toBe("ok");
      if (scope.status === "ok") expect(scope.paths).toEqual([]);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }, 30_000);

  test("staged-only change appears in scope.paths", () => {
    const repo = initRepo();
    try {
      writeFileSync(join(repo, "staged.txt"), "staged content\n");
      git(repo, ["add", "staged.txt"]);
      const scope = captureCrossReviewScope(repo, { baseRevision: "HEAD" });
      expect(scope.status).toBe("ok");
      if (scope.status === "ok") expect(scope.paths).toContain("staged.txt");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }, 30_000);

  test("unstaged tracked modification appears in scope.paths", () => {
    const repo = initRepo();
    try {
      writeFileSync(join(repo, "README.md"), "# fixture\nchanged\n");
      const scope = captureCrossReviewScope(repo, { baseRevision: "HEAD" });
      expect(scope.status).toBe("ok");
      if (scope.status === "ok") expect(scope.paths).toContain("README.md");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }, 30_000);

  test("untracked file appears in scope.paths", () => {
    const repo = initRepo();
    try {
      writeFileSync(join(repo, "untracked.txt"), "new file\n");
      const scope = captureCrossReviewScope(repo, { baseRevision: "HEAD" });
      expect(scope.status).toBe("ok");
      if (scope.status === "ok") expect(scope.paths).toContain("untracked.txt");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }, 30_000);

  test("degraded_scope: an unresolvable base revision fails closed", () => {
    const repo = initRepo();
    try {
      const scope = captureCrossReviewScope(repo, { baseRevision: "this-ref-does-not-exist-xyz" });
      expect(scope.status).toBe("degraded");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }, 30_000);

  test("exact-base binding: scope binds to the resolved SHA of the declared base even after HEAD moves later", () => {
    const repo = initRepo();
    try {
      const c1 = git(repo, ["rev-parse", "HEAD"]).trim();

      writeFileSync(join(repo, "file-2.txt"), "second commit content\n");
      git(repo, ["add", "."]);
      git(repo, ["commit", "--quiet", "-m", "second"]);
      const c2 = git(repo, ["rev-parse", "HEAD"]).trim();

      const scope = captureCrossReviewScope(repo, { baseRevision: c1 });
      expect(scope.status).toBe("ok");
      if (scope.status !== "ok") throw new Error("expected ok scope");
      expect(scope.baseRev).toBe(c1);
      expect(scope.headRev).toBe(c2);

      // Advance HEAD again after the scope was already captured.
      writeFileSync(join(repo, "file-3.txt"), "third commit content\n");
      git(repo, ["add", "."]);
      git(repo, ["commit", "--quiet", "-m", "third"]);
      const c3 = git(repo, ["rev-parse", "HEAD"]).trim();
      expect(c3).not.toBe(c2);

      // The already-captured scope object still reflects the exact base/HEAD
      // pair pinned at capture time -- it was never re-resolved against the
      // now-moved HEAD.
      expect(scope.baseRev).toBe(c1);
      expect(scope.headRev).toBe(c2);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }, 30_000);
});

describe("runCrossReview (codex mode, fixture provider process)", () => {
  test("degraded_scope short-circuits before any provider process is spawned", () => {
    withFixture((repo) => {
      const result = runCrossReview({
        repoRoot: repo,
        provider: "codex",
        baseRevision: "this-ref-does-not-exist-xyz",
        // Deliberately nonexistent: if the runner ever tried to invoke a
        // provider despite the degraded scope, this would surface as a
        // spawn failure (a different code), proving the short-circuit.
        providerCommand: "/nonexistent/should-never-be-invoked",
      });
      expect(result.status).toBe("failed");
      if (result.status === "failed") {
        expect(result.code).toBe("degraded_scope");
        expect(result.scope).toBeNull();
      }
    });
  }, 30_000);

  test("empty_output: clean exit with no stdout and no recovery attempted skips after the budget", () => {
    withFixture((repo, provider) => {
      const result = runCrossReview({
        repoRoot: repo,
        provider: "codex",
        providerCommand: provider,
        timeoutMs: 5000,
        env: { ...process.env, CROSS_REVIEW_FIXTURE_MODE: "empty" },
      });
      expect(result.status).toBe("skipped");
      if (result.status === "skipped") {
        expect(result.code).toBe("empty_output");
        expect(result.attempts).toBe(2);
      }
    });
  }, 30_000);

  test("auth_failure: a nonzero exit with an auth signal in stderr is distinguished from provider_nonzero", () => {
    withFixture((repo, provider) => {
      const result = runCrossReview({
        repoRoot: repo,
        provider: "codex",
        providerCommand: provider,
        timeoutMs: 5000,
        env: { ...process.env, CROSS_REVIEW_FIXTURE_MODE: "auth" },
      });
      expect(result.status).toBe("skipped");
      if (result.status === "skipped") expect(result.code).toBe("auth_failure");
    });
  }, 30_000);

  test("success: a P2-only transcript parses to a PASS recommendation", () => {
    withFixture((repo, provider) => {
      const result = runCrossReview({
        repoRoot: repo,
        provider: "codex",
        providerCommand: provider,
        timeoutMs: 5000,
        env: { ...process.env, CROSS_REVIEW_FIXTURE_MODE: "success" },
      });
      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        expect(result.findings).toHaveLength(1);
        expect(result.findings[0].severity).toBe("P2");
        expect(result.recommendation).toContain("PASS");
      }
    });
  }, 30_000);

  test("success-p1: a P1 finding drives a FAIL recommendation and a nonzero CLI exit code", () => {
    withFixture((repo, provider) => {
      const command = runCrossReviewCommand({
        repoRoot: repo,
        provider: "codex",
        providerCommand: provider,
        timeoutMs: 5000,
        env: { ...process.env, CROSS_REVIEW_FIXTURE_MODE: "success-p1" },
      });
      expect(command.exitCode).toBe(1);
      expect(command.result.status).toBe("ok");
      if (command.result.status === "ok") expect(command.result.recommendation).toContain("FAIL");
      expect(command.output).toContain("[P1]");
    });
  }, 30_000);

  test("json output round-trips the structured result", () => {
    withFixture((repo, provider) => {
      const command = runCrossReviewCommand({
        repoRoot: repo,
        provider: "codex",
        providerCommand: provider,
        timeoutMs: 5000,
        json: true,
        env: { ...process.env, CROSS_REVIEW_FIXTURE_MODE: "success" },
      });
      const parsed = JSON.parse(command.output);
      expect(parsed.status).toBe("ok");
      expect(parsed.provider).toBe("codex");
    });
  }, 30_000);

  test("an active work-package enters direct provider review once across later subject changes", () => {
    withFixture((repo, provider) => {
      activateWorkPackage(repo);
      const counterFile = `${provider}.single-pass-count`;
      const options = {
        repoRoot: repo,
        provider: "codex" as const,
        providerCommand: provider,
        timeoutMs: 5000,
        env: {
          ...process.env,
          CROSS_REVIEW_FIXTURE_MODE: "success",
          CROSS_REVIEW_COUNTER_FILE: counterFile,
        },
      };

      const first = runCrossReviewCommand(options);
      expect(first.exitCode).toBe(0);
      expect(readFileSync(counterFile, "utf8").trim()).toBe("1");

      writeFileSync(join(repo, "README.md"), "# fixture\npost-review correction\n");
      const second = runCrossReviewCommand(options);
      expect(second.exitCode).toBe(1);
      expect(second.result.status).toBe("failed");
      if (second.result.status === "failed") expect(second.result.code).toBe("review_budget_exhausted");
      expect(second.output).toContain("one semantic review");
      expect(readFileSync(counterFile, "utf8").trim()).toBe("1");
    });
  }, 30_000);
});

describe("runCrossReview (official codex-plugin mode)", () => {
  test("discovers the enabled official install and binds the app-server request to the exact combined subject", () => {
    withOfficialPluginFixture(({ repo, pluginRoot, claudeCommand, runtimeCommand, env }) => {
      writeFileSync(join(repo, "untracked.txt"), "new file\n");
      const scope = captureCrossReviewScope(repo, { baseRevision: "HEAD" });
      expect(scope.status).toBe("ok");
      if (scope.status !== "ok") throw new Error("expected ok scope");
      const discovery = discoverOfficialCodexPlugin(repo, scope, {
        env,
        claudeCommand,
        nodeCommand: runtimeCommand,
      });
      expect(discovery.status).toBe("ok");
      if (discovery.status !== "ok") throw new Error(discovery.message);
      expect(discovery.invocation.version).toBe("1.0.6");
      expect(discovery.invocation.args[0]).toBe(realpathSync(join(pluginRoot, "scripts", "codex-companion.mjs")));
      expect(discovery.invocation.args).toContain("adversarial-review");
      expect(discovery.invocation.args).toContain("--json");
      expect(discovery.invocation.args).toContain("--base");
      expect(discovery.invocation.args).toContain(scope.baseRev);
      const focus = discovery.invocation.args.at(-1) ?? "";
      expect(focus).toContain(scope.reviewSubjectSha256);
      expect(focus).toContain(`git diff ${scope.baseRev}...${scope.headRev}`);
      expect(focus).toContain(JSON.stringify(scope.paths));
      expect(focus).toContain("git diff --cached");
      expect(focus).toContain("git ls-files --others --exclude-standard");
      expect(discovery.invocation.env.CLAUDE_PLUGIN_DATA).toContain("codex-openai-codex");
      expect(buildOfficialPluginFocus(scope)).toBe(focus);
    });
  });

  test("maps official critical/high to P1 and medium/low to P2 while preserving the verbatim Codex transcript", () => {
    withOfficialPluginFixture(({ repo, home, claudeCommand, runtimeCommand, env }) => {
      const findings = [
        {
          severity: "high",
          title: "High risk",
          body: "The operation can lose data.",
          file: "src/high.ts",
          line_start: 8,
          line_end: 9,
          confidence: 0.99,
          recommendation: "Make the write atomic.",
        },
        {
          severity: "medium",
          title: "Missing assertion",
          body: "The test does not prove the failure path.",
          file: "tests/example.test.ts",
          line_start: 20,
          line_end: 20,
          confidence: 0.8,
          recommendation: "Assert the error result.",
        },
      ];
      const payload = officialPluginPayload(findings);
      const counterFile = join(home, "plugin-counter.txt");
      const result = runCrossReview({
        repoRoot: repo,
        provider: "codex-plugin",
        providerCommand: runtimeCommand,
        claudeCommand,
        timeoutMs: 5000,
        env: { ...env, CROSS_REVIEW_PLUGIN_PAYLOAD: payload, CROSS_REVIEW_COUNTER_FILE: counterFile },
      });
      expect(result.status).toBe("ok");
      if (result.status !== "ok") throw new Error(result.message);
      expect(result.findings.map((finding) => finding.severity)).toEqual(["P1", "P2"]);
      expect(result.transcript).toBe(JSON.parse(payload).codex.stdout);
      expect(result.recommendation).toContain("FAIL");
      expect(result.usedTranscriptRecovery).toBe(false);
      expect(readFileSync(counterFile, "utf-8").trim()).toBe("1");
    });
  });

  test("runs the official reviewer against an immutable snapshot and fails if the source subject changes", () => {
    withOfficialPluginFixture(({ repo, home, claudeCommand, runtimeCommand, env }) => {
      writeFileSync(join(repo, "README.md"), "# fixture\nreview me\n");
      const cwdFile = join(home, "provider-cwd.txt");
      const counterFile = join(home, "provider-count.txt");
      const result = runCrossReview({
        repoRoot: repo,
        provider: "codex-plugin",
        providerCommand: runtimeCommand,
        claudeCommand,
        timeoutMs: 5000,
        env: {
          ...env,
          CROSS_REVIEW_CWD_FILE: cwdFile,
          CROSS_REVIEW_COUNTER_FILE: counterFile,
          CROSS_REVIEW_MUTATE_FILE: join(repo, "README.md"),
        },
      });
      expect(result.status).toBe("failed");
      if (result.status !== "failed") throw new Error("expected stale scope failure");
      expect(result.code).toBe("stale_scope");
      expect(result.message).toContain("changed while");
      expect(readFileSync(counterFile, "utf-8").trim()).toBe("1");
      expect(readFileSync(cwdFile, "utf-8").trim()).not.toBe(repo);
      expect(readFileSync(cwdFile, "utf-8")).toContain("repo-harness-cross-review-");
    });
  });

  test("missing or disabled official plugin fails explicitly after the bounded budget and never runs a fallback", () => {
    withOfficialPluginFixture(({ repo, home, claudeCommand, runtimeCommand, env }) => {
      const counterFile = join(home, "plugin-counter.txt");
      const result = runCrossReview({
        repoRoot: repo,
        provider: "codex-plugin",
        providerCommand: runtimeCommand,
        claudeCommand,
        timeoutMs: 5000,
        env: {
          ...env,
          CODEX_PLUGIN_INVENTORY: JSON.stringify([{
            id: "codex@openai-codex",
            version: "1.0.6",
            enabled: false,
            installPath: "/ignored",
          }]),
          CROSS_REVIEW_COUNTER_FILE: counterFile,
        },
      });
      expect(result.status).toBe("skipped");
      if (result.status !== "skipped") throw new Error("expected skipped");
      expect(result.attempts).toBe(2);
      expect(result.message).toContain("installed but disabled");
      expect(() => readFileSync(counterFile, "utf-8")).toThrow();
    });
  });

  test("malformed official structured output fails closed instead of parsing prose", () => {
    withOfficialPluginFixture(({ repo, claudeCommand, runtimeCommand, env }) => {
      const result = runCrossReview({
        repoRoot: repo,
        provider: "codex-plugin",
        providerCommand: runtimeCommand,
        claudeCommand,
        timeoutMs: 5000,
        env: { ...env, CROSS_REVIEW_PLUGIN_PAYLOAD: '{"result":"not-the-schema"}' },
      });
      expect(result.status).toBe("skipped");
      if (result.status === "skipped") expect(result.code).toBe("malformed_transcript");
    });
  });

  test("structured parser rejects unsafe finding paths", () => {
    const payload = officialPluginPayload([{
      severity: "low",
      title: "Unsafe path",
      body: "Path escaped the repository.",
      file: "../outside.ts",
      line_start: 1,
      line_end: 1,
      confidence: 0.5,
      recommendation: "Use a repository-relative path.",
    }]);
    expect(parseOfficialCodexPluginReview(payload)).toEqual({
      status: "failed",
      message: "official Codex plugin returned an unsupported review result shape",
    });
  });

  test("structured parser rejects wrapper fields that disagree with the verbatim Codex transcript", () => {
    const payload = JSON.parse(officialPluginPayload()) as Record<string, unknown>;
    payload.result = { verdict: "approve", summary: "tampered", findings: [], next_steps: [] };
    expect(parseOfficialCodexPluginReview(JSON.stringify(payload))).toEqual({
      status: "failed",
      message: "official Codex plugin payload disagrees with the verbatim Codex transcript",
    });
  });

  test("structured parser rejects verdict/findings combinations that could synthesize a false pass", () => {
    for (const [verdict, findings] of [
      ["needs-attention", []],
      ["approve", [{
        severity: "low",
        title: "Advisory",
        body: "A finding exists.",
        file: "src/example.ts",
        line_start: 1,
        line_end: 1,
        confidence: 0.8,
        recommendation: "Address it.",
      }]],
    ] as const) {
      const result = { verdict, summary: "inconsistent", findings, next_steps: [] };
      const payload = JSON.stringify({
        codex: { status: 0, stderr: "", stdout: JSON.stringify(result), reasoning: "" },
        result,
        rawOutput: JSON.stringify(result),
        parseError: null,
        reasoningSummary: "",
      });
      expect(parseOfficialCodexPluginReview(payload)).toEqual({
        status: "failed",
        message: "official Codex plugin returned an unsupported review result shape",
      });
    }
  });
});

describe("bounded attempt budget: 2 attempts, then a non-blocking skip", () => {
  test("timeout on both attempts -> skipped after 2 attempts with exit code 0", () => {
    withFixture((repo, provider) => {
      const timeoutMs = 300;
      const startedAt = Date.now();
      const command = runCrossReviewCommand({
        repoRoot: repo,
        provider: "codex",
        providerCommand: provider,
        timeoutMs,
        env: { ...process.env, CROSS_REVIEW_FIXTURE_MODE: "timeout" },
      });
      const elapsedMs = Date.now() - startedAt;
      expect(command.result.status).toBe("skipped");
      if (command.result.status === "skipped") {
        expect(command.result.attempts).toBe(2);
        expect(command.result.code).toBe("timeout");
      }
      expect(command.exitCode).toBe(0);
      expect(command.output).toContain("SKIPPED");
      // A killed provider process cannot be observed through a counter file it
      // never got to flush, so two full budgets of wall clock is the proof that
      // a second attempt really was spawned (lower bound only, never flaky).
      expect(elapsedMs).toBeGreaterThanOrEqual(2 * timeoutMs);
    });
  }, 30_000);

  test("nonzero exit on both attempts -> skipped after 2 attempts with exit code 0", () => {
    withFixture((repo, provider) => {
      const counterFile = `${provider}.count`;
      const command = runCrossReviewCommand({
        repoRoot: repo,
        provider: "codex",
        providerCommand: provider,
        timeoutMs: 5000,
        env: {
          ...process.env,
          CROSS_REVIEW_FIXTURE_MODE: "nonzero",
          CROSS_REVIEW_COUNTER_FILE: counterFile,
        },
      });
      expect(command.result.status).toBe("skipped");
      if (command.result.status === "skipped") {
        expect(command.result.attempts).toBe(2);
        expect(command.result.code).toBe("provider_nonzero");
      }
      expect(command.exitCode).toBe(0);
      expect(command.output).toContain("SKIPPED");
      expect(readFileSync(counterFile, "utf8").trim()).toBe("2");
    });
  }, 30_000);

  test("happy path spends exactly one attempt (no gratuitous second invocation)", () => {
    withFixture((repo, provider) => {
      const counterFile = `${provider}.count`;
      const command = runCrossReviewCommand({
        repoRoot: repo,
        provider: "codex",
        providerCommand: provider,
        timeoutMs: 5000,
        env: {
          ...process.env,
          CROSS_REVIEW_FIXTURE_MODE: "success",
          CROSS_REVIEW_COUNTER_FILE: counterFile,
        },
      });
      expect(command.result.status).toBe("ok");
      expect(command.exitCode).toBe(0);
      expect(readFileSync(counterFile, "utf8").trim()).toBe("1");
    });
  }, 30_000);

  test("degraded_scope stays a blocking failure with exit code 1 (never skipped)", () => {
    withFixture((repo) => {
      const command = runCrossReviewCommand({
        repoRoot: repo,
        provider: "codex",
        baseRevision: "this-ref-does-not-exist-xyz",
        providerCommand: "/nonexistent/should-never-be-invoked",
      });
      expect(command.result.status).toBe("failed");
      if (command.result.status === "failed") expect(command.result.code).toBe("degraded_scope");
      expect(command.exitCode).toBe(1);
      expect(command.output).toContain("FAILED");
    });
  }, 30_000);
});

describe("pure classification and parsing helpers (src/core/review/cross-review.ts)", () => {
  const baseInvocation: ProviderInvocationOutcome = {
    ok: true,
    status: 0,
    timedOut: false,
    stdout: "",
    stderr: "",
    error: "",
  };
  test("classifyCrossReviewOutcome: timeout is explicit", () => {
    const outcome = classifyCrossReviewOutcome(
      { ...baseInvocation, ok: false, timedOut: true, status: 124 },
    );
    expect(outcome.kind).toBe("failed");
    if (outcome.kind === "failed") {
      expect(outcome.code).toBe("timeout");
    }
  });

  test("classifyCrossReviewOutcome: nonzero + auth signal -> auth_failure", () => {
    const outcome = classifyCrossReviewOutcome(
      { ...baseInvocation, ok: false, status: 1, stderr: "please sign in to continue" },
    );
    expect(outcome.kind).toBe("failed");
    if (outcome.kind === "failed") expect(outcome.code).toBe("auth_failure");
  });

  test("classifyCrossReviewOutcome: nonzero without auth signal -> provider_nonzero", () => {
    const outcome = classifyCrossReviewOutcome(
      { ...baseInvocation, ok: false, status: 2, stderr: "boom" },
    );
    expect(outcome.kind).toBe("failed");
    if (outcome.kind === "failed") expect(outcome.code).toBe("provider_nonzero");
  });

  test("classifyCrossReviewOutcome does not treat review stdout as an auth signal", () => {
    const outcome = classifyCrossReviewOutcome(
      { ...baseInvocation, ok: false, status: 2, stdout: "The reviewed code says not logged in", stderr: "boom" },
    );
    expect(outcome.kind).toBe("failed");
    if (outcome.kind === "failed") expect(outcome.code).toBe("provider_nonzero");
  });

  test("classifyCrossReviewOutcome recognizes the exact Claude stdout login failure", () => {
    const outcome = classifyCrossReviewOutcome(
      { ...baseInvocation, ok: false, status: 1, stdout: "Not logged in · Please run /login" },
    );
    expect(outcome.kind).toBe("failed");
    if (outcome.kind === "failed") expect(outcome.code).toBe("auth_failure");
  });

  test("classifyCrossReviewOutcome recognizes the exact Claude login line around banners", () => {
    const outcome = classifyCrossReviewOutcome(
      { ...baseInvocation, ok: false, status: 1, stdout: "Claude Code\nNot logged in · Please run /login\nGoodbye" },
    );
    expect(outcome.kind).toBe("failed");
    if (outcome.kind === "failed") expect(outcome.code).toBe("auth_failure");
  });

  test("classifyCrossReviewOutcome: clean exit + stdout -> success, no recovery used", () => {
    const outcome = classifyCrossReviewOutcome({ ...baseInvocation, stdout: "[P2] fine" });
    expect(outcome.kind).toBe("success");
    if (outcome.kind === "success") {
      expect(outcome.transcript).toBe("[P2] fine");
      expect(outcome.usedRecovery).toBe(false);
    }
  });

  test("classifyCrossReviewOutcome: clean exit + empty stdout -> empty_output", () => {
    const outcome = classifyCrossReviewOutcome(baseInvocation);
    expect(outcome.kind).toBe("failed");
    if (outcome.kind === "failed") expect(outcome.code).toBe("empty_output");
  });

  test("matchesAuthFailureSignal recognizes known auth signals and rejects generic errors", () => {
    expect(matchesAuthFailureSignal("please run `codex login` again")).toBe(true);
    expect(matchesAuthFailureSignal("Not logged in · Please run /login")).toBe(true);
    expect(matchesAuthFailureSignal("Unauthorized (401)")).toBe(true);
    expect(matchesAuthFailureSignal("boom: internal error")).toBe(false);
  });

  test("parseFindings extracts plain and Markdown-wrapped [P1]/[P2] lines and ignores everything else", () => {
    const findings = parseFindings([
      "some prose",
      "## [P1] critical heading",
      "-[P1] compact bullet",
      "- [P1] critical thing",
      "[P2] minor thing",
      "**[P1] bold critical heading**",
      "- **[P2]** bold marker advisory",
      "**[P1]** bold marker critical",
      "",
    ].join("\n"));
    expect(findings).toEqual([
      { severity: "P1", text: "critical heading" },
      { severity: "P1", text: "compact bullet" },
      { severity: "P1", text: "critical thing" },
      { severity: "P2", text: "minor thing" },
      { severity: "P1", text: "bold critical heading" },
      { severity: "P2", text: "bold marker advisory" },
      { severity: "P1", text: "bold marker critical" },
    ]);
  });

  test("buildRecommendation: any P1 drives FAIL regardless of P2 count", () => {
    const rec = buildRecommendation([
      { severity: "P2", text: "minor" },
      { severity: "P1", text: "critical" },
    ]);
    expect(rec).toContain("FAIL");
    expect(rec).toContain("critical");
  });

  test("buildRecommendation: no findings -> PASS", () => {
    expect(buildRecommendation([])).toContain("PASS");
  });

});

describe("no-merge-gate reachability (hard constraint 3)", () => {
  const ROOT = join(import.meta.dir, "..", "..");
  const NEW_MODULE_PATHS = [
    "src/core/review/cross-review.ts",
    "src/effects/review/codex-plugin-provider.ts",
    "src/effects/review/cross-review-runner.ts",
    "src/cli/commands/cross-review.ts",
  ];
  const FORBIDDEN_IMPORT_SUBSTRINGS = [
    "merge-gate",
    "acceptance-receipt",
    "helper-runner",
    "evidence/verify-producer",
    "evidence/checks-materializer",
    "evidence/attested-import",
  ];

  test("new SSD-04 modules never import from, or reference, a merge-gate/receipt surface", () => {
    const violations: string[] = [];
    for (const relPath of NEW_MODULE_PATHS) {
      const content = readFileSync(join(ROOT, relPath), "utf-8");
      const importLines = content.split("\n").filter((line) => /\bfrom\s+['"]|require\(/.test(line));
      for (const line of importLines) {
        for (const forbidden of FORBIDDEN_IMPORT_SUBSTRINGS) {
          if (line.includes(forbidden)) violations.push(`${relPath}: ${line.trim()}`);
        }
      }
      // Belt-and-suspenders: these modules never construct a "receipt" of any kind.
      if (/\breceipt\b/i.test(content)) violations.push(`${relPath}: contains the literal word "receipt"`);
    }
    expect(violations).toEqual([]);
  });
});
