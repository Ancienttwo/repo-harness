import { describe, test, expect } from "bun:test";
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import { pathToFileURL } from "url";

const ROOT = join(import.meta.dir, "..");

// Parser children use only the historical metadata parser. Strip repository
// overrides so the fixture cannot inherit a caller's execution context.
function fixtureEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("REPO_HARNESS_") || key === "HOOK_REPO_ROOT") continue;
    env[key] = value;
  }
  return env;
}

function runHistoricalEvidenceParser(cwd: string, contractRelPath: string) {
  const source = [
    'import { readFileSync } from "node:fs";',
    `import { acceptanceBenchmarkRequirement } from ${JSON.stringify(pathToFileURL(join(ROOT, "src/core/review/acceptance-receipt.ts")).href)};`,
    `process.stdout.write(acceptanceBenchmarkRequirement(readFileSync(${JSON.stringify(join(cwd, contractRelPath))}, "utf8")));`,
  ].join("\n");
  return spawnSync(process.execPath, ["--eval", source], {
    cwd, encoding: "utf-8", env: fixtureEnv(),
  });
}

describe("workflow evidence requirement and explicit verification", () => {
  test("explicit verification does not consume review prose or create acceptance receipts", () => {
    for (const path of ["scripts/verify-sprint.sh"]) {
      const helper = readFileSync(join(ROOT, path), "utf-8");
      expect(helper).not.toContain('acceptance-receipt.ts');
      expect(helper).not.toContain('workflow_current_review_subject_value');
      expect(helper).toContain('"$BUN_BIN" run check:type');
      expect(helper).toContain('"$SCRIPT_DIR/merge-gate.ts" run --base "$base"');
      expect(helper).toContain('choose local execution or provider evidence consumption');
    }
  });

  test("historical evidence-requirement parser fails closed on a duplicate benchmark: key, a sibling-nested benchmark:, and a grandchild-nested benchmark:", () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), "workflow-evidence-requirement-hardening-")));
    try {
      writeFileSync(
        join(cwd, "duplicate-benchmark.contract.md"),
        [
          "# Task Contract: demo",
          "",
          "```yaml",
          "evidence_requirements:",
          "  benchmark: required",
          "  benchmark: not_applicable",
          "```",
          "",
        ].join("\n")
      );
      const duplicate = runHistoricalEvidenceParser(cwd, "duplicate-benchmark.contract.md");
      expect(duplicate.status).not.toBe(0);
      expect(duplicate.stdout).toBe("");
      expect(duplicate.stderr).toContain("contract evidence requirements are ambiguous");

      writeFileSync(
        join(cwd, "nested-sibling-benchmark.contract.md"),
        [
          "# Task Contract: demo",
          "",
          "```yaml",
          "evidence_requirements:",
          "  something: value",
          "other_key:",
          "  nested:",
          "    benchmark: required",
          "```",
          "",
        ].join("\n")
      );
      const nestedSibling = runHistoricalEvidenceParser(cwd, "nested-sibling-benchmark.contract.md");
      expect(nestedSibling.status).not.toBe(0);
      expect(nestedSibling.stdout).toBe("");
      expect(nestedSibling.stderr).toContain("contract benchmark requirement must be required or not_applicable");

      writeFileSync(
        join(cwd, "nested-grandchild-benchmark.contract.md"),
        [
          "# Task Contract: demo",
          "",
          "```yaml",
          "evidence_requirements:",
          "  other_key:",
          "    benchmark: required",
          "```",
          "",
        ].join("\n")
      );
      const nestedGrandchild = runHistoricalEvidenceParser(cwd, "nested-grandchild-benchmark.contract.md");
      expect(nestedGrandchild.status).not.toBe(0);
      expect(nestedGrandchild.stdout).toBe("");
      expect(nestedGrandchild.stderr).toContain("contract benchmark requirement must be required or not_applicable");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  // R-D (fix 4, second hardening after a third external review round): a `#`
  // only starts a YAML comment when it is the first character on the line or
  // is preceded by whitespace. The prior comment-stripping regex used
  // `[[:space:]]*#` (zero or more whitespace), so an inline `#` glued
  // directly onto a scalar with no separating space -- e.g.
  // "not_applicable#required" -- was stripped as if it were a trailing
  // comment, silently truncating the malformed value into a valid-looking
  // "not_applicable" instead of failing closed on the garbage suffix.
  test("historical evidence-requirement parser fails closed on a value with no whitespace before a trailing #, and still strips a real whitespace-separated comment", () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), "workflow-evidence-requirement-comment-")));
    try {
      writeFileSync(
        join(cwd, "glued-hash-benchmark.contract.md"),
        [
          "# Task Contract: demo",
          "",
          "```yaml",
          "evidence_requirements:",
          "  benchmark: not_applicable#required",
          "```",
          "",
        ].join("\n")
      );
      const glued = runHistoricalEvidenceParser(cwd, "glued-hash-benchmark.contract.md");
      expect(glued.status).not.toBe(0);
      expect(glued.stdout).toBe("");
      expect(glued.stderr).toContain("contract benchmark requirement must be required or not_applicable");

      writeFileSync(
        join(cwd, "real-comment-benchmark.contract.md"),
        [
          "# Task Contract: demo",
          "",
          "```yaml",
          "evidence_requirements:",
          "  benchmark: not_applicable  # trailing note, whitespace-separated",
          "```",
          "",
        ].join("\n")
      );
      const realComment = runHistoricalEvidenceParser(cwd, "real-comment-benchmark.contract.md");
      expect(realComment.status, realComment.stderr).toBe(0);
      expect(realComment.stdout).toBe("not_applicable");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("historical evidence-requirement parser fails closed when parser sentinels appear as yaml content", () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), "workflow-evidence-requirement-sentinel-")));
    try {
      for (const [name, marker] of [
        ["begin", "@@workflow_contract_evidence_requirement:begin@@"],
        ["end", "@@workflow_contract_evidence_requirement:end@@"],
      ] as const) {
        writeFileSync(
          join(cwd, `${name}-marker.contract.md`),
          [
            "# Task Contract: demo",
            "",
            "```yaml",
            "evidence_requirements:",
            "  benchmark: not_applicable",
            marker,
            "evidence_requirements:",
            "  benchmark: required",
            "```",
            "",
          ].join("\n")
        );
        const result = runHistoricalEvidenceParser(cwd, `${name}-marker.contract.md`);
        expect(result.status).not.toBe(0);
        expect(result.stdout).toBe("");
        expect(result.stderr).toContain("contract evidence requirements are ambiguous");
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("historical evidence-requirement parser fails closed on quoted spellings of canonical evidence keys", () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), "workflow-evidence-requirement-quoted-key-")));
    try {
      for (const [name, quotedLine] of [
        ["duplicate-declaration", '"evidence_requirements":'],
        ["duplicate-benchmark", "  'benchmark': required"],
      ] as const) {
        writeFileSync(
          join(cwd, `${name}.contract.md`),
          [
            "# Task Contract: demo",
            "",
            "```yaml",
            "evidence_requirements:",
            "  benchmark: not_applicable",
            quotedLine,
            "```",
            "",
          ].join("\n")
        );
        const result = runHistoricalEvidenceParser(cwd, `${name}.contract.md`);
        expect(result.status).not.toBe(0);
        expect(result.stdout).toBe("");
        expect(result.stderr).toContain("contract evidence requirements use an unsupported key or document form");
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("historical evidence-requirement parser fails closed on whitespace-before-colon spellings of canonical evidence keys", () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), "workflow-evidence-requirement-spaced-key-")));
    try {
      writeFileSync(
        join(cwd, "spaced-key.contract.md"),
        [
          "# Task Contract: demo",
          "",
          "```yaml",
          "evidence_requirements:",
          "  benchmark: not_applicable",
          "  benchmark : required",
          "```",
          "",
        ].join("\n")
      );
      const result = runHistoricalEvidenceParser(cwd, "spaced-key.contract.md");
      expect(result.status).not.toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("contract evidence requirements use an unsupported key or document form");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);
});
