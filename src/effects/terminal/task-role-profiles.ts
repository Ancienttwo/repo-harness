import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { canonicalize } from '../../core/evidence/canonical-json';

// Moved from the existing installer: one owner for logical persona parsing,
// declared writability and the user's configured model/effort projections.
export const MANAGED_AGENTS = ['explorer', 'deep-reasoner', 'fast-worker', 'deep-worker', 'gatekeeper', 'root-cause-prover', 'harness-evaluator'];
export const WRITABLE_AGENTS: ReadonlySet<string> = new Set(['fast-worker', 'deep-worker', 'root-cause-prover', 'harness-evaluator']);
export interface ModelTarget { model: string; effort: string; sourceDescription: string; targetDescription: string }
export interface ParsedRole { name: string | undefined; description: string | undefined; model: string | undefined; effort: string | undefined; hasTools: boolean; body: string }
export type RoleValidation = {ok: true; mapped: ModelTarget} | {ok: false; kind?: string; reason: string};
export const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"];

function buildFamilyEffortMap(sourceLabel: string, targetModel: string, targetLabel: string) {
  const map: Record<string, ModelTarget> = {};
  for (const effort of EFFORT_LEVELS) {
    map[effort] = {
      model: targetModel,
      effort,
      sourceDescription: `${sourceLabel} at ${effort} effort`,
      targetDescription: `${targetLabel} at ${effort} reasoning`,
    };
  }
  return map;
}

export const MODEL_EFFORT_MAP: Record<string, Record<string, ModelTarget>> = {
  opus: buildFamilyEffortMap("Opus", "gpt-6-astra", "GPT-6 Astra"),
  sonnet: buildFamilyEffortMap("Sonnet", "gpt-6-luna", "GPT-6 Luna"),
  haiku: buildFamilyEffortMap("Haiku", "gpt-6-luna", "GPT-6 Luna"),
  fable: buildFamilyEffortMap("Fable", "gpt-6.1-sol", "GPT-6.1 Sol"),
};

// Per-agent Codex target overrides — the only model/effort remaps in the fleet.
// Every role carries an explicit target so Codex model/effort never drift with
// the Claude-side family default.
export const AGENT_TARGET_OVERRIDES: Record<string, { model: string; effort: string; targetDescription: string }> = {
  explorer: { model: "gpt-6-luna", effort: "high", targetDescription: "GPT-6 Luna at high reasoning" },
  "deep-reasoner": { model: "gpt-6-astra", effort: "high", targetDescription: "GPT-6 Astra at high reasoning" },
  "fast-worker": { model: "gpt-6.1-sol", effort: "medium", targetDescription: "GPT-6.1 Sol at medium reasoning" },
  "deep-worker": { model: "gpt-6.1-sol", effort: "high", targetDescription: "GPT-6.1 Sol at high reasoning" },
  gatekeeper: { model: "gpt-6-astra", effort: "medium", targetDescription: "GPT-6 Astra at medium reasoning" },
  "root-cause-prover": { model: "gpt-6-astra", effort: "high", targetDescription: "GPT-6 Astra at high reasoning" },
  "harness-evaluator": { model: "gpt-6-astra", effort: "medium", targetDescription: "GPT-6 Astra at medium reasoning" },
};

