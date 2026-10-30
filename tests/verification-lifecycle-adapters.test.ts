import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { seedReviewAdmissionFixture } from "./helpers/review-admission-fixture";
import { parseVerificationPlanFromContractText } from "../src/core/evidence/verification-plan";

const approved = new Map<string, ReturnType<typeof seedReviewAdmissionFixture>>();
const ROOT = resolve(import.meta.dir, "..");
const tempDirs: string[] = [];

afterEach(() => {
  approved.clear();
  for (const path of tempDirs.splice(0)) rmSync(path, { recursive: true, force: true });
});

function git(root: string, ...args: string[]): string {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf-8" });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

function commit(root: string, message: string): void {
  git(root, "add", ".");
  git(root, "commit", "-m", message);
}

function plan(checks: unknown[]): string {
  return JSON.stringify({ protocol: 1, checks }, null, 2);
}

function check(id: string, command: string, phase: "preflight" | "verification", cost: "normal" | "expensive", env: string[] = []): Record<string, unknown> {
  return {
    id,
    kind: "command",
    command,
    cwd: ".",
    phase,
    cost,
    evidence_policy: "current_exact",
    necessity: `${id} is required by this fixture.`,
    inputs: { env },
  };
}

function contract(checks: unknown[], prose = "fixture"): string {
  return [
    "# Task Contract: adapter-fixture",
    "",
    "> **Status**: Active",
    "> **Task Profile**: code-change",
    "",
    "## Why",
    "",
    prose,
    "",
    "## Evidence Requirements",
    "",
    "```yaml",
    "evidence_requirements:",
    "  benchmark: not_applicable",
    "```",
    "",
    "## Exit Criteria (Machine Verifiable)",
    "",
    "```yaml",
    "exit_criteria:",
    "  files_exist:",
    "    - source.txt",
    "```",
    "",
    "## Verification Plan",
    "",
    "```json",
    plan(checks),
    "```",
    "",
  ].join("\n");
}

function fixture(name: string, checks: unknown[]): { root: string; counter: string; contract: string } {
  const root = mkdtempSync(join(tmpdir(), `${name}-`));
  tempDirs.push(root);
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "Verification Adapter Test");
  git(root, "config", "user.email", "verification-adapter@example.com");
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, ".ai", "hooks", "lib"), { recursive: true });
  mkdirSync(join(root, "tasks", "contracts"), { recursive: true });
  symlinkSync(join(ROOT, "src"), join(root, "src"), "dir");
  cpSync(join(ROOT, "scripts", "verification-plan.ts"), join(root, "scripts", "verification-plan.ts"));
  const counter = join(root, "counter.log");
  const contractPath = "tasks/contracts/adapter.contract.md";
  writeFileSync(join(root, ".gitignore"), ".ai/harness/evidence/\n.ai/harness/runs/\n.ai/harness/checks/\ncounter.log\n");
  writeFileSync(join(root, "source.txt"), "source\n");
  writeFileSync(join(root, contractPath), contract(checks));
  commit(root, "fixture");
  if (checks.length) {
    const home = mkdtempSync(join(tmpdir(), "verification-adapter-authority-"));
    tempDirs.push(home);
    approved.set(root, seedReviewAdmissionFixture(root, home, {
      plan: parseVerificationPlanFromContractText(readFileSync(join(root, contractPath), "utf8")),
    }));
  }
  return { root, counter, contract: contractPath };
}

function verify(root: string, script: string, report: string, counter: string) {
  const approval = approved.get(root)!;
  const args = ['execute', '--repo', root,
    '--repository-id', approval.source.repository_id, '--issue-id', approval.source.issue_id,
    '--campaign-id', approval.source.campaign_id, '--grant-sha256', approval.source.expectedGrantSha256,
    '--policy-sha256', approval.source.expectedPolicySha256, '--actor', approval.source.expectedActor,
    '--report-file', report];
  return spawnSync(process.execPath, ["-e", `
    const { main } = await import(${JSON.stringify(join(root, script))});
    const source = ${JSON.stringify(approval.source)};
    source.runner = args => ({ stdout: JSON.stringify(args.includes('repos/acme/widgets/issues/903')
      ? ${JSON.stringify(approval.issue)} : { id: 'R_provider', full_name: 'acme/widgets', html_url: 'https://github.com/acme/widgets' }) });
    process.exit(await main(${JSON.stringify(args)}, () => source));
  `], {
    cwd: root,
    encoding: "utf-8",
    env: { ...process.env, COUNTER_PATH: counter },
  });
}

function counterLines(path: string): number {
  return existsSync(path) ? readFileSync(path, "utf-8").trim().split("\n").filter(Boolean).length : 0;
}

