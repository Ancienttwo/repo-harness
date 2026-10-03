import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

function run(command: string, args: string[], cwd = ROOT, env: NodeJS.ProcessEnv = process.env) {
  return spawnSync(command, args, { cwd, encoding: "utf-8", env });
}

function oldContract(): string {
  return `# Task Contract: migrate\n\n## Exit Criteria (Machine Verifiable)\n\n\`\`\`yaml\nexit_criteria:\n  files_exist:\n    - docs/spec.md\n  tests_pass:\n    - path: "tests/example.test.ts"\n  commands_succeed: # executable checks\n    - "bun run check:type"\ncriterion_reuse:\n  tests_pass:\n    - tests/example.test.ts\n  commands_succeed:\n    - bun run check:type\n\`\`\`\n`;
}

describe("verification-plan authoring cutover", () => {
  test("downstream contract template retains one optional executable block", () => {
    const asset = readFileSync(join(ROOT, "assets/templates/contract.template.md"), "utf-8");

    expect(asset).toContain("## Verification Plan");
    expect(asset).toContain('"protocol": 1');
    expect(asset).not.toContain("tests_pass:");
    expect(asset).not.toContain("commands_succeed:");
    expect(asset).not.toContain("criterion_reuse:");
    // Self-host optional templates are independently maintained after #483.

    const planToTodo = readFileSync(join(ROOT, "scripts/plan-to-todo.sh"), "utf-8");
    const ensure = readFileSync(join(ROOT, "scripts/ensure-task-workflow.sh"), "utf-8");
    const projectInit = readFileSync(join(ROOT, "scripts/lib/project-init-lib.sh"), "utf-8");
    expect(planToTodo).not.toContain("CONTRACT_TEMPLATE_EOF");
    expect(ensure).not.toContain("CONTRACT_TEMPLATE_EOF");
    expect(projectInit).not.toContain("PI_TEMPLATE_CONTRACT");
  });

  test("operator migration needs an explicit typed mapping and never writes without --write", () => {
    const dir = mkdtempSync(join(tmpdir(), "rh-verification-migration-"));
    try {
      const contract = join(dir, "legacy.contract.md");
      const mapping = join(dir, "mapping.json");
      writeFileSync(contract, oldContract());
      writeFileSync(mapping, JSON.stringify({
        protocol: 1,
        checks: [
          {
            legacy: { kind: "package_test", path: "tests/example.test.ts" },
            check: {
              id: "example-test",
              kind: "package_test",
              path: "tests/example.test.ts",
              cwd: ".",
              phase: "verification",
              cost: "normal",
              evidence_policy: "current_exact",
              necessity: "Covers the changed behavior.",
              inputs: { env: [] },
            },
          },
          {
            legacy: { kind: "command", command: "bun run check:type" },
            check: {
              id: "typecheck",
              kind: "command",
              command: "bun run check:type",
              cwd: ".",
              phase: "preflight",
              cost: "normal",
              evidence_policy: "current_exact",
              necessity: "Ensures source types remain valid.",
              inputs: { env: [] },
            },
          },
        ],
      }, null, 2));

      const missing = run("bun", ["scripts/migrate-verification-plan.ts", "--contract", contract]);
      expect(missing.status).toBe(1);
      expect(missing.stderr).toContain("--mapping");

      const dryRun = run("bun", ["scripts/migrate-verification-plan.ts", "--contract", contract, "--mapping", mapping]);
      expect(dryRun.status).toBe(0);
      expect(dryRun.stdout).toContain("## Verification Plan");
      expect(dryRun.stdout).not.toContain("criterion_reuse:");
      expect(readFileSync(contract, "utf-8")).toBe(oldContract());

      const apply = run("bun", ["scripts/migrate-verification-plan.ts", "--contract", contract, "--mapping", mapping, "--write"]);
      expect(apply.status).toBe(0);
      const migrated = readFileSync(contract, "utf-8");
      expect(migrated).toContain("## Verification Plan");
      expect(migrated).not.toContain("tests_pass:");
      expect(migrated).not.toContain("commands_succeed:");
      expect(migrated).not.toContain("criterion_reuse:");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("migration rejects incomplete mappings and mixed executable schema", () => {
    const dir = mkdtempSync(join(tmpdir(), "rh-verification-migration-"));
    try {
      const contract = join(dir, "legacy.contract.md");
      const mapping = join(dir, "mapping.json");
      writeFileSync(contract, oldContract());
      writeFileSync(mapping, JSON.stringify({ protocol: 1, checks: [] }));
      const incomplete = run("bun", ["scripts/migrate-verification-plan.ts", "--contract", contract, "--mapping", mapping]);
      expect(incomplete.status).toBe(1);
      expect(incomplete.stderr).toContain("missing explicit mapping");

      writeFileSync(contract, `${oldContract()}\n## Verification Plan\n\n\`\`\`json\n{"protocol":1,"checks":[]}\n\`\`\`\n`);
      const mixed = run("bun", ["scripts/migrate-verification-plan.ts", "--contract", contract, "--mapping", mapping]);
      expect(mixed.status).toBe(1);
      expect(mixed.stderr).toContain("mixed executable schema");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
