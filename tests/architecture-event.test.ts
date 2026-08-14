import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import { createHash } from "crypto";

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
  }, 30_000);

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
  }, 30_000);

  test("renders Mermaid-only architecture follow-up without an HTML artifact route", () => {
    const cwd = mkdtempSync(join(tmpdir(), "architecture-event-mermaid-only-"));
    try {
      const requestFile = "docs/architecture/requests/apps-web.md";
      const event = {
        ts: "2026-08-09T23:46:13+0800",
        file_path: "apps/web/routes.ts",
        severity: "high",
        functional_block: "apps/web",
        capability_id: "apps-web",
        matched_prefix: "apps/web",
        architecture_domain: "apps-web",
        architecture_capability: "web",
        architecture_module: "docs/architecture/modules/apps-web/web.md",
        workstream_dir: "tasks/workstreams/apps-web/web",
        contract_agents: "apps/web/AGENTS.md",
        contract_claude: "apps/web/CLAUDE.md",
        change_type: "workflow-surface",
        request_file: requestFile,
        spawn_recommended: true,
        contract_sync_required: true,
      };

      const result = runArchitectureEvent(
        ["upsert-request", "--request-file", requestFile, "--event-json", JSON.stringify(event)],
        cwd,
      );

      expect(result.status).toBe(0);
      const request = readFileSync(join(cwd, requestFile), "utf8");
      expect(request).toContain("Mermaid Markdown is the only architecture diagram artifact");
      expect(request).toContain("external `mermaid` skill only for authoring and review");
      expect(request).not.toContain("architecture HTML");
      expect(request).not.toContain("docs/architecture/diagrams/");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("updates a repeated file only when its semantic routing changes", () => {
    const cwd = mkdtempSync(join(tmpdir(), "architecture-event-semantic-update-"));
    try {
      const requestFile = "docs/architecture/requests/provider.md";
      const event = {
        ts: "2026-08-14T01:00:00+0800",
        file_path: "packages/provider/src/index.ts",
        severity: "low",
        functional_block: "packages/provider",
        capability_id: "provider",
        matched_prefix: "packages/provider",
        architecture_domain: "providers",
        architecture_capability: "provider",
        architecture_module: "docs/architecture/modules/providers/provider.md",
        workstream_dir: "tasks/workstreams/providers/provider",
        contract_agents: "packages/provider/AGENTS.md",
        contract_claude: "packages/provider/CLAUDE.md",
        change_type: "source-change",
        request_file: requestFile,
        spawn_recommended: false,
        contract_sync_required: false,
      };

      const first = runArchitectureEvent(
        ["upsert-request", "--request-file", requestFile, "--event-json", JSON.stringify(event)],
        cwd,
      );
      expect(first.status).toBe(0);
      expect(first.stdout).toBe("changed");
      const firstCard = readFileSync(join(cwd, requestFile), "utf8");
      const firstEventKey = firstCard.match(/"event_key": "([^"]+)"/)?.[1];
      expect(firstEventKey).toMatch(/^sha256:[0-9a-f]{64}$/);

      const changed = {
        ...event,
        event_key: firstEventKey,
        ts: "2026-08-14T02:00:00+0800",
        matched_prefix: "packages/provider/src",
        architecture_module: "docs/architecture/modules/providers/provider-source.md",
      };
      const second = runArchitectureEvent(
        ["upsert-request", "--request-file", requestFile, "--event-json", JSON.stringify(changed)],
        cwd,
      );
      expect(second.status).toBe(0);
      expect(second.stdout).toBe("changed");
      const changedCard = readFileSync(join(cwd, requestFile), "utf8");
      expect(changedCard).toContain("> **Updated**: 2026-08-14T02:00:00+0800");
      expect(changedCard).toContain(
        "> **Architecture Module**: `docs/architecture/modules/providers/provider-source.md`",
      );

      const repeated = runArchitectureEvent(
        [
          "upsert-request",
          "--request-file",
          requestFile,
          "--event-json",
          JSON.stringify({ ...changed, ts: "2026-08-14T03:00:00+0800" }),
        ],
        cwd,
      );
      expect(repeated.status).toBe(0);
      expect(repeated.stdout).toBe("unchanged");
      expect(readFileSync(join(cwd, requestFile), "utf8")).toBe(changedCard);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("keeps a low-severity latest file idempotent under a high-severity card", () => {
    const cwd = mkdtempSync(join(tmpdir(), "architecture-event-mixed-severity-"));
    try {
      const requestFile = "docs/architecture/requests/root.md";
      const base = {
        functional_block: "root",
        capability_id: "root",
        matched_prefix: "root",
        architecture_domain: "root",
        architecture_capability: "_root",
        architecture_module: "docs/architecture/index.md",
        workstream_dir: "tasks/workstreams/root/_root",
        contract_agents: "",
        contract_claude: "",
        request_file: requestFile,
        spawn_recommended: false,
        contract_sync_required: false,
      };
      const high = {
        ...base,
        ts: "2026-08-14T01:00:00+0800",
        file_path: ".ai/harness/policy.json",
        severity: "high",
        change_type: "workflow-surface",
      };
      const low = {
        ...base,
        ts: "2026-08-14T02:00:00+0800",
        file_path: "src/provider.ts",
        severity: "low",
        change_type: "source-change",
      };

      for (const event of [high, low]) {
        const result = runArchitectureEvent(
          ["upsert-request", "--request-file", requestFile, "--event-json", JSON.stringify(event)],
          cwd,
        );
        expect(result.status).toBe(0);
        expect(result.stdout).toBe("changed");
      }
      const cardPath = join(cwd, requestFile);
      const before = readFileSync(cardPath, "utf8");
      expect(before).toContain("> **Severity**: high");
      const eventFieldsMatch = before.match(/## Event Fields\s*```json\s*([\s\S]*?)\s*```/);
      expect(eventFieldsMatch).not.toBeNull();
      const eventFields = JSON.parse(eventFieldsMatch![1]);
      expect(eventFields.severity).toBe("low");
      const semanticFields = {
        file_path: low.file_path,
        severity: low.severity,
        functional_block: low.functional_block,
        capability_id: low.capability_id,
        matched_prefix: low.matched_prefix,
        architecture_domain: low.architecture_domain,
        architecture_capability: low.architecture_capability,
        architecture_module: low.architecture_module,
        workstream_dir: low.workstream_dir,
        contract_agents: low.contract_agents,
        contract_claude: low.contract_claude,
        change_type: low.change_type,
        spawn_recommended: low.spawn_recommended,
        contract_sync_required: low.contract_sync_required,
      };
      expect(eventFields.event_key).toBe(
        `sha256:${createHash("sha256").update(JSON.stringify(semanticFields)).digest("hex")}`,
      );

      const repeated = runArchitectureEvent(
        [
          "upsert-request",
          "--request-file",
          requestFile,
          "--event-json",
          JSON.stringify({ ...low, ts: "2026-08-14T03:00:00+0800" }),
        ],
        cwd,
      );
      expect(repeated.status).toBe(0);
      expect(repeated.stdout).toBe("unchanged");
      expect(readFileSync(cardPath, "utf8")).toBe(before);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("keeps alternating prefixes of one capability independently idempotent", () => {
    const cwd = mkdtempSync(join(tmpdir(), "architecture-event-multi-prefix-"));
    try {
      const requestFile = "docs/architecture/requests/provider.md";
      const base = {
        severity: "low",
        functional_block: "packages/providers/hyperliquid",
        capability_id: "provider-hyperliquid",
        architecture_domain: "providers",
        architecture_capability: "hyperliquid",
        architecture_module: "docs/architecture/modules/providers/hyperliquid.md",
        workstream_dir: "tasks/workstreams/providers/hyperliquid",
        contract_agents: "packages/providers/hyperliquid/AGENTS.md",
        contract_claude: "packages/providers/hyperliquid/CLAUDE.md",
        change_type: "source-change",
        request_file: requestFile,
        spawn_recommended: false,
        contract_sync_required: false,
      };
      const first = {
        ...base,
        ts: "2026-08-14T01:00:00+0800",
        file_path: "packages/providers/hyperliquid/src/l1.ts",
        matched_prefix: "packages/providers/hyperliquid",
      };
      const second = {
        ...base,
        ts: "2026-08-14T02:00:00+0800",
        file_path: "packages/providers/hyperliquid/src/spot/orders.ts",
        matched_prefix: "packages/providers/hyperliquid/src/spot",
      };

      for (const event of [first, second]) {
        const result = runArchitectureEvent(
          ["upsert-request", "--request-file", requestFile, "--event-json", JSON.stringify(event)],
          cwd,
        );
        expect(result.status).toBe(0);
        expect(result.stdout).toBe("changed");
      }
      const cardPath = join(cwd, requestFile);
      const before = readFileSync(cardPath, "utf8");

      for (const event of [
        { ...first, ts: "2026-08-14T03:00:00+0800" },
        { ...second, ts: "2026-08-14T04:00:00+0800" },
      ]) {
        const repeated = runArchitectureEvent(
          ["upsert-request", "--request-file", requestFile, "--event-json", JSON.stringify(event)],
          cwd,
        );
        expect(repeated.status).toBe(0);
        expect(repeated.stdout).toBe("unchanged");
        expect(readFileSync(cardPath, "utf8")).toBe(before);
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("fails closed on malformed or forged card authority and reopens a non-Pending card", () => {
    const cwd = mkdtempSync(join(tmpdir(), "architecture-event-authority-"));
    try {
      const requestFile = "docs/architecture/requests/root.md";
      const event = {
        ts: "2026-08-14T01:00:00+0800",
        file_path: "src/authority.ts",
        severity: "low",
        functional_block: "root",
        capability_id: "root",
        matched_prefix: "root",
        architecture_domain: "root",
        architecture_capability: "_root",
        architecture_module: "docs/architecture/index.md",
        workstream_dir: "tasks/workstreams/root/_root",
        contract_agents: "",
        contract_claude: "",
        change_type: "source-change",
        request_file: requestFile,
        spawn_recommended: false,
        contract_sync_required: false,
      };
      const args = ["upsert-request", "--request-file", requestFile, "--event-json", JSON.stringify(event)];
      expect(runArchitectureEvent(args, cwd).status).toBe(0);
      const cardPath = join(cwd, requestFile);
      const canonical = readFileSync(cardPath, "utf8");

      writeFileSync(cardPath, canonical.replace(/"event_key": "sha256:[0-9a-f]{64}"/, '"event_key": "sha256:forged"'));
      expect(runArchitectureEvent(args, cwd).status).toBe(1);

      writeFileSync(cardPath, canonical.replace(/## Event Fields\s*```json[\s\S]*?```/, "## Event Fields\n\n```json\n{}\n```"));
      expect(runArchitectureEvent(args, cwd).status).toBe(1);

      writeFileSync(cardPath, canonical.replace("> **Status**: Pending", "> **Status**: Resolved"));
      const reopened = runArchitectureEvent(args, cwd);
      expect(reopened.status, reopened.stderr).toBe(0);
      expect(reopened.stdout).toBe("changed");
      expect(readFileSync(cardPath, "utf8")).toContain("> **Status**: Pending");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

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
  }, 30_000);

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
      expect(agents).not.toContain("Latest human diagram");
      expect(agents).not.toContain("docs/architecture/diagrams/20260527-apps-web.html");
      expect(agents).toContain("current_slice: Shell reduction");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

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
  }, 30_000);
});
