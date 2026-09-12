import { spawnSync } from "child_process";
import { existsSync, rmSync } from "fs";
import { HELPER_DIR, INTENTIONALLY_DIVERGENT, TEMPLATE_DIR, ROOT as scriptROOT } from "../helpers/helper-script-fixture";
import { run, tmpWorkspace } from "../helpers/repo-fixture";

/**
 * Helper projection drift guard.
 *
 * `assets/templates/helpers/` is the shipped projection of the repo's own
 * `scripts/` helpers: a downstream repo receives the assets copy, while this
 * repo runs the scripts copy. Editing one and not the other leaves downstream
 * installs on stale behavior with nothing failing locally -- which is exactly
 * how the verification budget constant reached `1200000` in `scripts/` while
 * `assets/templates/helpers/` still read `600000`.
 *
 * This enumerates every filename present in both directories and asserts
 * byte-equality, so the guard automatically covers helper pairs added later
 * rather than a hand-maintained list.
 */
import { describe, expect, test } from 'bun:test';
import { createHash } from 'crypto';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..', '..');
const SCRIPTS_DIR = join(ROOT, 'scripts');
const HELPERS_DIR = join(ROOT, 'assets', 'templates', 'helpers');

/**
 * Pairs that are deliberately NOT byte copies. Each entry needs a reason: an
 * unexplained exclusion is indistinguishable from the drift this test exists
 * to catch.
 */
const NOT_BYTE_COPIES: ReadonlyMap<string, string> = new Map([
  ['recovery-view-cli.ts', 'generated standalone projection of the canonical checkpoint snapshot reader'],
  [
    'capability-resolver.ts',
    // The assets copy is a generated standalone Bun projection of
    // src/core/capabilities/registry.ts (it carries its own
    // `@generated-from ... sha256:` provenance header and inlines the registry
    // that the scripts copy imports), so the two files are intentionally
    // different sizes and shapes rather than a copy that drifted.
    'generated standalone projection of src/core/capabilities/registry.ts, not a byte copy',
  ],
]);

function regularFileNames(dir: string): string[] {
  return readdirSync(dir).filter((name) => statSync(join(dir, name)).isFile());
}

function pairedFileNames(): string[] {
  const scripts = new Set(regularFileNames(SCRIPTS_DIR));
  return regularFileNames(HELPERS_DIR)
    .filter((name) => scripts.has(name))
    .sort();
}

describe('helper projection drift', () => {
  test('scripts/ and assets/templates/helpers/ share helper files', () => {
    // Guards the enumeration itself: a rename that emptied the intersection
    // would otherwise turn every assertion below into a silent no-op.
    expect(pairedFileNames().length).toBeGreaterThan(10);
  });

  test('every paired helper is byte-identical in both directories', () => {
    const drifted: string[] = [];
    for (const name of pairedFileNames()) {
      if (NOT_BYTE_COPIES.has(name)) continue;
      const script = readFileSync(join(SCRIPTS_DIR, name));
      const helper = readFileSync(join(HELPERS_DIR, name));
      if (!script.equals(helper)) drifted.push(name);
    }
    expect(
      drifted,
      `helper projection drift: ${drifted.join(', ')} differ between scripts/ and assets/templates/helpers/. ` +
        'Sync both copies, or add the file to NOT_BYTE_COPIES with the reason it is not a byte copy.',
    ).toEqual([]);
  });

  test('every documented exclusion is still a real, still-divergent pair', () => {
    // Keeps the exclusion list honest: once a pair converges (or disappears),
    // the exclusion must go, otherwise it silently un-guards a real copy.
    const paired = new Set(pairedFileNames());
    for (const [name, reason] of NOT_BYTE_COPIES) {
      expect(paired.has(name), `excluded pair ${name} no longer exists in both directories`).toBe(true);
      expect(reason.length).toBeGreaterThan(0);
      const script = readFileSync(join(SCRIPTS_DIR, name));
      const helper = readFileSync(join(HELPERS_DIR, name));
      expect(script.equals(helper), `${name} is now byte-identical; drop it from NOT_BYTE_COPIES`).toBe(false);
    }
  });

  test('the recovery helper includes the exact canonical snapshot reader with its source digest', () => {
    const reader = readFileSync(join(ROOT, 'src/effects/evidence/checkpoint-snapshot.ts'), 'utf8');
    const helper = readFileSync(join(HELPERS_DIR, 'recovery-view-cli.ts'), 'utf8');
    expect(helper).toContain(`@generated-from src/effects/evidence/checkpoint-snapshot.ts sha256:${createHash('sha256').update(reader).digest('hex')}`);
    expect(helper).toContain(reader.trimEnd());
    expect(helper).not.toContain('from "../src/');
  });

  test('the verification budget constant matches across both helper copies', () => {
    const constant = 'VERIFICATION_BUDGET_MS=3600000';
    expect(readFileSync(join(SCRIPTS_DIR, 'verify-contract.sh'), 'utf-8')).toContain(constant);
    expect(readFileSync(join(HELPERS_DIR, 'verify-contract.sh'), 'utf-8')).toContain(constant);
  });
});

