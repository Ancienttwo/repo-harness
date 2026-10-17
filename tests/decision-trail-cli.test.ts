import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { initGitRepo, run, withTempRepo } from "./helpers/repo-fixture";
import { readAcceptedEvents } from "../src/effects/evidence/event-log";
import { publishCheckpointFromLedger, resolveLastPublishedCheckpoint } from "../src/effects/evidence/checkpoint-store";

const ROOT = join(import.meta.dir, "..");
const CLI = join(ROOT, "src/cli/index.ts");
const RECORD = ["record", "--phase", "build", "--decision", "Use ledger", "--why", "One authority",
  "--evidence", "#812", "--evidence", "src/core/evidence/types.ts:42", "--result", "Done"];

function cli(repoRoot: string, args: string[], env?: NodeJS.ProcessEnv) {
  return run("bun", [CLI, "run", "decision-trail", ...args], repoRoot, env);
}

function init(repoRoot: string): void {
  initGitRepo(repoRoot);
  expect(run("git", ["commit", "--allow-empty", "-m", "fixture"], repoRoot).status).toBe(0);
}

describe("decision-trail CLI", () => {
  test("repeated record calls remain distinct accepted observations in the same run", () => {
    withTempRepo("decision-repeat", repoRoot => {
      init(repoRoot);
      const first = cli(repoRoot, [...RECORD, "--run-id", "session-812"]);
      const second = cli(repoRoot, [...RECORD, "--run-id", "session-812"]);
      expect(first.status).toBe(0);
      expect(second.status).toBe(0);
      const ids = [first.stdout.trim(), second.stdout.trim()];
      expect(ids[0]).not.toBe(ids[1]);
      expect(readAcceptedEvents(repoRoot).accepted.map(event => event.event_id)).toEqual(ids);
      const rendered = cli(repoRoot, ["render", "--format", "tsv"]);
      expect(rendered.status).toBe(0);
      expect(rendered.stdout.trimEnd().split("\n")).toHaveLength(3);
      const since = cli(repoRoot, ["render", "--since", ids[1]]);
      expect(since.status).toBe(0);
      expect(publishCheckpointFromLedger(repoRoot).status).toBe("published");
      const checkpoint = resolveLastPublishedCheckpoint(repoRoot);
      expect(checkpoint.found).toBe(true);
      if (!checkpoint.found) throw new Error("missing checkpoint");
      expect(checkpoint.resolved.projection.decisions?.map(row => row.event_id)).toEqual(ids);
    });
  });

  test("registered helper records from a subdirectory and projects only accepted decisions", () => {
    withTempRepo("decision-cli", repoRoot => {
      init(repoRoot);
      const subdir = join(repoRoot, "src");
      mkdirSync(subdir);
      const first = cli(subdir, [...RECORD, "--run-id", "session-812"]);
      expect(first.status).toBe(0);
      expect(first.stdout).toMatch(/^evt-[0-9A-HJKMNP-TV-Z]{26}\n$/);
      const firstId = first.stdout.trim();
      const rawBefore = readFileSync(join(repoRoot, ".ai/harness/evidence/events/log.jsonl"), "utf8");
      const correction = cli(repoRoot, [...RECORD, "--supersedes", firstId]);
      expect(correction.status).toBe(0);
      const correctedId = correction.stdout.trim();
      expect(readAcceptedEvents(repoRoot).accepted.map(row => row.event_id)).toEqual([correctedId]);
      expect(readFileSync(join(repoRoot, ".ai/harness/evidence/events/log.jsonl"), "utf8").startsWith(rawBefore)).toBe(true);
      const tsv = cli(repoRoot, ["render", "--format", "tsv"]);
      expect(tsv.status).toBe(0);
      const lines = tsv.stdout.trimEnd().split("\n");
      expect(lines[0]).toBe("ts\tphase\tdecision\twhy\tevidence\tresult\tevent_id\tsupersedes");
      expect(lines).toHaveLength(2);
      expect(lines[1].split("\t").slice(1)).toEqual([
        "build", "Use ledger", "One authority", "#812; src/core/evidence/types.ts:42", "Done", correctedId, firstId,
      ]);
      const markdown = cli(repoRoot, ["render"]);
      expect(markdown.status).toBe(0);
      expect(markdown.stdout).toContain("| ts | phase | decision | why | evidence | result | event_id | supersedes |");
      expect(markdown.stdout.trimEnd().split("\n")).toHaveLength(3);
      expect(cli(repoRoot, ["render", "--since", correctedId]).stdout.trimEnd().split("\n")).toHaveLength(2);
      const later = cli(repoRoot, [...RECORD, "--run-id", "later-session"]);
      expect(later.status).toBe(0);
      const limited = cli(repoRoot, ["render", "--format", "tsv", "--since", correctedId, "--limit", "1"]);
      expect(limited.status).toBe(0);
      expect(limited.stdout).toContain(later.stdout.trim());
      expect(limited.stdout).not.toContain(correctedId);
      const help = run("bun", [CLI, "run", "--help"], repoRoot);
      expect(help.status).toBe(0);
      expect(help.stdout).toContain("decision-trail");
    });
  });

  test("keeps one row per decision and guards formula cells and Markdown delimiters", () => {
    withTempRepo("decision-format", repoRoot => {
      init(repoRoot);
      const result = cli(repoRoot, ["record", "--phase", "=SUM(1)", "--decision", "+Use\nledger | <tag>",
        "--why=-One\tauthority", "--evidence", "#812", "--result", "@Done"]);
      expect(result.status).toBe(0);
      const tsv = cli(repoRoot, ["render", "--format", "tsv"]);
      expect(tsv.status).toBe(0);
      const cells = tsv.stdout.split("\n")[1].split("\t");
      expect(cells).toHaveLength(8);
      expect(cells.slice(1, 4)).toEqual(["'=SUM(1)", "'+Use ledger | <tag>", "'-One authority"]);
      expect(cells[5]).toBe("'@Done");
      const markdown = cli(repoRoot, ["render", "--format", "markdown"]);
      expect(markdown.status).toBe(0);
      expect(markdown.stdout).toContain("+Use ledger \\| &lt;tag&gt;");
      expect(markdown.stdout.trimEnd().split("\n")).toHaveLength(3);
    });
  });

  test("redacts and resolves blob payloads in render and checkpoint, and rejects a corrupt blob", () => {
    withTempRepo("decision-blob", repoRoot => {
      init(repoRoot);
      const why = `${"word ".repeat(2000)}fixture-secret`;
      const args = [...RECORD];
      args[args.indexOf("--why") + 1] = why;
      const result = cli(repoRoot, args, { OPENAI_API_KEY: "fixture-secret" });
      expect(result.status).toBe(0);
      const event = readAcceptedEvents(repoRoot).accepted[0];
      expect(event.payload).toBeUndefined();
      expect(event.blob_sha256).toMatch(/^[0-9a-f]{64}$/);
      const rendered = cli(repoRoot, ["render", "--format", "tsv"]);
      expect(rendered.status).toBe(0);
      expect(rendered.stdout).toContain("word word");
      expect(rendered.stdout).toContain("sha256:");
      expect(rendered.stdout).not.toContain("fixture-secret");
      expect(publishCheckpointFromLedger(repoRoot).status).toBe("published");
      const checkpoint = resolveLastPublishedCheckpoint(repoRoot);
      expect(checkpoint.found).toBe(true);
      if (!checkpoint.found) throw new Error("missing checkpoint");
      expect(checkpoint.resolved.projection.decisions?.[0].why).toContain("word word");
      expect(JSON.stringify(checkpoint.resolved.projection)).not.toContain("fixture-secret");
      writeFileSync(join(repoRoot, ".ai/harness/evidence/blobs", event.blob_sha256!), "{}");
      const corrupt = cli(repoRoot, ["render"]);
      expect(corrupt.status).toBe(2);
      expect(corrupt.stdout).toBe("");
      expect(corrupt.stderr).toContain("decision blob integrity check failed");
    });
  });

  test("record fails closed on a ledger pinned to another epoch", () => {
    withTempRepo("decision-epoch", repoRoot => {
      init(repoRoot);
      const dir = join(repoRoot, ".ai/harness/evidence/events");
      mkdirSync(dir, { recursive: true });
      const genesis = {
        kind: "evidence_genesis", schema_version: 1, worktree_id: "worktree-other",
        ledger_epoch_start_sha: "0".repeat(40), created_at: new Date(0).toISOString(),
      };
      writeFileSync(join(dir, "log.jsonl"), `${JSON.stringify(genesis)}\n`);
      const result = cli(repoRoot, RECORD);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("genesis epoch mismatch");
      expect(readFileSync(join(dir, "log.jsonl"), "utf8").trimEnd().split("\n")).toHaveLength(1);
    });
  });

  test("empty render creates no ledger and invalid arguments fail without a success row", () => {
    withTempRepo("decision-arguments", repoRoot => {
      init(repoRoot);
      const empty = cli(repoRoot, ["render", "--format", "tsv"]);
      expect(empty.status).toBe(0);
      expect(empty.stdout.trimEnd().split("\n")).toHaveLength(1);
      for (const args of [["record"], ["record", "--unknown", "x"], ["render", "--format", "json"],
        ["render", "--limit", "0"], ["render", "--limit", "1.5"], ["render", "--limit", "9007199254740992"],
        ["render", "--since", "missing"]]) {
        const result = cli(repoRoot, args);
        expect(result.status).toBe(2);
        expect(result.stdout).toBe("");
      }
      expect(existsSync(join(repoRoot, ".ai/harness/evidence/events/log.jsonl"))).toBe(false);
    });
  });
});
