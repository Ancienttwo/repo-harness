/**
 * EPC-09 Program closeout, Goal 2: deprecation residue scan.
 *
 * Consumes the checked-in evals/harness/epc-retired-surfaces.json -- the
 * union of every writer/placeholder EPC-05/07/08 retired same-package (R5)
 * -- and asserts zero unexcepted hits across the repo's own source/script/
 * hook/asset surfaces. The enumerated list and this scan share one source
 * of truth (the JSON file) so they cannot silently drift apart; a second,
 * precise re-assertion block below pins each named surface directly (not
 * just via the generic JSON-driven sweep), mirroring EPC-05/EPC-07's own
 * "the two EPC-00-named direct-authoring sites are actually gone" style.
 */
import { describe, expect, test } from "bun:test";
import { createHash } from "crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const REPO_ROOT = join(import.meta.dir, "..");
const RETIRED_SURFACES_PATH = join(REPO_ROOT, "evals/harness/epc-retired-surfaces.json");

interface RetiredSurface {
  readonly id: string;
  readonly surface: string;
  readonly retiring_package: string;
  readonly retired_at_pr: string;
  readonly description: string;
  readonly patterns: readonly string[];
  readonly allowed_exceptions: readonly string[];
}

interface RetiredSurfacesFile {
  readonly schema: string;
  readonly scan_roots: readonly string[];
  readonly scan_extensions: readonly string[];
  readonly surfaces: readonly RetiredSurface[];
}

function loadRetiredSurfaces(): RetiredSurfacesFile {
  return JSON.parse(readFileSync(RETIRED_SURFACES_PATH, "utf-8"));
}

function listFiles(dir: string, exts: readonly string[]): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const abs = join(dir, entry);
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      out.push(...listFiles(abs, exts));
    } else if (exts.some((ext) => entry.endsWith(ext))) {
      out.push(abs);
    }
  }
  return out;
}

describe("residue scan: epc-retired-surfaces.json is well-formed", () => {
  test("carries the frozen schema, the four sweep roots, and at least the EPC-05/07/08 deletion union (8 surfaces)", () => {
    const data = loadRetiredSurfaces();
    expect(data.schema).toBe("repo-harness-epc-retired-surfaces.v1");
    expect(data.scan_roots).toEqual(["src", "scripts", ".ai/hooks", "assets"]);
    expect(data.scan_extensions).toEqual([".ts", ".sh"]);
    expect(data.surfaces.length).toBeGreaterThanOrEqual(8);

    const ids = data.surfaces.map((surface) => surface.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const surface of data.surfaces) {
      expect(surface.patterns.length).toBeGreaterThan(0);
      expect(["EPC-05", "EPC-07", "EPC-08"]).toContain(surface.retiring_package);
      // Every regex pattern must actually compile.
      for (const source of surface.patterns) {
        expect(() => new RegExp(source)).not.toThrow();
      }
    }
  });

  test("every declared allowed_exception path actually exists (no stale exception masking a real gap)", () => {
    const data = loadRetiredSurfaces();
    for (const surface of data.surfaces) {
      for (const exceptionPath of surface.allowed_exceptions) {
        expect(existsSync(join(REPO_ROOT, exceptionPath))).toBe(true);
      }
    }
  });
});

