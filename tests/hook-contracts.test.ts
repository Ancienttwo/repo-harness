import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf-8");
}

describe("Hook contracts", () => {
  test("shared hook input parser should exist", () => {
    expect(existsSync(join(ROOT, "assets/hooks/hook-input.sh"))).toBe(true);
    expect(existsSync(join(ROOT, "assets/hooks/lib/workflow-state.sh"))).toBe(true);
    expect(existsSync(join(ROOT, "assets/hooks/lib/session-state.sh"))).toBe(true);
    expect(existsSync(join(ROOT, "assets/hooks/lib/memory-state.sh"))).toBe(false);
    expect(existsSync(join(ROOT, "assets/hooks/lib/skill-factory.sh"))).toBe(false);
  });

  test("shared hook dispatcher should exist", () => {
    const script = read("assets/hooks/run-hook.sh");
    expect(script).toContain("HOOK_REPO_ROOT");
    expect(script).toContain("HookRunner");
    expect(script).toContain(".ai/hooks");
    expect(script).toContain("hook_stdout_is_json_kind");
    expect(script).toContain('(.decision == "block") or (.decision == "allow")');
    expect(script).toContain("Stop decision JSON is deliberately");
    expect(script).not.toContain('"$HOOK_NAME" == "stop-orchestrator.sh"');
    expect(script).toContain('"$HOOK_NAME" == "subagent-stop-quality.sh"');
    expect(script).toContain('"$HOOK_NAME" == "codex-delegation-advisor.sh"');
  });

  test("hook input parser should support current Claude Code prompt and memory fields", () => {
    const script = read("assets/hooks/hook-input.sh");
    expect(script).toContain(".prompt");
    expect(script).toContain(".session_id");
    expect(script).toContain(".transcript_path");
    expect(script).toContain("CODEX_TRANSCRIPT_PATH");
    expect(script).toContain(".run_id");
    expect(script).toContain(".memory_type");
    expect(script).toContain(".load_reason");
    expect(script).toContain('"failure_class"');
    expect(script).toContain(".ai/harness/failures/latest.jsonl");
  });


  // HRD-03: worktree-guard.sh and pre-edit-guard.sh are retired; their
  // decision surface -- including the exact reason tokens and message text
  // this test protects -- now lives in the in-process mutation-guard
  // handler. Shell-specific assertions (sourcing hook-input.sh, calling the
  // bash hook_structured_error helper) are dropped as not applicable to a
  // TypeScript module; every guard-name/message-text string stays checked
  // against the new handler's source.
  test("mutation-guard handler should combine asset-layer and test reminders", () => {
    const script = read("src/cli/hook/mutation-guard.ts");
    expect(script).toContain("[AssetLayer]");
    expect(script).toContain("[BDD Guard]");
    expect(script).toContain("[TDD Guard]");
    expect(script).toContain("PlanTransitionGuard");
    expect(script).toContain("ExternalReferenceGuard");
    expect(script).toContain("OpsPrivateGuard");
    expect(script).toContain("deploy/");
  });

  test("mutation-guard handler should be warning-first with marker-based worktree enforcement", () => {
    const script = read("src/cli/hook/mutation-guard.ts");
    expect(script).toContain(".claude/.require-worktree");
    expect(script).toContain("Warning: primary working tree detected");
    expect(script).toContain("Mutation blocked");
  });

  test("post-tool observer should keep trace, CodeGraph session state, and plan annotation guards without budget probes", () => {
    const script = read("assets/hooks/post-tool-observer.sh");
    expect(script).toContain(".claude/.session-id");
    expect(script).toContain("session_state_resolve_key");
    expect(script).toContain("session_state_mark_codegraph_used");
    expect(script).toContain("workflow_trace_file");
    expect(script).toContain("[AnnotationGuard]");
    expect(script).not.toContain("WARN_FILE");
    expect(script).not.toContain("RED_FILE");
    expect(script).not.toContain(".tool-call-count");
    expect(script).not.toContain(".context-pressure");
    expect(script).not.toContain("scripts/context-budget.ts");
    expect(script).not.toContain("BUDGET_SAMPLE_EVERY");
    expect(script).not.toContain("ContextMonitor");
    expect(script).not.toContain("/compact");
  });

  test("subagent return-channel guard should cover spawn prompts and subagent SendUserMessage", () => {
    const script = read("assets/hooks/subagent-return-channel-guard.sh");
    expect(script).toContain("Task|Agent|SendUserMessage");
    expect(script).toContain("hook-input.sh");
    expect(script).toContain("[repo-harness:return-channel]");
    expect(script).toContain("updatedInput");
    expect(script).toContain("permissionDecision: \"deny\"");
    expect(script).toContain(".agent_id");
    expect(script).toContain("/subagents/agent-");
    expect(script).not.toContain("claude-opus");
    expect(script).not.toContain("model");
  });

  test("codex delegation hooks should use explicit prompt authorization and bounded roles", () => {
    const advisor = read("assets/hooks/codex-delegation-advisor.sh");
    expect(advisor).toContain("UserPromptSubmit.delegation");
    expect(advisor).toContain("/(delegate|parallel)");
    expect(advisor).toContain("spawn_agent");
    expect(advisor).toContain("max_agents");
    expect(advisor).toContain("max_depth");
    expect(advisor).toContain(".ai\", \"harness\", \"delegation");
    expect(advisor).toContain("permission only");
    expect(advisor).toContain("activeContractPath");
    expect(advisor).not.toContain("policyDelegation.mode");
    expect(advisor).not.toContain("auto-mode");
    expect(advisor).not.toContain("readGlobalDelegationMode");
    expect(advisor).not.toContain("prompt-route");
    expect(advisor).not.toContain(
      "standing user authorization for bounded delegation, selected by the user at install time",
    );

    // HRD-04 retired session-start-context.sh; the delegation section it
    // owned now lives in the in-process session-context builder.
    const sessionStart = read("src/cli/hook/session-context.ts");
    expect(sessionStart).toContain("Delegation Standing Authorization");
    expect(sessionStart).toContain(
      "standing user authorization for bounded native",
    );
    expect(sessionStart).toContain("effectiveDelegationMode");

    const start = read("assets/hooks/subagent-start-context.sh");
    expect(start).toContain("SubagentStart.context");
    expect(start).toContain("[repo-harness:subagent-context]");
    expect(start).toContain("Do not claim overall task completion");

    const stop = read("assets/hooks/subagent-stop-quality.sh");
    expect(stop).toContain("SubagentStop.quality");
    expect(stop).toContain("[SubagentQualityGate]");
    expect(stop).toContain("last_blocked_hash");
  });

  test("prompt-guard shell layer keeps route hints, gates, and rendering without emoji", () => {
    const script = read("assets/hooks/prompt-guard.sh");
    expect(script).toContain("emit_waza_route_hint");
    expect(script).toContain("[WazaRoute]");
    expect(script).toContain("Waza /check");
    expect(script).toContain("Waza /health");
    expect(script).toContain("Waza /think");
    expect(script).toContain("emit_agentic_packaging_hint");
    expect(script).toContain("[AgenticDevRoute]");
    expect(script).toContain("repo-harness-autoplan after user authorization");
    expect(script).toContain("hook will not plan or create assets");
    expect(script).not.toContain("Waza /hunt");
    expect(script).not.toContain("Waza /learn");
    expect(script).toContain("ResearchGuard");
    expect(script).toContain("AnnotationGuard");
    expect(script).toContain("PlanStatusGuard");
    expect(script).toContain("PlanDiscussionGate");
    expect(script).toContain("workflow_write_pending_orchestration");
    expect(script).toContain("ContractGuard");
    expect(script).toContain("ResearchGate");
    expect(script).toContain("done");
    expect(script).toContain("repo-harness run verify-contract");
    expect(script).toContain("HarnessMaintenance");
    expect(script).toContain("has_changes_glob");
    expect(script).toContain("emit_external_acceptance_prompt");
    expect(script).toContain("[ExternalAcceptance]");
    expect(script).toContain("## External Acceptance Advice");
    expect(script).toContain("[CrossReview]");
    expect(script).toContain("prompt_strict_workflow && review_profile=\"strict\"");
    expect(script).toContain("if prompt_strict_workflow; then");
    expect(script).toContain("hook_circuit_record cross-model-consult CrossModelLimit");
    expect(script).toContain('if prompt_strict_workflow; then risk="true"; consult_profile="strict"; fi');
    expect(script).not.toContain("📋");
    expect(script).not.toContain("🧠");
    expect(script).not.toContain("📎");
    // The shell layer no longer owns intent regexes or a fallback decision
    // table; classification lives in the TypeScript engine.
    expect(script).not.toContain("is_implement_intent");
    expect(script).not.toContain("prompt_guard_decide_fallback");
  });

  test("prompt intent classifier owns Chinese bug/feature keywords with Unicode semantics", () => {
    const intents = read("src/cli/hook/prompt-intents.ts");
    expect(intents).toContain("修复");
    expect(intents).toContain("修bug");
    expect(intents).toContain("新功能");
    expect(intents).toContain("实现");
    expect(intents).toContain("执行");
    expect(intents).toContain("收工");
    expect(intents).toContain("完成");
    expect(intents).toContain("下一刀");
    expect(intents).toContain("\\p{P}");
  });

  // HRD-04 retired session-start-context.sh; its content now lives in the
  // in-process session-context builder. Bash-syntax assertions
  // (`:-604800` default-value syntax, `"$target"` interpolation) retarget to
  // the equivalent TS constructs; every underlying claim (default TTL 604800,
  // report/marker file naming, update-action id filter) is unchanged.
  test("session-start should not spend the global budget on cross-review availability", () => {
    const script = read("src/cli/hook/session-context.ts");
    expect(script).not.toContain("[CrossReview]");
    expect(script).toContain("Pending Plan Capture");
    expect(script).toContain("pendingOrchestrationIsFresh");
    expect(script).not.toContain("claude-review");
    expect(script).not.toContain("worth the tokens");
  });

  test("session-start owns throttled tooling update advisories", () => {
    const script = read("src/cli/hook/session-context.ts");
    expect(script).toContain("Tooling Update Advisory");
    expect(script).toContain("'setup', 'check', '--target', target, '--check-updates', '--json'");
    expect(script).toContain("if (raw === undefined) return 604800;");
    expect(script).toContain("tooling-update-advisory-${target}.json");
    expect(script).toContain("tooling-update-advisory-${target}.rendered");
    expect(script).toContain("cli.update");
    expect(script).toContain("tooling\\.[^.]+\\.update");
  });

  test("security sentinel should stay changed-only and advisory", () => {
    const script = read("src/cli/hook/session-context.ts");
    // Ports to a direct in-process runSecurityScan() call (no CLI text to
    // match); the fingerprint-gated, changed-only, advisory shape it owns is
    // still verified via the surrounding state/state.sha256/[SecurityConfig]
    // markers and the absence of any --strict escalation.
    expect(script).toContain("runSecurityScan");
    expect(script).toContain("state.sha256");
    expect(script).toContain(".ai/harness/security");
    expect(script).toContain("[SecurityConfig]");
    expect(script).not.toContain("--strict");
  });

  test("in-process stop handler should own Stop JSON control and recovery projection", () => {
    const handler = read("src/cli/hook/stop-handler.ts");
    expect(handler).toContain("PlanCompletenessGate");
    expect(handler).toContain("last_assistant_message");
    expect(handler).toContain("stop_hook_active");
    expect(handler).toContain("StopProjectionBatch");
    expect(handler).toContain("decision: 'block'");
    expect(handler).toContain("getStopEffectiveState");
  });

  // HRD-05 retired assets/hooks/post-edit-guard.sh; doc-drift coverage now
  // lives in the in-process mutation-observed journal handler.
  test("mutation-observed should retain doc-drift coverage for apps/*/src/** and wrangler*.toml", () => {
    const script = read("src/cli/hook/mutation-observed.ts");
    expect(script).toContain("apps\\/[^/]+\\/src\\/.+");
    expect(script).toContain("wrangler.*\\.toml");
  });

  // HRD-05: post-edit-guard.sh's per-edit task-handoff regeneration
  // ("[TaskHandoff]") is retired -- deferred to Stop's existing unconditional
  // handoff refresh instead of reprinted per edit -- so that assertion does
  // not carry over. architecture-queue/context-contract-sync move from a
  // synchronous `run_repo_harness_helper` call to deferred Stop-time
  // consumption (`runRepoHarnessHelper`, same helper names as CLI args).
  test("mutation-observed should combine doc drift and deferred contract/architecture dirty bits", () => {
    const script = read("src/cli/hook/mutation-observed.ts");
    expect(script).toContain("[DocDrift]");
    expect(script).toContain("[DeployAsset]");
    expect(script).toContain("'architecture-queue'");
    expect(script).toContain("'context-contract-sync'");
    expect(script).not.toContain("sync-brain-docs");
    expect(read("assets/templates/helpers/archive-architecture-request.sh")).toContain("[ArchitectureArchive]");
    expect(read("assets/templates/helpers/workstream-sync.sh")).toContain("tasks/workstreams");
    expect(script).toContain("tasks/todos.md");
    expect(script).toContain("--quiet");
    expect(script).toContain("contract_references_path");
  });

  test("workflow verification should not gate on external brain vault state", () => {
    const script = read("assets/templates/helpers/check-task-workflow.sh");
    expect(script).not.toContain('run_optional_helper "check-brain-manifest.sh"');
    expect(script).not.toContain('run_optional_helper "sync-brain-docs.sh"');
    expect(script).not.toContain("Brain doc sync check failed");
  });

  test("architecture drift helpers should keep detection and context sync separated", () => {
    const eventHelper = read("assets/templates/helpers/architecture-event.ts");
    const drift = read("assets/templates/helpers/architecture-queue.sh");
    const sync = read("assets/templates/helpers/context-contract-sync.sh");
    const workstream = read("assets/templates/helpers/workstream-sync.sh");

    expect(eventHelper).toContain("sync-context-map");
    expect(eventHelper).toContain("sync-contract-files");
    expect(eventHelper).toContain("event-json");
    expect(drift).toContain("docs/architecture/requests");
    expect(drift).toContain("architecture-event.ts");
    expect(drift).toContain(".ai/harness/architecture/events.jsonl");
    expect(eventHelper).toContain("repo-harness run workstream-sync");
    expect(drift).not.toContain("BEGIN ARCHITECTURE CONTRACT");
    expect(sync).toContain("architecture-event.ts");
    expect(sync).toContain("BEGIN ARCHITECTURE CONTRACT");
    expect(sync).toContain("Active Workstreams");
    expect(sync).toContain("discoverable_contexts");
    expect(sync).toContain("Semantic diagram source");
    expect(sync).toContain("Latest human diagram");
    expect(sync).toContain("docs/architecture/diagrams");
    expect(eventHelper).toContain("Mermaid fenced block");
    expect(eventHelper).toContain("Markdown semantic source");
    expect(workstream).toContain("tasks/workstreams");
    expect(workstream).toContain("context-contract-sync.sh");
  });


  test("first-principles guard should parse file path and keep anti-overengineering advisory semantics", () => {
    const script = read("assets/hooks/first-principles-guard.sh");
    const wrapper = read("assets/hooks/anti-simplification.sh");
    // HRD-05 retired assets/hooks/post-edit-guard.sh; the aggregated
    // first-principles-guard.sh/anti-simplification.sh dispatch that used to
    // live inline in that script is now ported verbatim into the in-process
    // mutation-observed journal handler.
    const postEdit = read("src/cli/hook/mutation-observed.ts");

    expect(script).toContain("hook-input.sh");
    expect(script).toContain("hook_get_file_path");
    expect(script).toContain("[FirstPrinciples]");
    expect(script).toContain("must this exist");
    expect(script).toContain("trust-boundary validation");
    expect(wrapper).toContain("first-principles-guard.sh");
    expect(postEdit).toContain("first-principles-guard.sh");
  });

  test("post-tool observer should record structured JSONL trace events once per call", () => {
    const script = read("assets/hooks/post-tool-observer.sh");
    expect(script).toContain("workflow_trace_file");
    expect(script).toContain('"event_type"');
    expect(script).toContain('"run_id"');
    expect(script).toContain("session_state_resolve_key");
    expect(script).not.toContain("workflow_append_event");
    expect(existsSync(join(ROOT, "assets/hooks/trace-event.sh"))).toBe(false);
    expect(existsSync(join(ROOT, "assets/hooks/context-pressure-hook.sh"))).toBe(false);
  });

  test("post-bash should keep Bash output evidence additive and advisory-only", () => {
    const script = read("assets/hooks/post-bash.sh");
    expect(script).toContain("verbosity_class");
    expect(script).toContain("suggested_runner");
    expect(script).toContain("raw_output_path");
    expect(script).toContain("raw_output_bytes");
    expect(script).toContain("raw_output_sha256");
    expect(script).toContain("failure_signal");
    expect(script).toContain("rtk_available");
    expect(script).toContain("workflow_runs_dir");
    expect(script).toContain("bash-output");
    expect(script).toContain("command -v rtk");
    expect(script).toContain("recommended_next_tool");
    expect(script).toContain("codegraph_context");
    expect(script).not.toContain("rtk $COMMAND_TEXT");
    expect(script).not.toContain("exec rtk");
  });
});
