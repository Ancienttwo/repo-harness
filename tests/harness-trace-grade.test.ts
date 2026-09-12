import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  readdirSync,
  rmSync,
  writeFileSync
} from "fs";
import { join } from "path";

import { ROOT } from "./helpers/helper-script-fixture";
import { run, tmpWorkspace } from "./helpers/repo-fixture";

setDefaultTimeout(30000);

describe("harness-trace-grade helper integration", () => {
  test("harness-trace-grade should pass all local trace fixtures", () => {
    const fixturesDir = join(ROOT, "tests/fixtures/harness-traces");
    const fixtures = readdirSync(fixturesDir).filter((name) => name.endsWith(".json")).sort();
    expect(fixtures.length).toBeGreaterThanOrEqual(5);

    for (const fixture of fixtures) {
      const res = run(
        "bash",
        ["scripts/harness-trace-grade.sh", "--run", join(fixturesDir, fixture), "--repo", ROOT, "--strict"],
        ROOT
      );
      expect(res.status, `${fixture}\nstdout:\n${res.stdout}\nstderr:\n${res.stderr}`).toBe(0);
      const report = JSON.parse(res.stdout);
      expect(report.status).toBe("pass");
      expect(report.failed).toBe(0);
      expect(report.total).toBeGreaterThanOrEqual(6);
    }
  }, 30_000);

  test("harness-trace-grade should reject an unsupported task_profile", () => {
    const cwd = tmpWorkspace("helper-harness-trace-grade-invalid-profile");
    try {
      const traceFile = join(cwd, "invalid-profile-trace.json");
      writeFileSync(
        traceFile,
        JSON.stringify({
          schema: "repo-harness-run-trace.v1",
          task_profile: "not-a-real-profile",
        }),
      );

      const res = run(
        "bash",
        ["scripts/harness-trace-grade.sh", "--run", traceFile, "--repo", ROOT, "--strict"],
        ROOT,
      );
      expect(res.status).toBe(1);
      const report = JSON.parse(res.stdout);
      expect(report.status).toBe("fail");
      const grader = (report.graders as Array<{ id: string; passed: boolean; message: string }>).find(
        (entry) => entry.id === "contract_profile.valid",
      );
      expect(grader?.passed).toBe(false);
      expect(grader?.message).toContain("not-a-real-profile");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);
});
