/**
 * The per-skill state vocabulary of the doctor skill projection check
 * (`skillProjectionState` in src/cli/commands/doctor.ts). The operator setup
 * decoder reads it in the browser, so this file has no imports.
 */
export const SKILL_PROJECTION_STATES = [
  'missing', 'dangling link', 'wrong link', 'ok link', 'invalid path type',
  'source missing', 'stale copy', 'unowned real directory', 'ok copy',
] as const;
export type SkillProjectionState = typeof SKILL_PROJECTION_STATES[number];
