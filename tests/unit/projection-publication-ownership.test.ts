import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const ROOT = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

test("explicit verification never authors automatic architecture or approval projections", () => {
  const helper = read("scripts/verify-sprint.sh");
  expect(helper).not.toContain("materialize_automatic_architecture_projection");
  expect(helper).not.toContain("review_subject_sha256");
  expect(helper).not.toContain("prepare-acceptance");
  expect(helper).toContain('"$BUN_BIN" run check:type');
  expect(helper).toContain('"$BUN_BIN" "$SCRIPT_DIR/merge-gate.ts" run --base "$base"');
});
test("contract scope exemption remains confined to the projection manifest", () => {
  const helper = read("scripts/contract-worktree.sh");
  expect(helper).toContain('[[ "$1" == "docs/architecture/.projection-manifest.json" ]]');
  expect(helper).toContain("is_workflow_owned_projection_output");
});
test("closeout binds provider verification to the exact publication candidate", () => {
  const helper = read("scripts/contract-worktree.sh");
  expect(helper).toContain('"$helper_dir/merge-gate.ts" run --base "$base_ref" --format sha');
  expect(helper).toContain('[[ "$verified_sha" == "$current_head" ]]');
  expect(helper).toContain("target branch moved after merge-gate review");
  expect(helper).not.toContain("acknowledge_architecture_projection_publication");
});
test("source and packaged helpers remain byte-identical", () => {
  expect(read("assets/templates/helpers/verify-sprint.sh")).toBe(read("scripts/verify-sprint.sh"));
  expect(read("assets/templates/helpers/contract-worktree.sh")).toBe(read("scripts/contract-worktree.sh"));
});
