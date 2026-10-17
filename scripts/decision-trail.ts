#!/usr/bin/env bun
import { execFileSync } from "child_process";
import { createHash, randomUUID } from "crypto";
import { realpathSync } from "fs";
import { parseArgs } from "util";
import { canonicalize } from "../src/core/evidence/canonical-json";
import {
  DECISION_EVENT_TYPE,
  isDecisionPayload,
  normalizeDecisionCell,
  projectDecisions,
  renderDecisionTable,
  type DecisionPayload,
} from "../src/core/evidence/checkpoint";
import type { EvidenceEventRecord, JsonValue } from "../src/core/evidence/types";
import { appendEvidenceEvent, appendGenesisRecord, readAcceptedEvents, readGenesisRecord } from "../src/effects/evidence/event-log";
import { readDecisionPayload } from "../src/effects/evidence/checkpoint-store";
import { LEDGER_EPOCH_START_SHA } from "../src/effects/evidence/epoch";
import { ensureRepoRelativePath } from "../src/effects/path-safety";

const PRODUCER = "decision-trail";
const EVENT_ID = /^evt-[0-9A-HJKMNP-TV-Z]{26}$/;
const USAGE = `Usage:
  repo-harness run decision-trail record --phase <p> --decision <d> --why <w> --evidence <ptr> [--evidence <ptr>...] --result <r> [--supersedes <event_id>] [--run-id <id>]
  repo-harness run decision-trail render [--format tsv|markdown] [--since <event_id>] [--limit N]
`;

export interface RecordDecisionInput extends DecisionPayload {
  readonly supersedes?: string;
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function normalizePayload(input: RecordDecisionInput): DecisionPayload {
  const payload = {
    phase: normalizeDecisionCell(input.phase),
    decision: normalizeDecisionCell(input.decision),
    why: normalizeDecisionCell(input.why),
    evidence: input.evidence.map(normalizeDecisionCell),
    result: normalizeDecisionCell(input.result),
    ...(input.run_id === undefined ? {} : { run_id: normalizeDecisionCell(input.run_id) }),
  };
  if (!isDecisionPayload(payload)) throw new Error("all decision fields and evidence pointers must be non-empty single-line text");
  for (const pointer of payload.evidence) {
    if (/^(?:[a-f0-9]{7,40}|[a-f0-9]{64}|#?[1-9]\d*|PR\s*#?[1-9]\d*)$/i.test(pointer)) continue;
    const path = pointer.replace(/:[1-9]\d*(?::[1-9]\d*)?$/, "");
    const safe = ensureRepoRelativePath(path);
    if (!safe.ok || /\s/.test(path) || !/^[\w./-]+$/.test(path)
      || (!path.includes("/") && !path.includes(".") && path === pointer)) {
      throw new Error("evidence must be a commit SHA, PR number, repo-relative file:line or artifact path");
    }
  }
  return payload;
}

function ensureGenesis(repoRoot: string) {
  return readGenesisRecord(repoRoot) ?? appendGenesisRecord(repoRoot, LEDGER_EPOCH_START_SHA, {
    worktreeId: `worktree-${sha256(realpathSync(repoRoot)).slice(7)}`,
  });
}

/** Agent-authored observations bind to HEAD. They do not attest a dirty tree. */
export function recordDecision(repoRoot: string, input: RecordDecisionInput): EvidenceEventRecord {
  const payload = normalizePayload(input);
  const supersedes = input.supersedes === undefined ? [] : [input.supersedes];
  if (supersedes.length > 0) {
    const target = readAcceptedEvents(repoRoot).accepted.find(event => event.event_id === input.supersedes);
    if (!EVENT_ID.test(input.supersedes!) || !target || target.event_type !== DECISION_EVENT_TYPE
      || target.producer !== PRODUCER || target.trust_class !== "observed") {
      throw new Error("supersedes must name an accepted decision-trail event in this worktree");
    }
  }
  const head = execFileSync("git", ["-C", repoRoot, "rev-parse", "--verify", "HEAD"], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  const genesis = ensureGenesis(repoRoot);
  return appendEvidenceEvent(repoRoot, {
    worktreeId: genesis.worktree_id,
    eventType: DECISION_EVENT_TYPE,
    trustClass: "observed",
    producer: PRODUCER,
    correlationRunId: randomUUID(),
    subjectIdentity: {
      authority_commit: head,
      base_commit: head,
      target_commit: head,
      scope_hash: sha256("decision-trail:worktree"),
      subject_hash: sha256(canonicalize({ head, worktree_id: genesis.worktree_id })),
      contract_hash: sha256("decision-trail:no-contract"),
      command_hash: sha256(canonicalize({ command: "repo-harness run decision-trail record", supersedes })),
      env_provider_id: `decision-trail/bun-${process.versions.bun}`,
    },
    supersedes,
    payload: { kind: "json", value: payload as unknown as JsonValue },
  });
}

function required(value: string | undefined, flag: string): string {
  if (value === undefined) throw new Error(`missing ${flag}`);
  return value;
}

function main(argv: string[]): void {
  const [command, ...args] = argv;
  if (command === "--help" || command === "-h" || args.includes("--help")) {
    process.stdout.write(USAGE);
    return;
  }
  if (command !== "record" && command !== "render") throw new Error(USAGE.trimEnd());
  const repoRoot = execFileSync("git", ["-C", process.env.REPO_HARNESS_TARGET_REPO_ROOT || process.cwd(), "rev-parse", "--show-toplevel"], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  if (command === "record") {
    const { values } = parseArgs({ args, options: {
      phase: { type: "string" }, decision: { type: "string" }, why: { type: "string" },
      evidence: { type: "string", multiple: true }, result: { type: "string" },
      supersedes: { type: "string" }, "run-id": { type: "string" },
    } });
    const event = recordDecision(repoRoot, {
      phase: required(values.phase, "--phase"), decision: required(values.decision, "--decision"),
      why: required(values.why, "--why"), evidence: values.evidence ?? [], result: required(values.result, "--result"),
      supersedes: values.supersedes, run_id: values["run-id"],
    });
    process.stdout.write(`${event.event_id}\n`);
    return;
  }
  const { values } = parseArgs({ args, options: {
    format: { type: "string", default: "markdown" }, since: { type: "string" }, limit: { type: "string" },
  } });
  if (values.format !== "tsv" && values.format !== "markdown") throw new Error("format must be tsv or markdown");
  const limit = values.limit === undefined ? undefined : Number(values.limit);
  if (values.limit !== undefined && (!/^[1-9]\d*$/.test(values.limit) || !Number.isSafeInteger(limit))) {
    throw new Error("limit must be a positive safe integer");
  }
  let decisions = projectDecisions(readAcceptedEvents(repoRoot).accepted, event => readDecisionPayload(repoRoot, event));
  if (values.since !== undefined) {
    const index = decisions.findIndex(row => row.event_id === values.since);
    if (index < 0) throw new Error("since must name an accepted decision event in this worktree");
    decisions = decisions.slice(index + 1);
  }
  if (limit !== undefined) decisions = decisions.slice(-limit);
  process.stdout.write(renderDecisionTable(decisions, values.format));
}

if (import.meta.main) {
  try { main(process.argv.slice(2)); }
  catch (error) {
    process.stderr.write(`decision-trail: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
