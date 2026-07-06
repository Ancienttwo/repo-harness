import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "..");

function runArchitectureEvent(args: string[], cwd = ROOT, input = "") {
  return spawnSync("bun", [join(ROOT, "scripts/architecture-event.ts"), ...args], {
    cwd,
    input,
    encoding: "utf-8",
  });
}

describe("architecture-event helper", () => {
  test("normalizes shell-adapter JSON, path, token, and scope fields", () => {
    const payload = JSON.stringify({
      matched: true,
      functional_block: "apps/web/src/routes/account",
    });

    const json = runArchitectureEvent(["json-get", "--key", "functional_block", "--json", payload]);
    expect(json.status).toBe(0);
    expect(json.stdout).toBe("apps/web/src/routes/account");

    const token = runArchitectureEvent(["safe-token", "--value", "Apps/Web: Account"]);
    expect(token.status).toBe(0);
    expect(token.stdout).toBe("apps-web-account");

    const path = runArchitectureEvent(["repo-path", "--repo", ROOT, "--path", `${ROOT}/scripts/architecture-queue.sh`]);
    expect(path.status).toBe(0);
    expect(path.stdout).toBe("scripts/architecture-queue.sh");

    const scope = runArchitectureEvent(["derive-scope", "--block", "apps/web/src/routes/account"]);
    expect(scope.status).toBe(0);
    expect(scope.stdout.trim().split("\n")).toEqual([
      "apps-web",
      "account",
      "docs/architecture/modules/apps-web/account.md",
      "tasks/workstreams/apps-web/account",
    ]);
  });

  test("builds architecture event JSON without shell string escaping", () => {
    const res = runArchitectureEvent([
      "event-json",
      "--ts",
      "2026-05-27T03:00:00+0800",
      "--file-path",
      'apps/web/src/routes/account/"page".tsx',
      "--severity",
      "medium",
      "--functional-block",
      "apps/web/src/routes/account",
      "--capability-id",
      "apps-web-account",
      "--matched-prefix",
      "apps/web/src/routes/account",
      "--architecture-domain",
      "apps-web",
      "--architecture-capability",
      "account",
      "--architecture-module",
      "docs/architecture/modules/apps-web/account.md",
      "--workstream-dir",
      "tasks/workstreams/apps-web/account",
      "--contract-agents",
      "apps/web/src/routes/account/AGENTS.md",
      "--contract-claude",
      "apps/web/src/routes/account/CLAUDE.md",
      "--change-type",
      "boundary-or-config",
      "--request-file",
      "docs/architecture/requests/request.md",
      "--spawn-recommended",
      "false",
      "--contract-sync-required",
      "true",
    ]);

    expect(res.status).toBe(0);
    const event = JSON.parse(res.stdout);
    expect(event.file_path).toBe('apps/web/src/routes/account/"page".tsx');
    expect(event.spawn_recommended).toBe(false);
    expect(event.contract_sync_required).toBe(true);
  });

  test("updates context-map discoverable contexts idempotently", () => {
    const cwd = mkdtempSync(join(tmpdir(), "architecture-event-context-map-"));
    try {
      const args = [
        "sync-context-map",
        "--context-map",
        ".ai/context/context-map.json",
        "--block",
        "apps/web",
        "--capability-id",
        "apps-web",
        "--contract-agents",
        "apps/web/AGENTS.md",
        "--contract-claude",
        "apps/web/CLAUDE.md",
        "--architecture-domain",
        "apps-web",
        "--architecture-capability",
        "web",
        "--lsp-profile",
        "typescript-lsp",
      ];

      expect(runArchitectureEvent(args, cwd).status).toBe(0);
      expect(runArchitectureEvent(args, cwd).status).toBe(0);
      expect(existsSync(join(cwd, ".ai/context/context-map.json"))).toBe(true);

      const contextMap = JSON.parse(readFileSync(join(cwd, ".ai/context/context-map.json"), "utf-8"));
      expect(contextMap.discoverable_contexts.map((entry: { path: string }) => entry.path)).toEqual([
        "apps/web/CLAUDE.md",
        "apps/web/AGENTS.md",
      ]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("syncs architecture contract blocks without shell rendering", () => {
    const cwd = mkdtempSync(join(tmpdir(), "architecture-event-contract-files-"));
    try {
      mkdirSync(join(cwd, "apps/web"), { recursive: true });
      mkdirSync(join(cwd, "docs/architecture/snapshots"), { recursive: true });
      mkdirSync(join(cwd, "docs/architecture/diagrams"), { recursive: true });
      mkdirSync(join(cwd, "tasks/workstreams/apps-web/web"), { recursive: true });

      writeFileSync(
        join(cwd, "apps/web/AGENTS.md"),
        [
          "# Web Context",
          "",
          "<!-- BEGIN ARCHITECTURE CONTRACT -->",
          "old block",
          "<!-- END ARCHITECTURE CONTRACT -->",
          "",
          "Human-owned note.",
          "",
        ].join("\n")
      );
      writeFileSync(join(cwd, "docs/architecture/snapshots/20260527-apps-web.md"), "# Snapshot\n");
      writeFileSync(join(cwd, "docs/architecture/diagrams/20260527-apps-web.html"), "<html></html>\n");
      writeFileSync(
        join(cwd, "tasks/workstreams/apps-web/web/current.md"),
        [
          "# Workstream",
          "",
          "> **Status**: Active",
          "> **Current Slice**: Shell reduction",
          "> **Source Plan**: ad-hoc",
          "",
        ].join("\n")
      );

      const res = runArchitectureEvent(
        [
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
        ],
        cwd
      );

      expect(res.status).toBe(0);
      const agents = readFileSync(join(cwd, "apps/web/AGENTS.md"), "utf-8");
      const claude = readFileSync(join(cwd, "apps/web/CLAUDE.md"), "utf-8");
      expect(agents).toBe(claude);
      expect(agents).not.toContain("old block");
      expect(agents).toContain("Human-owned note.");
      expect(agents).toContain("Capability ID: `apps-web`");
      expect(agents).toContain("Latest snapshot: `docs/architecture/snapshots/20260527-apps-web.md`");
      expect(agents).toContain("Semantic diagram source: `docs/architecture/snapshots/20260527-apps-web.md`");
      expect(agents).toContain("Latest human diagram: `docs/architecture/diagrams/20260527-apps-web.html`");
      expect(agents).toContain("current_slice: Shell reduction");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("syncs pending architecture request only when the card is active and pending", () => {
    const cwd = mkdtempSync(join(tmpdir(), "architecture-event-pending-request-"));
    const requestPath = "docs/architecture/requests/apps-web.md";
    const archivedRequestPath = "docs/architecture/requests/archive/2026/apps-web.md";
    const args = [
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
      "2026-07-06T15:13:43+0800",
      "--file-path",
      "apps/web/routes.ts",
      "--severity",
      "medium",
      "--change-type",
      "source-change",
      "--request-file",
      requestPath,
      "--lsp-profile",
      "typescript-lsp",
    ];

    try {
      mkdirSync(join(cwd, "apps/web"), { recursive: true });
      mkdirSync(join(cwd, "docs/architecture/requests/archive/2026"), { recursive: true });
      writeFileSync(join(cwd, "apps/web/AGENTS.md"), "# Web Context\n");
      writeFileSync(
        join(cwd, requestPath),
        [
          "# Architecture Queue Card: apps-web",
          "",
          "> **Status**: Pending",
          "> **Updated**: 2026-07-06T15:13:43+0800",
          "",
        ].join("\n"),
      );

      const pending = runArchitectureEvent(args, cwd);
      expect(pending.status).toBe(0);
      let agents = readFileSync(join(cwd, "apps/web/AGENTS.md"), "utf-8");
      expect(agents).toContain(`Pending architecture request: \`${requestPath}\``);

      renameSync(join(cwd, requestPath), join(cwd, archivedRequestPath));
      const archived = runArchitectureEvent(args, cwd);
      expect(archived.status).toBe(0);
      agents = readFileSync(join(cwd, "apps/web/AGENTS.md"), "utf-8");
      expect(agents).toContain("Pending architecture request: `(none)`");
      expect(agents).not.toContain(`Pending architecture request: \`${requestPath}\``);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
