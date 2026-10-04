import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "..");

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

});
