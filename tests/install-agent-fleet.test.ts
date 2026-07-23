import { describe, expect, test } from "bun:test";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "..");
const SCRIPT = join(ROOT, "scripts/install-agent-fleet.sh");
const FLEET_SOURCE_DIR = join(ROOT, "agents/fleet");
const GOLDEN_CODEX_DIR = join(ROOT, ".codex/agents");
const AGENTS = ["explorer", "deep-reasoner", "fast-worker", "gatekeeper", "root-cause-prover", "harness-evaluator"];
const CODEX_EXPECTATIONS: Record<
  string,
  { model: string; effort: string; descriptionLabel: string; sourceDescription: string; sandboxMode: string }
> = {
  explorer: {
    model: "gpt-5.6-luna",
    effort: "high",
    descriptionLabel: "GPT-5.6 Luna at high reasoning",
    sourceDescription: "Sonnet at high effort",
    sandboxMode: "read-only",
  },
  "deep-reasoner": {
    model: "gpt-5.6-sol",
    effort: "xhigh",
    descriptionLabel: "GPT-5.6 Sol at xhigh reasoning",
    sourceDescription: "Opus at xhigh effort",
    sandboxMode: "read-only",
  },
  "fast-worker": {
    model: "gpt-5.6-luna",
    effort: "max",
    descriptionLabel: "GPT-5.6 Luna at max reasoning",
    sourceDescription: "Sonnet at max effort",
    sandboxMode: "workspace-write",
  },
  gatekeeper: {
    model: "gpt-5.6-sol",
    effort: "xhigh",
    descriptionLabel: "GPT-5.6 Sol at xhigh reasoning",
    sourceDescription: "Fable at xhigh effort",
    sandboxMode: "read-only",
  },
  "root-cause-prover": {
    model: "gpt-5.6-sol",
    effort: "high",
    descriptionLabel: "GPT-5.6 Sol at high reasoning",
    sourceDescription: "Opus at high effort",
    sandboxMode: "workspace-write",
  },
  "harness-evaluator": {
    model: "gpt-5.6-sol",
    effort: "high",
    descriptionLabel: "GPT-5.6 Sol at high reasoning",
    sourceDescription: "Opus at high effort",
    sandboxMode: "workspace-write",
  },
};

// Canonical anti-extras clause (scripts/contract-run.ts EXECUTION_BOUNDARY, joined with
// "\n"). Hardcoded here the same way tests/workflow-contract.test.ts hardcodes the
// canonical first sentence: this is the literal text the installer must embed verbatim
// into every generated Codex agent's developer_instructions.
const CANONICAL_BOUNDARY_TEXT = [
  "Execution boundary: implement exactly the Goal, In scope items, Allowed Paths, and Exit Criteria in this brief. Treat absent requirements as forbidden design space, not as permission to improve.",
  "",
  "Do not add optional features, alternate UX, extra integrations, migration paths, compatibility behavior, fallback behavior, telemetry, broad cleanup, refactors, new abstractions, extra docs, or polish unless that work is explicitly listed under In scope or required by Exit Criteria.",
  "",
  "If you discover useful additional work, record it under Out of scope / Future work in the notes or review artifact. Do not implement it. Do not end with unsolicited offers to do more work.",
  "",
  "If the requested outcome cannot be completed without expanding scope, fail closed: stop, name the missing decision, and cite the exact file/section that blocks execution.",
].join("\n");

function setupFakeHome(prefix: string) {
  const root = mkdtempSync(join(tmpdir(), `${prefix}-`));
  const home = join(root, "home");
  mkdirSync(home, { recursive: true });
  return { root, home };
}

let runtimeSequence = 0;

function prepareInstallerRuntime(home: string, sourceDir: string) {
  const packageRoot = join(dirname(home), `package-runtime-${runtimeSequence++}`);
  const runtimeScript = join(packageRoot, "scripts/install-agent-fleet.sh");
  mkdirSync(join(packageRoot, "scripts"), { recursive: true });
  mkdirSync(join(packageRoot, "agents"), { recursive: true });
  cpSync(SCRIPT, runtimeScript);
  chmodSync(runtimeScript, 0o755);
  cpSync(sourceDir, join(packageRoot, "agents/fleet"), { recursive: true });
  return { packageRoot, runtimeScript };
}

