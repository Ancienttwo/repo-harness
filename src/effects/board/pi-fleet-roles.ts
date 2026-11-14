// The fleet roles of one Pi seat as pi-subagents role files (#1977). pi-subagents 0.87.0 reads the PATH-style
// `PI_SUBAGENT_EXTRA_AGENT_DIRS` per process, so only the seat that `rh seats argv` launches sees them.
import { sha256Hex } from '../../core/evidence/sha256';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { piRoleName } from '../../core/board/seat-launch';
import { PI_CODEX_MODEL_PREFIX } from '../../core/board/seats-settings';
import { globalConfigurationPath } from '../configuration/global-configuration';
import { AGENT_TARGET_OVERRIDES, WRITABLE_AGENTS, parseFrontmatter, validateFrontmatter } from '../terminal/task-role-profiles';

const FLEET_SOURCE_DIR = fileURLToPath(new URL('../../../agents/fleet/', import.meta.url));
const READ_ONLY_TOOLS = 'read, grep, find, ls, bash';
const WRITABLE_TOOLS = `${READ_ONLY_TOOLS}, edit, write`;

export class PiFleetRolesError extends Error {
  readonly code = 'pi_fleet_role_invalid';
}

/** The role file text: the fleet source body on the Codex target model, with the tools of its writable or read-only class. */
function roleFile(role: string): string {
  const target = AGENT_TARGET_OVERRIDES[role];
  if (target === undefined) throw new PiFleetRolesError(`The ${role} fleet role has no Codex target.`);
  const parsed = parseFrontmatter(readFileSync(join(FLEET_SOURCE_DIR, `${role}.md`), 'utf8'));
  const valid = validateFrontmatter(parsed, role);
  if (!valid.ok) throw new PiFleetRolesError(`The ${role} fleet source is invalid: ${valid.reason}.`);
  return [
    '---',
    `name: ${piRoleName(role)}`,
    `description: ${parsed!.description!.replace(valid.sourceDescription, target.targetDescription)}`,
    `model: ${PI_CODEX_MODEL_PREFIX}${target.model}`,
    `thinking: ${target.effort}`,
    `tools: ${WRITABLE_AGENTS.has(role) ? WRITABLE_TOOLS : READ_ONLY_TOOLS}`,
    'systemPromptMode: replace',
    'inheritProjectContext: false',
    'inheritSkills: false',
    '---',
    '',
    parsed!.body,
    '',
  ].join('\n');
}

/**
 * Writes the role files of `fleet` and returns their directory. The directory name holds the digest of the files,
 * so each launch regenerates the same projection of `agents/fleet/` and a concurrent launch writes identical bytes;
 * each file lands by an atomic rename. A source change gives a new directory; nothing reads a stale one.
 */
export function writePiFleetRoles(fleet: readonly string[], env: NodeJS.ProcessEnv = process.env): string {
  const files = fleet.map(role => [`${piRoleName(role)}.md`, roleFile(role)] as const);
  const digest = sha256Hex(JSON.stringify(files)).slice(0, 16);
  const directory = join(dirname(globalConfigurationPath(env)), 'seats', 'pi-fleet', digest);
  mkdirSync(directory, { recursive: true });
  for (const [name, text] of files) {
    const temporary = join(directory, `.${name}.${process.pid}.tmp`);
    writeFileSync(temporary, text);
    renameSync(temporary, join(directory, name));
  }
  return directory;
}
