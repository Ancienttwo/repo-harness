import { ROUTES } from '../src/cli/hook/route-registry';
import { getHandlerForRoute } from '../src/cli/hook/handler-registry';
import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf-8");
}

describe("Hook contracts", () => {
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

  test("the installed inbox tuple resolves to a no-op handler", () => {
    const route = ROUTES.find(route => route.event === 'UserPromptSubmit' && route.routeId === 'inbox');
    expect(route).toMatchObject({ hosts: ['claude', 'codex'], handler: 'noop' });
    if (!route) throw new Error('inbox adapter tuple is missing');
    expect(getHandlerForRoute(route).id).toBe('noop');
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

  test("one typed handler owns each subagent route", () => {
    const returnChannel = read("src/cli/hook/return-channel.ts");
    expect(returnChannel).toContain("[repo-harness:return-channel]");
    expect(returnChannel).toContain("updatedInput");
    // #691 finding 9: the handler returns a typed permission; the host renderer writes permissionDecision.
    expect(returnChannel).toContain("decision: 'allow'");
    expect(read("src/cli/hook/subagent-context.ts")).toContain("[repo-harness:subagent-context]");
  });

  test("no hook grants standing delegation authorization", () => {
    const sessionStart = read("src/cli/hook/session-context.ts");
    expect(sessionStart).not.toContain("Delegation Standing Authorization");
    expect(sessionStart).not.toContain("effectiveDelegationMode");
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
    expect(read("scripts/workstream-sync.sh")).toContain("tasks/workstreams");
  });

  test("workflow verification should not gate on external brain vault state", () => {
    const script = read("scripts/check-task-workflow.sh");
    expect(script).not.toContain('run_optional_helper "check-brain-manifest.sh"');
    expect(script).not.toContain('run_optional_helper "sync-brain-docs.sh"');
    expect(script).not.toContain("Brain doc sync check failed");
  });
});