describe("verification lifecycle explicit adapters", () => {
  test("repeated direct verifiers share one execution fact and report immutable execution run refs", () => {
    const expensive = check("full", "printf full\\n >> \"$COUNTER_PATH\"", "verification", "expensive", ["COUNTER_PATH"]);
    const { root, counter, contract: contractPath } = fixture("verification-adapter-reuse", [expensive]);

    const source = verify(root, "scripts/verification-plan.ts", ".ai/harness/checks/source.json", counter);
    expect(source.status, `${source.stdout}\n${source.stderr}`).toBe(0);
    const projected = verify(root, "scripts/verification-plan.ts", ".ai/harness/checks/projected.json", counter);
    expect(projected.status, `${projected.stdout}\n${projected.stderr}`).toBe(0);
    expect(counterLines(counter)).toBe(1);

    const report = JSON.parse(readFileSync(join(root, ".ai/harness/checks/projected.json"), "utf-8"));
    expect(report.passed).toBe(true);
    const full = report.results.find((entry: { id: string }) => entry.id === "full");
    expect(full.execution).toBe("reused");
    expect(full.execution_id).toBeString();
    expect(full.run_file).toMatch(/^\.ai\/harness\/runs\/verification-.+\.json$/);
    const event = JSON.parse(readFileSync(join(root, full.run_file), "utf-8"));
    expect(event.execution_id).toBe(full.execution_id);
    expect(event.result.id).toBe("full");
  }, 30_000);

  test("prose movement and main movement never auto-start another expensive execution", () => {
    const expensive = check("full", "printf full\\n >> \"$COUNTER_PATH\"", "verification", "expensive", ["COUNTER_PATH"]);
    const { root, counter, contract: contractPath } = fixture("verification-adapter-drift", [expensive]);
    const first = verify(root, "scripts/verification-plan.ts", ".ai/harness/checks/first.json", counter);
    expect(first.status, `${first.stdout}\n${first.stderr}`).toBe(0);

    const original = readFileSync(join(root, contractPath), "utf-8");
    writeFileSync(join(root, contractPath), original.replace("fixture", "changed prose"));
    const prose = verify(root, "scripts/verification-plan.ts", ".ai/harness/checks/prose.json", counter);
    expect(prose.status).toBe(1);
    expect(JSON.parse(readFileSync(join(root, ".ai/harness/checks/prose.json"), "utf-8")).status).toBe("needs_verification_plan");
    expect(counterLines(counter)).toBe(1);

    writeFileSync(join(root, contractPath), original);
    git(root, "checkout", "-b", "codex/demo");
    git(root, "checkout", "main");
    writeFileSync(join(root, "main-only.txt"), "advance main\n");
    commit(root, "advance main");
    git(root, "checkout", "codex/demo");
    const main = verify(root, "scripts/verification-plan.ts", ".ai/harness/checks/main.json", counter);
    expect(main.status, main.stderr).toBe(0);
    expect(counterLines(counter)).toBe(1);
  }, 30_000);

  test("a failed preflight leaves later expensive checks unstarted", () => {
    const { root, counter, contract: contractPath } = fixture("verification-adapter-preflight", [
      check("preflight", "exit 9", "preflight", "normal"),
      check("full", "printf full\\n >> \"$COUNTER_PATH\"", "verification", "expensive", ["COUNTER_PATH"]),
    ]);
    const result = verify(root, "scripts/verification-plan.ts", ".ai/harness/checks/preflight.json", counter);
    expect(result.status).toBe(1);
    expect(counterLines(counter)).toBe(0);
    const report = JSON.parse(readFileSync(join(root, ".ai/harness/checks/preflight.json"), "utf-8"));
    expect(report.passed).toBe(false);
    expect(report.results.find((entry: { id: string }) => entry.id === "full").execution).toBe("missing");
  }, 30_000);
  for (const script of ["verify-sprint.sh"]) {
    for (const typeExit of [0, 7]) {
      test(`${script} runs typecheck once and ${typeExit ? "stops before selected tests on failure" : "runs selected tests once"}`, () => {
        const { root, counter } = fixture("verification-local-selection", []);
        mkdirSync(join(root, "tests"), { recursive: true });
        writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { "check:type": "bun typecheck.ts", test: "bun test" } }));
        writeFileSync(join(root, "typecheck.ts"), `import { appendFileSync } from "node:fs"; appendFileSync("counter.log", "type\\n"); process.exit(${typeExit});`);
        writeFileSync(join(root, "tests/selected.test.ts"), 'import { test } from "bun:test"; import { appendFileSync } from "node:fs"; test("selected", () => appendFileSync("counter.log", "test\\n"));');
        commit(root, "local checks");
        const result = spawnSync("bash", [join(ROOT, "scripts", script), "--test", "tests/selected.test.ts"], { cwd: root, encoding: "utf-8" });
        expect(result.status, result.stderr).toBe(typeExit);
        expect(readFileSync(counter, "utf-8")).toBe(typeExit ? "type\n" : "type\ntest\n");
        expect(existsSync(join(root, ".ai/harness/checks/latest.json"))).toBe(false);
      });
    }
  }
  test("local selection rejects escaping paths and retired acceptance flags before typecheck", () => {
    const { root, counter } = fixture("verification-local-boundaries", []);
    writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { "check:type": "bun typecheck.ts" } }));
    writeFileSync(join(root, "typecheck.ts"), 'import { appendFileSync } from "node:fs"; appendFileSync("counter.log", "type\\n");');
    const outside = mkdtempSync(join(tmpdir(), "verification-external-tests-"));
    tempDirs.push(outside);
    mkdirSync(join(root, "tests"), { recursive: true });
    writeFileSync(join(outside, "outside.test.ts"), 'throw new Error("must not execute");');
    symlinkSync(join(outside, "outside.test.ts"), join(root, "tests/linked.test.ts"));
    for (const args of [["--test", "tests/../outside.test.ts"], ["--test", "tests/linked.test.ts"], ["--prepare-acceptance"], ["--capture-task-acceptance"], ["--base", "main", "--test", "tests/linked.test.ts"]]) {
      const result = spawnSync("bash", [join(ROOT, "scripts/verify-sprint.sh"), ...args], { cwd: root, encoding: "utf-8" });
      expect(result.status, args.join(" ")).not.toBe(0);
      expect(existsSync(counter)).toBe(false);
    }
  });

});
