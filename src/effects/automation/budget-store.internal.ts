/**
 * Test-only seam for the automation budget store.
 *
 * Nothing on the public surface -- `budget-store.ts`, the CLI command, the
 * capability's declared entrypoints -- re-exports these. Importing this module
 * is a deliberate act, and the setter still refuses unless the process opted in
 * with `REPO_HARNESS_TEST_CLOCK_SEAM=1`, so a controller cannot reach the
 * store's clock through any supported path.
 */
export {
  AUTOMATION_TEST_CLOCK_SEAM_ENV,
  __resetAutomationClockForTests,
  __setAutomationClockForTests,
  type AutomationClock,
} from './clock';
