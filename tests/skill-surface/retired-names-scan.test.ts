import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, relative, sep } from "path";

// SSD-06 (C8): live-reference scan for the 19 retired Skill package names,
// extending tests/retired-planning-provider.test.ts's precedent pattern
// (scan a fixed surface list, fail on any hit) with a per-name/per-file
// allowlist for the legitimate contexts the plan itself names: migration
// metadata (the manifest's own retiredPackages array), changelog/history,
// archived artifacts, the R1 provenance-enum vocabulary (acceptance-receipt
// source values and plan-capture --source values, both permanent
// data-schema vocabulary unrelated to Skill routing), and the R2 generated
// bridge projection identity.

const ROOT = join(import.meta.dir, "..", "..");

// The 19 retired names minus `repo-harness-chatgpt-bridge`: R2 rules that
// name is the permanent, generated bridge.md-frontmatter-driven runtime
// projection identity (setup.ts's CHATGPT_BRIDGE_FRONTMATTER_NAME, bridge.md
// frontmatter, and every install-skill destination path), not a retired
// name -- only the static self-hosted `.agents/skills/repo-harness-chatgpt-bridge/`
// *directory* retired, and its non-existence is proven directly by
// tests/skill-surface/chatgpt-package.test.ts instead of a name-string scan.
const RETIRED_NAMES = [
  "repo-harness-init",
  "repo-harness-migrate",
  "repo-harness-upgrade",
  "repo-harness-repair",
  "repo-harness-scaffold",
  "repo-harness-capability",
  "repo-harness-review",
  "repo-harness-prd",
  "repo-harness-sprint",
  "repo-harness-goal",
  "repo-harness-handoff",
  "repo-harness-deploy",
  "repo-harness-autoplan",
  "repo-harness-gptpro-setup",
  "repo-harness-gptpro",
  "codex-review",
  "claude-review",
  "repo-harness-chatgpt-browser",
] as const;

// Plan C8: "src/, scripts/, assets/, .agents/, SKILL.md, README*,
// docs/reference-configs/, docs/architecture/, evals/".
const SCAN_SURFACES = [
  "src",
  "scripts",
  "assets",
  ".agents",
  "SKILL.md",
  "README.md",
  "README.zh-CN.md",
  "README.ja.md",
  "README.fr.md",
  "README.es.md",
  "docs/reference-configs",
  "docs/architecture",
  "evals",
];

// Whole-file exemptions, each with its own justification. Every entry here
// was found by an exploratory sweep during SSD-06 and individually
// classified before being allowlisted -- none is a blanket "quiet the scan"
// exemption.
const FILE_ALLOWLIST: Record<string, string> = {
  // Migration diagnostics: the manifest's own retiredPackages[] array names
  // every retired package and its replacement (plan-required content).
  "assets/skill-commands/manifest.json":
    "retiredPackages[] migration-diagnostics array (plan-required)",
  // R5: untouchable historical pre-cutover evidence.
  "evals/skill-routing/discovery-baseline.json":
    "frozen pre-cutover discovery baseline (plan Ruling R5)",
  // SSD-07 phase A (D3): the subject-freeze record's changed_files_since_base
  // field is the literal `git diff --name-only <base>..HEAD` output, which
  // legitimately lists deleted paths from the old facade tree (e.g.
  // assets/skill-commands/repo-harness-init/SKILL.md) as migration diff
  // evidence -- the same "archival record naming a retired name" category as
  // discovery-baseline.json above, not a live reference.
  "evals/skill-routing/final-subject-freeze.json":
    "SSD-07 subject-freeze changed_files_since_base is git-diff migration evidence, not a live reference",
  // This module doc's own migration-metadata paragraph, documenting the
  // retiredPackages[] mapping for human readers (same justification as the
  // manifest entry above).
  "docs/architecture/modules/public-surface/action-commands.md":
    "documents the retiredPackages[] mapping as migration metadata",
  // Explanatory code comments about why repo-harness-handoff is no longer
  // specially handled (historical, not a live reference).
  "src/cli/installer/install-profile.ts":
    "explanatory comments documenting the retired repo-harness-handoff facade",
  // R1: source stays the acceptance-receipt AcceptanceReceipt.source
  // provenance enum value (permanent data-schema vocabulary); command/skill
  // suggestion strings on the same lines were already migrated.
  "src/cli/hook/prompt-handler.ts":
    "R1 provenance-enum value (AcceptanceReceipt.source)",
  // Same acceptance-receipt source-enum concept as R1, implemented as a
  // bash sibling of scripts/acceptance-receipt.ts's TS enum.
  "assets/hooks/lib/workflow-state.sh":
    "acceptance-receipt source-enum value (bash sibling of R1's TS enum)",
  // Explanatory docstring: names the retired predecessor facade this file
  // used to back, alongside its current owner (repo-harness-setup).
  "src/cli/commands/init.ts":
    "docstring naming the retired predecessor of repo-harness-setup's adopt-init mode",
  // R1 provenance-enum value used in eval 24's expected_output prose
  // ("--source repo-harness-sprint"), the same permanent capture-plan
  // --source vocabulary R1 protects in scripts/capture-plan.sh etc.
  "evals/evals.json":
    "R1 provenance-enum value (capture-plan --source repo-harness-sprint) in eval 24's expected_output",
};