function runInstaller(
  home: string,
  sourceDir: string,
  args: string[] = [],
  extraEnv: Record<string, string> = {},
) {
  const runtime = prepareInstallerRuntime(home, sourceDir);
  return spawnSync("bash", [runtime.runtimeScript, ...args], {
    cwd: ROOT,
    encoding: "utf-8",
    env: {
      ...process.env,
      HOME: home,
      ...extraEnv,
    },
  });
}

describe("install-agent-fleet", () => {
  test("fresh install writes claude .md byte-identical to source and codex .toml byte-identical to golden", () => {
    const { root, home } = setupFakeHome("install-agent-fleet-fresh");
    try {
      const res = runInstaller(home, FLEET_SOURCE_DIR);
      expect(res.status).toBe(0);

      for (const agent of AGENTS) {
        expect(res.stdout).toContain(`[fleet] claude/${agent}.md: installed`);
        expect(res.stdout).toContain(`[fleet] codex/${agent}.toml: installed`);

        const installedClaude = readFileSync(join(home, ".claude/agents", `${agent}.md`), "utf-8");
        const sourceClaude = readFileSync(join(FLEET_SOURCE_DIR, `${agent}.md`), "utf-8");
        expect(installedClaude).toBe(sourceClaude);

        const installedCodex = readFileSync(join(home, ".codex/agents", `${agent}.toml`), "utf-8");
        const golden = readFileSync(join(GOLDEN_CODEX_DIR, `${agent}.toml`), "utf-8");
        const expected = CODEX_EXPECTATIONS[agent];
        expect(installedCodex).toBe(golden);
        expect(installedCodex).toContain(`model = "${expected.model}"`);
        expect(installedCodex).toContain(`model_reasoning_effort = "${expected.effort}"`);
        expect(installedCodex).toContain(expected.descriptionLabel);
        expect(installedCodex).toContain(`sandbox_mode = "${expected.sandboxMode}"`);
        expect(installedCodex).not.toContain(expected.sourceDescription);
        expect(installedCodex).not.toMatch(/\b(?:fable|opus|sonnet|haiku)\b/i);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("idempotent re-run reports up-to-date for all 12 files", () => {
    const { root, home } = setupFakeHome("install-agent-fleet-idempotent");
    try {
      expect(runInstaller(home, FLEET_SOURCE_DIR).status).toBe(0);
      const second = runInstaller(home, FLEET_SOURCE_DIR);
      expect(second.status).toBe(0);
      for (const agent of AGENTS) {
        expect(second.stdout).toContain(`[fleet] claude/${agent}.md: up-to-date`);
        expect(second.stdout).toContain(`[fleet] codex/${agent}.toml: up-to-date`);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("local modification to an installed target is preserved and reported as drift", () => {
    const { root, home } = setupFakeHome("install-agent-fleet-drift");
    try {
      expect(runInstaller(home, FLEET_SOURCE_DIR).status).toBe(0);
      const target = join(home, ".codex/agents/gatekeeper.toml");
      const locallyEdited = [
        'developer_instructions = """escaped delimiter: \\"""',
        'name = "fast-worker"',
        'still part of developer instructions"""',
        'name = "fast-worker # local"',
        'description = "identity-correct local drift"',
        'model = "gpt-5.6-sol"',
        'model_reasoning_effort = "xhigh"',
        'sandbox_mode = "read-only"',
        "",
      ].join("\n");
      writeFileSync(target, locallyEdited);

      const second = runInstaller(home, FLEET_SOURCE_DIR);
      expect(second.status).not.toBe(0);
      expect(second.stdout).toContain("[fleet] codex/gatekeeper.toml: drift");
      expect(readFileSync(target, "utf-8")).toBe(locallyEdited);

      const claudeTarget = join(home, ".claude/agents/gatekeeper.md");
      const quotedIdentityEdit = `${readFileSync(claudeTarget, "utf-8")
        .replace("name: gatekeeper", 'name: "gatekeeper" # local style')
        .replace("\n---\n", "\nmetadata:\n  name: fast-worker\n---\n")}\n# preserve-me\n`;
      writeFileSync(claudeTarget, quotedIdentityEdit);
      const third = runInstaller(home, FLEET_SOURCE_DIR);
      expect(third.status).not.toBe(0);
      expect(third.stdout).toContain("[fleet] claude/gatekeeper.md: drift");
      expect(readFileSync(claudeTarget, "utf-8")).toBe(quotedIdentityEdit);

      const ambiguousYamlIdentityEdit = quotedIdentityEdit.replace('name: "gatekeeper" # local style', "name: null");
      writeFileSync(claudeTarget, ambiguousYamlIdentityEdit);
      const fourth = runInstaller(home, FLEET_SOURCE_DIR);
      expect(fourth.status).not.toBe(0);
      expect(fourth.stdout).toContain("[fleet] claude/gatekeeper.md: drift");
      expect(readFileSync(claudeTarget, "utf-8")).toBe(ambiguousYamlIdentityEdit);

      const duplicateYamlIdentityEdit = quotedIdentityEdit.replace(
        'name: "gatekeeper" # local style',
        "name: gatekeeper\nname: fast-worker",
      );
      writeFileSync(claudeTarget, duplicateYamlIdentityEdit);
      const fifth = runInstaller(home, FLEET_SOURCE_DIR);
      expect(fifth.status).not.toBe(0);
      expect(fifth.stdout).toContain("[fleet] claude/gatekeeper.md: drift");
      expect(readFileSync(claudeTarget, "utf-8")).toBe(duplicateYamlIdentityEdit);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("an explicitly accepted user-managed fleet remains idempotent until an accepted file changes", () => {
    const { root, home } = setupFakeHome("install-agent-fleet-user-managed");
    try {
      expect(runInstaller(home, FLEET_SOURCE_DIR).status).toBe(0);
      const claudeTarget = join(home, ".claude/agents/deep-reasoner.md");
      const codexTarget = join(home, ".codex/agents/explorer.toml");
      const customClaude = readFileSync(claudeTarget, "utf-8")
        .replaceAll("Opus at xhigh effort", "Opus at max effort")
        .replace("effort: xhigh", "effort: max");
      const customCodex = readFileSync(codexTarget, "utf-8")
        .replace('model = "gpt-5.6-luna"', 'model = "gpt-5.6-terra"');
      writeFileSync(claudeTarget, customClaude);
      writeFileSync(codexTarget, customCodex);

      const accepted = runInstaller(home, FLEET_SOURCE_DIR, ["--accept-user-managed"]);
      expect(accepted.status).toBe(0);
      expect(accepted.stdout).toContain("[fleet] user-managed receipt: accepted 2 files");
      expect(readFileSync(claudeTarget, "utf-8")).toBe(customClaude);
      expect(readFileSync(codexTarget, "utf-8")).toBe(customCodex);

      const receiptPath = join(home, ".repo-harness/agent-fleet-user-managed.json");
      const receipt = JSON.parse(readFileSync(receiptPath, "utf-8")) as {
        protocol: number;
        authority: string;
        files: Array<{ path: string; sha256: string }>;
      };
      expect(receipt.protocol).toBe(1);
      expect(receipt.authority).toBe("user-managed-agent-fleet");
      expect(receipt.files.map((entry) => entry.path).sort()).toEqual([claudeTarget, codexTarget].sort());
      expect(receipt.files.every((entry) => /^sha256:[a-f0-9]{64}$/.test(entry.sha256))).toBe(true);

      const repeated = runInstaller(home, FLEET_SOURCE_DIR);
      expect(repeated.status).toBe(0);
      expect(repeated.stdout).toContain("[fleet] claude/deep-reasoner.md: user-managed");
      expect(repeated.stdout).toContain("[fleet] codex/explorer.toml: user-managed");
      expect(readFileSync(claudeTarget, "utf-8")).toBe(customClaude);
      expect(readFileSync(codexTarget, "utf-8")).toBe(customCodex);

      const changedAfterAcceptance = `${customCodex}# changed after acceptance\n`;
      writeFileSync(codexTarget, changedAfterAcceptance);
      const staleReceipt = runInstaller(home, FLEET_SOURCE_DIR);
      expect(staleReceipt.status).not.toBe(0);
      expect(staleReceipt.stdout).toContain("[fleet] codex/explorer.toml: drift");
      expect(readFileSync(codexTarget, "utf-8")).toBe(changedAfterAcceptance);

      const forced = runInstaller(home, FLEET_SOURCE_DIR, ["--force"]);
      expect(forced.status).toBe(0);
      expect(existsSync(receiptPath)).toBe(false);
      expect(readFileSync(codexTarget, "utf-8")).toBe(
        readFileSync(join(GOLDEN_CODEX_DIR, "explorer.toml"), "utf-8"),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("--accept-user-managed rejects malformed or role-mismatched files without writing a receipt", () => {
    const { root, home } = setupFakeHome("install-agent-fleet-user-managed-invalid");
    try {
      expect(runInstaller(home, FLEET_SOURCE_DIR).status).toBe(0);
      const target = join(home, ".claude/agents/gatekeeper.md");
      writeFileSync(
        target,
        readFileSync(target, "utf-8").replace("name: gatekeeper", "name: fast-worker"),
      );

      const accepted = runInstaller(home, FLEET_SOURCE_DIR, ["--accept-user-managed"]);
      expect(accepted.status).not.toBe(0);
      expect(accepted.stdout).toContain("[fleet] claude/gatekeeper.md: user-managed-invalid");
      expect(existsSync(join(home, ".repo-harness/agent-fleet-user-managed.json"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("--force overwrites a drifted target back to generated content", () => {
    const { root, home } = setupFakeHome("install-agent-fleet-force");
    try {
      expect(runInstaller(home, FLEET_SOURCE_DIR).status).toBe(0);
      const target = join(home, ".codex/agents/gatekeeper.toml");
      writeFileSync(target, "corrupted\n");

      const forced = runInstaller(home, FLEET_SOURCE_DIR, ["--force"]);
      expect(forced.status).toBe(0);
      expect(forced.stdout).toContain("[fleet] codex/gatekeeper.toml: installed");
      expect(readFileSync(target, "utf-8")).toBe(readFileSync(join(GOLDEN_CODEX_DIR, "gatekeeper.toml"), "utf-8"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("invalid frontmatter fails the whole source preflight before any target mutation", () => {
    const { root, home } = setupFakeHome("install-agent-fleet-invalid");
    const badSourceDir = join(root, "bad-source");
    try {
      mkdirSync(badSourceDir, { recursive: true });
      for (const agent of AGENTS) {
        cpSync(join(FLEET_SOURCE_DIR, `${agent}.md`), join(badSourceDir, `${agent}.md`));
      }
      const corrupted = readFileSync(join(badSourceDir, "fast-worker.md"), "utf-8").replace("effort: max", "effort: min");
      writeFileSync(join(badSourceDir, "fast-worker.md"), corrupted);

      const res = runInstaller(home, badSourceDir);
      expect(res.status).not.toBe(0);
      expect(res.stdout).toContain("[fleet] claude/fast-worker.md: source-invalid");
      expect(res.stdout).toContain("[fleet] codex/fast-worker.toml: source-invalid");
      expect(existsSync(join(home, ".claude/agents/fast-worker.md"))).toBe(false);
      expect(existsSync(join(home, ".codex/agents/fast-worker.toml"))).toBe(false);
      expect(existsSync(join(home, ".claude/agents/deep-reasoner.md"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a missing or unparseable source role identity fails the installer", () => {
    const { root, home } = setupFakeHome("install-agent-fleet-missing-role-identity");
    const badSourceDir = join(root, "bad-source");
    try {
      mkdirSync(badSourceDir, { recursive: true });
      for (const agent of AGENTS) {
        cpSync(join(FLEET_SOURCE_DIR, `${agent}.md`), join(badSourceDir, `${agent}.md`));
      }
      writeFileSync(
        join(badSourceDir, "fast-worker.md"),
        [
          "---",
          "- metadata:",
          "    name: fast-worker",
          "    description: nested identity is not root role metadata",
          "    model: sonnet",
          "    effort: max",
          "---",
          "nested role fixture",
          "",
        ].join("\n"),
      );

      const res = runInstaller(home, badSourceDir);
      expect(res.status).not.toBe(0);
      expect(res.stdout).toContain("[fleet] claude/fast-worker.md: source-invalid");
      expect(res.stdout).toContain("[fleet] codex/fast-worker.toml: source-invalid");
      expect(existsSync(join(home, ".codex/agents/fast-worker.toml"))).toBe(false);
      expect(existsSync(join(home, ".codex/agents/deep-reasoner.toml"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a frontmatter name that does not match its source role fails closed", () => {
    const { root, home } = setupFakeHome("install-agent-fleet-role-name-mismatch");
    const badSourceDir = join(root, "bad-source");
    try {
      mkdirSync(badSourceDir, { recursive: true });
      for (const agent of AGENTS) {
        cpSync(join(FLEET_SOURCE_DIR, `${agent}.md`), join(badSourceDir, `${agent}.md`));
      }
      const corrupted = readFileSync(join(badSourceDir, "gatekeeper.md"), "utf-8")
        .replace("name: gatekeeper", "name: fast-worker")
        .replace("description:", "removed_description:");
      writeFileSync(join(badSourceDir, "gatekeeper.md"), corrupted);
      const installedClaudeDir = join(home, ".claude/agents");
      const installedCodexDir = join(home, ".codex/agents");
      mkdirSync(installedClaudeDir, { recursive: true });
      mkdirSync(installedCodexDir, { recursive: true });
      writeFileSync(join(installedClaudeDir, "gatekeeper.md"), corrupted);
      writeFileSync(
        join(installedCodexDir, "gatekeeper.toml"),
        '"name" = "fast-worker"\nsandbox_mode = "workspace-write"\n',
      );

      const res = runInstaller(home, badSourceDir);
      expect(res.status).not.toBe(0);
      expect(res.stdout).toContain("[fleet] claude/gatekeeper.md: source-invalid");
      expect(res.stdout).toContain("[fleet] codex/gatekeeper.toml: source-invalid");
      expect(readFileSync(join(home, ".claude/agents/gatekeeper.md"), "utf-8")).toBe(corrupted);
      expect(readFileSync(join(home, ".codex/agents/gatekeeper.toml"), "utf-8")).toContain('"name" = "fast-worker"');
      expect(existsSync(join(home, ".codex/agents/fast-worker.toml"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a corrected source refuses stale installed targets with mismatched role identities", () => {
    const { root, home } = setupFakeHome("install-agent-fleet-stale-role-identity");
    try {
      const installedClaudeDir = join(home, ".claude/agents");
      const installedCodexDir = join(home, ".codex/agents");
      mkdirSync(installedClaudeDir, { recursive: true });
      mkdirSync(installedCodexDir, { recursive: true });
      const mismatchedClaude = readFileSync(join(FLEET_SOURCE_DIR, "gatekeeper.md"), "utf-8")
        .replace(/^---\n([\s\S]*?)\n---/, (_match, frontmatter) => {
          const indented = String(frontmatter)
            .split("\n")
            .map((line) => `  ${line}`)
            .join("\n");
          return `---\n${indented}\n---`;
        })
        .replace("  name: gatekeeper", "  name: fast-worker");
      writeFileSync(join(installedClaudeDir, "gatekeeper.md"), mismatchedClaude);
      writeFileSync(
        join(installedCodexDir, "gatekeeper.toml"),
        "  'name' = \"fast-worker\"\nsandbox_mode = \"workspace-write\"\n",
      );

      const res = runInstaller(home, FLEET_SOURCE_DIR);
      expect(res.status).not.toBe(0);
      expect(res.stdout).toContain("[fleet] claude/gatekeeper.md: drift");
      expect(res.stdout).toContain("[fleet] codex/gatekeeper.toml: drift");
      expect(readFileSync(join(installedClaudeDir, "gatekeeper.md"), "utf-8")).toBe(mismatchedClaude);
      expect(readFileSync(join(installedCodexDir, "gatekeeper.toml"), "utf-8")).toContain('"fast-worker"');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("an invalid source leaves a stale installed target untouched", () => {
    const { root, home } = setupFakeHome("install-agent-fleet-stale-role-invalid-source");
    const badSourceDir = join(root, "bad-source");
    try {
      mkdirSync(badSourceDir, { recursive: true });
      for (const agent of AGENTS) {
        cpSync(join(FLEET_SOURCE_DIR, `${agent}.md`), join(badSourceDir, `${agent}.md`));
      }
      writeFileSync(
        join(badSourceDir, "gatekeeper.md"),
        readFileSync(join(badSourceDir, "gatekeeper.md"), "utf-8").replace("effort: xhigh", "effort: min"),
      );
      const installedCodexDir = join(home, ".codex/agents");
      mkdirSync(installedCodexDir, { recursive: true });
      writeFileSync(
        join(installedCodexDir, "gatekeeper.toml"),
        'name = "fast-worker"\nsandbox_mode = "workspace-write"\n',
      );

      const res = runInstaller(home, badSourceDir);
      expect(res.status).not.toBe(0);
      expect(res.stdout).toContain("[fleet] codex/gatekeeper.toml: source-invalid");
      expect(readFileSync(join(installedCodexDir, "gatekeeper.toml"), "utf-8")).toContain('name = "fast-worker"');
      expect(existsSync(join(home, ".codex/agents/fast-worker.toml"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a provider-specific description that disagrees with the model mapping fails closed", () => {
    const { root, home } = setupFakeHome("install-agent-fleet-description-mismatch");
    const badSourceDir = join(root, "bad-source");
    try {
      mkdirSync(badSourceDir, { recursive: true });
      for (const agent of AGENTS) {
        cpSync(join(FLEET_SOURCE_DIR, `${agent}.md`), join(badSourceDir, `${agent}.md`));
      }
      const mismatched = readFileSync(join(badSourceDir, "fast-worker.md"), "utf-8").replace(
        "Sonnet at max effort",
        "an unspecified model",
      );
      writeFileSync(join(badSourceDir, "fast-worker.md"), mismatched);

      const res = runInstaller(home, badSourceDir);
      expect(res.status).not.toBe(0);
      expect(res.stdout).toContain("[fleet] claude/fast-worker.md: source-invalid");
      expect(res.stdout).toContain("[fleet] codex/fast-worker.toml: source-invalid");
      expect(existsSync(join(home, ".codex/agents/fast-worker.toml"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a missing packaged source fails the whole preflight before any target mutation", () => {
    const { root, home } = setupFakeHome("install-agent-fleet-partial-source");
    const partialSourceDir = join(root, "partial-source");
    try {
      mkdirSync(partialSourceDir, { recursive: true });
      cpSync(join(FLEET_SOURCE_DIR, "explorer.md"), join(partialSourceDir, "explorer.md"));
      cpSync(join(FLEET_SOURCE_DIR, "deep-reasoner.md"), join(partialSourceDir, "deep-reasoner.md"));
      cpSync(join(FLEET_SOURCE_DIR, "gatekeeper.md"), join(partialSourceDir, "gatekeeper.md"));
      // fast-worker.md deliberately absent from partialSourceDir.

      const res = runInstaller(home, partialSourceDir);
      expect(res.status).not.toBe(0);
      expect(res.stdout).toContain("[fleet] claude/fast-worker.md: source-missing");
      expect(res.stdout).toContain("[fleet] codex/fast-worker.toml: source-missing");
      expect(existsSync(join(home, ".claude/agents/fast-worker.md"))).toBe(false);
      expect(existsSync(join(home, ".claude/agents/deep-reasoner.md"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a decoy REPO_HARNESS_HELPER_SOURCE_PATH pointing at a different real helper still fails closed on a bad packaged fixture", () => {
    const { root, home } = setupFakeHome("install-agent-fleet-decoy-helper-source-path");
    const partialSourceDir = join(root, "partial-source");
    try {
      mkdirSync(partialSourceDir, { recursive: true });
      cpSync(join(FLEET_SOURCE_DIR, "explorer.md"), join(partialSourceDir, "explorer.md"));
      cpSync(join(FLEET_SOURCE_DIR, "deep-reasoner.md"), join(partialSourceDir, "deep-reasoner.md"));
      cpSync(join(FLEET_SOURCE_DIR, "gatekeeper.md"), join(partialSourceDir, "gatekeeper.md"));
      // fast-worker.md deliberately absent from partialSourceDir, matching the
      // "missing packaged source" fixture shape above.

      // Simulates the real leak: repo-harness run verify-sprint exports its own
      // resolved helper path (a different, real, unrelated packaged helper) into
      // the environment; a nested bun test child then inherits it verbatim. The
      // installer must reject this decoy (its basename does not match the
      // runtime script's own $0) and keep resolving package_root from $0.
      const decoyHelperSourcePath = join(ROOT, "assets/templates/helpers/verify-sprint.sh");
      expect(existsSync(decoyHelperSourcePath)).toBe(true);

      const res = runInstaller(home, partialSourceDir, [], {
        REPO_HARNESS_HELPER_SOURCE_PATH: decoyHelperSourcePath,
      });
      expect(res.status).not.toBe(0);
      expect(res.stdout).toContain("[fleet] claude/fast-worker.md: source-missing");
      expect(res.stdout).toContain("[fleet] codex/fast-worker.toml: source-missing");
      expect(existsSync(join(home, ".claude/agents/fast-worker.md"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("total failure (no source, no pre-existing targets) exits non-zero", () => {
    const { root, home } = setupFakeHome("install-agent-fleet-total-failure");
    const emptySourceDir = join(root, "empty-source");
    try {
      mkdirSync(emptySourceDir, { recursive: true });
      const res = runInstaller(home, emptySourceDir);
      expect(res.status).not.toBe(0);
      for (const agent of AGENTS) {
        expect(res.stdout).toContain(`[fleet] claude/${agent}.md: source-missing`);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("missing packaged source leaves existing targets untouched across retries", () => {
    const { root, home } = setupFakeHome("install-agent-fleet-persistent-remediation-failure");
    const partialSourceDir = join(root, "partial-source");
    try {
      mkdirSync(partialSourceDir, { recursive: true });
      cpSync(join(FLEET_SOURCE_DIR, "explorer.md"), join(partialSourceDir, "explorer.md"));
      cpSync(join(FLEET_SOURCE_DIR, "deep-reasoner.md"), join(partialSourceDir, "deep-reasoner.md"));
      cpSync(join(FLEET_SOURCE_DIR, "fast-worker.md"), join(partialSourceDir, "fast-worker.md"));
      const installedCodexDir = join(home, ".codex/agents");
      mkdirSync(installedCodexDir, { recursive: true });
      writeFileSync(
        join(installedCodexDir, "gatekeeper.toml"),
        'name = "fast-worker"\nsandbox_mode = "workspace-write"\n',
      );

      const first = runInstaller(home, partialSourceDir);
      expect(first.status).not.toBe(0);
      expect(first.stdout).toContain("[fleet] codex/gatekeeper.toml: source-missing");
      expect(readFileSync(join(installedCodexDir, "gatekeeper.toml"), "utf-8")).toContain('name = "fast-worker"');

      const second = runInstaller(home, partialSourceDir);
      expect(second.status).not.toBe(0);
      expect(second.stdout).toContain("[fleet] codex/gatekeeper.toml: source-missing");
      expect(readFileSync(join(installedCodexDir, "gatekeeper.toml"), "utf-8")).toContain('name = "fast-worker"');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("--help exits zero and does not create any HOME state", () => {
    const { root, home } = setupFakeHome("install-agent-fleet-help");
    try {
      const res = runInstaller(home, FLEET_SOURCE_DIR, ["--help"]);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("Usage:");
      expect(existsSync(join(home, ".claude"))).toBe(false);
      expect(existsSync(join(home, ".codex"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("the installer declares Bun as its only semantic parser runtime", () => {
    const source = readFileSync(SCRIPT, "utf-8");
    expect(source).toContain("install-agent-fleet.sh requires bun");
    expect(source).toContain('MIN_BUN_VERSION="1.1.35"');
    expect(source).toContain("Bun.TOML.parse(");
    expect(source).not.toContain("install-agent-fleet.sh requires node or bun");
    expect(source).toContain('AGENT_FLEET_SOURCE_DIR="$package_root/agents/fleet"');
    expect(source).not.toContain("REPO_HARNESS_FLEET_SOURCE_DIR");
    expect(source).not.toContain('spawnSync("curl"');
    expect(source).toContain('const WRITABLE_AGENTS = new Set(["fast-worker", "root-cause-prover", "harness-evaluator"]);');
    expect(source).toContain("if (WRITABLE_AGENTS.has(agent))");
  });

  test("an unsupported Bun version fails before creating HOME state", () => {
    const { root, home } = setupFakeHome("install-agent-fleet-old-bun");
    const fakeBin = join(root, "bin");
    const fakeBun = join(fakeBin, "bun");
    try {
      mkdirSync(fakeBin, { recursive: true });
      writeFileSync(
        fakeBun,
        ['#!/bin/sh', 'if [ "$1" = "--version" ]; then', "  echo 1.0.0", "  exit 0", "fi", "exit 99", ""].join("\n"),
      );
      chmodSync(fakeBun, 0o755);
      const res = spawnSync("bash", [SCRIPT], {
        cwd: ROOT,
        encoding: "utf-8",
        env: {
          ...process.env,
          HOME: home,
          PATH: `${fakeBin}:/usr/bin:/bin`,
        },
      });
      expect(res.status).not.toBe(0);
      expect(res.stderr).toContain("requires Bun >= 1.1.35 (found: 1.0.0)");
      expect(existsSync(join(home, ".claude"))).toBe(false);
      expect(existsSync(join(home, ".codex"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a supported HOME Bun wins when PATH resolves an unsupported Bun", () => {
    const { root, home } = setupFakeHome("install-agent-fleet-home-bun-fallback");
    const fakeBin = join(root, "bin");
    const oldBun = join(fakeBin, "bun");
    const homeBun = join(home, ".bun/bin/bun");
    try {
      mkdirSync(fakeBin, { recursive: true });
      mkdirSync(join(home, ".bun/bin"), { recursive: true });
      writeFileSync(
        oldBun,
        ['#!/bin/sh', 'if [ "$1" = "--version" ]; then', "  echo 1.0.0", "  exit 0", "fi", "exit 99", ""].join("\n"),
      );
      writeFileSync(
        homeBun,
        [
          "#!/bin/sh",
          'if [ "$1" = "--version" ]; then',
          "  echo 1.1.35",
          "  exit 0",
          "fi",
          `exec ${JSON.stringify(process.execPath)} "$@"`,
          "",
        ].join("\n"),
      );
      chmodSync(oldBun, 0o755);
      chmodSync(homeBun, 0o755);
      const res = spawnSync("bash", [SCRIPT], {
        cwd: ROOT,
        encoding: "utf-8",
        env: {
          ...process.env,
          HOME: home,
          PATH: `${fakeBin}:/usr/bin:/bin`,
        },
      });
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[fleet] codex/fast-worker.toml: installed");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("generated developer_instructions embeds the canonical EXECUTION_BOUNDARY text verbatim", () => {
    const { root, home } = setupFakeHome("install-agent-fleet-boundary");
    try {
      // The installer source holds the boundary as an array of paragraph literals
      // (joined into one string only at runtime), so assert each paragraph is present
      // in the source verbatim, then assert the fully-joined text appears in the
      // actual generated output -- the stronger, functional half of this check.
      const installerSource = readFileSync(SCRIPT, "utf-8");
      for (const paragraph of CANONICAL_BOUNDARY_TEXT.split("\n\n")) {
        expect(installerSource).toContain(paragraph);
      }

      const res = runInstaller(home, FLEET_SOURCE_DIR);
      expect(res.status).toBe(0);
      for (const agent of AGENTS) {
        const toml = readFileSync(join(home, ".codex/agents", `${agent}.toml`), "utf-8");
        expect(toml).toContain(CANONICAL_BOUNDARY_TEXT);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
