import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf-8");
}

describe("Hook contracts", () => {
  test("typed hook input parser and operator workflow helper should exist", () => {
    expect(existsSync(join(ROOT, "src/cli/hook/hook-input.ts"))).toBe(true);
    expect(existsSync(join(ROOT, "assets/hooks/lib/workflow-state.sh"))).toBe(true);
    expect(existsSync(join(ROOT, "assets/hooks/hook-input.sh"))).toBe(false);
    expect(existsSync(join(ROOT, "assets/hooks/lib/session-state.sh"))).toBe(false);
    expect(existsSync(join(ROOT, "assets/hooks/lib/memory-state.sh"))).toBe(false);
    expect(existsSync(join(ROOT, "assets/hooks/lib/skill-factory.sh"))).toBe(false);
  });

  test("route registry binds every public tuple to exactly one typed handler", () => {
    const routes = read("src/cli/hook/route-registry.ts");
    const registry = read("src/cli/hook/handler-registry.ts");
    const runtime = read("src/cli/hook/runtime.ts");
    expect(routes).toContain("readonly handler: HookHandlerId");
    expect(routes).not.toContain("readonly scripts");
    expect(registry).toContain("getHandlerForRoute");
    expect(registry).toContain("ROUTES.map");
    expect(runtime).toContain("getHandlerForRoute");
    expect(runtime).not.toContain("run-hook.sh");
    expect(existsSync(join(ROOT, "assets/hooks/run-hook.sh"))).toBe(false);
  });

  test("typed hook input parser owns prompt, session, run, tool, and path accessors", () => {
    const parser = read("src/cli/hook/hook-input.ts");
    expect(parser).toContain("getPrompt");
    expect(parser).toContain("getSessionId");
    expect(parser).toContain("getRunId");
    expect(parser).toContain("getToolName");
    expect(parser).toContain("getFilePath");
    expect(parser).toContain("getApplyPatchPaths");
    expect(parser).toContain("CODEX_SESSION_ID");
    expect(parser).toContain("[HookInput] WARN");
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

  test("typed trace observer keeps trace, CodeGraph session state, and plan annotation without budget probes", () => {
    const observer = read("src/cli/hook/trace-observer.ts");
    expect(observer).toContain(".claude/.session-id");
    expect(observer).toContain(".claude/.trace.jsonl");
    expect(observer).toContain(".claude/.codegraph-state");
    expect(observer).toContain("[AnnotationGuard]");
    expect(observer).toContain("event_type");
    expect(observer).toContain("run_id");
    expect(observer).not.toContain(".tool-call-count");
    expect(observer).not.toContain("context-budget");
    expect(observer).not.toContain("/compact");
  });

  test("typed subagent handler owns return channel, delegation, context, and quality", () => {
    const handler = read("src/cli/hook/subagent-handler.ts");
    expect(handler).toContain("[repo-harness:return-channel]");
    expect(handler).toContain("updatedInput");
    expect(handler).toContain("permissionDecision: 'deny'");
    expect(handler).toContain("/(delegate|parallel)");
    expect(handler).toContain("max_agents");
    expect(handler).toContain("max_depth");
    expect(handler).toContain("permission only");
    expect(handler).toContain("[repo-harness:subagent-context]");
    expect(handler).toContain("[SubagentQualityGate]");
    expect(handler).toContain("last_blocked_hash");
  });

  test("delegation standing authorization stays separate from per-prompt typed permission", () => {
    const advisor = read("src/cli/hook/subagent-handler.ts");
    expect(advisor).toContain("activeContractPath");
    expect(advisor).not.toContain("policyDelegation.mode");
    expect(advisor).not.toContain("auto-mode");
    expect(advisor).not.toContain("readGlobalDelegationMode");
    const sessionStart = read("src/cli/hook/session-context.ts");
    expect(sessionStart).toContain("Delegation Standing Authorization");
    expect(sessionStart).toContain(
      "standing user authorization for bounded native",
    );
    expect(sessionStart).toContain("effectiveDelegationMode");
  });

  test("typed prompt handler keeps route hints, gates, acceptance, and circuit rendering", () => {
    const script = read("src/cli/hook/prompt-handler.ts");
    expect(script).toContain("[WazaRoute]");
    expect(script).toContain("Waza /check");
    expect(script).toContain("Waza /health");
    expect(script).toContain("Waza /think");
    expect(script).toContain("[AgenticDevRoute]");
    expect(script).toContain("execute continuation via Effective State after user authorization");
    expect(script).toContain("hook will not plan or create assets");
    expect(script).not.toContain("Waza /hunt");
    expect(script).not.toContain("Waza /learn");
    expect(script).toContain("ResearchGuard");
    expect(script).toContain("AnnotationGuard");
    expect(script).toContain("PlanStatusGuard");
    expect(script).toContain("PlanDiscussionGate");
    expect(script).toContain("writePendingOrchestration");
    expect(script).toContain("ContractGuard");
    expect(script).toContain("ResearchGate");
    expect(script).toContain("done");
    expect(script).toContain("'run', 'verify-contract'");
    expect(script).toContain("[ExternalAcceptance]");
    expect(script).toContain("AcceptanceReceipt");
    expect(script).toContain("[CrossReview]");
    expect(script).toContain("kind: 'cross-model-consult'");
    expect(script).toContain("guard: 'CrossModelLimit'");
    expect(script).toContain("kind: 'review'");
    expect(script).toContain("guard: 'ReviewLimit'");
    expect(script).not.toContain("📋");
    expect(script).not.toContain("🧠");
    expect(script).not.toContain("📎");
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


  test("mutation observer owns first-principles anti-overengineering advice in-process", () => {
    const observer = read("src/cli/hook/mutation-observed.ts");
    expect(observer).toContain("renderFirstPrinciplesAdvisory");
    expect(observer).toContain("[FirstPrinciples]");
    expect(observer).toContain("must this exist");
    expect(observer).toContain("trust-boundary validation");
    expect(existsSync(join(ROOT, "assets/hooks/first-principles-guard.sh"))).toBe(false);
    expect(existsSync(join(ROOT, "assets/hooks/anti-simplification.sh"))).toBe(false);
  });

  test("typed trace observer records one structured JSONL event per call", () => {
    const observer = read("src/cli/hook/trace-observer.ts");
    expect(observer).toContain(".claude/.trace.jsonl");
    expect(observer).toContain("event_type");
    expect(observer).toContain("run_id");
    expect(observer).toContain("appendFileSync");
    expect(observer).not.toContain("workflow_append_event");
    expect(existsSync(join(ROOT, "assets/hooks/trace-event.sh"))).toBe(false);
    expect(existsSync(join(ROOT, "assets/hooks/context-pressure-hook.sh"))).toBe(false);
  });

  test("typed command observer keeps Bash output evidence additive and advisory-only", () => {
    const script = read("src/cli/hook/command-observed.ts");
    expect(script).toContain("verbosity_class");
    expect(script).toContain("suggested_runner");
    expect(script).toContain("raw_output_path");
    expect(script).toContain("raw_output_bytes");
    expect(script).toContain("raw_output_sha256");
    expect(script).toContain("failure_signal");
    expect(script).toContain("rtk_available");
    expect(script).toContain("policyRunsDir");
    expect(script).toContain("bash-output");
    expect(script).toContain("hasExecutable");
    expect(script).toContain("recommended_next_tool");
    expect(script).toContain("codegraph_context");
    expect(script).not.toContain("rtk $COMMAND_TEXT");
    expect(script).not.toContain("exec rtk");
  });
});
