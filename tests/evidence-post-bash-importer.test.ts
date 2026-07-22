import { describe, expect, test } from "bun:test";
import { createHash } from "crypto";
import { execFileSync } from "child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { LEDGER_EPOCH_START_SHA } from "../src/effects/evidence/epoch";
import {
  importPostBashObservation,
  UNBOUND_SENTINEL,
  type PostBashObservationInput,
} from "../src/effects/evidence/post-bash-importer";
import { readAcceptedEvents, readGenesisRecord } from "../src/effects/evidence/event-log";

function git(repoRoot: string, args: readonly string[]): void {
  execFileSync("git", ["-C", repoRoot, ...args], { encoding: "utf-8" });
}

function withTempRepo(prefix: string, fn: (repoRoot: string) => void): void {
  const repoRoot = mkdtempSync(join(tmpdir(), `${prefix}-`));
  try {
    fn(repoRoot);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
}

/**
 * A minimal real git fixture repo, own to this producer's test suite (tmp
 * prefix `post-bash-importer-*`, disjoint from EPC-04's fixture names per
 * R4). One base commit plus, optionally, a committed contract declaring
 * `allowed_paths`.
 */
function setupFixtureRepo(
  repoRoot: string,
  opts: { readonly commitContract?: boolean; readonly allowedPaths?: readonly string[] } = {},
): { readonly contractRelative: string } {
  mkdirSync(repoRoot, { recursive: true });
  git(repoRoot, ["init", "-q", "-b", "main"]);
  git(repoRoot, ["config", "user.email", "post-bash-importer-test@example.com"]);
  git(repoRoot, ["config", "user.name", "post-bash-importer-test"]);

  writeFileSync(join(repoRoot, ".gitignore"), ".ai/harness/evidence/\n");
  writeFileSync(join(repoRoot, "README.md"), "base\n");
  git(repoRoot, ["add", ".gitignore", "README.md"]);
  git(repoRoot, ["commit", "-q", "-m", "base"]);

  const allowedPaths = opts.allowedPaths ?? [
    "src/effects/evidence/post-bash-importer.ts",
    "tests/evidence-post-bash-importer.test.ts",
  ];
  const contractRelative = "tasks/contracts/fixture.contract.md";
  mkdirSync(join(repoRoot, "tasks", "contracts"), { recursive: true });
  const contractBody = [
    "# Task Contract: fixture",
    "",
    "## Allowed Paths",
    "",
    "```yaml",
    "allowed_paths:",
    ...allowedPaths.map((path) => `  - ${path}`),
    "```",
    "",
  ].join("\n");
  writeFileSync(join(repoRoot, contractRelative), contractBody);

  if (opts.commitContract ?? true) {
    git(repoRoot, ["add", contractRelative]);
    git(repoRoot, ["commit", "-q", "-m", "contract"]);
  }

  return { contractRelative };
}

function baseInput(repoRoot: string, overrides: Partial<PostBashObservationInput> = {}): PostBashObservationInput {
  return {
    repoRoot,
    command: "bun test tests/evidence-post-bash-importer.test.ts",
    exitCode: 0,
    durationMs: 1234,
    rawOutputPath: null,
    ...overrides,
  };
}

describe("importPostBashObservation: trust class and D3 field set", () => {
  test("emits exactly one observed event with the D3 field set and the small structured payload", () => {
    withTempRepo("post-bash-importer-basic", (repoRoot) => {
      setupFixtureRepo(repoRoot, { commitContract: false });
      const result = importPostBashObservation(
        baseInput(repoRoot, { rawOutputPath: ".ai/harness/runs/bash-output/post-bash-example.log" }),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.event.trust_class).toBe("observed");
      expect(result.event.event_id).toMatch(/^evt-/);
      expect(result.event.producer).toBe("post-bash-importer");

      const identity = result.event.subject_identity;
      expect(identity.base_commit).toMatch(/^[0-9a-f]{40}$/);
      expect(identity.target_commit).toMatch(/^[0-9a-f]{40}$/);
      expect(identity.subject_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(identity.command_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(identity.subject_hash).toBe(identity.command_hash);
      expect(identity.env_provider_id.length).toBeGreaterThan(0);

      const rawOutputPathValue = ".ai/harness/runs/bash-output/post-bash-example.log";
      expect(result.event.payload).toEqual({
        command_hash: expect.stringMatching(/^[0-9a-f]{16}$/),
        exit_code: 0,
        duration_ms: 1234,
        raw_output_ref: rawOutputPathValue.slice(-24),
      });
      // The reference is a short, always-safe-length suffix, not the
      // literal path -- verify it fits under the D6 redaction threshold
      // and is a genuine suffix of the real repo-relative path.
      const payloadValue = result.event.payload as { raw_output_ref: string };
      expect(payloadValue.raw_output_ref.length).toBeLessThan(32);
      expect(rawOutputPathValue.endsWith(payloadValue.raw_output_ref)).toBe(true);

      const { accepted } = readAcceptedEvents(repoRoot);
      expect(accepted.length).toBe(1);
    });
  });
});

describe("importPostBashObservation: unbound vs bound contract identity (sentinel rules)", () => {
  test("no active contract resolves -> unbound authority/scope/contract identity", () => {
    withTempRepo("post-bash-importer-no-contract", (repoRoot) => {
      setupFixtureRepo(repoRoot, { commitContract: false });
      const result = importPostBashObservation(baseInput(repoRoot));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const identity = result.event.subject_identity;
      expect(identity.authority_commit).toBe(UNBOUND_SENTINEL);
      expect(identity.scope_hash).toBe(UNBOUND_SENTINEL);
      expect(identity.contract_hash).toBe(UNBOUND_SENTINEL);
      expect(identity.base_commit).toMatch(/^[0-9a-f]{40}$/);
      expect(identity.target_commit).toMatch(/^[0-9a-f]{40}$/);
    });
  });

  test("a dirty (uncommitted) contract -> unbound authority/scope/contract identity", () => {
    withTempRepo("post-bash-importer-dirty-contract", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot);
      writeFileSync(
        join(repoRoot, contractRelative),
        readFileSync(join(repoRoot, contractRelative), "utf-8") + "\n<!-- dirty -->\n",
      );

      const result = importPostBashObservation(baseInput(repoRoot, { contractPath: contractRelative }));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const identity = result.event.subject_identity;
      expect(identity.authority_commit).toBe(UNBOUND_SENTINEL);
      expect(identity.scope_hash).toBe(UNBOUND_SENTINEL);
      expect(identity.contract_hash).toBe(UNBOUND_SENTINEL);
    });
  });

  test("an untracked (never committed) contract -> unbound authority/scope/contract identity", () => {
    withTempRepo("post-bash-importer-untracked-contract", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot, { commitContract: false });
      const result = importPostBashObservation(baseInput(repoRoot, { contractPath: contractRelative }));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const identity = result.event.subject_identity;
      expect(identity.authority_commit).toBe(UNBOUND_SENTINEL);
      expect(identity.scope_hash).toBe(UNBOUND_SENTINEL);
      expect(identity.contract_hash).toBe(UNBOUND_SENTINEL);
    });
  });

  test("a clean, committed contract -> bound authority/scope/contract identity", () => {
    withTempRepo("post-bash-importer-bound-contract", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot, { allowedPaths: ["src/a.ts", "src/b.ts"] });
      const result = importPostBashObservation(baseInput(repoRoot, { contractPath: contractRelative }));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const identity = result.event.subject_identity;
      expect(identity.authority_commit).toMatch(/^[0-9a-f]{40}$/);
      expect(identity.authority_commit).not.toBe(UNBOUND_SENTINEL);
      expect(identity.contract_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
      const expectedScopeHash = `sha256:${createHash("sha256").update(JSON.stringify(["src/a.ts", "src/b.ts"])).digest("hex")}`;
      expect(identity.scope_hash).toBe(expectedScopeHash);
    });
  });
});

