import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import { warmFixtureExecutable } from "../helpers/repo-fixture";

const ROOT = join(import.meta.dir, "..", "..");
const CLI = join(ROOT, "src/cli/index.ts");

function writeExecutable(filePath: string, content: string) {
  writeFileSync(filePath, content);
  chmodSync(filePath, 0o755);
}

function setupFakeEnvironment(prefix: string) {
  const root = mkdtempSync(join(tmpdir(), `${prefix}-`));
  const home = join(root, "home");
  const fakeBin = join(root, "fakebin");
  mkdirSync(home, { recursive: true });
  mkdirSync(fakeBin, { recursive: true });
  return { root, home, fakeBin };
}

function writeFakeCodeGraph(fakeBin: string, logFile: string) {
  writeExecutable(
    join(fakeBin, "codegraph"),
    [
      "#!/bin/bash",
      "set -euo pipefail",
      "if [[ \"${1:-}\" == \"__fixture-ready\" ]]; then exit 0; fi",
      `echo "codegraph $*" >> "${logFile}"`,
      "case \"${1:-}\" in",
      "  \"--version\") echo '0.9.6' ;;",
      "  \"status\") echo 'CodeGraph Status'; echo 'Index is up to date' ;;",
      "  \"init\"|\"sync\"|\"install\") echo 'unexpected mutation' >&2; exit 2 ;;",
      "  *) exit 1 ;;",
      "esac",
      "",
    ].join("\n")
  );
  warmFixtureExecutable(join(fakeBin, "codegraph"), ["__fixture-ready"]);
}

// check-agent-tooling.sh resolves `skills` from PATH (and only spawns it under
// --probe-skills-cli), so the stub has to be the binary itself, not bunx.
function writeFakeSkillsCli(fakeBin: string) {
  writeExecutable(
    join(fakeBin, "skills"),
    [
      "#!/bin/bash",
      "set -euo pipefail",
      "if [[ \"$*\" == \"ls -g --json\" ]]; then echo '[]'; exit 0; fi",
      "exit 1",
      "",
    ].join("\n")
  );
}

describe("tools ensure codegraph", () => {
  test("--check is read-only and exposes the shared readiness report", () => {
    const envRoot = setupFakeEnvironment("repo-harness-tools-codegraph");
    const logFile = join(envRoot.root, "tool.log");
    try {
      mkdirSync(join(envRoot.home, ".codex"), { recursive: true });
      writeFileSync(join(envRoot.home, ".codex", "config.toml"), "[mcp_servers.codegraph]\ncommand = \"codegraph\"\n");
      writeFakeCodeGraph(envRoot.fakeBin, logFile);
      writeFakeSkillsCli(envRoot.fakeBin);

      const res = spawnSync("bun", [CLI, "tools", "ensure", "codegraph", "--check", "--json", "--repo", ROOT], {
        cwd: ROOT,
        encoding: "utf-8",
        env: {
          ...process.env,
          HOME: envRoot.home,
          PATH: `${envRoot.fakeBin}:${process.env.PATH ?? ""}`,
          AGENTIC_DEV_CODEGRAPH_ALLOW_REPO_LOCAL: "0",
        },
      });

      expect(res.status).toBe(0);
      const result = JSON.parse(res.stdout);
      expect(result.read_only).toBe(true);
      expect(result.changed).toBe(false);
      expect(result.codegraph.name).toBe("codegraph");
      expect(result.codegraph.source).toBe("global");
      expect(result.actions).toEqual([]);

      const log = readFileSync(logFile, "utf-8");
      expect(log).toContain("codegraph --version");
      expect(log).toContain("codegraph status .");
      expect(log).not.toContain("codegraph init");
      expect(log).not.toContain("codegraph sync");
      expect(log).not.toContain("codegraph install");
    } finally {
      rmSync(envRoot.root, { recursive: true, force: true });
    }
  }, 15000);

  test("human output names CodeGraph status", () => {
    const res = spawnSync("bun", [CLI, "tools", "ensure", "codegraph", "--check"], {
      cwd: ROOT,
      encoding: "utf-8",
    });

    expect(res.status).toBe(0);
    expect(res.stdout).toContain("CodeGraph:");
    expect(res.stdout).toContain("Source:");
  }, 15000);
});

test('standalone CodeGraph configure records restorable MCP provenance', () => {
  const fixture = setupFakeEnvironment('standalone-codegraph-uninstall');
  try {
    writeFakeSkillsCli(fixture.fakeBin);
    const codegraph = join(fixture.fakeBin, 'codegraph');
    writeExecutable(codegraph, [
      '#!/bin/bash',
      'set -euo pipefail',
      'if [[ "${1:-}" == "__fixture-ready" ]]; then exit 0; fi',
      'case "${1:-}" in',
      '  --version) echo "0.9.6" ;;',
      '  status) echo "CodeGraph Status"; echo "Index is up to date" ;;',
      '  install) mkdir -p "$HOME/.codex"; printf \'%s\\n\' \'[mcp_servers.codegraph]\' \'command = "codegraph"\' >> "$HOME/.codex/config.toml" ;;',
      '  *) exit 1 ;;',
      'esac',
    ].join('\n'));
    warmFixtureExecutable(codegraph, ['__fixture-ready']);
    mkdirSync(join(fixture.home, '.codex'));
    writeFileSync(join(fixture.home, '.codex/config.toml'), 'model = "user-model"\n');
    const env = { ...process.env, HOME: fixture.home, PATH: `${fixture.fakeBin}:${process.env.PATH ?? ''}`, AGENTIC_DEV_CODEGRAPH_ALLOW_REPO_LOCAL: '0', BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0' };
    const configured = spawnSync('bun', [CLI, 'tools', 'configure', 'codegraph', '--target', 'codex', '--location', 'global', '--json', '--repo', ROOT], { cwd: ROOT, env, encoding: 'utf8' });
    expect(configured.status, configured.stderr).toBe(0);
    const receiptRaw = readFileSync(join(fixture.home, '.repo-harness/configuration-restore.json'), 'utf8');
    const receipt = JSON.parse(receiptRaw);
    expect(receipt.pending).toBeUndefined();
    expect(receipt.changes.find((entry: any) => entry.selector === 'mcp_servers.codegraph').active).toBe(true);
    expect(receiptRaw).not.toContain('user-model');
    const uninstalled = spawnSync('bun', [CLI, 'uninstall', '--target', 'codex', '--json'], { cwd: ROOT, env, encoding: 'utf8' });
    expect(uninstalled.status, uninstalled.stdout + uninstalled.stderr).toBe(0);
    expect(readFileSync(join(fixture.home, '.codex/config.toml'), 'utf8')).toBe('model = "user-model"\n');
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
}, 15000);
