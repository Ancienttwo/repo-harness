import { describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "..");
const SCRIPT = join(ROOT, "scripts/install-agent-fleet.sh");
const CLAUDE_SOURCE_DIR = join(ROOT, ".claude/agents");
const GOLDEN_CODEX_DIR = join(ROOT, ".codex/agents");
const AGENTS = ["deep-reasoner", "fast-worker", "gatekeeper"];

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
        expect(installedCodex).toBe(golden);
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
      const locallyEdited = `${readFileSync(target, "utf-8")}\n# local edit\n`;
      writeFileSync(target, locallyEdited);

      const second = runInstaller(home, CLAUDE_SOURCE_DIR);
      expect(second.status).toBe(0);
      expect(second.stdout).toContain("[fleet] codex/gatekeeper.toml: drift");
      expect(readFileSync(target, "utf-8")).toBe(locallyEdited);
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
      expect(res.status).toBe(0);
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

  test("a missing upstream source for one agent reports fetch-failed for that agent while others still install", () => {
    const { root, home } = setupFakeHome("install-agent-fleet-partial-fetch");
    const partialSourceDir = join(root, "partial-source");
    try {
      mkdirSync(partialSourceDir, { recursive: true });
      cpSync(join(CLAUDE_SOURCE_DIR, "deep-reasoner.md"), join(partialSourceDir, "deep-reasoner.md"));
      cpSync(join(CLAUDE_SOURCE_DIR, "gatekeeper.md"), join(partialSourceDir, "gatekeeper.md"));
      // fast-worker.md deliberately absent from partialSourceDir.

      const res = runInstaller(home, partialSourceDir);
      expect(res.status).toBe(0);
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