describe("importPostBashObservation: observed-only ledger leaves authoritative gates unsatisfied", () => {
  test("filtering the accepted fold for authoritative_machine returns empty over an observed-only ledger", () => {
    withTempRepo("post-bash-importer-gate-unsatisfied", (repoRoot) => {
      setupFixtureRepo(repoRoot, { commitContract: false });
      importPostBashObservation(baseInput(repoRoot, { command: "bun test" }));
      importPostBashObservation(baseInput(repoRoot, { command: "git status" }));
      importPostBashObservation(baseInput(repoRoot, { command: "bun run check:type" }));

      const { accepted } = readAcceptedEvents(repoRoot);
      expect(accepted.length).toBeGreaterThan(0);
      expect(accepted.every((event) => event.trust_class === "observed")).toBe(true);
      expect(accepted.filter((event) => event.trust_class === "authoritative_machine")).toEqual([]);
    });
  });
});

describe("importPostBashObservation: fail-closed on malformed input", () => {
  test("a non-integer exitCode fails closed and appends nothing", () => {
    withTempRepo("post-bash-importer-malformed-exit-code", (repoRoot) => {
      setupFixtureRepo(repoRoot, { commitContract: false });
      const result = importPostBashObservation(baseInput(repoRoot, { exitCode: 1.5 }));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("malformed_input");

      expect(readGenesisRecord(repoRoot)).toBeNull();
      const { accepted } = readAcceptedEvents(repoRoot);
      expect(accepted.length).toBe(0);
    });
  });

  test("a negative durationMs fails closed and appends nothing", () => {
    withTempRepo("post-bash-importer-malformed-duration", (repoRoot) => {
      setupFixtureRepo(repoRoot, { commitContract: false });
      const result = importPostBashObservation(baseInput(repoRoot, { durationMs: -1 }));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("malformed_input");
      const { accepted } = readAcceptedEvents(repoRoot);
      expect(accepted.length).toBe(0);
    });
  });

  test("an absolute rawOutputPath fails closed and appends nothing", () => {
    withTempRepo("post-bash-importer-malformed-path", (repoRoot) => {
      setupFixtureRepo(repoRoot, { commitContract: false });
      const result = importPostBashObservation(baseInput(repoRoot, { rawOutputPath: "/etc/passwd" }));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("malformed_input");
      const { accepted } = readAcceptedEvents(repoRoot);
      expect(accepted.length).toBe(0);
    });
  });

  test("a path-traversal rawOutputPath fails closed and appends nothing", () => {
    withTempRepo("post-bash-importer-malformed-traversal", (repoRoot) => {
      setupFixtureRepo(repoRoot, { commitContract: false });
      const result = importPostBashObservation(baseInput(repoRoot, { rawOutputPath: "../escape.log" }));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("malformed_input");
      const { accepted } = readAcceptedEvents(repoRoot);
      expect(accepted.length).toBe(0);
    });
  });
});

