import { describe, test, expect } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");

describe("Hook dedup", () => {
  test("legacy duplicate hook assets are removed", () => {
    expect(existsSync(join(ROOT, "assets/hooks/doc-drift-guard.sh"))).toBe(false);
    expect(existsSync(join(ROOT, "assets/hooks/task-handoff.sh"))).toBe(false);
  });

  // HRD-05 retired assets/hooks/post-edit-guard.sh; the in-process
  // mutation-observed journal handler is now the single home for doc-drift
  // advisories. Task-handoff regeneration ("[TaskHandoff]") is retired
  // entirely (deferred to Stop's existing unconditional handoff refresh, not
  // reprinted per edit), so that assertion does not carry over.
  test("mutation-observed remains the single home for doc drift advisories", () => {
    const content = readFileSync(join(ROOT, "src/cli/hook/mutation-observed.ts"), "utf-8");
    expect(content).toContain("[DocDrift]");
    expect(content).not.toContain("run_skill_factory_activity");
  });
});
