import { describe, expect, test } from "bun:test";
import { spawnSync } from "child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import {
  GITIGNORE_MANAGED_BLOCK_CONTENT,
  gitignoreManagedBlockOperation,
  ignoreBlockProof,
  RUNTIME_STATE_IGNORE_CONTENT,
  RUNTIME_STATE_IGNORE_MARKER,
  removeRuntimeStateIgnoreBlock,
  runtimeStateIgnoreOperation,
  userExcludesFilePath,
} from "../../src/effects/adoption/gitignore-plan";
import { upsertManagedBlock } from "../../src/core/adoption/managed-block";

// A repository root without files: no retired runtime rule is kept.
const ABSENT_REPO = join(tmpdir(), "gitignore-plan-absent-repo");

describe("gitignore managed block .repo-harness rule", () => {
  test("a relocated package reads the asset and a missing asset cannot write a fallback", () => {
    const root = join(import.meta.dir, "../..");
    const cwd = mkdtempSync(join(tmpdir(), "gitignore-package-"));
    try {
      // The TypeScript reader imports the upgrade inventory, so the relocated package carries src/ and assets/ whole.
      for (const path of ["src", "assets"]) cpSync(join(root, path), join(cwd, path), { recursive: true });
      const emitted = spawnSync(process.execPath, ["-e", 'import { GITIGNORE_MANAGED_BLOCK_CONTENT } from "./src/effects/adoption/gitignore-plan.ts"; process.stdout.write(GITIGNORE_MANAGED_BLOCK_CONTENT)'], { cwd, encoding: "utf8" });
      expect(emitted.status).toBe(0);
      expect(emitted.stdout).toBe(GITIGNORE_MANAGED_BLOCK_CONTENT);
      rmSync(join(cwd, "assets/templates/runtime.gitignore"));
      const missing = spawnSync(process.execPath, ["-e", 'import "./src/effects/adoption/gitignore-plan.ts"'], { cwd, encoding: "utf8" });
      expect(missing.status).not.toBe(0);
      expect(missing.stderr).toContain("runtime.gitignore");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
  test("init appends the block after user entries and a reapply changes nothing", () => {
    const operation = gitignoreManagedBlockOperation(ABSENT_REPO, "planned", "custom-local/");
    const first = upsertManagedBlock("# user rules\nprivate-notes/\n", operation, ignoreBlockProof(operation));
    expect(first.ok).toBe(true);
    const output = first.content!;
    expect(output.startsWith("# user rules\nprivate-notes/\n")).toBe(true);
    const body = output.split("# BEGIN: repo-harness generated-runtime\n")[1]!.split("# END: repo-harness generated-runtime")[0]!.trimEnd();
    expect(body).toBe(`${GITIGNORE_MANAGED_BLOCK_CONTENT}\n\ncustom-local/`);
    expect(upsertManagedBlock(output, operation, ignoreBlockProof(operation))).toMatchObject({ ok: true, changed: false, content: output });
  });
  test("init replaces a released legacy-marker block in place and keeps an edited one", () => {
    const operation = gitignoreManagedBlockOperation(ABSENT_REPO, "planned");
    const ensure = (text: string) => upsertManagedBlock(text, operation, ignoreBlockProof(operation));
    const current = `# BEGIN: repo-harness generated-runtime\n${GITIGNORE_MANAGED_BLOCK_CONTENT}\n# END: repo-harness generated-runtime`;
    // The v0.1.5 bash block, a released value in assets/released-managed-values.v1.json.
      const released = [
        "# BEGIN: claude-runtime-temp (managed by repo-harness)",
        ".claude/settings.local.json",
        ".claude/.atomic_pending",
        ".claude/.session-id",
        ".claude/.trace.jsonl",
        ".claude/.tool-call-count",
        ".claude/.session-handoff.md",
        ".claude/.task-state.json",
        ".claude/.task-handoff.md",
        ".claude/.context-pressure/",
        ".claude/.codegraph-state/",
        ".claude/*.tmp",
        ".claude/*.bak",
        ".claude/*.bak.*",
        ".claude/*.backup-*",
        ".ai/harness/checks/latest.json",
        ".ai/harness/checks/post-bash-latest.json",
        ".ai/harness/events.jsonl",
        ".ai/harness/failures/latest.jsonl",
        ".ai/harness/handoff/current.md",
        ".ai/harness/handoff/resume.md",
        ".ai/harness/context-budget/latest.json",
        ".ai/harness/capability-context/",
        ".ai/harness/planning/*",
        "!.ai/harness/planning/.gitkeep",
        ".ai/harness/architecture/events.jsonl",
        ".ai/harness/active-plan",
        ".ai/harness/active-worktree",
        ".ai/harness/worktrees/",
        ".ai/harness/runs/",
        ".codex/*",
        ".claude/.active-plan",
        "# END: claude-runtime-temp",
      ].join("\n");
    expect(ensure(`before/\n${released}\nafter/\n`)).toMatchObject({ ok: true, changed: true, content: `before/\n${current}\nafter/\n` });

    const edited = "before/\n# BEGIN: claude-runtime-temp (managed by repo-harness)\nstale-entry/\n# END: claude-runtime-temp\nafter/\n";
    expect(ensure(edited)).toMatchObject({ ok: true, changed: false, kept: "# BEGIN: claude-runtime-temp (managed by repo-harness)", content: edited });

    // A released block with a retired-rule section, in a CRLF file, is replaced and keeps CRLF.
    const retiredSection = ["", "# Retired runtime state that still exists; repo-harness upgrade lists these files", ".claude/.session-id", "tasks/current.md"];
    const releasedRetired = ["# BEGIN: repo-harness generated-runtime", GITIGNORE_MANAGED_BLOCK_CONTENT, ...retiredSection, "# END: repo-harness generated-runtime"].join("\n");
    expect(ensure(`before/\n${releasedRetired}\nafter/\n`.replaceAll("\n", "\r\n")))
      .toMatchObject({ ok: true, changed: true, content: `before/\n${current}\nafter/\n`.replaceAll("\n", "\r\n") });
  });

  test("init refuses an unterminated block without dropping user lines", () => {
    const operation = gitignoreManagedBlockOperation(ABSENT_REPO, "planned");
    const original = "before/\n# BEGIN: repo-harness generated-runtime\nstale-entry/\nuser-after/\n";
    expect(upsertManagedBlock(original, operation, ignoreBlockProof(operation)))
      .toMatchObject({ ok: false, changed: false, error: "managed block is missing end marker: # END: repo-harness generated-runtime" });
  });

  test("tracked and runtime-state blocks together ignore every repo-local runtime path the CLI writes", () => {
    const cwd = mkdtempSync(join(tmpdir(), "gitignore-runtime-paths-"));
    try {
      expect(spawnSync("git", ["init", "-q"], { cwd }).status).toBe(0);
      writeFileSync(join(cwd, ".gitignore"), `${GITIGNORE_MANAGED_BLOCK_CONTENT}\n${RUNTIME_STATE_IGNORE_CONTENT}\n`);
      const runtimePaths = [
        ".ai/harness/chatgpt/oracle-home/Default/Cookies", // oracle-provider.ts resolveOracleHomeDir
        ".ai/harness/chatgpt/delegations/stamp-slug/bundle/brief.md", // repo-harness-chatgpt delegate skill
        ".ai/harness/chatgpt/sessions/session-id/meta.json", // chatgpt-browser session-store.ts
        ".ai/harness/handoff/gptpro/gptpro-stamp-slug.md", // repo-harness-chatgpt delegate skill
        ".ai/harness/mcp/index-events.jsonl", // mcp general-repo-access.ts
        ".ai/harness/backups/fs-transaction/entry", // fs-transaction.ts BACKUP_ROOT
        ".claude/worktrees/task/README.md", // Claude Code task worktrees
      ];
      const result = spawnSync("git", ["check-ignore", "--no-index", "--stdin"], { cwd, encoding: "utf8", input: `${runtimePaths.join("\n")}\n` });
      expect(result.stdout.trimEnd().split("\n")).toEqual(runtimePaths);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("managed block content ignores the whole .repo-harness directory", () => {
    const lines = GITIGNORE_MANAGED_BLOCK_CONTENT.split("\n");
    expect(lines).toContain(".repo-harness/");
  });

  test("managed block no longer ignores retired plan and task runtime paths", () => {
    const lines = GITIGNORE_MANAGED_BLOCK_CONTENT.split("\n");
    for (const retired of [
      "tasks/current.md",
      "tasks/.current.md.tmp.*",
      ".ai/harness/active-plan",
      ".ai/harness/sprint/",
      ".claude/.active-plan",
      ".claude/.plan-state/",
    ]) expect(lines).not.toContain(retired);
  });

  test("managed block content no longer carries per-file .repo-harness entries", () => {
    const lines = GITIGNORE_MANAGED_BLOCK_CONTENT.split("\n");
    const perFile = lines.filter((line) => line.startsWith(".repo-harness/") && line !== ".repo-harness/");
    expect(perFile).toEqual([]);
    expect(GITIGNORE_MANAGED_BLOCK_CONTENT).not.toContain(".repo-harness/chatgpt-browser.local.json");
    expect(GITIGNORE_MANAGED_BLOCK_CONTENT).not.toContain(".repo-harness/chatgpt-browser.tokens.json");
  });

  test("the planned tracked block holds no rule of the runtime-state set", () => {
    const tracked = new Set(gitignoreManagedBlockOperation(ABSENT_REPO, "planned").content.split("\n"));
    const moved = RUNTIME_STATE_IGNORE_CONTENT.split("\n").filter((line) => line && !line.startsWith("#"));
    expect(moved).toContain(".ai/harness/events.jsonl");
    expect(moved.filter((rule) => tracked.has(rule))).toEqual([]);
  });

  test("removing a block between user lines leaves one blank line", () => {
    const block = `# BEGIN: ${RUNTIME_STATE_IGNORE_MARKER}\nrule/\n# END: ${RUNTIME_STATE_IGNORE_MARKER}\n`;
    expect(removeRuntimeStateIgnoreBlock(`# user\n*.orig\n\n${block}\nuser-tail/\n`)).toEqual({ status: "removed", content: "# user\n*.orig\n\nuser-tail/\n" });
  });

  test("the emitted operation carries the directory-level rule", () => {
    const operation = gitignoreManagedBlockOperation(ABSENT_REPO, "planned");
    expect(operation.path).toBe(".gitignore");
    expect(operation.content.split("\n")).toContain(".repo-harness/");
    expect(operation.content).not.toContain(".repo-harness/chatgpt-browser.tokens.json");
  });

  test("a retired-rule subset proves a project block only at the rendered section position", () => {
    const header = "# Retired runtime state that still exists; rh upgrade lists these files";
    const project = (...lines: string[]) => ["# BEGIN: repo-harness generated-runtime", GITIGNORE_MANAGED_BLOCK_CONTENT, ...lines, "# END: repo-harness generated-runtime"].join("\n");
    const proof = ignoreBlockProof(gitignoreManagedBlockOperation(ABSENT_REPO, "planned", "custom-local/"));
    expect(proof(project("", header, ".claude/.session-id", "tasks/current.md", "", "custom-local/"))).toBe(true);
    expect(proof(project("", "custom-local/", "", header, "tasks/current.md"))).toBe(false);
    expect(proof(project("", header, "", "custom-local/"))).toBe(false);
    expect(proof(project("", header, "tasks/current.md", "my-rule/", "", "custom-local/"))).toBe(false);
    expect(proof(project("my-rule/", "", "custom-local/"))).toBe(false);

    // The user excludes renderer has no retired section, so an injected one is an edit.
    const excludes = runtimeStateIgnoreOperation("/home/user/.config/git/ignore");
    const injected = [`# BEGIN: ${RUNTIME_STATE_IGNORE_MARKER}`, RUNTIME_STATE_IGNORE_CONTENT, "", header, "tasks/current.md", `# END: ${RUNTIME_STATE_IGNORE_MARKER}`].join("\n");
    expect(ignoreBlockProof(excludes)(injected)).toBe(false);
    expect(upsertManagedBlock(`${injected}\n`, excludes, ignoreBlockProof(excludes))).toMatchObject({ changed: false, kept: `# BEGIN: ${RUNTIME_STATE_IGNORE_MARKER}` });
  });

  test("extra content is appended without disturbing the directory rule", () => {
    const operation = gitignoreManagedBlockOperation(ABSENT_REPO, "planned", "custom-local/\n");
    expect(operation.content.split("\n")).toContain(".repo-harness/");
    expect(operation.content).toContain("custom-local/");
  });

  test("the user-level excludes lookup follows an include section of the global Git config", () => {
    const home = mkdtempSync(join(tmpdir(), "gitignore-include-"));
    const shared = join(home, "shared-ignore");
    try {
      writeFileSync(join(home, ".gitconfig"), "[include]\n\tpath = extra.cfg\n");
      writeFileSync(join(home, "extra.cfg"), `[core]\n\texcludesFile = ${shared}\n`);
      expect(userExcludesFilePath({ HOME: home, XDG_CONFIG_HOME: join(home, "xdg"), GIT_CONFIG_NOSYSTEM: "1" })).toEqual({ ok: true, path: shared });
    } finally { rmSync(home, { recursive: true, force: true }); }
  });
});