describe("importPostBashObservation: idempotent re-import", () => {
  test("re-importing the identical observation dedups to one accepted event", () => {
    withTempRepo("post-bash-importer-idempotent", (repoRoot) => {
      setupFixtureRepo(repoRoot, { commitContract: false });
      const input = baseInput(repoRoot, { command: "bun test", correlationRunId: "run-a" });

      const first = importPostBashObservation(input);
      const second = importPostBashObservation({ ...input, correlationRunId: "run-b" });
      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) return;

      expect(first.event.idempotency_key).toBe(second.event.idempotency_key);

      const logPath = join(repoRoot, ".ai", "harness", "evidence", "events", "log.jsonl");
      const eventLines = readFileSync(logPath, "utf-8")
        .split("\n")
        .filter((line) => line.length > 0)
        .filter((line) => JSON.parse(line).kind === "evidence_event");
      expect(eventLines.length).toBe(2);

      const { accepted } = readAcceptedEvents(repoRoot);
      expect(accepted.length).toBe(1);
      expect(accepted[0]!.event_id).toBe(first.event.event_id);
    });
  });

  test("genesis is written once with LEDGER_EPOCH_START_SHA across repeated imports", () => {
    withTempRepo("post-bash-importer-genesis-once", (repoRoot) => {
      setupFixtureRepo(repoRoot, { commitContract: false });
      expect(readGenesisRecord(repoRoot)).toBeNull();

      const first = importPostBashObservation(baseInput(repoRoot));
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      expect(first.genesis.ledger_epoch_start_sha).toBe(LEDGER_EPOCH_START_SHA);

      const second = importPostBashObservation(baseInput(repoRoot, { command: "a different command" }));
      expect(second.ok).toBe(true);

      const logPath = join(repoRoot, ".ai", "harness", "evidence", "events", "log.jsonl");
      const lines = readFileSync(logPath, "utf-8").split("\n").filter((line) => line.length > 0);
      const genesisLines = lines.filter((line) => JSON.parse(line).kind === "evidence_genesis");
      expect(genesisLines.length).toBe(1);
    });
  });
});
