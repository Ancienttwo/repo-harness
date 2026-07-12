import { describe, expect, test } from "bun:test";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "..");
const SCRIPT = join(ROOT, "scripts/install-agent-fleet.sh");
const CLAUDE_SOURCE_DIR = join(ROOT, ".claude/agents");
const GOLDEN_CODEX_DIR = join(ROOT, ".codex/agents");
const AGENTS = ["deep-reasoner", "fast-worker", "gatekeeper"];
const CODEX_EXPECTATIONS: Record<string, { model: string; effort: string; descriptionLabel: string; sandboxMode?: string }> = {
  "deep-reasoner": {
    model: "gpt-5.6-sol",
    effort: "xhigh",
    descriptionLabel: "GPT-5.6 Sol at extra high reasoning",
  },
  "fast-worker": {
    model: "gpt-5.6-luna",
    effort: "xhigh",
    descriptionLabel: "GPT-5.6 Luna at extra high reasoning",
    sandboxMode: "workspace-write",
  },
  gatekeeper: {
    model: "gpt-5.6-sol",
    effort: "xhigh",
    descriptionLabel: "GPT-5.6 Sol at extra high reasoning",
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

function runInstaller(home: string, sourceDir: string, args: string[] = []) {
  return spawnSync("bash", [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: "utf-8",
    env: {
      ...process.env,
      HOME: home,
      REPO_HARNESS_FLEET_SOURCE_DIR: sourceDir,
    },
  });
}

describe("install-agent-fleet", () => {
  test("fresh install writes claude .md byte-identical to source and codex .toml byte-identical to golden", () => {
    const { root, home } = setupFakeHome("install-agent-fleet-fresh");
    try {
      const res = runInstaller(home, CLAUDE_SOURCE_DIR);
      expect(res.status).toBe(0);

      for (const agent of AGENTS) {
        expect(res.stdout).toContain(`[fleet] claude/${agent}.md: installed`);
        expect(res.stdout).toContain(`[fleet] codex/${agent}.toml: installed`);

        const installedClaude = readFileSync(join(home, ".claude/agents", `${agent}.md`), "utf-8");
        const sourceClaude = readFileSync(join(CLAUDE_SOURCE_DIR, `${agent}.md`), "utf-8");
        expect(installedClaude).toBe(sourceClaude);

        const installedCodex = readFileSync(join(home, ".codex/agents", `${agent}.toml`), "utf-8");
        const golden = readFileSync(join(GOLDEN_CODEX_DIR, `${agent}.toml`), "utf-8");
        const expected = CODEX_EXPECTATIONS[agent];
        expect(installedCodex).toBe(golden);
        expect(installedCodex).toContain(`model = "${expected.model}"`);
        expect(installedCodex).toContain(`model_reasoning_effort = "${expected.effort}"`);
        expect(installedCodex).toContain(expected.descriptionLabel);
        if (expected.sandboxMode) {
          expect(installedCodex).toContain(`sandbox_mode = "${expected.sandboxMode}"`);
        }
        expect(installedCodex).not.toContain("Opus 4.8 at max effort");
        expect(installedCodex).not.toContain("Sonnet 5 at max effort");
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("idempotent re-run reports up-to-date for all 6 files", () => {
    const { root, home } = setupFakeHome("install-agent-fleet-idempotent");
    try {
      expect(runInstaller(home, CLAUDE_SOURCE_DIR).status).toBe(0);
      const second = runInstaller(home, CLAUDE_SOURCE_DIR);
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
      expect(runInstaller(home, CLAUDE_SOURCE_DIR).status).toBe(0);
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

      const second = runInstaller(home, CLAUDE_SOURCE_DIR);
      expect(second.status).toBe(0);
      expect(second.stdout).toContain("[fleet] codex/gatekeeper.toml: drift");
      expect(readFileSync(target, "utf-8")).toBe(locallyEdited);

      const claudeTarget = join(home, ".claude/agents/gatekeeper.md");
      const quotedIdentityEdit = `${readFileSync(claudeTarget, "utf-8")
        .replace("name: gatekeeper", 'name: "gatekeeper" # local style')
        .replace("\n---\n", "\nmetadata:\n  name: fast-worker\n---\n")}\n# preserve-me\n`;
      writeFileSync(claudeTarget, quotedIdentityEdit);
      const third = runInstaller(home, CLAUDE_SOURCE_DIR);
      expect(third.status).toBe(0);
      expect(third.stdout).toContain("[fleet] claude/gatekeeper.md: drift");
      expect(readFileSync(claudeTarget, "utf-8")).toBe(quotedIdentityEdit);

      const ambiguousYamlIdentityEdit = quotedIdentityEdit.replace('name: "gatekeeper" # local style', "name: null");
      writeFileSync(claudeTarget, ambiguousYamlIdentityEdit);
      const fourth = runInstaller(home, CLAUDE_SOURCE_DIR);
      expect(fourth.status).toBe(0);
      expect(fourth.stdout).toContain("[fleet] claude/gatekeeper.md: drift");
      expect(readFileSync(claudeTarget, "utf-8")).toBe(ambiguousYamlIdentityEdit);

      const duplicateYamlIdentityEdit = quotedIdentityEdit.replace(
        'name: "gatekeeper" # local style',
        "name: gatekeeper\nname: fast-worker",
      );
      writeFileSync(claudeTarget, duplicateYamlIdentityEdit);
      const fifth = runInstaller(home, CLAUDE_SOURCE_DIR);
      expect(fifth.status).toBe(0);
      expect(fifth.stdout).toContain("[fleet] claude/gatekeeper.md: drift");
      expect(readFileSync(claudeTarget, "utf-8")).toBe(duplicateYamlIdentityEdit);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("--force overwrites a drifted target back to generated content", () => {
    const { root, home } = setupFakeHome("install-agent-fleet-force");
    try {
      expect(runInstaller(home, CLAUDE_SOURCE_DIR).status).toBe(0);
      const target = join(home, ".codex/agents/gatekeeper.toml");
      writeFileSync(target, "corrupted\n");

      const forced = runInstaller(home, CLAUDE_SOURCE_DIR, ["--force"]);
      expect(forced.status).toBe(0);
      expect(forced.stdout).toContain("[fleet] codex/gatekeeper.toml: installed");
      expect(readFileSync(target, "utf-8")).toBe(readFileSync(join(GOLDEN_CODEX_DIR, "gatekeeper.toml"), "utf-8"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("invalid frontmatter (unmapped model/effort) fails closed for only that agent", () => {
    const { root, home } = setupFakeHome("install-agent-fleet-invalid");
    const badSourceDir = join(root, "bad-source");
    try {
      mkdirSync(badSourceDir, { recursive: true });
      for (const agent of AGENTS) {
        cpSync(join(CLAUDE_SOURCE_DIR, `${agent}.md`), join(badSourceDir, `${agent}.md`));
      }
      const corrupted = readFileSync(join(badSourceDir, "fast-worker.md"), "utf-8").replace("effort: max", "effort: min");
      writeFileSync(join(badSourceDir, "fast-worker.md"), corrupted);

      const res = runInstaller(home, badSourceDir);
      expect(res.status).not.toBe(0);
      expect(res.stdout).toContain("[fleet] claude/fast-worker.md: invalid");
      expect(res.stdout).toContain("[fleet] codex/fast-worker.toml: invalid");
      expect(existsSync(join(home, ".claude/agents/fast-worker.md"))).toBe(false);
      expect(existsSync(join(home, ".codex/agents/fast-worker.toml"))).toBe(false);

      // Unaffected agents still install.
      expect(res.stdout).toContain("[fleet] claude/deep-reasoner.md: installed");
      expect(existsSync(join(home, ".claude/agents/deep-reasoner.md"))).toBe(true);
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
        cpSync(join(CLAUDE_SOURCE_DIR, `${agent}.md`), join(badSourceDir, `${agent}.md`));
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
      expect(res.stdout).toContain("[fleet] claude/fast-worker.md: invalid");
      expect(res.stdout).toContain("[fleet] codex/fast-worker.toml: invalid");
      expect(existsSync(join(home, ".codex/agents/fast-worker.toml"))).toBe(false);
      expect(existsSync(join(home, ".codex/agents/deep-reasoner.toml"))).toBe(true);
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
        cpSync(join(CLAUDE_SOURCE_DIR, `${agent}.md`), join(badSourceDir, `${agent}.md`));
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
      expect(res.stdout).toContain("[fleet] claude/gatekeeper.md: deactivated-invalid");
      expect(res.stdout).toContain("[fleet] codex/gatekeeper.toml: deactivated-invalid");
      expect(existsSync(join(home, ".claude/agents/gatekeeper.md"))).toBe(false);
      expect(existsSync(join(home, ".codex/agents/gatekeeper.toml"))).toBe(false);

      // The trusted fast-worker source still receives the intended write sandbox.
      expect(readFileSync(join(home, ".codex/agents/fast-worker.toml"), "utf-8")).toContain(
        'sandbox_mode = "workspace-write"',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a corrected source repairs stale installed targets with mismatched role identities", () => {
    const { root, home } = setupFakeHome("install-agent-fleet-stale-role-identity");
    try {
      const installedClaudeDir = join(home, ".claude/agents");
      const installedCodexDir = join(home, ".codex/agents");
      mkdirSync(installedClaudeDir, { recursive: true });
      mkdirSync(installedCodexDir, { recursive: true });
      const mismatchedClaude = readFileSync(join(CLAUDE_SOURCE_DIR, "gatekeeper.md"), "utf-8")
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

      const res = runInstaller(home, CLAUDE_SOURCE_DIR);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[fleet] claude/gatekeeper.md: installed");
      expect(res.stdout).toContain("[fleet] codex/gatekeeper.toml: installed");
      expect(readFileSync(join(installedClaudeDir, "gatekeeper.md"), "utf-8")).toContain("name: gatekeeper");
      const repairedCodex = readFileSync(join(installedCodexDir, "gatekeeper.toml"), "utf-8");
      expect(repairedCodex).toContain('name = "gatekeeper"');
      expect(repairedCodex).toContain('sandbox_mode = "read-only"');
      expect(repairedCodex).not.toContain('name = "fast-worker"');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a stale mismatched target stays deactivated when its replacement source is invalid", () => {
    const { root, home } = setupFakeHome("install-agent-fleet-stale-role-invalid-source");
    const badSourceDir = join(root, "bad-source");
    try {
      mkdirSync(badSourceDir, { recursive: true });
      for (const agent of AGENTS) {
        cpSync(join(CLAUDE_SOURCE_DIR, `${agent}.md`), join(badSourceDir, `${agent}.md`));
      }
      writeFileSync(
        join(badSourceDir, "gatekeeper.md"),
        readFileSync(join(badSourceDir, "gatekeeper.md"), "utf-8").replace("effort: max", "effort: min"),
      );
      const installedCodexDir = join(home, ".codex/agents");
      mkdirSync(installedCodexDir, { recursive: true });
      writeFileSync(
        join(installedCodexDir, "gatekeeper.toml"),
        'name = "fast-worker"\nsandbox_mode = "workspace-write"\n',
      );

      const res = runInstaller(home, badSourceDir);
      expect(res.status).not.toBe(0);
      expect(res.stdout).toContain("[fleet] codex/gatekeeper.toml: deactivated-invalid");
      expect(existsSync(join(installedCodexDir, "gatekeeper.toml"))).toBe(false);
      expect(existsSync(join(home, ".codex/agents/fast-worker.toml"))).toBe(true);
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
        cpSync(join(CLAUDE_SOURCE_DIR, `${agent}.md`), join(badSourceDir, `${agent}.md`));
      }
      const mismatched = readFileSync(join(badSourceDir, "fast-worker.md"), "utf-8").replace(
        "Sonnet 5 at max effort",
        "an unspecified model",
      );
      writeFileSync(join(badSourceDir, "fast-worker.md"), mismatched);

      const res = runInstaller(home, badSourceDir);
      expect(res.status).not.toBe(0);
      expect(res.stdout).toContain("[fleet] claude/fast-worker.md: invalid");
      expect(res.stdout).toContain("[fleet] codex/fast-worker.toml: invalid");
      expect(existsSync(join(home, ".codex/agents/fast-worker.toml"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a missing upstream source for one agent reports fetch-failed for that agent while others still install", () => {
    const { root, home } = setupFakeHome("install-agent-fleet-partial-fetch");
    const partialSourceDir = join(root, "partial-source");
    try {
      mkdirSync(partialSourceDir, { recursive: true });
      cpSync(join(CLAUDE_SOURCE_DIR, "deep-reasoner.md"), join(partialSourceDir, "deep-reasoner.md"));
      cpSync(join(CLAUDE_SOURCE_DIR, "gatekeeper.md"), join(partialSourceDir, "gatekeeper.md"));
      // fast-worker.md deliberately absent from partialSourceDir.

      const res = runInstaller(home, partialSourceDir);
      expect(res.status).not.toBe(0);
      expect(res.stdout).toContain("[fleet] claude/fast-worker.md: fetch-failed");
      expect(res.stdout).toContain("[fleet] codex/fast-worker.toml: fetch-failed");
      expect(res.stdout).toContain("[fleet] claude/deep-reasoner.md: installed");
      expect(res.stdout).toContain("[fleet] claude/gatekeeper.md: installed");
      expect(existsSync(join(home, ".claude/agents/fast-worker.md"))).toBe(false);
      expect(existsSync(join(home, ".claude/agents/deep-reasoner.md"))).toBe(true);
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
        expect(res.stdout).toContain(`[fleet] claude/${agent}.md: fetch-failed`);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("incomplete stale-target remediation stays non-zero across retries", () => {
    const { root, home } = setupFakeHome("install-agent-fleet-persistent-remediation-failure");
    const partialSourceDir = join(root, "partial-source");
    try {
      mkdirSync(partialSourceDir, { recursive: true });
      cpSync(join(CLAUDE_SOURCE_DIR, "deep-reasoner.md"), join(partialSourceDir, "deep-reasoner.md"));
      cpSync(join(CLAUDE_SOURCE_DIR, "fast-worker.md"), join(partialSourceDir, "fast-worker.md"));
      const installedCodexDir = join(home, ".codex/agents");
      mkdirSync(installedCodexDir, { recursive: true });
      writeFileSync(
        join(installedCodexDir, "gatekeeper.toml"),
        'name = "fast-worker"\nsandbox_mode = "workspace-write"\n',
      );

      const first = runInstaller(home, partialSourceDir);
      expect(first.status).not.toBe(0);
      expect(first.stdout).toContain("[fleet] codex/gatekeeper.toml: deactivated-fetch-failed");
      expect(existsSync(join(installedCodexDir, "gatekeeper.toml"))).toBe(false);

      const second = runInstaller(home, partialSourceDir);
      expect(second.status).not.toBe(0);
      expect(second.stdout).toContain("[fleet] codex/gatekeeper.toml: fetch-failed");
      expect(existsSync(join(installedCodexDir, "gatekeeper.toml"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("--help exits zero and does not create any HOME state", () => {
    const { root, home } = setupFakeHome("install-agent-fleet-help");
    try {
      const res = runInstaller(home, CLAUDE_SOURCE_DIR, ["--help"]);
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
    expect(source).toContain("Bun.TOML.parse(content)");
    expect(source).not.toContain("install-agent-fleet.sh requires node or bun");
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
          REPO_HARNESS_FLEET_SOURCE_DIR: CLAUDE_SOURCE_DIR,
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
          REPO_HARNESS_FLEET_SOURCE_DIR: CLAUDE_SOURCE_DIR,
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

      const res = runInstaller(home, CLAUDE_SOURCE_DIR);
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
