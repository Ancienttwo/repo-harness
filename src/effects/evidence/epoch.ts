/**
 * Program-wide ledger epoch constant (D2 successor-pinned rule, sprint
 * `### Frozen decisions (EPC-00, 2026-07-22)`). `ledger_epoch_start_sha` was
 * not knowable at EPC-00 time; the frozen rule instead pins it to the exact
 * base SHA the EPC-01 contract consumed at its own fresh fetch (R1). Every
 * producer across the Program imports this single constant for genesis
 * initialization -- it is never re-pinned by a later package.
 */
export const LEDGER_EPOCH_START_SHA = "5228d4ea0d7987cf6fb73be216d5b9cc638817c3";
