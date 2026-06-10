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

// Run the real replace_contract_block function extracted from
// context-contract-sync.sh against a source file, returning {status, output}.
function runShellReplace(sourceContent: string): { status: number | null; output: string | null; stderr: string } {
  const dir = mkdtempSync(join(tmpdir(), "replace-block-"));
  try {
    const src = join(dir, "source.md");
    const out = join(dir, "out.md");
    const block = join(dir, "block.md");
    writeFileSync(src, sourceContent);
    writeFileSync(
      block,
      ["<!-- BEGIN ARCHITECTURE CONTRACT -->", "NEW BLOCK", "<!-- END ARCHITECTURE CONTRACT -->", ""].join("\n"),
    );
    const script = [
      `fn_src="$(sed -n '/^replace_contract_block() {/,/^}$/p' "$1")"`,
      `[ -n "$fn_src" ] || { echo "failed to extract function" >&2; exit 99; }`,
      `eval "$fn_src"`,
      `replace_contract_block "$2" "$3" "$4"`,
    ].join("\n");
    const res = spawnSync("bash", ["-c", script, "_", SYNC_SCRIPT, src, out, block], { encoding: "utf-8" });
    return {
      status: res.status,
      output: existsSync(out) && res.status === 0 ? readFileSync(out, "utf-8") : null,
      stderr: res.stderr,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
  });

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
  });

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
  });

  test("shell replace_contract_block aborts on missing END marker instead of eating content to EOF", () => {
    const res = runShellReplace(
      ["intro", "<!-- BEGIN ARCHITECTURE CONTRACT -->", "old", "", "tail content that must survive", ""].join("\n"),
    );
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("unbalanced ARCHITECTURE CONTRACT markers");
  });

  test("shell replace_contract_block aborts when END precedes BEGIN", () => {
    const res = runShellReplace(
      ["<!-- END ARCHITECTURE CONTRACT -->", "x", "<!-- BEGIN ARCHITECTURE CONTRACT -->", ""].join("\n"),
    );
    expect(res.status).not.toBe(0);
  });

  test("shell replace_contract_block replaces balanced block and keeps surrounding content", () => {
    const res = runShellReplace(
      [
        "intro",
        "<!-- BEGIN ARCHITECTURE CONTRACT -->   ",
        "old",
        "<!-- END ARCHITECTURE CONTRACT -->",
        "outro",
        "",
      ].join("\n"),
    );
    expect(res.status).toBe(0);
    expect(res.output).toContain("intro");
    expect(res.output).toContain("NEW BLOCK");
    expect(res.output).toContain("outro");
    expect(res.output).not.toContain("old\n");
    expect(res.output?.match(/<!-- BEGIN ARCHITECTURE CONTRACT -->/g)?.length).toBe(1);
  });
});