describe("helper-projection helper integration", () => {
  test("workflow contract drives a deterministic helper projection without a migration delegate", () => {
    const check = run("bun", ["scripts/sync-helper-sources.ts", "--check"], scriptROOT);
    expect(
      check.status,
      `sync-helper-sources --check exited ${check.status} (signal=${check.signal ?? "none"})\nstdout:\n${check.stdout}\nstderr:\n${check.stderr}`
    ).toBe(0);
    expect(check.stdout).toContain("projection OK");
    expect(check.stdout).not.toContain("package delegate preserved");
    expect(check.stderr).toBe("");

    const contract = JSON.parse(readFileSync(join(scriptROOT, "assets/workflow-contract.v1.json"), "utf-8")) as {
      helpers: { scripts: string[] };
    };
    const packaged = readdirSync(HELPER_DIR)
      .filter((name) => name.endsWith(".sh") || name.endsWith(".ts"))
      .sort();
    expect(packaged).toEqual([...contract.helpers.scripts].sort());

    const helpers = packaged.filter((name) => !INTENTIONALLY_DIVERGENT.includes(name));
    expect(helpers.length).toBeGreaterThan(0);
    for (const helper of helpers) {
      const scriptsPath = join(scriptROOT, "scripts", helper);
      expect(existsSync(scriptsPath)).toBe(true);
      expect(readFileSync(scriptsPath, "utf-8")).toBe(readFileSync(join(HELPER_DIR, helper), "utf-8"));
      expect(statSync(scriptsPath).mode & 0o111).toBe(statSync(join(HELPER_DIR, helper)).mode & 0o111);
    }
  }, 30_000);

  test("contract projection has a single canonical executable template authority", () => {
    const standalone = readFileSync(join(TEMPLATE_DIR, "contract.template.md"), "utf-8");
    const planToTodoSrc = readFileSync(join(scriptROOT, "scripts/plan-to-todo.sh"), "utf-8");
    const ensureTaskWorkflowSrc = readFileSync(join(scriptROOT, "scripts/ensure-task-workflow.sh"), "utf-8");
    const projectInitLibSrc = readFileSync(join(scriptROOT, "scripts/lib/project-init-lib.sh"), "utf-8");
    expect(readFileSync(join(scriptROOT, ".claude/templates/contract.template.md"), "utf-8")).toBe(standalone);
    for (const [label, source] of Object.entries({ planToTodoSrc, ensureTaskWorkflowSrc, projectInitLibSrc })) {
      expect(source, `${label} must not restore an executable contract fallback`).not.toContain("CONTRACT_TEMPLATE_EOF");
      expect(source, `${label} must fail closed without its canonical template`).toContain("canonical contract template is required");
    }
  });

  test("direct helper tests ignore ambient repo-root env", () => {
    const poisonRepo = tmpWorkspace("helper-ambient-root-poison");
    try {
      const res = spawnSync("bun", [
        "test",
        "tests/new-plan.test.ts",
        "--test-name-pattern",
        "new-plan should create timestamped plan without compatibility pointer",
      ], {
        cwd: scriptROOT,
        encoding: "utf-8",
        env: {
          ...process.env,
          REPO_HARNESS_TARGET_REPO_ROOT: poisonRepo,
        },
      });

      expect(res.status, `${res.stdout}\n${res.stderr}`).toBe(0);
      expect(`${res.stdout}\n${res.stderr}`).toContain("1 pass");
      expect(existsSync(join(poisonRepo, "plans"))).toBe(false);
    } finally {
      rmSync(poisonRepo, { recursive: true, force: true });
    }
  }, 30_000);
});