// R1: "Do NOT touch scripts/acceptance-receipt.ts,
// scripts/harness-trace-grade.sh, scripts/sprint-backlog.sh,
// scripts/plan-to-todo.sh, scripts/capture-plan.sh,
// scripts/lib/project-init-lib.sh enum usages" -- permanent provenance-enum
// vocabulary (claude-review/codex-review as AcceptanceReceipt.source;
// repo-harness-sprint/repo-harness-plan as plan-capture --source). Each has
// a byte-synced assets/templates/helpers/ mirror (package.json's
// sync:helpers/check:helpers), exempted for the same reason.
const R1_PROVENANCE_ENUM_FILES = [
  "scripts/acceptance-receipt.ts",
  "scripts/classify-historical-plans.ts",
  "scripts/harness-trace-grade.sh",
  "scripts/sprint-backlog.sh",
  "scripts/plan-to-todo.sh",
  "scripts/capture-plan.sh",
  "scripts/lib/project-init-lib.sh",
  "assets/templates/helpers/acceptance-receipt.ts",
  "assets/templates/helpers/classify-historical-plans.ts",
  "assets/templates/helpers/harness-trace-grade.sh",
  "assets/templates/helpers/sprint-backlog.sh",
  "assets/templates/helpers/plan-to-todo.sh",
  "assets/templates/helpers/capture-plan.sh",
];

// Discovered during the SSD-06 sweep, originally outside this contract's
// allowed_paths (assets/templates/, scripts/ensure-task-workflow.sh, and
// evals/fixtures/ were not listed in
// tasks/contracts/20260715-1140-skill-surface-discovery-convergence.contract.md's
// allowed_paths). The contract was amended to bring those five files into
// scope and the acceptance-gate follow-up fixed all five (prior-art trigger
// text reworded to name repo-harness-product's prd mode; both fixture
// READMEs reworded to the same canonical names), so no residual remains.
// Kept as an empty record rather than deleted: the tightened stale-allowlist
// test below still iterates its keys, and a future genuine out-of-scope
// residual is recorded the same way.
const OUT_OF_SCOPE_RESIDUALS: Record<string, string> = {};

// Reference-provenance convention: every canonical package's reference file
// opens with "Source facade: `assets/skill-commands/repo-harness-X`" (or,
// for repo-harness-chatgpt's reconciled references, "Reconciles the
// `repo-harness-X` facade/rules ..."), documenting which retired facade the
// content was extracted from. This is exactly the plan's "allowed migration
// metadata" category, expressed per-package instead of centrally.
const REFERENCE_PROVENANCE_DIR_PREFIXES = [
  "assets/skills/repo-harness-setup/references",
  "assets/skills/repo-harness-plan/references",
  "assets/skills/repo-harness-product/references",
  "assets/skills/repo-harness-chatgpt/references",
  "assets/skill-commands/repo-harness-check/references",
];

function allFiles(root: string): string[] {
  const stats = statSync(root);
  if (stats.isFile()) return [root];
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const child = join(root, entry.name);
    if (entry.isDirectory()) out.push(...allFiles(child));
    else if (entry.isFile()) out.push(child);
  }
  return out;
}

/** Word-boundary-aware match: a retired name is a hit only when not glued
 * to more identifier/hyphen characters on either side (rejects homonyms
 * like `.repo-harness-migrate-backup` or `repo-harness-deploy-sql`, which a
 * plain substring scan would false-positive on). */
function hasLiveHit(content: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const pattern = new RegExp(`(?<![A-Za-z0-9_-])${escaped}(?![A-Za-z0-9_-])`, "u");
  return pattern.test(content);
}

