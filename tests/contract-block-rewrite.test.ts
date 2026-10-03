import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "..");
const SYNC_SCRIPT = join(ROOT, "scripts/context-contract-sync.sh");

const SYNC_CONTRACT_ARGS = [
  "sync-contract-files",
  "--functional-block",
  "apps/web",
  "--capability-id",
  "apps-web",
  "--matched-prefix",
  "apps/web",
  "--architecture-domain",
  "apps-web",
  "--architecture-capability",
  "web",
  "--architecture-module",
  "docs/architecture/modules/apps-web/web.md",
  "--workstream-dir",
  "tasks/workstreams/apps-web/web",
  "--contract-agents",
  "apps/web/AGENTS.md",
  "--contract-claude",
  "apps/web/CLAUDE.md",
  "--event-ts",
  "2026-05-27T03:00:00+0800",
  "--file-path",
  "apps/web/routes.ts",
  "--severity",
  "medium",
  "--change-type",
  "boundary-or-config",
  "--request-file",
  "docs/architecture/requests/request.md",
  "--lsp-profile",
  "typescript-lsp",
];

function runSyncContractFiles(cwd: string) {
  return spawnSync("bun", [join(ROOT, "scripts/architecture-event.ts"), ...SYNC_CONTRACT_ARGS], {
    cwd,
    encoding: "utf-8",
  });
}

function makeFixture(agentsContent: string): string {
  const cwd = mkdtempSync(join(tmpdir(), "contract-block-"));
  mkdirSync(join(cwd, "apps/web"), { recursive: true });
  writeFileSync(join(cwd, "apps/web/AGENTS.md"), agentsContent);
  return cwd;
}

function runShellSyncEvent(cwd: string, requestFile: string) {
  const event = JSON.stringify({
    functional_block: "apps/web",
    capability_id: "apps-web",
    matched_prefix: "apps/web",
    file_path: "apps/web/routes.ts",
    severity: "medium",
    change_type: "source-change",
    request_file: requestFile,
    ts: "2026-07-06T15:13:43+0800",
    architecture_domain: "apps-web",
    architecture_capability: "web",
    architecture_module: "docs/architecture/modules/apps-web/web.md",
    workstream_dir: "tasks/workstreams/apps-web/web",
    contract_agents: "apps/web/AGENTS.md",
    contract_claude: "apps/web/CLAUDE.md",
    lsp_profile: "typescript-lsp",
  });
  return spawnSync("bash", [SYNC_SCRIPT, "sync-event", "--json", event], {
    cwd,
    encoding: "utf-8",
  });
}

describe("contract block rewrite hardening", () => {
  test("TS sync refuses to rewrite when END marker is missing and leaves files untouched", () => {
    const original = [
      "# Context",
      "",
      "<!-- BEGIN ARCHITECTURE CONTRACT -->",
      "old block without end marker",
      "",
      "Human-owned note after the broken block.",
      "",
    ].join("\n");
    const cwd = makeFixture(original);
    try {
      const res = runSyncContractFiles(cwd);
      expect(res.status).not.toBe(0);
      expect(`${res.stderr}${res.stdout}`).toContain("unbalanced ARCHITECTURE CONTRACT markers");
      expect(readFileSync(join(cwd, "apps/web/AGENTS.md"), "utf-8")).toBe(original);
      expect(existsSync(join(cwd, "apps/web/CLAUDE.md"))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("TS sync refuses duplicate contract blocks", () => {
    const original = [
      "<!-- BEGIN ARCHITECTURE CONTRACT -->",
      "first",
      "<!-- END ARCHITECTURE CONTRACT -->",
      "middle human content",
      "<!-- BEGIN ARCHITECTURE CONTRACT -->",
      "second",
      "<!-- END ARCHITECTURE CONTRACT -->",
      "",
    ].join("\n");
    const cwd = makeFixture(original);
    try {
      const res = runSyncContractFiles(cwd);
      expect(res.status).not.toBe(0);
      expect(readFileSync(join(cwd, "apps/web/AGENTS.md"), "utf-8")).toBe(original);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("TS sync tolerates trailing whitespace on markers without duplicating the block", () => {
    const cwd = makeFixture(
      [
        "# Context",
        "",
        "<!-- BEGIN ARCHITECTURE CONTRACT -->  ",
        "old block",
        "<!-- END ARCHITECTURE CONTRACT -->\t",
        "",
        "Human-owned note.",
        "",
      ].join("\n"),
    );
    try {
      const res = runSyncContractFiles(cwd);
      expect(res.status).toBe(0);
      const agents = readFileSync(join(cwd, "apps/web/AGENTS.md"), "utf-8");
      expect(agents.match(/<!-- BEGIN ARCHITECTURE CONTRACT -->/g)?.length).toBe(1);
      expect(agents).not.toContain("old block");
      expect(agents).toContain("Human-owned note.");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test.each([
    ['missing END', ['intro', '<!-- BEGIN ARCHITECTURE CONTRACT -->', 'old', 'human tail'].join('\n')],
    ['reversed markers', ['<!-- END ARCHITECTURE CONTRACT -->', 'human', '<!-- BEGIN ARCHITECTURE CONTRACT -->'].join('\n')],
    ['balanced markers', ['intro', '<!-- BEGIN ARCHITECTURE CONTRACT -->', 'old', '<!-- END ARCHITECTURE CONTRACT -->', 'outro'].join('\n')],
  ])('observation-only shell sync preserves %s and does not create a sibling contract', (_name, original) => {
    const cwd = makeFixture(original!);
    try {
      const result = runShellSyncEvent(cwd, 'none');
      expect(result.status).toBe(0);
      expect(readFileSync(join(cwd, 'apps/web/AGENTS.md'), 'utf8')).toBe(original!);
      expect(existsSync(join(cwd, 'apps/web/CLAUDE.md'))).toBe(false);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  test("shell observation does not rewrite agent context for an archived request", () => {
    const cwd = mkdtempSync(join(tmpdir(), "context-sync-shell-fallback-"));
    const requestFile = "docs/architecture/requests/apps-web.md";
    try {
      mkdirSync(join(cwd, "apps/web"), { recursive: true });
      mkdirSync(join(cwd, "docs/architecture/requests/archive/2026"), { recursive: true });
      writeFileSync(join(cwd, "apps/web/AGENTS.md"), "# Web Context\n");
      writeFileSync(
        join(cwd, "docs/architecture/requests/archive/2026/apps-web.md"),
        [
          "# Architecture Queue Card: apps-web",
          "",
          "> **Status**: Resolved",
          "",
        ].join("\n"),
      );

      const res = runShellSyncEvent(cwd, requestFile);
      expect(res.status).toBe(0);
      const agents = readFileSync(join(cwd, "apps/web/AGENTS.md"), "utf-8");
      expect(agents).toBe("# Web Context\n");
      expect(agents).not.toContain(`Pending architecture request: \`${requestFile}\``);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);
});
