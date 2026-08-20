import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");
const SCRIPT = join(ROOT, "scripts/contract-worktree.sh");

describe("contract-worktree projection publication ownership", () => {
  test("closeout never discards a target-worktree projection manifest", () => {
    const helper = readFileSync(SCRIPT, "utf8");

    expect(helper).not.toContain("restore_machine_owned_projection_output");
    expect(helper).not.toContain("git -C \"$worktree\" checkout -- \"$MACHINE_OWNED_PROJECTION_PATH\"");
    expect(helper.match(/target worktree is dirty, refusing merge/g)).toHaveLength(2);
  });

  test("the exact manifest is workflow-owned but the architecture directory is not broadly exempted", () => {
    const helper = readFileSync(SCRIPT, "utf8");

    expect(helper).toContain("is_workflow_owned_projection_output()");
    expect(helper).toContain('[[ "$1" == "docs/architecture/.projection-manifest.json" ]]');
    expect(helper).not.toContain('[[ "$1" == "docs/architecture/"* ]]');
  });

  test("the packaged helper stays byte-identical to the repo-local script", () => {
    expect(readFileSync(join(ROOT, "assets/templates/helpers/contract-worktree.sh"), "utf8"))
      .toBe(readFileSync(SCRIPT, "utf8"));
  });
});
