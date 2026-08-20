import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

test("prepare-acceptance materializes automatic architecture projection before freezing the review subject", () => {
  const helper = read("scripts/verify-sprint.sh");
  const materialize = helper.indexOf(
    'materialize_automatic_architecture_projection "${projection_changed_paths',
  );
  const subject = helper.indexOf(
    "review_subject_sha256=\"$(workflow_source_authority_call workflow_current_review_subject_value",
  );

  expect(materialize).toBeGreaterThan(-1);
  expect(subject).toBeGreaterThan(materialize);
});

test("only the projection manifest is workflow-owned during scope checks", () => {
  for (const path of ["scripts/verify-sprint.sh", "scripts/contract-worktree.sh"]) {
    const helper = read(path);
    expect(helper).toContain("docs/architecture/.projection-manifest.json");
    expect(helper).toContain("is_workflow_owned_projection_output");
  }
});

test("a manifest-bearing publication is acknowledged before closeout commits its merge journal", () => {
  const helper = read("scripts/contract-worktree.sh");
  const publicationMerge = helper.indexOf('git -C "$target_worktree" merge --ff-only "$publication_sha"');
  const acknowledgement = helper.indexOf(
    'acknowledge_architecture_projection_publication "$target_worktree" "$publication_sha"',
  );
  const mergedPhase = helper.indexOf('finish_transaction_phase merged "$publication_sha"');

  expect(publicationMerge).toBeGreaterThan(-1);
  expect(acknowledgement).toBeGreaterThan(publicationMerge);
  expect(mergedPhase).toBeGreaterThan(acknowledgement);
  expect(helper).toContain("diff-tree --no-commit-id --name-only -r");
});

test("source and packaged helpers remain byte-identical", () => {
  expect(read("assets/templates/helpers/verify-sprint.sh")).toBe(read("scripts/verify-sprint.sh"));
  expect(read("assets/templates/helpers/contract-worktree.sh")).toBe(read("scripts/contract-worktree.sh"));
});
