import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "crypto";
import { chmodSync, copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "..");
const SCRIPT = join(ROOT, "scripts", "merge-gate.ts");
const tempDirs: string[] = [];

afterEach(() => {
  for (const path of tempDirs.splice(0)) rmSync(path, { recursive: true, force: true });
});

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}) {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf-8",
    env: { ...process.env, ...env },
  });
}

function git(cwd: string, ...args: string[]): string {
  const result = run("git", args, cwd);
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

function commitAll(cwd: string, message: string): void {
  git(cwd, "add", "-A");
  git(cwd, "commit", "-m", message);
}

function basePolicy(enabled: unknown = true): string {
  return `${JSON.stringify({ merge_gate: { enabled, rule: "fixture" } }, null, 2)}\n`;
}

function makeFixture(options: { baseGate?: boolean; hostConfig?: boolean } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "repo-harness-merge-gate-repo-"));
  const home = mkdtempSync(join(tmpdir(), "repo-harness-merge-gate-home-"));
  tempDirs.push(cwd, home);
  git(cwd, "init", "-b", "main");
  git(cwd, "config", "user.name", "Merge Gate Test");
  git(cwd, "config", "user.email", "merge-gate@test.local");
  mkdirSync(join(cwd, ".ai", "harness"), { recursive: true });
  writeFileSync(join(cwd, ".gitignore"), ".ai/harness/checks\n");
  writeFileSync(join(cwd, "base.txt"), "base\n");
  if (options.baseGate !== false) writeFileSync(join(cwd, ".ai", "harness", "policy.json"), basePolicy());
  commitAll(cwd, "base");
  git(cwd, "checkout", "-b", "codex/demo");
  mkdirSync(join(cwd, "plans"), { recursive: true });
  writeFileSync(join(cwd, "feature.txt"), "candidate\n");
  writeFileSync(join(cwd, "plans", "plan-demo.md"), "# Plan: demo\n\n- Ship feature.txt.\n");
  commitAll(cwd, "candidate");
  mkdirSync(join(cwd, ".ai", "harness", "checks"), { recursive: true });
  writeFileSync(join(cwd, ".ai", "harness", "checks", "latest.json"), `${JSON.stringify({ status: "pass", commands: ["bun test"] })}\n`);

  const fakeClaude = join(home, "fake-claude.sh");
  const fakeArgs = join(home, "claude.args");
  const fakePrompt = join(home, "claude.prompt");
  const fakeVerdict = join(home, "claude.verdict");
  writeFileSync(fakeVerdict, "PASS\n");
  writeFileSync(fakeClaude, [
    "#!/bin/bash",
    "set -euo pipefail",
    "[[ -z \"${CLAUDE_CONFIG_DIR+x}\" ]] || { echo 'unexpected CLAUDE_CONFIG_DIR override' >&2; exit 99; }",
    `printf '%s\\n' \"$@\" > ${JSON.stringify(fakeArgs)}`,
    `cat > ${JSON.stringify(fakePrompt)}`,
    `case \"$(cat ${JSON.stringify(fakeVerdict)})\" in`,
    "  PASS)",
    "    decision='{\"protocol\":1,\"verdict\":\"PASS\",\"summary\":\"candidate accepted\",\"findings\":[],\"checks\":[{\"command\":\"bun test\",\"status\":\"pass\",\"summary\":\"supplied evidence passed\"}]}' ;;",
    "  FAIL)",
    "    decision='{\"protocol\":1,\"verdict\":\"FAIL\",\"summary\":\"blocking defect\",\"findings\":[{\"severity\":\"HIGH\",\"file\":\"feature.txt\",\"line\":1,\"message\":\"bad candidate\",\"fix\":\"repair it\"}],\"checks\":[{\"command\":\"bun test\",\"status\":\"fail\",\"summary\":\"failed\"}]}' ;;",
    "  BLOCKED)",
    "    decision='{\"protocol\":1,\"verdict\":\"BLOCKED\",\"summary\":\"evidence unavailable\",\"findings\":[],\"checks\":[{\"command\":\"bun test\",\"status\":\"blocked\",\"summary\":\"unavailable\"}]}' ;;",
    "  MALFORMED) printf 'not-json\\n'; exit 0 ;;",
    "  ERROR) printf '{\"type\":\"result\",\"is_error\":true,\"structured_output\":null}\\n'; exit 0 ;;",
    "  LIMIT) printf '{\"type\":\"result\",\"is_error\":true,\"result\":\"session limit\"}\\n'; exit 1 ;;",
    "  *) exit 9 ;;",
    "esac",
    "printf '{\"type\":\"result\",\"is_error\":false,\"structured_output\":%s}\\n' \"$decision\"",
    "",
  ].join("\n"));
  chmodSync(fakeClaude, 0o755);

  const stateRoot = join(home, ".repo-harness");
  mkdirSync(stateRoot, { recursive: true });
  mkdirSync(join(home, ".claude", "agents"), { recursive: true });
  mkdirSync(join(home, ".claude", "skills", "merge-gate"), { recursive: true });
  writeFileSync(join(home, ".claude", "agents", "gatekeeper.md"), "fixture gatekeeper\n");
  writeFileSync(join(home, ".claude", "skills", "merge-gate", "SKILL.md"), "fixture merge gate\n");
  const config = join(stateRoot, "config.json");
  if (options.hostConfig !== false) {
    writeFileSync(config, `${JSON.stringify({
      merge_gate: {
        enabled: true,
        runner: "claude-agent",
        agent: "gatekeeper",
        skill: "merge-gate",
        claude_bin: fakeClaude,
      },
    }, null, 2)}\n`);
  }
  const repoId = createHash("sha256").update(realpathSync(cwd)).digest("hex");
  const harness = join(home, "merge-gate-harness.ts");
  writeFileSync(
    harness,
    `import { runMergeGateCli } from ${JSON.stringify(SCRIPT)};\nrunMergeGateCli(process.argv.slice(2), ${JSON.stringify(home)});\n`,
  );
  return {
    cwd,
    home,
    fakeClaude,
    fakeArgs,
    fakePrompt,
    fakeVerdict,
    config,
    harness,
    receipt: join(stateRoot, "gates", repoId, "merge-gate.latest.json"),
  };
}

