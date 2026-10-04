#!/bin/bash
# Subagent Start Context - SubagentStart.context
# Marks explicit delegation as spawned and injects the repo-harness subagent
# return contract into Codex-created subagents.

set -euo pipefail

[[ "${HOOK_HOST:-}" == "codex" ]] || exit 0
command -v bun >/dev/null 2>&1 || exit 0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/hook-input.sh"

hook_read_stdin_once

subagent_profile=""
explicit_high_risk="false"
if [[ -f .ai/harness/state/effective.json ]] && command -v jq >/dev/null 2>&1; then
  subagent_profile="$(jq -r '.workflow_profile // empty' .ai/harness/state/effective.json 2>/dev/null || true)"
fi
active_contract="$(cat .ai/harness/active-plan 2>/dev/null | sed 's#plans/plan-#tasks/contracts/#; s#\.md$#.contract.md#' || true)"
if [[ -f "$active_contract" ]] && grep -Eiq '^> \*\*(Workflow Profile|Risk)\*\*:[[:space:]]*(strict|high)[[:space:]]*$' "$active_contract"; then
  subagent_profile="strict"
  explicit_high_risk="true"
fi
if ! subagent_circuit="$(hook_circuit_record subagent SubagentLimit 'bounded subagent spawn cap' spawn-subagent subagent-spawn "$subagent_profile" "$explicit_high_risk" false false false)"; then
  [[ -n "$subagent_circuit" ]] && printf '%s\n' "$subagent_circuit" >&2
  exit 2
fi

