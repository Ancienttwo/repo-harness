import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decideRecommendation, listOpenRecommendations, runRefactorScan } from "../src/effects/refactor/archctx-provider";
import { RefactorProviderError } from "../src/core/refactor/provider-contract";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function repo(): string { const root = mkdtempSync(join(tmpdir(), "refactor-provider-")); roots.push(root); return root; }

// The archctx-contracts package ships these 0.7.2 fixtures: a real scan result and one recorded open suggestion.
const shipped = (name: string) => JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.resolve("archctx-contracts"))), "../fixtures/valid", name), "utf8"));
const shippedScan = () => shipped("runtime-refactor-scan.json");
const shippedRecord = () => shipped("recommendation-v3.json");

const capabilities = (version = "0.7.2") => ({ schemaVersion: "archcontext.capabilities/v1", package: { name: "archctx", version }, features: [] });
const envelope = (requestId: string, data: Record<string, unknown>) => ({ schemaVersion: "archcontext.envelope/v1", ok: true, requestId, data });
const lifecycle = (decision: string, status: string) => envelope(`recommendations.${decision}`, {
  schemaVersion: "archcontext.runtime-recommendation-lifecycle/v1", action: decision, recommendation: { ...shippedRecord(), status },
});

function runner(calls: string[][], respond: (args: readonly string[]) => unknown) {
  return (_binary: string, args: readonly string[]) => {
    calls.push([...args]);
    return { status: 0, signal: null, stderr: "", stdout: JSON.stringify(args[0] === "capabilities" ? capabilities() : respond(args)) };
  };
}

describe("refactor archctx provider", () => {
  test("checks the pinned version once per repository, then scans and lists the open records", () => {
    const root = repo(); const calls: string[][] = [];
    const run = runner(calls, (args) => args[0] === "refactor"
      ? envelope("refactor.scan", shippedScan())
      : envelope("recommendations.list", { schemaVersion: "archcontext.runtime-recommendation-list/v1", status: "open", count: 1, recommendations: [shippedRecord()] }));
    expect(runRefactorScan(root, { consumerRoot: process.cwd(), run }).proposedRecommendations).toHaveLength(2);
    expect(listOpenRecommendations(root, { consumerRoot: process.cwd(), run }).map((entry) => entry.recommendationId)).toEqual([shippedRecord().recommendationId]);
    expect(calls.map((args) => args.slice(0, 4))).toEqual([
      ["capabilities", "--json"],
      ["refactor", "scan", "--request-json", expect.any(String)],
      ["recommendations", "list", "--status", "open"],
    ]);
    expect(calls[2]).toEqual(["recommendations", "list", "--status", "open", "--json"]);
  });

  test("passes the import node limit to the scan only when one is set", () => {
    const root = repo(); const calls: string[][] = [];
    const run = runner(calls, () => envelope("refactor.scan", shippedScan()));
    runRefactorScan(root, { consumerRoot: process.cwd(), run });
    runRefactorScan(root, { consumerRoot: process.cwd(), run }, 100);
    const [unlimited, limited] = calls.filter((args) => args[0] === "refactor");
    expect(unlimited).not.toContain("--import-node-limit");
    expect(limited!.slice(-3)).toEqual(["--import-node-limit", "100", "--json"]);
  });

  test("fails on another archctx version and preserves upstream error code, action and message", () => {
    const mismatch = (_binary: string, _args: readonly string[]) => ({ status: 0, signal: null, stderr: "", stdout: JSON.stringify(capabilities("0.0.1")) });
    expect(() => runRefactorScan(repo(), { consumerRoot: process.cwd(), run: mismatch })).toThrow("expected archctx@0.7.2");
    const failing = runner([], () => ({ schemaVersion: "archcontext.envelope/v1", ok: false, requestId: "recommendations.accept", error: { code: "AC_REFACTOR_STALE", action: "run-refactor-scan", message: "recommendation not found: rec.x" } }));
    try {
      decideRecommendation("rec.x", "accept", "user agreed", repo(), { consumerRoot: process.cwd(), run: failing });
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(RefactorProviderError);
      expect(error).toMatchObject({ code: "AC_REFACTOR_STALE", action: "run-refactor-scan", message: "recommendation not found: rec.x" });
    }
  });

  test("decides a recorded id in one call, with no book read and no pre-scan", () => {
    const root = repo(); const calls: string[][] = [];
    // The book lists at most 12 records and would answer "truncated" for an id beyond that budget; the decision never asks it.
    const run = runner(calls, () => lifecycle("reject", "rejected"));
    const outsideBookBudget = shippedRecord().recommendationId;
    expect(decideRecommendation(outsideBookBudget, "reject", "not worth it", root, { consumerRoot: process.cwd(), run }).status).toBe("rejected");
    expect(calls.slice(1)).toEqual([["recommendations", "reject", "--id", outsideBookBudget, "--reason", "not worth it", "--json"]]);
  });

  test("sends the scan import node limit with the user decision", () => {
    const root = repo(); const calls: string[][] = [];
    const run = runner(calls, () => lifecycle("defer", "deferred"));
    expect(decideRecommendation("rec.1", "defer", "after the release", root, { consumerRoot: process.cwd(), run }, 100).status).toBe("deferred");
    expect(calls.slice(1)).toEqual([["recommendations", "defer", "--id", "rec.1", "--reason", "after the release", "--import-node-limit", "100", "--json"]]);
  });
});
