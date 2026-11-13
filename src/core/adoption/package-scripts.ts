import { CLI_NAME, RETIRED_CLI_NAME } from '../skill-surface/cli-name';

/** The package scripts that init manages, with their current values. */
export const MANAGED_PACKAGE_SCRIPTS: Readonly<Record<string, string>> = {
  "check:brain": "rh brain check",
  "check:context-files": "rh run check-context-files",
  "check:deploy-sql": "rh run check-deploy-sql-order",
  "sync:brain": "rh brain sync",
};

/**
 * The released managed values of one key: the current value and the 0.32 value, which named the
 * retired command. Init replaces a managed key only on an exact match; any other value is the user's.
 */
export function releasedManagedScriptValues(key: string): readonly string[] {
  const current = MANAGED_PACKAGE_SCRIPTS[key];
  return current === undefined ? [] : [current, current.replace(new RegExp(`^${CLI_NAME} `), `${RETIRED_CLI_NAME} `)];
}

/** True when init may write the key: it is missing, or it holds a released managed value. */
export function managedScriptWritable(key: string, value: unknown): boolean {
  return value === undefined || (typeof value === 'string' && releasedManagedScriptValues(key).includes(value));
}
