import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decideRecommendation, readRecommendationRecords, recordRefactorScan, runRefactorScan } from "../src/effects/refactor/archctx-provider";
import { RefactorProviderError, type RefactorScanResultV1 } from "../src/core/refactor/provider-contract";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function repo(): string { const root = mkdtempSync(join(tmpdir(), "refactor-provider-")); roots.push(root); return root; }

const capabilities = (version = "0.6.3") => ({ schemaVersion: "archcontext.capabilities/v1", package: { name: "archctx", version }, features: [] });
const envelope = (requestId: string, data: Record<string, unknown>) => ({ schemaVersion: "archcontext.envelope/v1", ok: true, requestId, data });

function runner(calls: string[][], respond: (args: readonly string[]) => unknown) {
  return (_binary: string, args: readonly string[]) => {
    calls.push([...args]);
    return { status: 0, signal: null, stderr: "", stdout: JSON.stringify(args[0] === "capabilities" ? capabilities() : respond(args)) };
  };
}

describe("refactor archctx provider", () => {
  test("checks the pinned version once per repository and returns the scan payload", () => {
    const root = repo(); const calls: string[][] = [];
    const run = runner(calls, () => envelope("refactor.scan", { schemaVersion: "archcontext.runtime-refactor-scan/v1", proposedRecommendations: [] }));
    expect(runRefactorScan(root, { consumerRoot: process.cwd(), run }).proposedRecommendations).toEqual([]);
    expect(readRecommendationRecords(root, { consumerRoot: process.cwd(), run: runner(calls, () => envelope("book.recommendations", { schemaVersion: "archcontext.architecture-book-recommendations/v1", recommendations: [] })) })).toEqual([]);
    expect(calls.map((args) => args[0])).toEqual(["capabilities", "refactor", "book"]);
  });

  test("fails on another archctx version and preserves upstream error codes", () => {
    const mismatch = (_binary: string, _args: readonly string[]) => ({ status: 0, signal: null, stderr: "", stdout: JSON.stringify(capabilities("0.0.1")) });
    expect(() => runRefactorScan(repo(), { consumerRoot: process.cwd(), run: mismatch })).toThrow("expected archctx@0.6.3");
    const failing = runner([], () => ({ schemaVersion: "archcontext.envelope/v1", ok: false, requestId: "recommendations.accept", error: { code: "AC_SCHEMA_INVALID", message: "recommendation not found: rec.x" } }));
    try {
      decideRecommendation("rec.x", "accept", "user agreed", repo(), { consumerRoot: process.cwd(), run: failing });
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(RefactorProviderError);
      expect((error as RefactorProviderError).code).toBe("AC_SCHEMA_INVALID");
    }
  });

  test("records a scan by its assessment and sends the user decision with its reason", () => {
    const root = repo(); const calls: string[][] = [];
    const run = runner(calls, (args) => args[0] === "refactor"
      ? envelope("refactor.record", { schemaVersion: "archcontext.runtime-refactor-record/v1" })
      : envelope("recommendations.defer", { schemaVersion: "archcontext.runtime-recommendation-lifecycle/v1", recommendation: { recommendationId: "rec.1", status: "deferred" } }));
    const scan = {
      worktree: { worktreeDigest: "sha256:wt" },
      proposedRecommendations: [{ category: "structural_observation", payload: { assessmentDigest: "sha256:assessment" } }],
    } as unknown as RefactorScanResultV1;
    recordRefactorScan(scan, root, { consumerRoot: process.cwd(), run });
    expect(decideRecommendation("rec.1", "defer", "after the release", root, { consumerRoot: process.cwd(), run }).status).toBe("deferred");
    expect(calls.slice(1)).toEqual([
      ["refactor", "record", "--assessment-digest", "sha256:assessment", "--expected-worktree-digest", "sha256:wt", "--json"],
      ["recommendations", "defer", "--id", "rec.1", "--reason", "after the release", "--json"],
    ]);
  });
});
