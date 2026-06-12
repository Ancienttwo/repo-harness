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
    expect(script).toContain('"$HOOK_NAME" == "stop-orchestrator.sh"');
    expect(script).toContain('"decision"[[:space:]]*:');
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


  test("pre-edit guard should combine asset-layer and test reminders", () => {
    const script = read("assets/hooks/pre-edit-guard.sh");
    expect(script).toContain("[AssetLayer]");
    expect(script).toContain("[BDD Guard]");
    expect(script).toContain("[TDD Guard]");
    expect(script).toContain("PlanTransitionGuard");
    expect(script).toContain("ExternalReferenceGuard");
    expect(script).toContain("OpsPrivateGuard");
    expect(script).toContain("deploy/");
  });

  test("worktree-guard should be warning-first with marker-based enforcement", () => {
    const script = read("assets/hooks/worktree-guard.sh");
    expect(script).toContain(".claude/.require-worktree");
    expect(script).toContain("Warning: primary working tree detected");
    expect(script).toContain("Mutation blocked");
    expect(script).toContain("hook-input.sh");
    expect(script).toContain("hook_structured_error");
  });

  test("post-tool observer should keep context pressure with stable session-id file, one-time flags, and sampled budget probes", () => {
    const script = read("assets/hooks/post-tool-observer.sh");
    expect(script).toContain(".claude/.session-id");
    expect(script).toContain("WARN_FILE");
    expect(script).toContain("RED_FILE");
    expect(script).toContain(".tool-call-count");
    expect(script).toContain("scripts/context-budget.ts");
    expect(script).toContain("BUDGET_SAMPLE_EVERY");
    expect(script).toContain("prepare-codex-handoff.sh");
    expect(script).toContain("fresh-session resume packet");
    expect(script).not.toContain("/compact");
  });

  test("prompt-guard shell layer keeps route hints, gates, and rendering without emoji", () => {
    const entrypoint = read("assets/hooks/prompt-guard.sh");
    const script = `${entrypoint}\n${read("assets/hooks/lib/prompt-guard-runtime.sh")}`;
    expect(entrypoint.split("\n").length).toBeLessThanOrEqual(300);
    expect(entrypoint).toContain("lib/prompt-guard-runtime.sh");
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
    expect(script).toContain("scripts/verify-contract.sh");
    expect(script).toContain("HarnessMaintenance");
    expect(script).toContain("has_changes_glob");
    expect(script).toContain("emit_cross_review_hint");
    expect(script).toContain("emit_external_acceptance_prompt");
    expect(script).toContain("[ExternalAcceptance]");
    expect(script).toContain("## External Acceptance Advice");
    expect(script).toContain("[CrossReview]");
    expect(script).toContain("codex-review");
    expect(script).toContain("claude-review");
    expect(script).not.toContain("📋");
    expect(script).not.toContain("🧠");
    expect(script).not.toContain("📎");
    // The shell entrypoint no longer owns prompt trigger rules or a fallback
    // decision table; trigger facts live in the TypeScript engine.
    expect(script).not.toContain("is_implement_intent");
    expect(script).not.toContain("prompt_guard_decide_fallback");
  });

  test("prompt trigger facts own Chinese explicit keywords with Unicode semantics", () => {
    const triggers = read("src/cli/hook/prompt-triggers.ts");
    expect(triggers).toContain("修复");
    expect(triggers).toContain("修bug");
    expect(triggers).toContain("新功能");
    expect(triggers).toContain("实现");
    expect(triggers).toContain("执行");
    expect(triggers).toContain("收工");
    expect(triggers).toContain("完成");
    expect(triggers).toContain("下一刀");
    expect(triggers).toContain("\\p{P}");
  });

  test("session-start should gate the Codex-host cross-review availability note", () => {
    const script = read("assets/hooks/session-start-context.sh");
    expect(script).toContain("[CrossReview]");
    expect(script).toContain("Pending Plan Capture");
    expect(script).toContain("workflow_pending_orchestration_is_fresh");
    expect(script).toContain("claude-review");
    expect(script).toContain('"${HOOK_HOST:-}" == "codex" && -n "$context"');
    expect(script).toContain("worth the tokens");
  });

  test("security sentinel should stay changed-only and advisory", () => {
    const script = read("assets/hooks/security-sentinel.sh");
    expect(script).toContain("security scan --json");
    expect(script).toContain("state.sha256");
    expect(script).toContain(".ai/harness/security");
    expect(script).toContain("[SecurityConfig]");
    expect(script).not.toContain("--strict");
  });

  test("stop orchestrator should own Stop JSON control and handoff refresh", () => {
    const script = read("assets/hooks/stop-orchestrator.sh");
    expect(script).toContain("PlanCompletenessGate");
    expect(script).toContain("last_assistant_message");
    expect(script).toContain("stop_hook_active");
    expect(script).toContain("workflow_write_handoff");
    expect(script).toContain("decision:\"block\"");
    expect(script).not.toContain('HOOK_HOST:-claude}" != "codex"');
  });

  test("post-edit guard should retain doc-drift coverage for apps/*/src/** and wrangler*.toml", () => {
    const script = read("assets/hooks/post-edit-guard.sh");
    expect(script).toContain("apps/[^/]+/src/.+");
    expect(script).toContain("wrangler.*\\.toml");
  });

  test("post-edit guard should combine doc drift and task handoff", () => {
    const script = read("assets/hooks/post-edit-guard.sh");
    expect(script).toContain("[DocDrift]");
    expect(script).toContain("[DeployAsset]");
    expect(script).toContain("[TaskHandoff]");
    expect(script).toContain("architecture-drift.sh");
    expect(script).toContain("context-contract-sync.sh");
    expect(script).toContain("sync-brain-docs.sh");
    expect(read("assets/templates/helpers/archive-architecture-request.sh")).toContain("[ArchitectureArchive]");
    expect(read("assets/templates/helpers/workstream-sync.sh")).toContain("tasks/workstreams");
    expect(script).toContain("tasks/todo.md");
    expect(script).toContain("--quiet");
    expect(script).toContain("contract_references_path");
  });

  test("architecture drift helpers should keep detection and context sync separated", () => {
    const eventHelper = read("assets/templates/helpers/architecture-event.ts");
    const drift = read("assets/templates/helpers/architecture-drift.sh");
    const sync = read("assets/templates/helpers/context-contract-sync.sh");
    const workstream = read("assets/templates/helpers/workstream-sync.sh");

    expect(eventHelper).toContain("sync-context-map");
    expect(eventHelper).toContain("sync-contract-files");
    expect(eventHelper).toContain("event-json");
    expect(drift).toContain("docs/architecture/requests");
    expect(drift).toContain("architecture-event.ts");
    expect(drift).toContain(".ai/harness/architecture/events.jsonl");
    expect(drift).toContain("workstream-sync.sh");
    expect(drift).not.toContain("BEGIN ARCHITECTURE CONTRACT");
    expect(sync).toContain("architecture-event.ts");
    expect(sync).toContain("BEGIN ARCHITECTURE CONTRACT");
    expect(sync).toContain("Active Workstreams");
    expect(sync).toContain("discoverable_contexts");
    expect(sync).toContain("Semantic diagram source");
    expect(sync).toContain("Latest human diagram");
    expect(sync).toContain("docs/architecture/diagrams");
    expect(drift).toContain("Mermaid fenced block");
    expect(drift).toContain("Markdown semantic source");
    expect(workstream).toContain("tasks/workstreams");
    expect(workstream).toContain("context-contract-sync.sh");
  });


  test("anti-simplification should parse file path via shared hook input", () => {
    const script = read("assets/hooks/anti-simplification.sh");
    expect(script).toContain("hook-input.sh");
    expect(script).toContain("hook_get_file_path");
  });

  test("settings template should not inject TOOL_INPUT/PROMPT argv blobs", () => {
    const settings = read("assets/hooks/settings.template.json");
    const codexHooks = read("assets/hooks/codex.hooks.template.json");
    expect(settings).toContain("run-hook.sh");
    expect(settings).toContain(".ai/hooks/run-hook.sh");
    expect(codexHooks).toContain("run-hook.sh");
    expect(codexHooks).toContain(".ai/hooks/run-hook.sh");
    expect(codexHooks).toContain("HOOK_HOST=codex");
    expect(settings).toContain("SessionStart");
    expect(codexHooks).toContain("SessionStart");
    expect(settings).toContain("session-start-context.sh");
    expect(codexHooks).toContain("session-start-context.sh");
    expect(settings).toContain("pre-edit-guard.sh");
    expect(codexHooks).toContain("pre-edit-guard.sh");
    expect(settings).toContain("post-edit-guard.sh");
    expect(codexHooks).toContain("post-edit-guard.sh");
    expect(settings).not.toContain("autoresearch-advisory.sh");
    expect(codexHooks).not.toContain("autoresearch-advisory.sh");
    expect(settings).toContain("post-tool-observer.sh");
    expect(codexHooks).toContain("post-tool-observer.sh");
    expect(settings).not.toContain("trace-event.sh");
    expect(codexHooks).not.toContain("trace-event.sh");
    expect(settings).toContain("stop-orchestrator.sh");
    expect(codexHooks).toContain("stop-orchestrator.sh");
    expect(settings).toContain("post-bash.sh");
    expect(codexHooks).toContain("post-bash.sh");
    expect(settings).not.toContain("context-pressure-hook.sh");
    expect(codexHooks).not.toContain("context-pressure-hook.sh");
    expect(settings).not.toContain("memory-intake.sh");
    expect(codexHooks).not.toContain("memory-intake.sh");
    expect(settings).not.toContain("skill-factory-session-end.sh");
    expect(codexHooks).not.toContain("skill-factory-session-end.sh");
    expect(settings).not.toContain("task-handoff.sh");
    expect(codexHooks).not.toContain("task-handoff.sh");
    expect(settings).not.toContain("atomic-commit.sh");
    expect(codexHooks).not.toContain("atomic-commit.sh");
    expect(settings).not.toContain('"$TOOL_INPUT"');
    expect(codexHooks).not.toContain('"$TOOL_INPUT"');
    expect(settings).not.toContain('"$PROMPT"');
    expect(codexHooks).not.toContain('"$PROMPT"');
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