export function parseRoleNameScalar(rawValue: unknown): string | undefined {
  if (typeof rawValue !== "string") return undefined;
  const match = rawValue.trim().match(/^(?:"([A-Za-z0-9_-]+)"|'([A-Za-z0-9_-]+)'|([A-Za-z0-9_-]+))(?:\s+#.*)?$/);
  return match?.[1] || match?.[2] || match?.[3];
}

export function parseFrontmatter(raw: string): ParsedRole | null {
  const lines = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  if (lines[0] !== "---") return null;

  let closeIndex = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index] === "---") {
      closeIndex = index;
      break;
    }
  }
  if (closeIndex === -1) return null;

  const frontmatterLines = lines.slice(1, closeIndex);
  const bodyLines = lines.slice(closeIndex + 1);
  while (bodyLines.length > 0 && bodyLines[0].trim() === "") bodyLines.shift();
  while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1].trim() === "") bodyLines.pop();

  const fieldLines = frontmatterLines.filter((line) => line.trim() && !line.trimStart().startsWith("#"));
  const firstField = fieldLines[0]?.match(/^( *)([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
  if (!firstField) return null;
  const rootIndent = firstField[1]!.length;
  const fields: Record<string, string> = {};
  for (const line of fieldLines) {
    const match = line.match(/^( *)([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (!match || match[1]!.length !== rootIndent) return null;
    if (Object.hasOwn(fields, match[2]!)) return null;
    fields[match[2]!] = match[3]!;
  }

  return {
    name: parseRoleNameScalar(fields.name),
    description: fields.description,
    model: fields.model,
    effort: fields.effort,
    hasTools: Object.hasOwn(fields, "tools"),
    body: bodyLines.join("\n"),
  };
}

export function validateFrontmatter(parsed: ParsedRole | null, expectedAgent: string): RoleValidation {
  if (!parsed) {
    return { ok: false, kind: "identity-invalid", reason: "missing or malformed frontmatter delimiters" };
  }
  if (parsed.name && parsed.name !== expectedAgent) {
    return {
      ok: false,
      kind: "identity-mismatch",
      reason: `frontmatter name does not match source role: ${parsed.name}/${expectedAgent}`,
    };
  }
  if (!parsed.name) {
    return { ok: false, kind: "identity-invalid", reason: "missing or malformed frontmatter name" };
  }
  if (!parsed.description || !parsed.model || !parsed.effort) {
    return { ok: false, reason: "missing required frontmatter field (name/description/model/effort)" };
  }
  const modelMap = MODEL_EFFORT_MAP[parsed.model];
  const mapped = modelMap ? modelMap[parsed.effort] : undefined;
  if (!mapped) {
    return { ok: false, reason: `unmapped model/effort combination: ${parsed.model}/${parsed.effort}` };
  }
  if (!parsed.description.includes(mapped.sourceDescription)) {
    return { ok: false, reason: `description missing expected model label: ${mapped.sourceDescription}` };
  }
  return { ok: true, mapped };
}


export interface TaskRoleProfile {
  protocol: 1;
  logical_role: string;
  harness_kind: string;
  model: string;
  effort: string;
  permission: 'read_only' | 'workspace_write';
  instructions: string;
  source_sha256: string;
  profile_sha256: string;
}
const fleetSource = resolve(dirname(fileURLToPath(import.meta.url)), '../../../agents/fleet');
export function loadTaskRoleProfile(logicalRole: string, harnessKind: string, sourceDirectory = fleetSource): TaskRoleProfile {
  if (!MANAGED_AGENTS.includes(logicalRole)) throw new Error('task_role_unsupported');
  if (harnessKind !== 'codex' && harnessKind !== 'claude') throw new Error('task_role_harness_unconfigured');
  const bytes = readFileSync(join(sourceDirectory, `${logicalRole}.md`));
  const parsed = parseFrontmatter(bytes.toString('utf8'));
  const validated = validateFrontmatter(parsed, logicalRole);
  if (!validated.ok || !parsed) throw new Error(`task_role_invalid: ${validated.ok ? 'missing role' : validated.reason}`);
  const target = AGENT_TARGET_OVERRIDES[logicalRole];
  if (!target) throw new Error('task_role_target_missing');
  const basis = { protocol: 1 as const, logical_role: logicalRole, harness_kind: harnessKind,
    model: harnessKind === 'codex' ? target.model : parsed.model!,
    effort: harnessKind === 'codex' ? target.effort : parsed.effort!,
    permission: WRITABLE_AGENTS.has(logicalRole) ? 'workspace_write' as const : 'read_only' as const,
    instructions: parsed.body, source_sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}` };
  return { ...basis, profile_sha256: `sha256:${createHash('sha256').update(JSON.stringify(canonicalize(basis))).digest('hex')}` };
}
