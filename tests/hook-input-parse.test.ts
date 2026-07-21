import { describe, expect, test } from "bun:test";
import { join } from "path";
import { parseHookInput } from "../src/cli/hook/hook-input";

const ROOT = join(import.meta.dir, "..");

describe("typed hook input", () => {
  test("returns a value when a key is present in valid JSON", () => {
    const input = parseHookInput(JSON.stringify({ run_id: "xyz" }), { repoRoot: ROOT });
    expect(input.valid).toBe(true);
    expect(input.getString(".run_id")).toBe("xyz");
    expect(input.warnings).toEqual([]);
  });

  test("returns the caller default silently when a key is absent from valid JSON", () => {
    const input = parseHookInput(JSON.stringify({
      session_id: "abc",
      prompt: "hi",
      hook_event_name: "UserPromptSubmit",
    }), { repoRoot: ROOT });

    expect(input.getString(".run_id")).toBe("");
    expect(input.getString(".missing", "fallback")).toBe("fallback");
    expect(input.warnings).toEqual([]);
  });

  test("returns the caller default and records a warning for malformed JSON", () => {
    const input = parseHookInput("not valid json{", { repoRoot: ROOT });

    expect(input.valid).toBe(false);
    expect(input.getString(".run_id")).toBe("");
    expect(input.warnings).toHaveLength(1);
    expect(input.warnings[0]).toContain("[HookInput] WARN");
    expect(input.warnings[0]).toContain(".run_id");
  });

  test("returns a caller default silently for empty input", () => {
    const input = parseHookInput(undefined, { repoRoot: ROOT });

    expect(input.valid).toBe(true);
    expect(input.getString(".run_id", "fallback")).toBe("fallback");
    expect(input.warnings).toEqual([]);
  });

  test("extracts every Codex apply_patch target path", () => {
    const command = [
      "*** Begin Patch",
      "*** Update File: src/a.ts",
      "@@",
      "+a",
      "*** Add File: deploy/sql/0001_demo.sql",
      "+select 1;",
      "*** End Patch",
    ].join("\n");
    const input = parseHookInput(JSON.stringify({ tool_input: { command } }), { repoRoot: ROOT });

    expect(input.getApplyPatchPaths()).toEqual(["src/a.ts", "deploy/sql/0001_demo.sql"]);
  });
});
