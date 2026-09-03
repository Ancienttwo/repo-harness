import { existsSync, readFileSync } from "fs";
import { join } from "path";

export type RefactorPolicy = { mode: "off" | "shadow" | "active"; require_cutover_closure: boolean };
const DEFAULT: RefactorPolicy = { mode: "off", require_cutover_closure: false };

export function readRefactorPolicy(value: unknown): RefactorPolicy {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("policy root must be an object");
  const policy = (value as Record<string, unknown>).policy;
  if (policy === undefined) return { ...DEFAULT };
  if (typeof policy !== "object" || policy === null || Array.isArray(policy)) throw new Error("policy must be an object");
  const refactor = (policy as Record<string, unknown>).refactor;
  if (refactor === undefined) return { ...DEFAULT };
  if (typeof refactor !== "object" || refactor === null || Array.isArray(refactor)) throw new Error("policy.refactor must be an object");
  const section = refactor as Record<string, unknown>;
  if (Object.keys(section).some((key) => !["mode", "require_cutover_closure"].includes(key))) throw new Error("policy.refactor contains an unknown field");
  const mode = section.mode ?? "off";
  const required = section.require_cutover_closure ?? false;
  if (!["off", "shadow", "active"].includes(String(mode))) throw new Error("policy.refactor.mode is invalid");
  if (typeof required !== "boolean") throw new Error("policy.refactor.require_cutover_closure must be boolean");
  return { mode: mode as RefactorPolicy["mode"], require_cutover_closure: required };
}

export function loadRefactorPolicy(repoRoot: string): RefactorPolicy {
  const path = join(repoRoot, ".ai", "harness", "policy.json");
  if (!existsSync(path)) return { ...DEFAULT };
  return readRefactorPolicy(JSON.parse(readFileSync(path, "utf8")));
}
