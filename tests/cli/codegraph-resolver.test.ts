import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "..", "..");
const SCRIPT = join(ROOT, "scripts/ensure-codegraph.sh");

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
  writeExecutable(
    join(fakeBin, "timeout"),
    [
      "#!/bin/bash",
      "set -euo pipefail",
      "if [[ \"${1:-}\" == --kill-after=* ]]; then shift; fi",
      "if [[ \"${1:-}\" == *s ]]; then shift; fi",
      "exec \"$@\"",
      "",
    ].join("\n")
  );
  return { root, home, fakeBin };
}

function writeFakeCodeGraph(fakeBin: string, logFile: string) {
  writeExecutable(
    join(fakeBin, "codegraph"),
    [
      "#!/bin/bash",
      "set -euo pipefail",
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
}

function writeFakeBunx(fakeBin: string) {
  writeExecutable(
    join(fakeBin, "bunx"),
    [
      "#!/bin/bash",
      "set -euo pipefail",
      "if [[ \"$*\" == *\"skills ls -g --json\"* ]]; then echo '[]'; exit 0; fi",
      "exit 1",
      "",
    ].join("\n")
  );
}

describe("ensure-codegraph", () => {
  test("--check is read-only and reuses check-agent-tooling readiness", () => {
    const envRoot = setupFakeEnvironment("ensure-codegraph");
    const logFile = join(envRoot.root, "tool.log");
    try {
      mkdirSync(join(envRoot.home, ".codex"), { recursive: true });
      writeFileSync(join(envRoot.home, ".codex", "config.toml"), "[mcp_servers.codegraph]\ncommand = \"codegraph\"\n");
      writeFakeCodeGraph(envRoot.fakeBin, logFile);
      writeFakeBunx(envRoot.fakeBin);

      const res = spawnSync("bash", [SCRIPT, "--check", "--json", "--repo", ROOT], {
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
      expect(result.codegraph.source).toBe("global");
      expect(result.codegraph.status).toBe("partial");

      expect(result.codegraph.probes).toHaveLength(2);
      for (const probe of result.codegraph.probes) {
        expect(probe.status).toBe(0);
        expect(probe.signal).toBeNull();
        expect(probe.error_code).toBeNull();
        expect(probe.error).toBe("");
        expect(probe.timed_out).toBe(false);
      }
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

  for (const failure of ["EAGAIN", "ETIMEDOUT", "SIGTERM", "exit"] as const) {
    test(`--check exposes CodeGraph probe ${failure} without synthesizing execution`, () => {
      const envRoot = setupFakeEnvironment("ensure-codegraph-probe");
      try {
        writeFakeCodeGraph(envRoot.fakeBin, join(envRoot.root, "tool.log"));
        writeFakeBunx(envRoot.fakeBin);
        const preload = join(envRoot.root, "probe.cjs");
        writeFileSync(preload, `
          const cp = require('child_process');
          const original = cp.spawnSync;
          cp.spawnSync = function(command, args, options) {
            if (![command, ...(args || [])].some(value => /(?:^|\\/)codegraph$/.test(String(value)))) return original.apply(this, arguments);
            return {status: ${failure === "exit" ? "7" : "null"}, signal: ${JSON.stringify(failure === "SIGTERM" || failure === "ETIMEDOUT" ? "SIGTERM" : null)}, stdout: '', stderr: '',
              error: ${failure === "EAGAIN" || failure === "ETIMEDOUT" ? `Object.assign(new Error('probe ${failure}'), {code: '${failure}'})` : "undefined"}};
          };
        `);
        const res = spawnSync("bash", [SCRIPT, "--check", "--json", "--repo", ROOT], {
          cwd: ROOT, encoding: "utf-8",
          env: { ...process.env, HOME: envRoot.home, PATH: `${envRoot.fakeBin}:${process.env.PATH ?? ""}`,
            NODE_OPTIONS: `--require=${preload}`, AGENTIC_DEV_CODEGRAPH_ALLOW_REPO_LOCAL: "0" },
        });
        expect(res.status).toBe(0);
        const probes = JSON.parse(res.stdout).codegraph.probes;
        expect(probes).toHaveLength(failure === "ETIMEDOUT" ? 3 : 2);
        expect(probes[0].args).toEqual(["--version"]);
        expect(probes.at(-1).args).toEqual(["status", "."]);
        for (const probe of probes) {
          expect(probe.bin_path).toBe(join(envRoot.fakeBin, "codegraph"));
          expect(probe.status).toBe(failure === "exit" ? 7 : null);
          expect(probe.signal).toBe(failure === "SIGTERM" || failure === "ETIMEDOUT" ? "SIGTERM" : null);
          expect(probe.error_code).toBe(failure === "EAGAIN" || failure === "ETIMEDOUT" ? failure : null);
          expect(probe.error).toBe(failure === "EAGAIN" || failure === "ETIMEDOUT" ? `probe ${failure}` : "");
          expect(probe.timed_out).toBe(failure === "ETIMEDOUT");
        }
      } finally { rmSync(envRoot.root, { recursive: true, force: true }); }
    }, 15000);
  }

});
