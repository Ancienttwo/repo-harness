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
    expect(runtime).toContain("getHandlerForRoute");
    expect(runtime).not.toContain("run-hook.sh");
    expect(existsSync(join(ROOT, "assets/hooks/run-hook.sh"))).toBe(false);
  });

  test("task inbox is an independent UserPromptSubmit route with bounded untrusted output", () => {
    const routes = read("src/cli/hook/route-registry.ts");
    const registry = read("src/cli/hook/handler-registry.ts");
    const handler = read("src/cli/hook/task-inbox-handler.ts");
    const protocol = read("src/core/fleet/task-message.ts");
    expect(routes).toContain("routeId: 'inbox'");
    expect(routes).toContain("handler: 'task-inbox'");
    expect(registry).toContain("runTaskInboxHandler");
    // #678: the runtime no longer lists structured routes by id, so the old
    // source pin on `opts.routeId === 'inbox'` is gone. The real hook-entry
    // test "Codex UserPromptSubmit.inbox writes its envelope unchanged" in
    // tests/hook-runtime.test.ts checks the bounded output on the host fd.
    expect(handler).toContain("renderTaskMessageUntrustedContext");
    expect(protocol).toContain("TaskInboxUntrustedPeerMessages");
    expect(protocol).toContain("untrusted data");
    expect(handler).not.toContain("transcript");
    expect(handler).not.toContain("pty");
    expect(handler).not.toContain("resume");
  });


  // HRD-03: worktree-guard.sh and pre-edit-guard.sh are retired; their
  // decision surface -- including the exact reason tokens and message text
  // this test protects -- now lives in the in-process mutation-guard
  // handler. Shell-specific assertions (sourcing hook-input.sh, calling the
  // bash hook_structured_error helper) are dropped as not applicable to a
  // TypeScript module; every guard-name/message-text string stays checked
  // against the new handler's source.
  test("mutation-guard preserves private path fences", () => {
    const script = read("src/cli/hook/mutation-guard.ts");
    expect(script).toContain("canonicalRepoRelativePath");
    expect(script).toContain("RepoScopeGuard");
    expect(script).toContain("OpsPrivateGuard");
    expect(script).toContain("ExternalReferenceGuard");
    expect(script).not.toContain(".claude/.require-worktree");
  });

  test("typed subagent handler owns return channel, delegation, context, and quality", () => {
    const handler = read("src/cli/hook/subagent-handler.ts");
    expect(handler).toContain("[repo-harness:return-channel]");
    expect(handler).toContain("updatedInput");
    // #691 finding 9: the handler returns a typed permission; the host renderer writes permissionDecision.
    expect(handler).toContain("decision: 'allow'");
    expect(handler).toContain("/(delegate|parallel)");
    expect(handler).toContain("max_agents");
    expect(handler).toContain("max_depth");
    expect(handler).toContain("permission only");
    expect(handler).toContain("[repo-harness:subagent-context]");
    expect(handler).toContain("[SubagentQuality]");
    expect(handler).toContain("Record the report gap");
  });

  test("delegation requires an explicit slash command and has no standing authorization", () => {
    const advisor = read("src/cli/hook/subagent-handler.ts");
    expect(advisor).toContain("activeContractPath");
    expect(advisor).not.toContain("policyDelegation.mode");
    expect(advisor).not.toContain("auto-mode");
    expect(advisor).not.toContain("readGlobalDelegationMode");
    const sessionStart = read("src/cli/hook/session-context.ts");
    expect(sessionStart).not.toContain("Delegation Standing Authorization");
    expect(sessionStart).not.toContain("effectiveDelegationMode");
  });

  test("typed prompt handler gives bounded advice without automatic workflow gates", () => {
    const script = read("src/cli/hook/prompt-handler.ts");
    for (const advice of ["[ReviewAdvice]", "[DiagnosisAdvice]", "[PlanningAdvice]", "[OperationBoundaries]", "[WorkflowObservation]"]) {
      expect(script).toContain(advice);
    }
    expect(script).toContain("routePromptExplicitFirst");
    expect(script).toContain("no plan, receipt or archive step is required");
    expect(script).not.toContain("writePendingOrchestration");
    expect(script).not.toContain("ContractGuard");
    expect(script).not.toContain("acceptance-receipt");
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

  test("session-start should not spend the global budget on cross-review availability", () => {
    const script = read("src/cli/hook/session-context.ts");
    expect(script).not.toContain("[CrossReview]");
    expect(script).toContain("Pending Plan Capture");
    expect(script).not.toContain("claude-review");
    expect(script).not.toContain("worth the tokens");
  });

  test("in-process stop handler renders the recovery views and resolves no workflow state", () => {
    const handler = read("src/cli/hook/stop-handler.ts");
    // #691 finding 10 removed the private Stop payload type, the only place that named last_assistant_message.
    expect(handler).toContain("stop_hook_active");
    expect(handler).toContain("renderRecoveryHandoff");
    expect(handler).toContain("renderRecoveryResume");
    expect(handler).toContain("publishCheckpointFromLedger");
    // #695: no readiness lines, no state resolution, no events.jsonl append.
    expect(handler).not.toContain("[StopReadiness]");
    expect(handler).not.toContain("getEffectiveState");
    expect(handler).not.toContain("handoff_refresh");
  });

  test("workstream sync helper keeps the workstreams directory", () => {
    expect(read("assets/templates/helpers/workstream-sync.sh")).toContain("tasks/workstreams");
  });

  test("workflow verification should not gate on external brain vault state", () => {
    const script = read("assets/templates/helpers/check-task-workflow.sh");
    expect(script).not.toContain('run_optional_helper "check-brain-manifest.sh"');
    expect(script).not.toContain('run_optional_helper "sync-brain-docs.sh"');
    expect(script).not.toContain("Brain doc sync check failed");
  });

  test("retired post-edit hooks stay deleted", () => {
    expect(existsSync(join(ROOT, "src/cli/hook/mutation-observed.ts"))).toBe(false);
    expect(existsSync(join(ROOT, "assets/hooks/first-principles-guard.sh"))).toBe(false);
    expect(existsSync(join(ROOT, "assets/hooks/anti-simplification.sh"))).toBe(false);
  });

  test("the trace observer and its shell predecessors are retired", () => {
    expect(existsSync(join(ROOT, "src/cli/hook/trace-observer.ts"))).toBe(false);
    expect(existsSync(join(ROOT, "assets/hooks/trace-event.sh"))).toBe(false);
    expect(existsSync(join(ROOT, "assets/hooks/context-pressure-hook.sh"))).toBe(false);
  });
});
