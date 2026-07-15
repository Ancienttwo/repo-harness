import { describe, expect, test } from "bun:test";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "..");

function tmpWorkspace(prefix: string): string {
  const cwd = mkdtempSync(join(tmpdir(), `${prefix}-`));
  mkdirSync(join(cwd, "scripts"), { recursive: true });
  for (const helper of ["capability-config.ts", "capability-resolver.ts", "architecture-event.ts", "context-contract-sync.sh", "workstream-sync.sh"]) {
    const source = helper === "capability-resolver.ts"
      ? join(ROOT, "assets/templates/helpers", helper)
      : join(ROOT, "scripts", helper);
    copyFileSync(source, join(cwd, "scripts", helper));
  }
  return cwd;
}

function runCapabilityConfig(cwd: string, args: string[]) {
  return spawnSync("bun", ["scripts/capability-config.ts", ...args], {
    cwd,
    encoding: "utf-8",
  });
}

describe("capability-config helper", () => {
  test("adds one explicit capability and syncs local agent contracts without full init", () => {
    const cwd = tmpWorkspace("capability-config-add");
    try {
      mkdirSync(join(cwd, "apps/agent"), { recursive: true });

      const res = runCapabilityConfig(cwd, [
        "add",
        "--prefix",
        "apps/agent",
        "--verification-hint",
        "bun test apps/agent",
      ]);

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[CapabilityConfig] Added apps-agent -> apps/agent");
      expect(existsSync(join(cwd, "scripts/migrate-project-template.sh"))).toBe(false);

      const registry = JSON.parse(readFileSync(join(cwd, ".ai/context/capabilities.json"), "utf-8"));
      expect(registry.capabilities).toHaveLength(1);
      expect(registry.capabilities[0]).toMatchObject({
        id: "apps-agent",
        domain: "apps-agent",
        name: "agent",
        prefixes: ["apps/agent"],
        contract_files: {
          agents: "apps/agent/AGENTS.md",
          claude: "apps/agent/CLAUDE.md",
        },
        architecture_module: "docs/architecture/modules/apps-agent/agent.md",
        workstream_dir: "tasks/workstreams/apps-agent/agent",
        lsp_profile: "typescript-lsp",
        verification_hints: ["bun test apps/agent"],
      });

      const agents = readFileSync(join(cwd, "apps/agent/AGENTS.md"), "utf-8");
      const claude = readFileSync(join(cwd, "apps/agent/CLAUDE.md"), "utf-8");
      expect(agents).toContain("Capability ID: `apps-agent`");
      expect(agents).toBe(claude);

      const contextMap = JSON.parse(readFileSync(join(cwd, ".ai/context/context-map.json"), "utf-8"));
      expect(contextMap.discoverable_contexts.map((entry: { path: string }) => entry.path)).toEqual([
        "apps/agent/CLAUDE.md",
        "apps/agent/AGENTS.md",
      ]);

      const match = spawnSync(
        "bun",
        ["scripts/capability-resolver.ts", "match", "--path", "apps/agent/index.ts", "--format", "json"],
        { cwd, encoding: "utf-8" }
      );
      expect(match.status).toBe(0);
      expect(JSON.parse(match.stdout).capability_id).toBe("apps-agent");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("refuses to create missing capability prefixes unless explicitly requested", () => {
    const cwd = tmpWorkspace("capability-config-missing-prefix");
    try {
      const res = runCapabilityConfig(cwd, ["add", "--prefix", "apps/missing"]);

      expect(res.status).toBe(1);
      expect(res.stderr).toContain("use --create-prefix to create it");
      expect(existsSync(join(cwd, ".ai/context/capabilities.json"))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("reuses existing registry entries instead of re-deriving custom fields", () => {
    const cwd = tmpWorkspace("capability-config-existing");
    try {
      mkdirSync(join(cwd, "apps/agent"), { recursive: true });

      const first = runCapabilityConfig(cwd, [
        "add",
        "--prefix",
        "apps/agent",
        "--id",
        "custom-agent",
        "--domain",
        "runtime",
        "--name",
        "agent",
      ]);
      expect(first.status).toBe(0);

      const second = runCapabilityConfig(cwd, ["add", "--prefix", "apps/agent", "--id", "custom-agent"]);
      expect(second.status).toBe(0);
      expect(second.stdout).toContain("[CapabilityConfig] Found existing custom-agent -> apps/agent");

      const registry = JSON.parse(readFileSync(join(cwd, ".ai/context/capabilities.json"), "utf-8"));
      expect(registry.capabilities).toHaveLength(1);
      expect(registry.capabilities[0].domain).toBe("runtime");

      const agents = readFileSync(join(cwd, "apps/agent/AGENTS.md"), "utf-8");
      expect(agents).toContain("Architecture domain: `runtime`");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
