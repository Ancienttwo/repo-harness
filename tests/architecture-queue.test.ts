import { describe, expect, test } from "bun:test";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawn, spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "..");

function run(cmd: string, args: string[], cwd: string, env?: Record<string, string>) {
  return spawnSync(cmd, args, { cwd, encoding: "utf-8", env: { ...process.env, ...env } });
}

function queueAsync(cwd: string, file: string): Promise<number | null> {
  return new Promise((resolve) => {
    const child = spawn("bash", ["scripts/architecture-queue.sh", "record", "--file", file], { cwd });
    child.on("exit", resolve);
  });
}

function tmpRepo(fn: (cwd: string) => void): void {
  const cwd = mkdtempSync(join(tmpdir(), "architecture-queue-"));
  try {
    mkdirSync(join(cwd, "scripts"), { recursive: true });
    mkdirSync(join(cwd, "docs/architecture/requests"), { recursive: true });
    mkdirSync(join(cwd, ".ai/harness/architecture"), { recursive: true });
    for (const file of ["architecture-queue.sh", "architecture-event.ts", "archive-architecture-request.sh"]) {
      copyFileSync(join(ROOT, "scripts", file), join(cwd, "scripts", file));
    }
    expect(run("chmod", ["+x", "scripts/architecture-queue.sh", "scripts/archive-architecture-request.sh"], cwd).status).toBe(0);
    writeFileSync(
      join(cwd, "docs/architecture/index.md"),
      [
        "# Architecture Index",
        "",
        "## Pending Requests",
        "",
        "- [ ] stale duplicate -> [old](requests/old.md)",
        "",
        "## Review Backlog",
        "",
        "- Human-owned backlog note.",
        "",
      ].join("\n"),
    );
    fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function queue(cwd: string, args: string[]) {
  return run("bash", ["scripts/architecture-queue.sh", ...args], cwd);
}

function writeLegacyRequest(
  cwd: string,
  fileName: string,
  capabilityId: string,
  filePath: string,
  severity = "high",
  detected = "2026-05-28T12:00:00+0800",
) {
  writeFileSync(
    join(cwd, "docs/architecture/requests", fileName),
    [
      `# Architecture Drift Request: ${fileName.replace(/\\.md$/, "")}`,
      "",
      "> **Status**: Pending",
      `> **Detected**: ${detected}`,
      `> **Severity**: ${severity}`,
      "> **Change Type**: workflow-surface",
      `> **File**: \`${filePath}\``,
      "> **Functional Block**: `root`",
      `> **Capability ID**: \`${capabilityId}\``,
      "> **Matched Prefix**: `root`",
      "> **Architecture Domain**: `root`",
      "> **Architecture Capability**: `_root`",
      "> **Architecture Module**: `docs/architecture/index.md`",
      "> **Workstream Directory**: `tasks/workstreams/root/_root`",
      "> **Contract Files**: `none`, `none`",
      "> **Contract Sync Required**: false",
      "> **Spawn Recommended**: true",
      "",
      "## Event Fields",
      "",
      "```json",
      JSON.stringify(
        {
          ts: detected,
          file_path: filePath,
          severity,
          functional_block: "root",
          capability_id: capabilityId,
          matched_prefix: "root",
          architecture_domain: "root",
          architecture_capability: "_root",
          architecture_module: "docs/architecture/index.md",
          workstream_dir: "tasks/workstreams/root/_root",
          contract_agents: "",
          contract_claude: "",
          change_type: "workflow-surface",
          request_file: `docs/architecture/requests/${capabilityId}.md`,
          spawn_recommended: true,
          contract_sync_required: false,
        },
        null,
        2,
      ),
      "```",
      "",
    ].join("\n"),
  );
}

describe("architecture queue", () => {
  test("record merges repeated events into one derived queue card and index line", () => {
    tmpRepo((cwd) => {
      const first = queue(cwd, ["record", "--file", "src/cli/hook/mutation-guard.ts"]);
      expect(first.status).toBe(0);
      expect(first.stdout).toContain("[ArchitectureDrift] Request: docs/architecture/requests/root.md");

      const second = queue(cwd, ["record", "--file", "src/cli/hook/prompt-handler.ts"]);
      expect(second.status).toBe(0);

      const requests = readdirSync(join(cwd, "docs/architecture/requests")).filter((name) => name.endsWith(".md"));
      expect(requests).toEqual(["root.md"]);
      const card = readFileSync(join(cwd, "docs/architecture/requests/root.md"), "utf-8");
      expect(card).toContain("> **Open Edits**: 2");
      expect(card).toContain("`src/cli/hook/mutation-guard.ts`");
      expect(card).toContain("`src/cli/hook/prompt-handler.ts`");

      const index = readFileSync(join(cwd, "docs/architecture/index.md"), "utf-8");
      expect(index).toContain("<!-- BEGIN ARCHITECTURE PENDING REQUESTS -->");
      expect(index).toContain("[root](requests/root.md)");
      expect(index).toContain("Human-owned backlog note.");
      expect(queue(cwd, ["reindex", "--check"]).status).toBe(0);
    });
  }, 30_000);

  test("record is byte-idempotent when Stop observes the same pending file again", () => {
    tmpRepo((cwd) => {
      const target = "src/cli/hook/mutation-guard.ts";
      const first = queue(cwd, ["record", "--file", target]);
      expect(first.status, `${first.stdout}\n${first.stderr}`).toBe(0);
      expect(first.stdout).toContain("[ArchitectureDrift] Request: docs/architecture/requests/root.md");

      const requestPath = join(cwd, "docs/architecture/requests/root.md");
      const indexPath = join(cwd, "docs/architecture/index.md");
      const eventsPath = join(cwd, ".ai/harness/architecture/events.jsonl");
      const before = {
        request: readFileSync(requestPath, "utf8"),
        index: readFileSync(indexPath, "utf8"),
        events: readFileSync(eventsPath, "utf8"),
      };

      const second = queue(cwd, ["record", "--file", target]);
      expect(second.status, `${second.stdout}\n${second.stderr}`).toBe(0);
      expect(second.stdout).toContain(
        `[ArchitectureDrift] No architecture drift update for ${target} (unchanged request).`,
      );
      expect(second.stdout).toContain("[ArchitectureDrift] Request: docs/architecture/requests/root.md");
      expect(second.stdout).toContain("spawn_recommended=true");
      expect(readFileSync(requestPath, "utf8")).toBe(before.request);
      expect(readFileSync(indexPath, "utf8")).toBe(before.index);
      expect(readFileSync(eventsPath, "utf8")).toBe(before.events);

      const other = queue(cwd, ["record", "--file", "src/cli/hook/prompt-handler.ts"]);
      expect(other.status, `${other.stdout}\n${other.stderr}`).toBe(0);
      const afterOther = {
        request: readFileSync(requestPath, "utf8"),
        index: readFileSync(indexPath, "utf8"),
        events: readFileSync(eventsPath, "utf8"),
      };

      const repeatedOlder = queue(cwd, ["record", "--file", target]);
      expect(repeatedOlder.status, `${repeatedOlder.stdout}\n${repeatedOlder.stderr}`).toBe(0);
      expect(repeatedOlder.stdout).toContain("(unchanged request).");
      expect(readFileSync(requestPath, "utf8")).toBe(afterOther.request);
      expect(readFileSync(indexPath, "utf8")).toBe(afterOther.index);
      expect(readFileSync(eventsPath, "utf8")).toBe(afterOther.events);

      writeFileSync(indexPath, afterOther.index.replace("[root](requests/root.md)", "[stale](requests/stale.md)"));
      const selfHeal = queue(cwd, ["record", "--file", target]);
      expect(selfHeal.status, `${selfHeal.stdout}\n${selfHeal.stderr}`).toBe(0);
      expect(selfHeal.stdout).toContain("(unchanged request).");
      expect(readFileSync(requestPath, "utf8")).toBe(afterOther.request);
      expect(readFileSync(indexPath, "utf8")).toBe(afterOther.index);
      expect(readFileSync(eventsPath, "utf8")).toBe(afterOther.events);
    });
  }, 30_000);

  test("record repairs a card-write interruption without duplicating the audit event", () => {
    tmpRepo((cwd) => {
      const target = "src/cli/hook/mutation-guard.ts";
      const failed = run(
        "bash",
        ["scripts/architecture-queue.sh", "record", "--file", target],
        cwd,
        { REPO_HARNESS_ARCHITECTURE_FAIL_AFTER_EVENT: "1" },
      );
      expect(failed.status).toBe(1);
      expect(existsSync(join(cwd, "docs/architecture/requests/root.md"))).toBe(false);
      expect(readFileSync(join(cwd, ".ai/harness/architecture/events.jsonl"), "utf8").trim().split("\n")).toHaveLength(1);

      const retried = queue(cwd, ["record", "--file", target]);
      expect(retried.status, retried.stderr).toBe(0);
      expect(readFileSync(join(cwd, ".ai/harness/architecture/events.jsonl"), "utf8").trim().split("\n")).toHaveLength(1);
      expect(readFileSync(join(cwd, "docs/architecture/requests/root.md"), "utf8")).toContain(`\`${target}\``);
    });
  }, 30_000);

  test("record serializes concurrent events without losing a card entry", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "architecture-queue-concurrent-"));
    try {
      mkdirSync(join(cwd, "scripts"), { recursive: true });
      mkdirSync(join(cwd, "docs/architecture/requests"), { recursive: true });
      mkdirSync(join(cwd, ".ai/harness/architecture"), { recursive: true });
      for (const file of ["architecture-queue.sh", "architecture-event.ts", "archive-architecture-request.sh"]) {
        copyFileSync(join(ROOT, "scripts", file), join(cwd, "scripts", file));
      }
      writeFileSync(join(cwd, "docs/architecture/index.md"), "# Architecture Index\n\n## Pending Requests\n");
      const [first, second] = await Promise.all([
        queueAsync(cwd, "src/cli/hook/concurrent-a.ts"),
        queueAsync(cwd, "src/cli/hook/concurrent-b.ts"),
      ]);
      expect([first, second]).toEqual([0, 0]);
      const card = readFileSync(join(cwd, "docs/architecture/requests/root.md"), "utf8");
      expect(card).toContain("src/cli/hook/concurrent-a.ts");
      expect(card).toContain("src/cli/hook/concurrent-b.ts");
      expect(readFileSync(join(cwd, ".ai/harness/architecture/events.jsonl"), "utf8").trim().split("\n")).toHaveLength(2);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("record refuses symlink write targets outside the repository", () => {
    tmpRepo((cwd) => {
      const outside = join(tmpdir(), `architecture-outside-${process.pid}-${Date.now()}`);
      writeFileSync(outside, "sentinel\n");
      const targets = [
        "docs/architecture/requests/root.md",
        ".ai/harness/architecture/events.jsonl",
        "docs/architecture/index.md",
      ];
      for (const target of targets) {
        const full = join(cwd, target);
        rmSync(full, { force: true });
        symlinkSync(outside, full);
        const result = queue(cwd, ["record", "--file", "src/cli/hook/symlink-escape.ts"]);
        expect(result.status).toBe(1);
        expect(readFileSync(outside, "utf8")).toBe("sentinel\n");
        rmSync(full, { force: true });
        if (target === "docs/architecture/index.md") writeFileSync(full, "# Architecture Index\n\n## Pending Requests\n");
      }
      rmSync(outside, { force: true });
    });
  }, 30_000);

  test("record preserves pipe paths and keeps canonical per-file severities", () => {
    tmpRepo((cwd) => {
      for (const target of [".ai/harness/policy.json", "src/cli/hook/low.ts", "src/cli/hook/a|b.ts"]) {
        const result = queue(cwd, ["record", "--file", target]);
        expect(result.status, result.stderr).toBe(0);
      }
      const repeated = queue(cwd, ["record", "--file", "src/cli/hook/a|b.ts"]);
      expect(repeated.status, repeated.stderr).toBe(0);
      expect(repeated.stdout).toContain("(unchanged request)");
      const card = readFileSync(join(cwd, "docs/architecture/requests/root.md"), "utf8");
      expect(card).toContain("src/cli/hook/a\\|b.ts");
      const records = JSON.parse(card.match(/## Event Records\s*```json\s*([\s\S]*?)\s*```/)![1]);
      expect(records.find((event: any) => event.file_path === "src/cli/hook/low.ts").severity).toBe("high");
      expect(records.find((event: any) => event.file_path === "src/cli/hook/a|b.ts").severity).toBe("high");
    });
  }, 30_000);

  test("record routes nested workspace source through the longest-prefix capability", () => {
    tmpRepo((cwd) => {
      mkdirSync(join(cwd, "packages/providers/hyperliquid/src"), { recursive: true });
      mkdirSync(join(cwd, ".ai/context"), { recursive: true });
      copyFileSync(
        join(ROOT, "assets/templates/helpers/capability-resolver.ts"),
        join(cwd, "scripts/capability-resolver.ts"),
      );
      writeFileSync(
        join(cwd, ".ai/context/capabilities.json"),
        `${JSON.stringify({
          version: 1,
          capabilities: [
            {
              id: "provider-hyperliquid",
              domain: "providers",
              name: "hyperliquid",
              prefixes: ["packages/providers/hyperliquid"],
              contract_files: {
                agents: "AGENTS.md",
                claude: "CLAUDE.md",
              },
              architecture_module: "docs/architecture/modules/providers/hyperliquid.md",
              workstream_dir: "tasks/workstreams/providers/hyperliquid",
              lsp_profile: "typescript-lsp",
              verification_hints: ["bun test"],
            },
          ],
        }, null, 2)}\n`,
      );

      const result = queue(cwd, [
        "record",
        "--file",
        "packages/providers/hyperliquid/src/l1-lifecycle-evidence.ts",
      ]);

      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      expect(result.stdout).toContain(
        "[ArchitectureDrift] Request: docs/architecture/requests/provider-hyperliquid.md",
      );
      expect(result.stdout).toContain("severity=low capability_id=provider-hyperliquid");
      expect(existsSync(join(cwd, "docs/architecture/requests/root.md"))).toBe(false);
      const card = readFileSync(
        join(cwd, "docs/architecture/requests/provider-hyperliquid.md"),
        "utf-8",
      );
      expect(card).toContain("> **Matched Prefix**: `packages/providers/hyperliquid`");
      expect(card).toContain(
        "> **Architecture Module**: `docs/architecture/modules/providers/hyperliquid.md`",
      );
      expect(card).toContain(
        "`packages/providers/hyperliquid/src/l1-lifecycle-evidence.ts`",
      );

      const unmatched = queue(cwd, [
        "record",
        "--file",
        "packages/providers/unregistered/src/source.ts",
      ]);
      expect(unmatched.status).toBe(0);
      expect(unmatched.stdout).toContain(
        "No architecture drift request for packages/providers/unregistered/src/source.ts (unrelated)",
      );
      expect(existsSync(join(cwd, "docs/architecture/requests/root.md"))).toBe(false);
    });
  }, 30_000);

  test("record preserves advisory skip before resolver failure for classified paths", () => {
    tmpRepo((cwd) => {
      rmSync(join(cwd, "scripts/architecture-event.ts"));
      mkdirSync(join(cwd, ".ai/context"), { recursive: true });
      copyFileSync(
        join(ROOT, "assets/templates/helpers/capability-resolver.ts"),
        join(cwd, "scripts/capability-resolver.ts"),
      );
      writeFileSync(join(cwd, ".ai/context/capabilities.json"), "not-json\n");

      const result = queue(cwd, ["record", "--file", "src/cli/hook/mutation-guard.ts"]);

      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      expect(result.stdout).toContain(
        "architecture-event helper is required to record src/cli/hook/mutation-guard.ts; skipping advisory queue update",
      );
      expect(result.stderr).toBe("");
    });
  }, 30_000);

  test("reindex self-heals stale loose pending lines and is idempotent", () => {
    tmpRepo((cwd) => {
      expect(queue(cwd, ["record", "--file", "src/cli/hook/mutation-guard.ts"]).status).toBe(0);
      const indexPath = join(cwd, "docs/architecture/index.md");
      writeFileSync(
        indexPath,
        `${readFileSync(indexPath, "utf-8")}\n- [ ] 2026 stale -> [duplicate](requests/duplicate.md)\n`,
      );
      expect(queue(cwd, ["reindex", "--check"]).status).toBe(1);
      expect(queue(cwd, ["reindex"]).status).toBe(0);
      expect(queue(cwd, ["reindex", "--check"]).status).toBe(0);
      const index = readFileSync(indexPath, "utf-8");
      expect(index).not.toContain("duplicate.md");
    });
  }, 30_000);

  test("triage collapses cutoff legacy requests into capability cards and archives the originals", () => {
    tmpRepo((cwd) => {
      writeLegacyRequest(cwd, "20260528-120000-root-a.md", "root", "package.json", "medium");
      writeLegacyRequest(cwd, "20260528-120100-runtime-a.md", "runtime-harness-hook-adapters", ".ai/hooks/prompt-guard.sh");
      writeLegacyRequest(cwd, "20260602-120000-new.md", "root", "turbo.json", "medium", "2026-06-02T12:00:00+0800");

      const res = queue(cwd, ["triage", "--before", "2026-06-01"]);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("triaged=2");

      expect(existsSync(join(cwd, "docs/architecture/requests/root.md"))).toBe(true);
      expect(existsSync(join(cwd, "docs/architecture/requests/runtime-harness-hook-adapters.md"))).toBe(true);
      expect(existsSync(join(cwd, "docs/architecture/requests/20260602-120000-new.md"))).toBe(true);
      const archived = readdirSync(join(cwd, "docs/architecture/requests/archive", String(new Date().getFullYear())));
      expect(archived).toContain("20260528-120000-root-a.md");
      expect(archived).toContain("20260528-120100-runtime-a.md");
      expect(queue(cwd, ["reindex", "--check"]).status).toBe(0);
    });
  }, 30_000);

  test("gate modes are advisory by default and strict blocks pending requests", () => {
    tmpRepo((cwd) => {
      expect(queue(cwd, ["record", "--file", "src/cli/hook/mutation-guard.ts"]).status).toBe(0);
      mkdirSync(join(cwd, ".ai/harness"), { recursive: true });
      writeFileSync(
        join(cwd, ".ai/harness/policy.json"),
        JSON.stringify({ architecture: { freshness_gate: "advisory", gate_min_severity: "medium" } }, null, 2),
      );
      expect(queue(cwd, ["status", "--gate", "--format", "summary"]).status).toBe(0);
      writeFileSync(
        join(cwd, ".ai/harness/policy.json"),
        JSON.stringify({ architecture: { freshness_gate: "strict", gate_min_severity: "medium" } }, null, 2),
      );
      expect(queue(cwd, ["status", "--gate", "--format", "summary"]).status).toBe(1);
    });
  }, 30_000);

  test("archive roundtrip leaves an empty derived pending block", () => {
    tmpRepo((cwd) => {
      expect(queue(cwd, ["record", "--file", ".ai/hooks/pre-edit-guard.sh"]).status).toBe(0);
      const archive = run(
        "bash",
        ["scripts/archive-architecture-request.sh", "--request", "docs/architecture/requests/root.md", "--status", "no-change"],
        cwd,
      );
      expect(archive.stderr).toBe("");
      expect(archive.status).toBe(0);
      expect(queue(cwd, ["reindex"]).status).toBe(0);
      const index = readFileSync(join(cwd, "docs/architecture/index.md"), "utf-8");
      expect(index).toContain("<!-- BEGIN ARCHITECTURE PENDING REQUESTS -->\n- (none)\n<!-- END ARCHITECTURE PENDING REQUESTS -->");
      expect(queue(cwd, ["reindex", "--check"]).status).toBe(0);
    });
  }, 30_000);
});
