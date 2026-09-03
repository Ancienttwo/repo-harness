import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { loadRefactorPolicy, readRefactorPolicy } from "../../src/core/refactor/policy";

describe("refactor policy", () => {
  test("defaults missing policy to off and false", () => {
    expect(readRefactorPolicy({})).toEqual({ mode: "off", require_cutover_closure: false });
  });
  test("accepts only the closed section", () => {
    expect(readRefactorPolicy({ policy: { refactor: { mode: "shadow", require_cutover_closure: true } } })).toEqual({ mode: "shadow", require_cutover_closure: true });
    expect(() => readRefactorPolicy({ policy: { refactor: { mode: "enabled" } } })).toThrow();
    expect(() => readRefactorPolicy({ policy: { refactor: { require_cutover_closure: "true" } } })).toThrow();
    expect(() => readRefactorPolicy({ policy: { refactor: { mode: "off", extra: true } } })).toThrow();
  });
  test("loads the workflow manifest and rejects malformed JSON", () => {
    const repo = mkdtempSync(join(tmpdir(), "refactor-policy-"));
    try {
      expect(loadRefactorPolicy(repo)).toEqual({ mode: "off", require_cutover_closure: false });
      mkdirSync(join(repo, ".ai", "harness"), { recursive: true });
      writeFileSync(join(repo, ".ai", "harness", "policy.json"), "not json\n");
      expect(() => loadRefactorPolicy(repo)).toThrow();
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });
});
