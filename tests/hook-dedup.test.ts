import { describe, test, expect } from "bun:test";
import { existsSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");

describe("Hook dedup", () => {
  test("legacy duplicate hook assets are removed", () => {
    expect(existsSync(join(ROOT, "assets/hooks/doc-drift-guard.sh"))).toBe(false);
    expect(existsSync(join(ROOT, "assets/hooks/task-handoff.sh"))).toBe(false);
  });
});
