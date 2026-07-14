#!/bin/bash
# Codex Delegation Advisor - UserPromptSubmit.delegation
# Converts explicit user delegation requests into bounded Codex subagent context.

set -euo pipefail

[[ "${HOOK_HOST:-}" == "codex" ]] || exit 0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/hook-input.sh"

hook_read_stdin_once
input="$HOOK_STDIN_JSON"
[[ -n "$input" ]] || exit 0
command -v bun >/dev/null 2>&1 || exit 0

JSON_INPUT="$input" REPO_ROOT="${HOOK_REPO_ROOT:-$(pwd)}" bun -e '
  const fs = require("fs");
  const path = require("path");
  const crypto = require("crypto");

  function sanitize(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-")
      .slice(0, 120);
  }

  function firstString(input, keys) {
    for (const key of keys) {
      const value = input?.[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
  }

  function delegationScope(input) {
    const turnId = firstString(input, ["turn_id"]);
    if (turnId) return { source: "turn_id", id: `turn-${sanitize(turnId)}` };

    const runId = firstString(input, ["run_id"]);
    if (runId) return { source: "run_id", id: `run-${sanitize(runId)}` };

    const sessionId = firstString(input, ["session_id"]);
    if (sessionId) return { source: "session_id", id: `session-${sanitize(sessionId)}` };

    const transcriptPath = firstString(input, ["transcript_path"]);
    if (transcriptPath) {
      const digest = crypto.createHash("sha1").update(transcriptPath).digest("hex").slice(0, 16);
      return { source: "transcript_path", id: `transcript-${digest}` };
    }

    const envSession = process.env.CODEX_SESSION_ID || process.env.CLAUDE_SESSION_ID || "";
    if (envSession) return { source: "env_session", id: `session-${sanitize(envSession)}` };

    return null;
  }

  function activeContractPath(repoRoot) {
    try {
      const plan = fs.readFileSync(path.join(repoRoot, ".ai", "harness", "active-plan"), "utf8").trim();
      const match = /^plans\/plan-([a-zA-Z0-9][a-zA-Z0-9._-]*)\.md$/.exec(plan);
      if (!match) return null;
      const planPath = path.join(repoRoot, plan);
      const contract = `tasks/contracts/${match[1]}.contract.md`;
      const contractPath = path.join(repoRoot, contract);
      if (!fs.statSync(planPath).isFile() || !fs.statSync(contractPath).isFile()) return null;
      const content = fs.readFileSync(contractPath, "utf8");
      if (!/^> \*\*Status\*\*:\s*(Active|Ready|Executing)\s*$/mi.test(content)) return null;
      return { plan, contract, content };
    } catch {
      return null;
    }
  }

  function sleepMs(durationMs) {
    if (durationMs <= 0) return;
    try {
      const view = new Int32Array(new SharedArrayBuffer(4));
      Atomics.wait(view, 0, 0, durationMs);
    } catch {
      const until = Date.now() + durationMs;
      while (Date.now() < until) {
        // Busy-wait fallback for a runtime where Atomics.wait is unavailable.
      }
    }
  }

  // A single lock FILE (not a directory) at a fixed sibling path, created
  // with the O_CREAT | O_EXCL | O_WRONLY (wx) flag: fs.writeFileSync with
  // { flag: wx } is one call that atomically creates and opens the path,
  // throwing EEXIST synchronously when the path already exists, and this
  // same call writes the small owner-marker JSON payload as part of that
  // same successful open. There is no intermediate state where the lock
  // exists but has no readable owner yet, unlike the previous mkdir-plus-
  // separate-marker-file design. This assumes the marker payload stays small
  // and this hook always runs against a local or tmpfs-backed filesystem, so
  // that lock existence and lock content are effectively one fact
  // established by a single syscall; it does not attempt to solve the
  // general case of multi-writer torn writes for a larger payload or a
  // networked filesystem. This lock file is the same shared path
  // subagent-start-context.sh acquires around its own latest.json
  // read-compare-write, so the two scripts serialize against each other on
  // the same shared pointer.
  function tryCreateLockFile(lockPath) {
    const token = crypto.randomBytes(8).toString("hex");
    try {
      fs.writeFileSync(
        lockPath,
        JSON.stringify({ pid: process.pid, token: token, acquired_at: new Date().toISOString() }),
        { flag: "wx" },
      );
      return { created: true, token: token };
    } catch (error) {
      if (error && typeof error === "object" && error.code === "EEXIST") return { created: false, token: null };
      throw error;
    }
  }

  // No reclaim is attempted here, on purpose. Five independent review rounds
  // each found a new TOCTOU race one layer deeper in a progressively more
  // careful reclaim mechanism: no lock at all, then an mkdir-based lock on
  // only one writer site, then the same lock on both writer sites but with
  // no ownership check, then an ownership token whose own mkdir-plus-marker
  // write was not atomic, then a single wx-locked file whose own stale-
  // reclaim step let two concurrent reclaimers race each other, and finally
  // a reclaim-marker gate whose own stale-marker cleanup could delete a
  // brand-new legitimate marker belonging to a different process. Every fix closed the
  // previously reported race and opened an equivalent one nested one layer
  // deeper in the mechanism protecting the previous fix. That pattern is a
  // decisive signal, not a coincidence: safely reclaiming a lock from a
  // possibly-crashed holder using only bare filesystem primitives (no
  // flock, no new dependency) cannot be made fully correct through
  // incremental patching. So this lock does not try. A lock left behind by
  // a crashed holder simply stays held until it is removed by hand (for
  // example, rm .ai/harness/delegation/latest.json.lock). That is an
  // accepted tradeoff, not an oversight: SubagentStart and UserPromptSubmit
  // hooks are short-lived, and this lock only guards the shared latest.json
  // convenience pointer -- the isolated per-turn state write always
  // succeeds no matter what this lock decides. The bounded retry loop
  // below still exists so ordinary, brief contention (two hooks racing a
  // normal, soon-to-be-released lock) resolves quickly, and a wedged lock
  // degrades to skipping the guarded write instead of hanging the hook.
  function acquireLock(lockPath, options) {
    const totalTimeoutMs = (options && options.totalTimeoutMs) || 2000;
    const retryDelayMs = (options && options.retryDelayMs) || 25;
    const deadline = Date.now() + totalTimeoutMs;
    for (;;) {
      let attempt;
      try {
        attempt = tryCreateLockFile(lockPath);
      } catch {
        return { acquired: false, token: null };
      }
      if (attempt.created) return { acquired: true, token: attempt.token };
      if (Date.now() >= deadline) return { acquired: false, token: null };
      sleepMs(retryDelayMs);
    }
  }

  // Release re-reads the lock file and only unlinks it when the content
  // token still matches the token returned by this exact acquireLock call,
  // so a lock that has since been legitimately released and re-acquired by
  // a different holder is never removed by a caller that no longer owns
  // it. The read and the unlink are still two separate steps, not one
  // atomic syscall -- POSIX has no portable delete-only-if-content-matches
  // primitive for a plain path without a file-descriptor-based lock such as
  // flock, which this hook deliberately avoids to stay dependency-free.
  // Since this lock is never reclaimed (see acquireLock above), the only
  // way this token check can ever see a mismatch is a legitimate release-
  // then-reacquire by a different holder in between, or the same accepted,
  // extremely low-probability PID-reuse/torn-write edge case already
  // documented for tryCreateLockFile above -- not a new gap introduced here.
  function releaseLock(lockPath, token) {
    let owner;
    try {
      owner = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    } catch {
      // No readable content at this path: this call cannot prove it still
      // owns the lock, so leave it alone rather than remove a lock it may
      // not own.
      return;
    }
    if (!owner || owner.token !== token) {
      // A different holder now owns this lock (already released and
      // re-acquired by a different call); do not touch a lock this call no
      // longer owns.
      return;
    }
    try {
      fs.unlinkSync(lockPath);
    } catch {
      // Already gone: released by a different invocation.
    }
  }

  let input;
  try {
    input = JSON.parse(process.env.JSON_INPUT || "");
  } catch {
    process.exit(0);
  }

  const prompt = firstString(input, [
    "prompt",
    "user_prompt",
    "user_message",
    "message",
    "input",
  ]);
  if (!prompt) process.exit(0);

  function isDelegationDiscussion(text) {
    if (!/\b(spawn|use|run)\s+(bounded\s+)?subagents?\b/i.test(text)) return false;
    if (/^\s*(please\s+)?(spawn|use|run)\s+(bounded\s+)?subagents?\s+(to|for)\b/i.test(text)) return false;
    return [
      /[?？]/,
      /\b(should|need|necessary)\b/i,
      /(机制|有必要|必要|是否|为什么|怎么|如何|架构|设计|注册|路由|本来就有)/i,
      /\b(mechanism|architecture|design|registration|route|routing|adapter|hook)\b/i,
    ].some((pattern) => pattern.test(text));
  }

  const triggers = [
    { name: "slash-delegate", pattern: /(^|\s)\/(delegate|parallel)\b/i },
    { name: "spawn-subagents", pattern: /\b(spawn|use|run)\s+(bounded\s+)?subagents?\b/i, skipDiscussion: true },
    { name: "multiple-agents", pattern: /\buse\s+multiple\s+agents?\b/i },
    { name: "parallel-agents", pattern: /\bparallel\s+(agents?|workstreams?|investigation|research)\b/i },
    { name: "chinese-subagent", pattern: /交给\s*子代理|使用多个\s*(agent|代理)|并行(调查|研究|处理|执行|agent|代理)/i },
  ];
  const trigger = triggers.find((entry) => entry.pattern.test(prompt) && !(entry.skipDiscussion && isDelegationDiscussion(prompt)));

  const repoRoot = process.env.REPO_ROOT || process.cwd();

  let policyDelegation = {};
  try {
    policyDelegation =
      JSON.parse(fs.readFileSync(path.join(repoRoot, ".ai", "harness", "policy.json"), "utf8")).delegation || {};
  } catch {
    policyDelegation = {};
  }

  const explicit = Boolean(trigger);
  if (!explicit) process.exit(0);
  const activeContract = activeContractPath(repoRoot);
  const contractBound = Boolean(activeContract);

  const strictContract = Boolean(
    activeContract && /^> \*\*Workflow Profile\*\*:\s*strict\s*$/mi.test(activeContract.content),
  );
  const defaultMax = Number.isInteger(policyDelegation.max_agents) ? policyDelegation.max_agents : 2;
  const strictMax = Number.isInteger(policyDelegation.strict_max_agents) ? policyDelegation.strict_max_agents : 3;
  const maxAgents = strictContract ? Math.min(strictMax, 3) : Math.min(defaultMax, 2);
  const maxDepth = Number.isInteger(policyDelegation.max_depth) ? policyDelegation.max_depth : 1;
  const preferredRunners =
    Array.isArray(policyDelegation.preferred_runners) && policyDelegation.preferred_runners.length
      ? policyDelegation.preferred_runners
      : ["subagent"];
  const fallbackRunner =
    typeof policyDelegation.fallback_runner === "string" && policyDelegation.fallback_runner
      ? policyDelegation.fallback_runner
      : null;

  const stateDir = path.join(repoRoot, ".ai", "harness", "delegation");
  fs.mkdirSync(stateDir, { recursive: true });

  const now = new Date();
  const scope = delegationScope(input);
  const relativeStateFile = scope ? path.join("turns", `${scope.id}.json`) : "latest.json";
  const promptHash = crypto.createHash("sha1").update(prompt).digest("hex");
  const evidenceScope = `${scope?.id || "unscoped"}-${promptHash.slice(0, 16)}`;
  const state = {
    version: 2,
    eligible: true,
    explicit,
    spawned: false,
    fallback_used: false,
    mode: "explicit",
    max_agents: maxAgents,
    max_depth: maxDepth,
    allow_parallel_writers: false,
    stop_fallback: true,
    native_role_routing: {
      required: true,
      status: "unverified",
      reason: "No authoritative SubagentStart role/model evidence has been recorded for this delegation.",
      evidence_dir: path.join("role-routing", evidenceScope),
    },
    preferred_runners: preferredRunners,
    fallback_runner: fallbackRunner,
    trigger: trigger.name,
    prompt_hash: promptHash,
    scope_source: scope?.source || "unscoped",
    scope_id: scope?.id || "",
    state_file: relativeStateFile,
    created_at: now.toISOString(),
    created_at_epoch: Math.floor(now.getTime() / 1000),
    updated_at: now.toISOString(),
  };
  if (scope) {
    const statePath = path.join(stateDir, relativeStateFile);
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
  }
  // Mutual-exclusion guard: this call always establishes a brand-new current
  // delegation, so unlike subagent-start-context.sh there is no scope compare
  // to make here. But subagent-start-context.sh can be mid-flight in its own
  // read-compare-write critical section for an older turn when this advisor
  // call lands, so this write still needs the same lock: without it, this
  // fresh pointer could be silently overwritten by that older invocation
  // committing its own (by-then-stale) decision right after this write. The
  // per-turn statePath write above is always scoped to this call alone and is
  // safe regardless.
  const latestPath = path.join(stateDir, "latest.json");
  const latestLockPath = `${latestPath}.lock`;
  const latestLock = acquireLock(latestLockPath);
  if (latestLock.acquired) {
    try {
      fs.writeFileSync(latestPath, `${JSON.stringify(state, null, 2)}\n`);
    } finally {
      releaseLock(latestLockPath, latestLock.token);
    }
  }
  // If the lock could not be acquired within the bounded retry window, skip
  // the shared latest.json write rather than risk a hung hook: a skipped
  // pointer update is safe, a hung hook is not.

  const sharedRules = [
    "Rules:",
    `- Spawn no more than ${maxAgents} agents.`,
    "- Use explorer for read-only code mapping.",
    "- Use worker only for an isolated implementation slice.",
    "- Use reviewer for correctness, regression, security, and missing-test review.",
    "- Never give two agents overlapping write ownership.",
    `- Keep max spawn depth at ${maxDepth}.`,
    "- Give every agent a precise scope and required return format.",
    "- Pass fork_turns=\"none\" on every spawn_agent call that selects an agent_type: the default fork_turns=\"all\" copies the full parent conversation into the child. A named-role child works from its self-contained packet and the contract brief, not inherited parent history.",
    "- Wait for all requested agents.",
    "- Reconcile contradictory findings in the parent.",
    "- Close completed agent threads.",
    "- Do not spawn for a trivial or strictly sequential task.",
    "- The role labels above describe responsibilities only; they do not prove that Codex selected a same-name custom-agent profile or its configured model.",
    "- Treat native children as inherited-model until the SubagentStart hook records matching non-default agent_type and model evidence. If it records unavailable or mismatch, report runner degradation and use the contract runner fallback instead of claiming role-specific routing.",
  ];

  const permissionContext = [
    "[repo-harness:delegation]",
    "",
    "The current user prompt explicitly enabled bounded delegation. This is permission only; it does not instruct continuation, verification, or execution and does not override the current user prompt.",
    "",
    "No active task contract was resolved. Scope remains the current user prompt; do not invent implementation, verification, or workflow work.",
    "",
    `Runner preference (policy delegation.preferred_runners): ${preferredRunners.join(", ")}. Delegate only when the current prompt contains at least two independent bounded workstreams; otherwise run sequentially.`,
    "",
    ...sharedRules,
  ].join("\n");

  const contractContext = [
    "[repo-harness:delegation]",
    "",
    "The current user prompt explicitly enabled bounded delegation.",
    "",
    `The current user turn is the execution authority. The active task contract (${activeContract?.contract}) constrains the implementation scope authorized by the current turn, but does not by itself authorize resuming prior implementation or completing Exit Criteria.`,
    "",
    `Runner preference (policy delegation.preferred_runners): ${preferredRunners.join(", ")}. Native subagent (spawn_agent) is the preferred parallelism accelerator that consumes the contract brief. When spawn_agent is unavailable, sandboxed, or unreliable, degrade to ${fallbackRunner || "main-thread"} on the SAME contract via contract-run. Runner-availability degradation MUST be recorded in the contract-run manifest and MUST NOT silently succeed; it is a runner-availability fallback, not a product-semantics change.`,
    "",
    "If this task contains at least two independent, bounded workstreams, dispatch per the contract before doing the corresponding work in the parent; otherwise run it sequentially.",
    "",
    ...sharedRules,
    "",
    "Execution boundary: implement exactly the Goal, In scope items, Allowed Paths, and Exit Criteria in this brief. Treat absent requirements as forbidden design space, not as permission to improve.",
    "",
    "Do not add optional features, alternate UX, extra integrations, migration paths, compatibility behavior, fallback behavior, telemetry, broad cleanup, refactors, new abstractions, extra docs, or polish unless that work is explicitly listed under In scope or required by Exit Criteria.",
    "",
    "If you discover useful additional work, record it under Out of scope / Future work in the notes or review artifact. Do not implement it. Do not end with unsolicited offers to do more work.",
    "",
    "If the requested outcome cannot be completed without expanding scope, fail closed: stop, name the missing decision, and cite the exact file/section that blocks execution.",
  ].join("\n");

  const context = contractBound ? contractContext : permissionContext;

  process.stdout.write(`${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: context,
    },
  })}\n`);
'
