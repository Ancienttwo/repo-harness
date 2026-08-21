#!/usr/bin/env bun
/**
 * Skill Lifecycle Hook Executor
 *
 * Runs lifecycle hooks defined in assets/skill-hooks.json.
 * Hook types:
 * - sync: blocking, failure aborts the operation
 * - advisory: non-blocking, failure is a warning only
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..");
const HOOKS_CONFIG_FILE = join(REPO_ROOT, "assets", "skill-hooks.json");

// ============================================================================
// Types
// ============================================================================

export type HookType = "sync" | "advisory";

export interface HookDefinition {
  type: HookType;
  description: string;
  scripts: string[];
}

export interface HookConfig {
  events: Record<string, HookDefinition>;
}

export const VALID_EVENTS = [
  "pre-init",
  "post-init",
  "pre-assemble",
  "post-assemble",
  "pre-migrate",
  "post-migrate",
  "on-version-change",
] as const;

export type HookEvent = (typeof VALID_EVENTS)[number];

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Load hook configuration from skill-hooks.json.
 */
export function loadHookConfig(
  configPath: string = HOOKS_CONFIG_FILE
): HookConfig {
  if (!existsSync(configPath)) {
    throw new Error(`skill-hooks.json not found at ${configPath}`);
  }

  const raw = readFileSync(configPath, "utf-8");
  const parsed = JSON.parse(raw) as HookConfig;

  if (!parsed.events || typeof parsed.events !== "object") {
    throw new Error("skill-hooks.json missing 'events' object");
  }

  return parsed;
}

/**
 * Check if an event name is valid.
 */
export function isValidEvent(event: string): event is HookEvent {
  return (VALID_EVENTS as readonly string[]).includes(event);
}

/**
 * Get the hook definition for a specific event.
 */
export function getHookDefinition(
  config: HookConfig,
  event: string
): HookDefinition | null {
  if (!isValidEvent(event)) return null;
  return config.events[event] ?? null;
}

/**
 * Stdin-offer error filter for the hook contract.
 *
 * The hook contract OFFERS context on stdin; consuming it is optional. A hook
 * script that exits or closes stdin without reading is legal, and the resulting
 * EPIPE on the write/end is the expected shape of that offer being declined,
 * not a communication failure — the hook outcome stays determined by exit code.
 * Every other stream error still propagates as before.
 */
export function rethrowNonEpipeStdinError(error: NodeJS.ErrnoException): void {
  if (error.code === "EPIPE") return;
  throw error;
}

/**
 * Execute a single hook script.
 * Context is passed via stdin as JSON and SKILL_HOOK_EVENT env var.
 */
export async function executeHookScript(
  scriptPath: string,
  event: string,
  context: Record<string, unknown> = {}
): Promise<{ success: boolean; output: string; error: string }> {
  return new Promise((resolve) => {
    const absolutePath = scriptPath.startsWith("/")
      ? scriptPath
      : join(REPO_ROOT, scriptPath);

    if (!existsSync(absolutePath)) {
      resolve({
        success: false,
        output: "",
        error: `Hook script not found: ${absolutePath}`,
      });
      return;
    }

    const child = spawn("bash", [absolutePath], {
      env: {
        ...process.env,
        SKILL_HOOK_EVENT: event,
        SKILL_ROOT: REPO_ROOT,
      },
      cwd: REPO_ROOT,
    });

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    child.stdout.on("data", (data: Buffer) => stdoutChunks.push(data.toString()));
    child.stderr.on("data", (data: Buffer) => stderrChunks.push(data.toString()));

    // Pass context via stdin (an offer; see rethrowNonEpipeStdinError)
    child.stdin.on("error", rethrowNonEpipeStdinError);
    child.stdin.write(JSON.stringify(context));
    child.stdin.end();

    child.on("close", (code) => {
      resolve({
        success: code === 0,
        output: stdoutChunks.join(""),
        error: stderrChunks.join(""),
      });
    });

    child.on("error", (err) => {
      resolve({
        success: false,
        output: "",
        error: err.message,
      });
    });
  });
}

/**
 * Run all hooks for a specific event.
 * For sync hooks, failure on any script aborts remaining scripts and returns false.
 * For advisory hooks, failures are logged but execution continues.
 */
export async function runHooks(
  event: string,
  context: Record<string, unknown> = {},
  configPath?: string
): Promise<{ success: boolean; results: Array<{ script: string; success: boolean; output: string; error: string }> }> {
  const config = loadHookConfig(configPath);
  const hookDef = getHookDefinition(config, event);

  if (!hookDef) {
    return { success: true, results: [] };
  }

  // Short-circuit if no scripts configured
  if (hookDef.scripts.length === 0) {
    return { success: true, results: [] };
  }

  const results: Array<{ script: string; success: boolean; output: string; error: string }> = [];

  for (const script of hookDef.scripts) {
    const result = await executeHookScript(script, event, context);
    results.push({ script, ...result });

    if (!result.success && hookDef.type === "sync") {
      console.error(`[hook:${event}] sync hook failed: ${script}`);
      if (result.error) console.error(`  ${result.error}`);
      return { success: false, results };
    }

    if (!result.success && hookDef.type === "advisory") {
      console.warn(`[hook:${event}] advisory hook warning: ${script}`);
      if (result.error) console.warn(`  ${result.error}`);
    }
  }

  return { success: true, results };
}

// ============================================================================
// CLI
// ============================================================================

if (import.meta.main) {
  const args = process.argv.slice(2);
  const event = args[0];
  const contextIdx = args.indexOf("--context");
  const contextStr = contextIdx !== -1 ? args[contextIdx + 1] : "{}";

  if (!event) {
    console.log(`Usage: bun scripts/run-skill-hook.ts <event> [--context '{"key":"value"}']`);
    console.log(`\nValid events: ${VALID_EVENTS.join(", ")}`);
    process.exit(1);
  }

  if (!isValidEvent(event)) {
    console.error(`Invalid event: ${event}`);
    console.error(`Valid events: ${VALID_EVENTS.join(", ")}`);
    process.exit(1);
  }

  let context: Record<string, unknown> = {};
  try {
    context = JSON.parse(contextStr);
  } catch {
    console.error("Invalid --context JSON");
    process.exit(1);
  }

  try {
    const result = await runHooks(event, context);

    if (result.results.length === 0) {
      console.log(`[hook:${event}] No hooks configured`);
    } else {
      for (const r of result.results) {
        const status = r.success ? "OK" : "FAIL";
        console.log(`[hook:${event}] ${r.script}: ${status}`);
        if (r.output) console.log(r.output.trimEnd());
      }
    }

    if (!result.success) {
      process.exit(1);
    }
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
