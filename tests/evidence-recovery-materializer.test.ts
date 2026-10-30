import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { commitAll, initGitRepo, run } from "./helpers/repo-fixture";

import type { SubjectIdentity, TrustClass } from "../src/core/evidence/types";
import { publishCheckpointFromLedger } from "../src/effects/evidence/checkpoint-store";
import { LEDGER_EPOCH_START_SHA } from "../src/effects/evidence/epoch";
import { appendEvidenceEvent, appendGenesisRecord } from "../src/effects/evidence/event-log";
import {
  buildRecoveryContext,
  renderRecoveryHandoff,
  renderRecoveryResume,
  resolveRecoveryEvidence,
} from "../src/effects/evidence/recovery-materializer";

const REPO_ROOT = join(import.meta.dir, "..");
const SUBJECT_A = `sha256:${"a".repeat(64)}`;
const FIXED_NOW = () => new Date("2026-07-22T22:00:00.000Z");

function withTempRepo(prefix: string, fn: (repoRoot: string) => void): void {
  const repoRoot = mkdtempSync(join(tmpdir(), `${prefix}-`));
  try {
    mkdirSync(join(repoRoot, ".ai/harness"), { recursive: true });
    writeFileSync(join(repoRoot, ".ai/harness/policy.json"), "{}\n");
    fn(repoRoot);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
}

function baseIdentity(overrides: Partial<SubjectIdentity> = {}): SubjectIdentity {
  return {
    authority_commit: "a".repeat(40),
    base_commit: "b".repeat(40),
    target_commit: "c".repeat(40),
    scope_hash: `sha256:${"d".repeat(64)}`,
    subject_hash: SUBJECT_A,
    contract_hash: `sha256:${"f".repeat(64)}`,
    command_hash: `sha256:${"0".repeat(64)}`,
    env_provider_id: "repo-harness/0.0.0/ws-test",
    ...overrides,
  };
}

function seedGenesis(repoRoot: string, worktreeId = "fixture"): void {
  appendGenesisRecord(repoRoot, LEDGER_EPOCH_START_SHA, { worktreeId });
}

function seedEvent(
  repoRoot: string,
  opts: {
    readonly worktreeId?: string;
    readonly eventType?: string;
    readonly trustClass?: TrustClass;
    readonly marker?: string;
  } = {},
) {
  return appendEvidenceEvent(repoRoot, {
    worktreeId: opts.worktreeId ?? "fixture",
    eventType: opts.eventType ?? "verify_sprint.result",
    trustClass: opts.trustClass ?? "authoritative_machine",
    producer: "verify-sprint",
    correlationRunId: `run-${Math.random().toString(36).slice(2)}`,
    subjectIdentity: baseIdentity(),
    payload: { kind: "json", value: { marker: opts.marker ?? "default" } },
  });
}


describe("recovery-materializer: repository identity", () => {
  test("records branch, HEAD and the issue from <type>/<number>-<slug> and no plan or todos", () => {
    withTempRepo("recovery-repository-identity", (repoRoot) => {
      writeFileSync(join(repoRoot, "README.md"), "# Fixture\n");
      mkdirSync(join(repoRoot, "plans"), { recursive: true });
      writeFileSync(join(repoRoot, "plans/plan-20260101-1200-think-plan-123.md"), "# Plan: Real Title\n");
      mkdirSync(join(repoRoot, "tasks"), { recursive: true });
      writeFileSync(join(repoRoot, "tasks/todos.md"), "# Deferred\n> **Source Plan**: plans/plan-20260101-1200-think-plan-123.md\n");
      initGitRepo(repoRoot);
      commitAll(repoRoot, "fixture");
      expect(run("git", ["checkout", "-b", "feat/1178-hook-recovery"], repoRoot).status).toBe(0);
      const head = run("git", ["rev-parse", "HEAD"], repoRoot).stdout.trim();

      const context = buildRecoveryContext(repoRoot, {}, { reason: "unit-test", now: FIXED_NOW });

      expect(context.repository).toEqual({ branch: "feat/1178-hook-recovery", head, issue: 1178 });
      expect(context.goal).toBe("Continue GitHub issue #1178 on branch feat/1178-hook-recovery.");
      const evidence = resolveRecoveryEvidence(repoRoot);
      const handoff = renderRecoveryHandoff(context, evidence);
      const resume = renderRecoveryResume(context, evidence);
      expect(handoff).toContain("- Branch: feat/1178-hook-recovery");
      expect(handoff).toContain(`- HEAD: ${head}`);
      expect(handoff).toContain("- Issue: 1178");
      expect(resume).toContain("- Issue: 1178");
      expect(handoff).not.toContain("plans/plan-20260101-1200-think-plan-123.md");
      expect(handoff).not.toContain("tasks/todos.md");
      expect(handoff).not.toContain("Active plan:");
      expect(resume).not.toContain("Plan:");
      expect(resume).not.toContain("Todo:");
    });
  });

  test("writes issue: none without guessing when the branch has no issue number", () => {
    withTempRepo("recovery-repository-no-issue", (repoRoot) => {
      writeFileSync(join(repoRoot, "README.md"), "# Fixture\n");
      initGitRepo(repoRoot);
      commitAll(repoRoot, "fixture");

      const context = buildRecoveryContext(repoRoot, {}, { reason: "unit-test", now: FIXED_NOW });

      expect(context.repository).toMatchObject({ branch: "main", issue: null });
      expect(context.goal).toBe("Continue work on branch main.");
      const handoff = renderRecoveryHandoff(context, resolveRecoveryEvidence(repoRoot));
      expect(handoff).toContain("- Issue: none");
      expect(handoff).not.toContain("Continue GitHub issue");
    });
  });

  test("records unknown branch and HEAD outside a Git repository", () => {
    withTempRepo("recovery-repository-not-git", (repoRoot) => {
      const context = buildRecoveryContext(repoRoot, {}, { reason: "unit-test", now: FIXED_NOW });
      expect(context.repository).toEqual({ branch: "(unknown)", head: "(unknown)", issue: null });
    });
  });

  test("a policy path outside its root fails closed instead of taking the default", () => {
    withTempRepo("recovery-artifacts-unsafe-policy", (repoRoot) => {
      writeFileSync(join(repoRoot, ".ai/harness/policy.json"), JSON.stringify({ harness: { handoff_file: "../handoff.md" } }));
      expect(() => buildRecoveryContext(repoRoot, {}, { reason: "unit-test", now: FIXED_NOW }))
        .toThrow("unsafe workflow policy path .harness.handoff_file: ../handoff.md");
    });
  });
});

describe("recovery-materializer: determinism", () => {
  test("same context + evidence + injected clock renders byte-identical handoff and resume", () => {
    withTempRepo("recovery-determinism", (repoRoot) => {
      const context = buildRecoveryContext(repoRoot, {}, { reason: "unit-test", now: FIXED_NOW });
      const evidence = resolveRecoveryEvidence(repoRoot);

      const handoffA = renderRecoveryHandoff(context, evidence);
      const handoffB = renderRecoveryHandoff(context, evidence);
      const resumeA = renderRecoveryResume(context, evidence);
      const resumeB = renderRecoveryResume(context, evidence);

      expect(handoffA).toBe(handoffB);
      expect(resumeA).toBe(resumeB);
      expect(resumeA).toContain('herdr skill');
      expect(resumeA).not.toContain('sidecar `codex exec');
      expect(resumeA).not.toContain('whether to use subagents');
    });
  });

  test("a different injected clock changes the rendered generated-at text (and, since the display timestamp is part of the hashed body, its content_hash) but not the rest of the workflow-context fields", () => {
    withTempRepo("recovery-determinism-clock", (repoRoot) => {
      const contextA = buildRecoveryContext(repoRoot, {}, { reason: "unit-test", now: FIXED_NOW, runId: "fixed-run-id" });
      const contextB = buildRecoveryContext(repoRoot, {}, { reason: "unit-test", now: () => new Date("2026-07-23T00:00:00.000Z"), runId: "fixed-run-id" });
      const evidence = resolveRecoveryEvidence(repoRoot);

      const handoffA = renderRecoveryHandoff(contextA, evidence);
      const handoffB = renderRecoveryHandoff(contextB, evidence);
      expect(handoffA).not.toBe(handoffB);
      expect(contextA.runId).toBe(contextB.runId);
      // Every workflow-context field besides the two rendered timestamps
      // (the "Generated" display line and the Provenance "Generated at"/
      // "Content hash" lines) is identical -- the clock only ever touches
      // its own rendered text and the hash that covers it.
      const strip = (text: string) => text
        .replace(/^> \*\*Generated\*\*:.*$/m, "")
        .replace(/^- Generated at:.*$/m, "")
        .replace(/^- Content hash:.*$/m, "");
      expect(strip(handoffA)).toBe(strip(handoffB));
    });
  });
});

describe("recovery-materializer: evidence (single hop: checkpoint -> view)", () => {
  test("no checkpoint published yet renders a typed minimal state, never a fabricated claim", () => {
    withTempRepo("recovery-no-checkpoint", (repoRoot) => {
      const evidence = resolveRecoveryEvidence(repoRoot);
      expect(evidence.available).toBe(false);
      if (!evidence.available) expect(evidence.reason).toBe("no-checkpoint");

      const context = buildRecoveryContext(repoRoot, {}, { reason: "unit-test", now: FIXED_NOW });
      const handoff = renderRecoveryHandoff(context, evidence);
      expect(handoff).toContain("- Checkpoint: (none published yet -- no ledger evidence recorded in this worktree)");
      expect(handoff).toContain("- Covered events: 0");
      expect(handoff).not.toContain("chk-");
    });
  });

  test("a dangling/invalid checkpoint marker degrades to the same typed unavailable shape, never throws", () => {
    withTempRepo("recovery-invalid-checkpoint", (repoRoot) => {
      mkdirSync(join(repoRoot, ".ai/harness/evidence/checkpoints"), { recursive: true });
      writeFileSync(
        join(repoRoot, ".ai/harness/evidence/checkpoints/last-published.json"),
        `${JSON.stringify({ schema_version: 1, checkpoint_id: "chk-missing", checkpoint_dir: "x", machine_path: "does/not/exist.json", human_path: "does/not/exist.md", content_hash: "sha256:0", published_at: "now" })}\n`,
      );

      let evidence: ReturnType<typeof resolveRecoveryEvidence>;
      expect(() => {
        evidence = resolveRecoveryEvidence(repoRoot);
      }).not.toThrow();
      evidence = resolveRecoveryEvidence(repoRoot);
      expect(evidence.available).toBe(false);
      if (!evidence.available) expect(evidence.reason).toBe("checkpoint-invalid");

      const context = buildRecoveryContext(repoRoot, {}, { reason: "unit-test", now: FIXED_NOW });
      const handoff = renderRecoveryHandoff(context, evidence);
      expect(handoff).toContain("- Checkpoint: (unavailable");
    });
  });

  test("a real published checkpoint's covered events and latest-by-type surface as the view's evidence claims", () => {
    withTempRepo("recovery-real-checkpoint", (repoRoot) => {
      seedGenesis(repoRoot);
      const event = seedEvent(repoRoot, { marker: "authoritative" });
      const published = publishCheckpointFromLedger(repoRoot, FIXED_NOW);
      expect(published.status).toBe("published");

      const evidence = resolveRecoveryEvidence(repoRoot);
      expect(evidence.available).toBe(true);
      if (!evidence.available) throw new Error("unreachable");
      expect(evidence.coveredEventCount).toBe(1);
      expect(evidence.sourceEventIds).toEqual([event.event_id]);

      const context = buildRecoveryContext(repoRoot, {}, { reason: "unit-test", now: FIXED_NOW });
      const handoff = renderRecoveryHandoff(context, evidence);
      expect(handoff).toContain(`- Checkpoint: ${evidence.checkpointId}`);
      expect(handoff).toContain(`verify_sprint.result: ${event.event_id}`);
      expect(handoff).toContain("## Provenance");
      expect(handoff).toContain(`- Source checkpoint id: ${evidence.checkpointId}`);
      expect(handoff).toContain("- Content hash: sha256:");
    });
  });
});

describe("recovery-materializer: checkpoint decisions", () => {
  test("shows no decisions without a checkpoint", () => {
    withTempRepo("recovery-no-decisions", repoRoot => {
      const context = buildRecoveryContext(repoRoot, {}, { reason: "unit-test", now: FIXED_NOW });
      const handoff = renderRecoveryHandoff(context, resolveRecoveryEvidence(repoRoot));
      expect(handoff).toContain("## Decisions\n\n- (none recorded)\n");
    });
  });

  test("uses only published decisions and replaces a corrected row after publication", () => {
    withTempRepo("recovery-decisions", repoRoot => {
      seedGenesis(repoRoot);
      const first = appendEvidenceEvent(repoRoot, {
        worktreeId: "fixture", eventType: "decision.recorded", trustClass: "observed", producer: "decision-trail",
        correlationRunId: "run-first", subjectIdentity: baseIdentity(),
        payload: { kind: "json", value: { phase: "plan", decision: "Use first choice", why: "Prior evidence",
          evidence: ["#812"], result: "Proposed" } },
      });
      expect(publishCheckpointFromLedger(repoRoot, FIXED_NOW).status).toBe("published");
      const correction = appendEvidenceEvent(repoRoot, {
        worktreeId: "fixture", eventType: "decision.recorded", trustClass: "observed", producer: "decision-trail",
        correlationRunId: "run-correction", subjectIdentity: baseIdentity(), supersedes: [first.event_id],
        payload: { kind: "json", value: { phase: "build", decision: "Use revised choice", why: "New evidence",
          evidence: ["src/core/evidence/types.ts:42"], result: "Implemented" } },
      });
      const context = buildRecoveryContext(repoRoot, {}, { reason: "unit-test", now: FIXED_NOW });
      const stale = renderRecoveryHandoff(context, resolveRecoveryEvidence(repoRoot));
      expect(stale).toContain("Use first choice");
      expect(stale).not.toContain("Use revised choice");
      expect(publishCheckpointFromLedger(repoRoot, FIXED_NOW).status).toBe("published");
      writeFileSync(join(repoRoot, ".ai/harness/evidence/events/log.jsonl"), "invalid raw log\n");
      const handoff = renderRecoveryHandoff(context, resolveRecoveryEvidence(repoRoot));
      const section = handoff.split("## Decisions\n\n")[1].split("\n\n## Files Touched")[0];
      expect(section.split("\n")).toHaveLength(1);
      expect(section).toContain("Use revised choice; Why: New evidence");
      expect(section).toContain("Evidence: src/core/evidence/types.ts:42; Result: Implemented");
      expect(section).toContain(`Event: ${correction.event_id}; Supersedes: ${first.event_id}`);
      expect(section).not.toContain("Use first choice");
    });
  });
});

describe("recovery-materializer: resume view carries the preserved external-observable contract", () => {
  test("resume keeps the legacy marker and a Resume Prompt header the EPC-08 SessionStart reader depends on", () => {
    withTempRepo("recovery-resume-contract", (repoRoot) => {
      const context = buildRecoveryContext(repoRoot, {}, { reason: "unit-test", now: FIXED_NOW });
      const evidence = resolveRecoveryEvidence(repoRoot);
      const resume = renderRecoveryResume(context, evidence);
      expect(resume).toContain("<!-- generated-by: repo-harness codex-handoff-resume v1 -->");
      expect(resume).toContain("## Resume Prompt");
      expect(resume).toContain("## Provenance");
    });
  });
});

describe("recovery-view-cli.ts: end-to-end", () => {
  function initGitRepo(cwd: string): void {
    expect(run("git", ["init", "-q", "-b", "main"], cwd).status).toBe(0);
    expect(run("git", ["config", "user.email", "test@example.com"], cwd).status).toBe(0);
    expect(run("git", ["config", "user.name", "Test"], cwd).status).toBe(0);
  }

  test("materializes handoff and resume, and a hand edit is fully overwritten by the next run", () => {
    const cwd = mkdtempSync(join(tmpdir(), "recovery-cli-e2e-"));
    try {
      initGitRepo(cwd);
      mkdirSync(join(cwd, ".ai/harness"), { recursive: true });
      mkdirSync(join(cwd, "tasks"), { recursive: true });
      writeFileSync(join(cwd, "tasks/todos.md"), "");
      writeFileSync(join(cwd, "README.md"), "hello\n");
      expect(run("git", ["add", "-A"], cwd).status).toBe(0);
      expect(run("git", ["commit", "-q", "-m", "init"], cwd).status).toBe(0);

      const first = run("bun", [join(REPO_ROOT, "scripts/recovery-view-cli.ts"), "--cwd", cwd, "--reason", "first-run"], cwd);
      expect(first.status).toBe(0);
      const handoffPath = join(cwd, ".ai/harness/handoff/current.md");
      const resumePath = join(cwd, ".ai/harness/handoff/resume.md");
      expect(existsSync(handoffPath)).toBe(true);
      expect(existsSync(resumePath)).toBe(true);
      const firstHandoff = readFileSync(handoffPath, "utf-8");
      expect(firstHandoff).toContain("**Reason**: first-run");
      expect(firstHandoff).toContain("## Provenance");

      // Hand-edit: a stale/divergent hand-written recovery projection.
      writeFileSync(handoffPath, "# HAND EDITED -- SHOULD NOT SURVIVE\n");
      writeFileSync(resumePath, "# HAND EDITED -- SHOULD NOT SURVIVE\n");

      const second = run("bun", [join(REPO_ROOT, "scripts/recovery-view-cli.ts"), "--cwd", cwd, "--reason", "second-run"], cwd);
      expect(second.status).toBe(0);
      const secondHandoff = readFileSync(handoffPath, "utf-8");
      const secondResume = readFileSync(resumePath, "utf-8");
      expect(secondHandoff).not.toContain("HAND EDITED");
      expect(secondResume).not.toContain("HAND EDITED");
      expect(secondHandoff).toContain("**Reason**: second-run");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("--print-prompt prints only the Resume Prompt body and writes no output besides the recovery views", () => {
    const cwd = mkdtempSync(join(tmpdir(), "recovery-cli-print-prompt-"));
    try {
      mkdirSync(join(cwd, ".ai/harness"), { recursive: true });
      mkdirSync(join(cwd, "tasks"), { recursive: true });
      writeFileSync(join(cwd, "tasks/todos.md"), "");

      const result = run("bun", [join(REPO_ROOT, "scripts/recovery-view-cli.ts"), "--cwd", cwd, "--reason", "prompt-test", "--print-prompt"], cwd);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("fresh Codex session");
      expect(result.stdout).not.toContain("## Source Artifacts");
      expect(result.stdout).not.toContain("## Provenance");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("--with-global-packet updates the Codex-global handoff file with a per-repo spliced section", () => {
    const cwd = mkdtempSync(join(tmpdir(), "recovery-cli-global-"));
    const codexHome = mkdtempSync(join(tmpdir(), "recovery-cli-codex-home-"));
    try {
      mkdirSync(join(cwd, ".ai/harness"), { recursive: true });
      mkdirSync(join(cwd, "tasks"), { recursive: true });
      writeFileSync(join(cwd, "tasks/todos.md"), "");

      const result = run(
        "bun",
        [join(REPO_ROOT, "scripts/recovery-view-cli.ts"), "--cwd", cwd, "--reason", "global-test", "--with-global-packet"],
        cwd,
        { CODEX_HOME: codexHome },
      );
      expect(result.status).toBe(0);
      const handoffs = readdirSync(join(codexHome, "handoffs")).filter((name) => /^handoff-\d{6}\.md$/.test(name));
      expect(handoffs.length).toBe(1);
      const global = readFileSync(join(codexHome, "handoffs", handoffs[0]), "utf-8");
      expect(global).toContain("Filesystem-first fallback handoffs");
      expect(global).toContain("### Repo Handoff");
      expect(global).toContain("### Resume Packet");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(codexHome, { recursive: true, force: true });
    }
  }, 30_000);
});

describe("no-independent-authoring: the retired writers carry zero content assembly", () => {
  const CANDIDATE_FILES = [
    "scripts/prepare-handoff.sh",
    "scripts/codex-handoff-resume.sh",
    "scripts/prepare-codex-handoff.sh",
  ];

  test("the retired heredoc content-assembly markers no longer appear in any thinned writer", () => {
    const retiredMarkers = [
      "<<EOF_HANDOFF",
      "<<EOF_RESUME",
      "generated-by: workflow_write_handoff v1",
    ];
    for (const relPath of CANDIDATE_FILES) {
      const text = readFileSync(join(REPO_ROOT, relPath), "utf-8");
      for (const marker of retiredMarkers) {
        expect(text.includes(marker)).toBe(false);
      }
    }
  });

  test("the thinned writers delegate to the single standalone materializer and nowhere else", () => {
    for (const relPath of CANDIDATE_FILES) {
      const text = readFileSync(join(REPO_ROOT, relPath), "utf-8");
      expect(text).toContain("recovery-view-cli");
    }
  });

  test("the recovery CLI renders nothing of its own", () => {
    for (const relPath of ["scripts/recovery-view-cli.ts"]) {
      const text = readFileSync(join(REPO_ROOT, relPath), "utf-8");
      expect(text).toContain("src/effects/evidence/recovery-materializer\";");
      expect(text).not.toContain("# Harness Handoff");
      expect(text).not.toContain("## Provenance");
    }
  });
});

describe("tasks/current.md: refresh-current-status.sh stays the sole materializer (drift check)", () => {
  test("two independent non-mutating preview regenerations agree byte-for-byte modulo the volatile updated_at timestamp", () => {
    // Non-mutating: no --write, so this never touches the tracked file --
    // deliberately not compared against tasks/current.md itself, which is
    // a point-in-time snapshot only refreshed at explicit lifecycle
    // boundaries (root CLAUDE.md) and is legitimately stale mid-task; the
    // regenerate -> compare drift check instead proves the materializer
    // itself is stable across repeated regenerations of the same live
    // source-of-truth artifacts, the actual no-drift property this row
    // requires.
    const first = run("bash", ["scripts/refresh-current-status.sh"], REPO_ROOT);
    const second = run("bash", ["scripts/refresh-current-status.sh"], REPO_ROOT);
    expect(first.status).toBe(0);
    expect(second.status).toBe(0);
    expect(first.stdout).toContain("<!-- generated-by: repo-harness refresh-current-status v1 -->");

    const strip = (text: string) => text
      .replace(/^<!-- updated_at:.*$/m, "")
      .replace(/^> \*\*Updated At\*\*:.*$/m, "");
    expect(strip(first.stdout)).toBe(strip(second.stdout));
  }, 30_000);
});
