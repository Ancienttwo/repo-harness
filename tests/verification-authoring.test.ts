import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

describe("verification-plan authoring cutover", () => {
  test("downstream contract template retains one optional executable block", () => {
    const asset = readFileSync(join(ROOT, "assets/templates/contract.template.md"), "utf-8");

    expect(asset).toContain("## Verification Plan");
    expect(asset).toContain('"protocol": 1');
    expect(asset).not.toContain("tests_pass:");
    expect(asset).not.toContain("commands_succeed:");
    expect(asset).not.toContain("criterion_reuse:");
    // Self-host optional templates are independently maintained after #483.

    const projectInit = readFileSync(join(ROOT, "scripts/lib/project-init-lib.sh"), "utf-8");
    expect(projectInit).not.toContain("PI_TEMPLATE_CONTRACT");
  });

});
