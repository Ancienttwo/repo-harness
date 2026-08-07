import { describe, expect, test } from "bun:test";

import {
  GITIGNORE_MANAGED_BLOCK_CONTENT,
  gitignoreManagedBlockOperation,
} from "../../src/core/adoption/gitignore-plan";

describe("gitignore managed block .repo-harness rule", () => {
  test("managed block content ignores the whole .repo-harness directory", () => {
    const lines = GITIGNORE_MANAGED_BLOCK_CONTENT.split("\n");
    expect(lines).toContain(".repo-harness/");
  });

  test("managed block content no longer carries per-file .repo-harness entries", () => {
    const lines = GITIGNORE_MANAGED_BLOCK_CONTENT.split("\n");
    const perFile = lines.filter((line) => line.startsWith(".repo-harness/") && line !== ".repo-harness/");
    expect(perFile).toEqual([]);
    expect(GITIGNORE_MANAGED_BLOCK_CONTENT).not.toContain(".repo-harness/chatgpt-browser.local.json");
    expect(GITIGNORE_MANAGED_BLOCK_CONTENT).not.toContain(".repo-harness/chatgpt-browser.tokens.json");
  });

  test("the emitted operation carries the directory-level rule", () => {
    const operation = gitignoreManagedBlockOperation("planned");
    expect(operation.path).toBe(".gitignore");
    expect(operation.content.split("\n")).toContain(".repo-harness/");
    expect(operation.content).not.toContain(".repo-harness/chatgpt-browser.tokens.json");
  });

  test("extra content is appended without disturbing the directory rule", () => {
    const operation = gitignoreManagedBlockOperation("planned", "custom-local/\n");
    expect(operation.content.split("\n")).toContain(".repo-harness/");
    expect(operation.content).toContain("custom-local/");
  });
});