JSON_INPUT="$HOOK_STDIN_JSON" REPO_ROOT="${HOOK_REPO_ROOT:-$(pwd)}" bun -e '
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

  function parseInput() {
    try {
      return JSON.parse(process.env.JSON_INPUT || "{}");
    } catch {
      return {};
    }
  }

  function validBoundedField(value, pattern) {
    return typeof value === "string"
      && value.length <= 128
      && !/[\u0000-\u001f\u007f]/.test(value)
      && pattern.test(value);
  }

  function scanAgentDirectory(directory, authorityRoot, agentType) {
    if (!directory || !fs.existsSync(directory)) return { matches: [], invalid: false };
    let entries;
    try {
      const authorityStat = fs.lstatSync(authorityRoot);
      const directoryStat = fs.lstatSync(directory);
      if (
        authorityStat.isSymbolicLink()
        || !authorityStat.isDirectory()
        || directoryStat.isSymbolicLink()
        || !directoryStat.isDirectory()
      ) return { matches: [], invalid: true };
      const canonicalRoot = fs.realpathSync(authorityRoot);
      const canonicalDirectory = fs.realpathSync(directory);
      if (!canonicalDirectory.startsWith(`${canonicalRoot}${path.sep}`)) {
        return { matches: [], invalid: true };
      }
      entries = fs.readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.name.endsWith(".toml"))
        .sort((left, right) => left.name.localeCompare(right.name));
    } catch {
      return { matches: [], invalid: true };
    }

    const matches = [];
    for (const entry of entries) {
      if (!entry.isFile()) return { matches: [], invalid: true };
      const configPath = path.join(directory, entry.name);
      try {
        const raw = fs.readFileSync(configPath, "utf8");
        const parsed = Bun.TOML.parse(raw);
        const requiredStrings = [parsed?.name, parsed?.description, parsed?.developer_instructions];
        if (requiredStrings.some((value) => typeof value !== "string" || !value.trim())) {
          return { matches: [], invalid: true };
        }
        if (parsed.name === agentType) {
          matches.push({
            configPath,
            model: typeof parsed.model === "string" ? parsed.model.trim() : "",
            configSha256: crypto.createHash("sha256").update(raw).digest("hex"),
          });
        }
      } catch {
        return { matches: [], invalid: true };
      }
    }
    return { matches, invalid: false };
  }

  function customAgentProfile(repoRoot, agentType) {
    const projectCodexRoot = path.join(repoRoot, ".codex");
    const project = scanAgentDirectory(path.join(projectCodexRoot, "agents"), projectCodexRoot, agentType);
    if (project.invalid) return { ok: false, invalid: true, reason: "Project custom-agent configuration is malformed or ambiguous." };
    if (project.matches.length > 1) return { ok: false, invalid: true, reason: "Project custom-agent name is duplicated." };
    if (project.matches.length === 1) {
      return validBoundedField(project.matches[0].model, /^[A-Za-z0-9._-]+$/)
        ? { ok: true, ...project.matches[0] }
        : { ok: false, invalid: true, reason: "Selected project custom-agent profile does not pin a model." };
    }

    const codexHome = process.env.CODEX_HOME || (process.env.HOME ? path.join(process.env.HOME, ".codex") : "");
    const user = scanAgentDirectory(codexHome ? path.join(codexHome, "agents") : "", codexHome, agentType);
    if (user.invalid) return { ok: false, invalid: true, reason: "User custom-agent configuration is malformed or ambiguous." };
    if (user.matches.length > 1) return { ok: false, invalid: true, reason: "User custom-agent name is duplicated." };
    if (user.matches.length === 1) {
      return validBoundedField(user.matches[0].model, /^[A-Za-z0-9._-]+$/)
        ? { ok: true, ...user.matches[0] }
        : { ok: false, invalid: true, reason: "Selected user custom-agent profile does not pin a model." };
    }
    return { ok: false, invalid: true, reason: "No custom-agent profile matches the authoritative agent_type." };
  }

  function nativeRoleRoutingEvidence(repoRoot, input, state) {
    if (!state?.native_role_routing?.required) return null;
    const checkedAt = new Date().toISOString();
    const agentType = firstString(input, ["agent_type"]);
    const observedModel = firstString(input, ["model"]);
    const agentId = firstString(input, ["agent_id"]);
    const turnId = firstString(input, ["turn_id"]);
    const base = {
      schema_version: 1,
      required: true,
      agent_id: agentId || null,
      turn_id: turnId || null,
      agent_type: agentType || null,
      observed_model: observedModel || null,
      configured_model: null,
      config_path: null,
      config_sha256: null,
      checked_at: checkedAt,
    };

    if (!agentType || !observedModel || !agentId || !turnId) {
      return {
        ...base,
        status: "unverified",
        reason: "SubagentStart omitted one or more required role-routing fields.",
      };
    }
    if (
      !validBoundedField(agentType, /^[A-Za-z0-9_-]+$/)
      || !validBoundedField(observedModel, /^[A-Za-z0-9._-]+$/)
      || !validBoundedField(agentId, /^[A-Za-z0-9._:-]+$/)
      || !validBoundedField(turnId, /^[A-Za-z0-9._:-]+$/)
    ) {
      return {
        ...base,
        agent_id: null,
        turn_id: null,
        agent_type: null,
        observed_model: null,
        status: "invalid",
        reason: "SubagentStart supplied malformed authoritative role-routing fields.",
      };
    }
    if (agentType === "default") {
      return {
        ...base,
        status: "unavailable",
        reason: `Codex resolved the native child as default on ${observedModel}; no custom-agent role was selected.`,
      };
    }

    const profile = customAgentProfile(repoRoot, agentType);
    if (!profile.ok) {
      return {
        ...base,
        status: profile.invalid ? "invalid" : "unverified",
        reason: profile.reason,
      };
    }
    if (profile.model !== observedModel) {
      return {
        ...base,
        status: "mismatch",
        reason: `Codex started ${agentType} on ${observedModel}, but its custom-agent TOML requires ${profile.model}.`,
        configured_model: profile.model,
        config_path: profile.configPath,
        config_sha256: profile.configSha256,
      };
    }
    return {
      ...base,
      status: "verified",
      reason: `Codex started custom agent ${agentType} on its configured model ${observedModel}.`,
      configured_model: profile.model,
      config_path: profile.configPath,
      config_sha256: profile.configSha256,
    };
  }

  function delegationScopes(input) {
    const scopes = [];
    const turnId = firstString(input, ["turn_id"]);
    if (turnId) scopes.push({ source: "turn_id", id: `turn-${sanitize(turnId)}` });

    const runId = firstString(input, ["run_id"]);
    if (runId) scopes.push({ source: "run_id", id: `run-${sanitize(runId)}` });

    const sessionId = firstString(input, ["session_id"]);
    if (sessionId) scopes.push({ source: "session_id", id: `session-${sanitize(sessionId)}` });

    const transcriptPath = firstString(input, ["transcript_path"]);
    if (transcriptPath) {
      const digest = crypto.createHash("sha1").update(transcriptPath).digest("hex").slice(0, 16);
      scopes.push({ source: "transcript_path", id: `transcript-${digest}` });
    }

    const envSession = process.env.CODEX_SESSION_ID || process.env.CLAUDE_SESSION_ID || "";
    if (envSession) scopes.push({ source: "env_session", id: `session-${sanitize(envSession)}` });

    return scopes;
  }

  function resolveStatePath(stateDir, scopes) {
    const latestPath = path.join(stateDir, "latest.json");
    const latest = JSON.parse(fs.readFileSync(latestPath, "utf8"));
    if (latest.scope_id) {
      if (!scopes.some((scope) => latest.scope_id === scope.id)) return null;
      const statePath = path.resolve(stateDir, latest.state_file || path.join("turns", `${latest.scope_id}.json`));
      const stateRoot = path.resolve(stateDir) + path.sep;
      if (!statePath.startsWith(stateRoot)) return null;
      return {
        latestPath,
        statePath,
      };
    }
    return { latestPath, statePath: latestPath };
  }

  function resolveEvidenceDir(stateDir, state) {
    const relative = state?.native_role_routing?.evidence_dir;
    if (typeof relative !== "string" || !relative.trim() || path.isAbsolute(relative)) return null;
    const stateRootStat = fs.lstatSync(stateDir);
    if (stateRootStat.isSymbolicLink() || !stateRootStat.isDirectory()) return null;
    const root = fs.realpathSync(stateDir);
    const resolved = path.resolve(root, relative);
    if (resolved === root || !resolved.startsWith(`${root}${path.sep}`)) return null;
    let current = root;
    for (const segment of path.relative(root, resolved).split(path.sep)) {
      current = path.join(current, segment);
      if (fs.existsSync(current)) {
        const stat = fs.lstatSync(current);
        if (stat.isSymbolicLink() || !stat.isDirectory()) return null;
      } else {
        try {
          fs.mkdirSync(current, { mode: 0o700 });
        } catch (error) {
          if (!(error && typeof error === "object" && error.code === "EEXIST")) throw error;
        }
        const stat = fs.lstatSync(current);
        if (stat.isSymbolicLink() || !stat.isDirectory()) return null;
      }
      const canonical = fs.realpathSync(current);
      if (!canonical.startsWith(`${root}${path.sep}`)) return null;
    }
    return current;
  }

  function atomicWriteJson(targetPath, value) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const temporary = `${targetPath}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, targetPath);
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
  // networked filesystem.
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

  const repoRoot = process.env.REPO_ROOT || process.cwd();
  const input = parseInput();
  const stateDir = path.join(repoRoot, ".ai", "harness", "delegation");
  let nativeRoleRouting = null;
  try {
    const paths = resolveStatePath(stateDir, delegationScopes(input));
    if (!paths) throw new Error("delegation state belongs to a different scope");
    const state = JSON.parse(fs.readFileSync(paths.statePath, "utf8"));
    if (state && state.eligible) {
      const now = new Date().toISOString();
      if (state.explicit && !state.spawned) {
        state.spawned = true;
        state.spawned_at = now;
      }
      nativeRoleRouting = nativeRoleRoutingEvidence(repoRoot, input, state);
      if (nativeRoleRouting) {
        const evidenceDir = resolveEvidenceDir(stateDir, state);
        const agentId = firstString(input, ["agent_id"]);
        const turnId = firstString(input, ["turn_id"]);
        if (!evidenceDir || !agentId || !turnId) {
          nativeRoleRouting = {
            ...nativeRoleRouting,
            status: nativeRoleRouting.status === "invalid" ? "invalid" : "unverified",
            reason: evidenceDir
              ? "SubagentStart omitted the identity fields required to persist role-routing evidence."
              : "Delegation state has no safe role-routing evidence directory.",
          };
        } else {
          const evidenceKey = crypto.createHash("sha256").update(`${turnId}\0${agentId}`).digest("hex");
          atomicWriteJson(path.join(evidenceDir, `${evidenceKey}.json`), nativeRoleRouting);
        }
      }
      state.updated_at = now;
      if (paths.latestPath === paths.statePath) {
        // Unscoped case: statePath IS the shared latest.json pointer (see
        // resolveStatePath above), not an isolated per-turn file, so this
        // single write is itself a shared-pointer write and must go through
        // the same lock-guarded read-compare-write sequence as the scoped
        // branch below instead of writing unconditionally. Skipping the
        // lock here (treating this as a redundant self-write) was the
        // actual bug: it let an unlocked write reach latest.json whenever
        // no scope had been claimed yet.
        const latestLockPath = `${paths.latestPath}.lock`;
        const latestLock = acquireLock(latestLockPath);
        if (latestLock.acquired) {
          try {
            const currentLatest = JSON.parse(fs.readFileSync(paths.latestPath, "utf8"));
            if (currentLatest && currentLatest.scope_id === state.scope_id) {
              atomicWriteJson(paths.statePath, state);
            }
          } finally {
            releaseLock(latestLockPath, latestLock.token);
          }
        }
        // If the lock could not be acquired within the bounded retry window,
        // skip this write rather than risk a hung hook: a skipped write is
        // safe, a hung hook is not.
      } else {
        // Scoped case: statePath belongs only to this invocation (see
        // resolveStatePath above) and is always safe to write
        // unconditionally; only the shared latestPath write below needs the
        // lock.
        atomicWriteJson(paths.statePath, state);
        // Mutual-exclusion guard: a newer delegation (a fresh
        // UserPromptSubmit advisor call) may replace latest.json with a
        // different scope while this SubagentStart invocation is still
        // working from state read earlier under the scope owned by this
        // invocation. Comparing the on-disk scope and then calling
        // atomicWriteJson are two separate steps (the write itself is
        // create-temp-file, write, rename), so a fresher write from another
        // invocation could still land in the gap between the compare and the
        // rename and be clobbered here. Hold a real lock across the whole
        // read-compare-write sequence so no other invocation of this script
        // can interleave inside it. The per-turn statePath write above is
        // always scoped to this invocation alone and is safe regardless.
        const latestLockPath = `${paths.latestPath}.lock`;
        const latestLock = acquireLock(latestLockPath);
        if (latestLock.acquired) {
          try {
            const currentLatest = JSON.parse(fs.readFileSync(paths.latestPath, "utf8"));
            if (currentLatest && currentLatest.scope_id === state.scope_id) {
              atomicWriteJson(paths.latestPath, state);
            }
          } finally {
            releaseLock(latestLockPath, latestLock.token);
          }
        }
        // If the lock could not be acquired within the bounded retry window,
        // skip the latestPath write rather than risk a hung hook: a skipped
        // write is safe, a hung hook is not.
      }
    }
  } catch {
    // SubagentStart context is still useful without delegation state.
  }

  const context = [
    "[repo-harness:subagent-context]",
    "",
    ...(nativeRoleRouting
      ? [
          `[repo-harness:native-role-routing] ${nativeRoleRouting.status}: ${nativeRoleRouting.reason}`,
          nativeRoleRouting.status === "verified"
            ? "Custom-agent model routing is verified for this child; reasoning-effort routing remains unverified because SubagentStart does not expose it."
            : "Do not claim custom-agent model or reasoning-effort routing. Return this routing status to the parent so it can record runner degradation or use the configured fallback.",
          "",
        ]
      : []),
    "Read the active repo-harness contract before working.",
    "Stay within the assigned role and permission scope.",
    "Do not broaden the task.",
    "Explorer and reviewer roles are read-only unless the parent prompt explicitly assigns a writable worker scope.",
    "",
    "Return complete findings in your final response, including:",
    "- files and symbols inspected",
    "- evidence",
    "- risks or uncertainty",
    "- tests or commands run when relevant",
    "- recommended parent action",
    "",
    "Do not claim overall task completion.",
    "",
    "Execution boundary: implement exactly the Goal, In scope items, Allowed Paths, and Exit Criteria in this brief. Treat absent requirements as forbidden design space, not as permission to improve.",
    "",
    "Do not add optional features, alternate UX, extra integrations, migration paths, compatibility behavior, fallback behavior, telemetry, broad cleanup, refactors, new abstractions, extra docs, or polish unless that work is explicitly listed under In scope or required by Exit Criteria.",
    "",
    "If you discover useful additional work, record it under Out of scope / Future work in the notes or review artifact. Do not implement it. Do not end with unsolicited offers to do more work.",
    "",
    "If the requested outcome cannot be completed without expanding scope, fail closed: stop, name the missing decision, and cite the exact file/section that blocks execution.",
  ].join("\n");

  process.stdout.write(`${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SubagentStart",
      additionalContext: context,
    },
  })}\n`);
'