describe("residue scan: zero unexcepted hits across src/, scripts/, .ai/hooks/, assets/", () => {
  test("no retired surface's pattern matches outside its documented allowed_exceptions", () => {
    const data = loadRetiredSurfaces();
    const files: string[] = [];
    for (const root of data.scan_roots) {
      files.push(...listFiles(join(REPO_ROOT, root), data.scan_extensions));
    }
    const relFiles = files.map((abs) => abs.slice(REPO_ROOT.length + 1));

    const hits: Array<{ surface: string; file: string; pattern: string }> = [];
    for (const surface of data.surfaces) {
      const exceptions = new Set(surface.allowed_exceptions);
      const patterns = surface.patterns.map((source) => new RegExp(source));
      for (const relPath of relFiles) {
        if (exceptions.has(relPath)) continue;
        const content = readFileSync(join(REPO_ROOT, relPath), "utf-8");
        for (let i = 0; i < patterns.length; i++) {
          if (patterns[i]!.test(content)) {
            hits.push({ surface: surface.id, file: relPath, pattern: surface.patterns[i]! });
          }
        }
      }
    }
    expect(hits).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Direct, precise re-assertions of each named retired surface -- a JSON
// authoring typo in the sweep above must not be the only line of defense.
// ---------------------------------------------------------------------------
describe("residue scan: direct re-assertion of each named retired surface", () => {
  test("verify-sprint.sh no longer cp's its report onto checks/latest.json (EPC-05)", () => {
    const text = readFileSync(join(REPO_ROOT, "scripts/verify-sprint.sh"), "utf-8");
    expect(text).not.toMatch(/cp\s+"\$checks_report"\s+"\$checks_file"/);
    expect(text).not.toMatch(/cp\s+"\$finalized_checks"\s+"\$checks_file"/);
    const mirror = readFileSync(join(REPO_ROOT, "assets/templates/helpers/verify-sprint.sh"), "utf-8");
    expect(mirror).toBe(text);
  });

  test("workflow-state.sh no longer bootstraps checks/latest.json with {} (EPC-05)", () => {
    const text = readFileSync(join(REPO_ROOT, ".ai/hooks/lib/workflow-state.sh"), "utf-8");
    expect(text).not.toMatch(/printf "\{\}\\n" > "\$\(workflow_checks_file\)"/);
    const mirror = readFileSync(join(REPO_ROOT, "assets/hooks/lib/workflow-state.sh"), "utf-8");
    expect(mirror).not.toMatch(/printf "\{\}\\n" > "\$\(workflow_checks_file\)"/);
  });

  test("mutation-observed.ts's contract-verification target is the dedicated path, never resolveChecksFile (EPC-05 residual 2b)", () => {
    const text = readFileSync(join(REPO_ROOT, "src/cli/hook/mutation-observed.ts"), "utf-8");
    expect(text).not.toMatch(/checksFile:\s*resolveChecksFile\(repoRoot\)/);
    expect(text).toContain("CONTRACT_VERIFICATION_REPORT_RELATIVE");
  });

  test("workflow_write_handoff is a thin invoker with no heredoc content assembly (EPC-07)", () => {
    const text = readFileSync(join(REPO_ROOT, ".ai/hooks/lib/workflow-state.sh"), "utf-8");
    expect(text).not.toContain("<<EOF_HANDOFF");
    expect(text).not.toContain("<<EOF_RESUME");
    expect(text).not.toContain("generated-by: workflow_write_handoff v1");
    expect(text).toContain("recovery-view-cli.ts");
  });

  test("codex-handoff-resume.sh defines no local content-assembly helpers (EPC-07)", () => {
    const text = readFileSync(join(REPO_ROOT, "scripts/codex-handoff-resume.sh"), "utf-8");
    expect(text).not.toMatch(/^active_plan\(\)\s*\{/m);
    expect(text).not.toMatch(/^safe_repo_file\(\)\s*\{/m);
    expect(text).toContain("recovery-view-cli.ts");
  });

  test("prepare-codex-handoff.sh assembles no independent global-packet splice (EPC-07)", () => {
    const text = readFileSync(join(REPO_ROOT, "scripts/prepare-codex-handoff.sh"), "utf-8");
    expect(text).not.toMatch(/<!--\s*repo:.*start\s*-->/);
    expect(text).not.toContain("PY_EOF");
    expect(text).toContain("recovery-view-cli.ts");
  });

  test("workflow_ensure_harness_surface no longer bootstraps handoff/resume placeholders (EPC-07)", () => {
    const text = readFileSync(join(REPO_ROOT, ".ai/hooks/lib/workflow-state.sh"), "utf-8");
    const start = text.indexOf("workflow_ensure_harness_surface() {");
    expect(start).toBeGreaterThan(-1);
    const end = text.indexOf("\n}\n", start);
    const body = text.slice(start, end);
    expect(body).not.toContain("Harness Handoff");
    expect(body).not.toContain("Codex Resume Packet");
  });

  test("session-context.ts no longer re-derives resume availability by string-scanning the marker (EPC-08)", () => {
    const text = readFileSync(join(REPO_ROOT, "src/cli/hook/session-context.ts"), "utf-8");
    expect(text).not.toMatch(/text\.includes\(['"]<!-- generated-by: repo-harness codex-handoff-resume v1 -->['"]\)/);
    expect(text).toContain("resolveRecoveryEvidence");
  });
});

// ---------------------------------------------------------------------------
// Checked closeout assertion: frozen fallback (row 13, orchestrator ruling,
// 2026-07-23). One protocol-clean matched-benchmark attempt
// (post-epc-196e787a-20260723-a01) self-classified failed_during_run; the
// orchestrator ruled to take row 13's frozen cannot-execute fallback branch
// rather than a second attempt. This block machine-checks that the fallback
// was actually recorded where it must be (three Program authority documents)
// and that the relabel never mutated the pre-EPC report's own bytes.
// ---------------------------------------------------------------------------
describe("closeout assertion: frozen fallback (row 13, orchestrator ruling)", () => {
  const CHANGELOG_PATH = join(REPO_ROOT, "docs/CHANGELOG.md");
  const RESEARCH_DOC_PATH = join(REPO_ROOT, "docs/researches/20260723-epc-program-closeout.research.md");
  const SPRINT_DOC_PATH = join(REPO_ROOT, "plans/sprints/20260722-0001-evidence-projection-convergence.sprint.md");

  const FALLBACK_DOCS: ReadonlyArray<{ readonly label: string; readonly path: string }> = [
    { label: "docs/CHANGELOG.md", path: CHANGELOG_PATH },
    { label: "docs/researches/20260723-epc-program-closeout.research.md", path: RESEARCH_DOC_PATH },
    { label: "plans/sprints/20260722-0001-evidence-projection-convergence.sprint.md", path: SPRINT_DOC_PATH },
  ];

  /**
   * Mechanism (documented per the orchestrator's own instruction): a
   * benchmark-improvement claim is asserted absent by checking that EVERY
   * occurrence of "benchmark improvement" / "benchmark-improvement"
   * (case-insensitive; line-wrapped markdown prose is normalized to single
   * spaces first, since a hard-wrapped sentence can put a real newline
   * between the two words) has a negation marker
   * (no / not / never / n't / zero) somewhere in the 80 characters
   * immediately preceding it. This is deliberately NOT true negation-scope
   * parsing -- it is a bounded, deterministic proxy: every legitimate
   * instance in this Program's own frozen text reads either "no
   * benchmark-improvement claim" or "must not claim benchmark improvement",
   * both of which satisfy a same-clause negation-marker check; an
   * affirmative, unnegated instance ("shows a clear benchmark improvement")
   * would NOT have a negation marker in that window and would fail this
   * check.
   */
  function assertOnlyNegatedBenchmarkImprovement(text: string, label: string): void {
    const normalized = text.replace(/\s+/g, " ");
    const pattern = /benchmark[- ]improvement/gi;
    const violations: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(normalized)) !== null) {
      const windowStart = Math.max(0, match.index - 80);
      const window = normalized.slice(windowStart, match.index);
      if (!/\b(no|not|never|n't|zero)\b/i.test(window)) {
        const contextStart = Math.max(0, match.index - 60);
        violations.push(`${label}: "...${normalized.slice(contextStart, match.index + 60)}..."`);
      }
    }
    expect(violations).toEqual([]);
  }

  test("the exact fallback designation phrase 'descriptive pre-EPC baseline only' is present in the changelog, the closeout research doc, and the sprint document", () => {
    for (const doc of FALLBACK_DOCS) {
      const text = readFileSync(doc.path, "utf-8");
      expect(text.includes("descriptive pre-EPC baseline only")).toBe(true);
    }
  });

  test("the exact no-benchmark-improvement claim sentence fragment is present, and every 'benchmark improvement' occurrence in these three documents is negated -- never an unnegated improvement claim", () => {
    for (const doc of FALLBACK_DOCS) {
      const text = readFileSync(doc.path, "utf-8");
      const normalized = text.replace(/\s+/g, " ").toLowerCase();
      expect(normalized.includes("claims no benchmark improvement")).toBe(true);
      assertOnlyNegatedBenchmarkImprovement(text, doc.label);
    }
  });

  test("the pre-EPC benchmark report triplet bytes are untouched by the fallback relabel -- the relabel lives only in Program authority documents", () => {
    const jsonPath = join(REPO_ROOT, "evals/harness/reports/profile-comparison.json");
    const mdPath = join(REPO_ROOT, "evals/harness/reports/profile-comparison.md");
    const sidecarPath = join(REPO_ROOT, "evals/harness/reports/profile-comparison.sha256.json");
    expect(existsSync(jsonPath)).toBe(true);
    expect(existsSync(mdPath)).toBe(true);
    expect(existsSync(sidecarPath)).toBe(true);

    const sidecar = JSON.parse(readFileSync(sidecarPath, "utf-8")) as {
      readonly files: {
        readonly json: { readonly sha256: string };
        readonly markdown: { readonly sha256: string };
      };
    };
    const jsonHash = `sha256:${createHash("sha256").update(readFileSync(jsonPath)).digest("hex")}`;
    const mdHash = `sha256:${createHash("sha256").update(readFileSync(mdPath)).digest("hex")}`;
    expect(jsonHash).toBe(sidecar.files.json.sha256);
    expect(mdHash).toBe(sidecar.files.markdown.sha256);
  });
});