function gate(
  fixture: ReturnType<typeof makeFixture>,
  command: "run" | "verify" | "fingerprint",
  verdict = "PASS",
  extraEnv: NodeJS.ProcessEnv = {},
) {
  const args = [fixture.harness, command, "--base", "main"];
  if (command === "run") args.push("--goal", "plans/plan-demo.md");
  writeFileSync(fixture.fakeVerdict, `${verdict}\n`);
  return run("bun", args, fixture.cwd, {
    HOME: fixture.home,
    ...extraEnv,
  });
}

describe("merge-gate receipt lifecycle", () => {
  test("writes and verifies a host-state PASS receipt bound to the exact candidate and runtime", () => {
    const fixture = makeFixture();
    const result = gate(fixture, "run");
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain("[MergeGate] PASS");
    expect(result.stderr).toContain("verified PASS");
    expect(JSON.parse(result.stdout)).toMatchObject({ required: true, head_sha: git(fixture.cwd, "rev-parse", "HEAD") });

    const receipt = JSON.parse(readFileSync(fixture.receipt, "utf-8"));
    expect(receipt).toMatchObject({
      protocol: 1,
      kind: "repo-harness-merge-gate-receipt",
      verdict: "PASS",
      base_ref: "main",
      runner: "claude-agent",
      agent: "gatekeeper",
      skill: "merge-gate",
    });
    expect(receipt.diff_fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(receipt.host_runtime_fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(receipt.helper_fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);

    const args = readFileSync(fixture.fakeArgs, "utf-8");
    expect(args).toContain("--agent\ngatekeeper");
    expect(args).toContain("--tools\n\n");
    expect(args).toContain("--permission-mode\nplan");
    expect(args).toContain("--setting-sources\nuser");
    const prompt = readFileSync(fixture.fakePrompt, "utf-8");
    expect(prompt).toContain("/merge-gate");
    expect(prompt).toContain('"diff":');
    expect(prompt).toContain('"verification_evidence":');
  });

  test.each([
    ["FAIL", 1],
    ["BLOCKED", 2],
  ] as const)("persists %s and exits fail closed", (verdict, status) => {
    const fixture = makeFixture();
    const result = gate(fixture, "run", verdict);
    expect(result.status).toBe(status);
    expect(JSON.parse(readFileSync(fixture.receipt, "utf-8")).verdict).toBe(verdict);
  });

  test.each(["MALFORMED", "ERROR"])("rejects %s runner output and removes a previous receipt", (verdict) => {
    const fixture = makeFixture();
    expect(gate(fixture, "run").status).toBe(0);
    const malformed = gate(fixture, "run", verdict);
    expect(malformed.status).toBe(2);
    expect(existsSync(fixture.receipt)).toBe(false);
  });

  test("surfaces a bounded provider error from a non-zero runner envelope", () => {
    const fixture = makeFixture();
    const result = gate(fixture, "run", "LIMIT");
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("runner exited 1: session limit");
  });

  test("base commit owns enablement, so a candidate cannot disable its own gate", () => {
    const fixture = makeFixture();
    writeFileSync(join(fixture.cwd, ".ai", "harness", "policy.json"), basePolicy(false));
    commitAll(fixture.cwd, "attempt to disable gate");
    const result = gate(fixture, "run");
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).required).toBe(true);
  });

  test("fails closed for malformed base enablement and candidate-local helper execution", () => {
    const malformed = makeFixture();
    git(malformed.cwd, "checkout", "main");
    writeFileSync(join(malformed.cwd, ".ai", "harness", "policy.json"), basePolicy("true"));
    commitAll(malformed.cwd, "malformed gate policy");
    git(malformed.cwd, "checkout", "codex/demo");
    git(malformed.cwd, "rebase", "main");
    const invalid = gate(malformed, "verify");
    expect(invalid.status).toBe(2);
    expect(invalid.stderr).toContain("merge_gate.enabled must be a boolean");

    const local = makeFixture();
    mkdirSync(join(local.cwd, "scripts"), { recursive: true });
    const localScript = join(local.cwd, "scripts", "merge-gate.ts");
    copyFileSync(SCRIPT, localScript);
    const localHarness = join(local.home, "local-helper-harness.ts");
    writeFileSync(
      localHarness,
      `import { runMergeGateCli } from ${JSON.stringify(localScript)};\nrunMergeGateCli(process.argv.slice(2), ${JSON.stringify(local.home)});\n`,
    );
    const result = run("bun", [localHarness, "verify", "--base", "main"], local.cwd);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("installed repo-harness helper runtime");
  });

  test("an ungated base returns the exact candidate SHA without reading host runner config", () => {
    const fixture = makeFixture({ baseGate: false, hostConfig: false });
    const result = gate(fixture, "verify");
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ required: false, head_sha: git(fixture.cwd, "rev-parse", "HEAD") });
  });

  test("fails closed when an enabled base has no trusted host runner config", () => {
    const fixture = makeFixture({ hostConfig: false });
    const result = gate(fixture, "verify");
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("host config not found");
  });

  test("ignores a process-level runner override", () => {
    const fixture = makeFixture();
    const result = gate(fixture, "run", "PASS", { REPO_HARNESS_CLAUDE_BIN: "/does/not/exist" });
    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(fixture.fakeArgs)).toBe(true);
  });

  test("production entrypoint ignores caller HOME as a trust-root override", () => {
    const fixture = makeFixture();
    const result = run("bun", [SCRIPT, "verify", "--base", "main"], fixture.cwd, { HOME: fixture.home });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain(".repo-harness");
    expect(result.stderr).not.toContain(realpathSync(fixture.home));
  });

  test("rejects a missing receipt", () => {
    const fixture = makeFixture();
    const result = gate(fixture, "verify");
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("PASS receipt is missing");
  });

  test("rejects changed or missing verification evidence after PASS", () => {
    const fixture = makeFixture();
    const evidence = join(fixture.cwd, ".ai", "harness", "checks", "latest.json");
    expect(gate(fixture, "run").status).toBe(0);
    writeFileSync(evidence, `${JSON.stringify({ status: "fail", commands: ["bun test"] })}\n`);
    const changed = gate(fixture, "verify");
    expect(changed.status).toBe(2);
    expect(changed.stderr).toContain("verification evidence is stale");

    writeFileSync(evidence, `${JSON.stringify({ status: "pass", commands: ["bun test"] })}\n`);
    expect(gate(fixture, "run").status).toBe(0);
    rmSync(evidence);
    const missing = gate(fixture, "verify");
    expect(missing.status).toBe(2);
    expect(missing.stderr).toContain("verification evidence is missing");
  });

  test("rejects stale head, base, diff, host config, and helper identity", () => {
    const fixture = makeFixture();
    expect(gate(fixture, "run").status).toBe(0);
    const receipt = JSON.parse(readFileSync(fixture.receipt, "utf-8"));

    receipt.diff_fingerprint = `sha256:${"0".repeat(64)}`;
    writeFileSync(fixture.receipt, `${JSON.stringify(receipt)}\n`);
    expect(gate(fixture, "verify").stderr).toContain("diff_fingerprint is stale");

    expect(gate(fixture, "run").status).toBe(0);
    const config = JSON.parse(readFileSync(fixture.config, "utf-8"));
    config.note = "changed";
    writeFileSync(fixture.config, `${JSON.stringify(config)}\n`);
    expect(gate(fixture, "verify").stderr).toContain("host runtime fingerprint is stale");

    writeFileSync(fixture.config, `${JSON.stringify({ ...config, note: undefined }, null, 2)}\n`);
    expect(gate(fixture, "run").status).toBe(0);
    writeFileSync(join(fixture.home, ".claude", "skills", "merge-gate", "SKILL.md"), "changed skill\n");
    expect(gate(fixture, "verify").stderr).toContain("host runtime fingerprint is stale");

    expect(gate(fixture, "run").status).toBe(0);
    writeFileSync(join(fixture.cwd, "after.txt"), "after\n");
    commitAll(fixture.cwd, "move head");
    expect(gate(fixture, "verify").stderr).toContain("head_sha is stale");
  });

  test("rejects a stale base SHA", () => {
    const fixture = makeFixture();
    expect(gate(fixture, "run").status).toBe(0);
    git(fixture.cwd, "branch", "-f", "main", "HEAD");
    const result = gate(fixture, "verify");
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("base_sha is stale");
  });

  test("rejects a goal outside plans and missing deterministic evidence", () => {
    const fixture = makeFixture();
    const outside = run("bun", [fixture.harness, "run", "--base", "main", "--goal", "/etc/hosts"], fixture.cwd, {
      HOME: fixture.home,
    });
    expect(outside.status).toBe(2);
    expect(outside.stderr).toContain("goal artifact escapes repository");

    rmSync(join(fixture.cwd, ".ai", "harness", "checks", "latest.json"));
    const missing = gate(fixture, "run");
    expect(missing.status).toBe(2);
    expect(missing.stderr).toContain("verification evidence is missing");
  });

  test("rejects a host receipt directory symlink", () => {
    const fixture = makeFixture();
    const outside = mkdtempSync(join(tmpdir(), "repo-harness-merge-gate-outside-"));
    tempDirs.push(outside);
    symlinkSync(outside, join(fixture.home, ".repo-harness", "gates"));
    const result = gate(fixture, "run");
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("receipt directory must not be a symbolic link");
  });

  test("rejects a base ref that is not an ancestor of HEAD", () => {
    const fixture = makeFixture();
    const tree = git(fixture.cwd, "rev-parse", "main^{tree}");
    const divergent = run("git", ["commit-tree", tree, "-m", "divergent base"], fixture.cwd);
    expect(divergent.status, divergent.stderr).toBe(0);
    git(fixture.cwd, "branch", "-f", "main", divergent.stdout.trim());
    const result = gate(fixture, "run");
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("is not an ancestor of HEAD");
  });
});