describe("retired Skill package names: live-reference scan", () => {
  // .agents/ is a plan-listed scan surface but, post-cutover, may be
  // entirely absent (git does not track empty directories; this repo's
  // .agents/skills/ contained only the two now-deleted static ChatGPT skill
  // dirs). An absent surface has nothing to scan, not an error.
  const files = SCAN_SURFACES
    .map((surface) => join(ROOT, surface))
    .filter((absolute) => existsSync(absolute))
    .flatMap((absolute) => allFiles(absolute));

  test("scan surface is non-trivial (sanity check against a vacuous pass)", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  test("every retired name has zero live hits outside the checked-in allowlist", () => {
    const violations: string[] = [];

    for (const absolute of files) {
      const rel = relative(ROOT, absolute).split(sep).join("/");
      if (FILE_ALLOWLIST[rel] || OUT_OF_SCOPE_RESIDUALS[rel] || R1_PROVENANCE_ENUM_FILES.includes(rel)) continue;
      if (REFERENCE_PROVENANCE_DIR_PREFIXES.some((prefix) => rel.startsWith(`${prefix}/`))) continue;

      let content: string;
      try {
        content = readFileSync(absolute, "utf-8");
      } catch {
        continue; // binary or unreadable; not a text reference by construction
      }

      for (const name of RETIRED_NAMES) {
        if (hasLiveHit(content, name)) {
          violations.push(`${rel}: ${name}`);
        }
      }
    }

    expect(violations).toEqual([]);
  }, 10_000);

  test("every allowlisted file still exists (no stale allowlist entries)", () => {
    const allEntries = [
      ...Object.keys(FILE_ALLOWLIST),
      ...Object.keys(OUT_OF_SCOPE_RESIDUALS),
      ...R1_PROVENANCE_ENUM_FILES,
    ];
    for (const rel of allEntries) {
      const absolute = join(ROOT, rel);
      expect(() => statSync(absolute)).not.toThrow();
    }

    // Existing is not enough: a since-fixed file still passes the
    // exists-check above forever, leaving a silent permanent exemption.
    // Every FILE_ALLOWLIST/OUT_OF_SCOPE_RESIDUALS entry must still contain
    // at least one live retired-name hit -- fixing the file's stale
    // reference forces removing its entry here, or this test fails.
    // (SSD-07 phase A/D2 R2: the three homonym-justified entries this loop
    // used to skip were removed entirely from both allowlists instead --
    // hasLiveHit's word-boundary regex never matched them in the first
    // place, so there was no hit to exempt and no residual to track.)
    const hitCheckEntries: Record<string, string> = { ...FILE_ALLOWLIST, ...OUT_OF_SCOPE_RESIDUALS };
    for (const rel of Object.keys(hitCheckEntries)) {
      const absolute = join(ROOT, rel);
      const content = readFileSync(absolute, "utf-8");
      const stillHasRetiredName = RETIRED_NAMES.some((name) => hasLiveHit(content, name));
      expect(stillHasRetiredName).toBe(true);
    }
  });

  test("the reference-provenance directories actually exist and carry the Source-facade/Reconciles convention", () => {
    let sawAtLeastOneProvenanceLine = false;
    for (const prefix of REFERENCE_PROVENANCE_DIR_PREFIXES) {
      const dir = join(ROOT, prefix);
      const filesInDir = allFiles(dir);
      expect(filesInDir.length).toBeGreaterThan(0);
      for (const f of filesInDir) {
        const content = readFileSync(f, "utf-8");
        if (/^(Source facade:|Reconciles the )/mu.test(content)) sawAtLeastOneProvenanceLine = true;
      }
    }
    expect(sawAtLeastOneProvenanceLine).toBe(true);
  });

  test("retiredPackages[] in the manifest records all 19 retired names with a live-or-null replacement", () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, "assets/skill-commands/manifest.json"), "utf-8")) as {
      packages: Array<{ name: string }>;
      retiredPackages: Array<{ name: string; replacement: string | null; note: string }>;
    };
    const liveNames = new Set(manifest.packages.map((p) => p.name));
    const recordedNames = new Set(manifest.retiredPackages.map((r) => r.name));

    // repo-harness-chatgpt-bridge is deliberately excluded from
    // RETIRED_NAMES (R2) but IS one of the 19 retiredPackages[] entries
    // (only its static directory retired, not its generated identity), so
    // check the manifest's own 19-entry count directly here.
    expect(manifest.retiredPackages.length).toBe(19);
    for (const name of RETIRED_NAMES) {
      expect(recordedNames.has(name)).toBe(true);
    }
    expect(recordedNames.has("repo-harness-chatgpt-bridge")).toBe(true);
    for (const entry of manifest.retiredPackages) {
      if (entry.replacement !== null) expect(liveNames.has(entry.replacement)).toBe(true);
    }
  });
});
