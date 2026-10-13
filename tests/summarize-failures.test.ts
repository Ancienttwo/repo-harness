import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  mkdirSync,
  rmSync,
  writeFileSync
} from "fs";
import { join } from "path";

import { copyHelpers } from "./helpers/helper-script-fixture";
import { run, tmpWorkspace } from "./helpers/repo-fixture";

setDefaultTimeout(30000);

describe("summarize-failures helper integration", () => {
  test("summarize-failures should aggregate failure_class and guard counts", () => {
    const cwd = tmpWorkspace("helper-summarize-failures");
    try {
      copyHelpers(cwd);
      mkdirSync(join(cwd, ".ai/harness/failures"), { recursive: true });
      writeFileSync(
        join(cwd, ".ai/harness/failures/latest.jsonl"),
        [
          '{"ts":"2026-03-29T12:00:00+0800","guard":"PlanStatusGuard","action":"block","reason":"missing plan","fix":"create plan","failure_class":"missing_artifact","run_id":"run-a"}',
          '{"ts":"2026-03-29T12:01:00+0800","guard":"ContractGuard","action":"block","reason":"bad contract","fix":"fix contract","failure_class":"contract_failure","run_id":"run-a"}',
          '{"ts":"2026-03-29T12:02:00+0800","guard":"ContractGuard","action":"block","reason":"bad contract","fix":"fix contract","failure_class":"contract_failure","run_id":"run-a"}',
        ].join("\n") + "\n"
      );

      const res = run("bash", ["scripts/summarize-failures.sh", "--run-id", "run-a"], cwd);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[FailureSummary] records=3 run_id=run-a");
      expect(res.stdout).toContain("- contract_failure: 2");
      expect(res.stdout).toContain("- missing_artifact: 1");
      expect(res.stdout).toContain("- ContractGuard: 2");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);
});
