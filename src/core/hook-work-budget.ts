/** The managed host limit and its consumers must leave time to reap timed-out processes and return hook output. */
export const MANAGED_STOP_TIMEOUT_SECONDS = 150;
export const STOP_WORK_BUDGET_MS = MANAGED_STOP_TIMEOUT_SECONDS * 1_000 - 10_000;
export const REFACTOR_RECOMMENDATION_TIMEOUT_MS = 30_000;
