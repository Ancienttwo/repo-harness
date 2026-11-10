---
name: verify-boss-command
description: "TLA+ model checks of the boss command send: the operator write run and the cooldown from the audit log. Use before you change src/effects/operator/write-run.ts, src/effects/operator/advisor-seat-route.ts, src/effects/operator/write-audit.ts, src/core/board/advisor-seat.ts or src/effects/operator/board-read.ts."
---

# Verify the boss command

A boss command is a console write into an agent terminal. `BossCommandSend.tla` describes the server code at the sync commit: the target lock, the request lookup, the intent record, the cooldown, the read-back, the send child, the result record, and one crash of `operator serve` at a step boundary.

Sync commit: `b9dee51ee0390b300951123607144d680add2339` (PR base). Move it forward only after each row of the coverage record is true for the new code.

## What is checked

| Rule | Sentence | Harm when it breaks | State |
|---|---|---|---|
| `CooldownHolds` | Two requests that reached the seat have intent times at least one cooldown apart. | The advisor seat gets the same command two times inside 30 or 60 minutes. | holds |
| `OneSendPerRequest` | One request_id reaches the seat at most one time. | A retry types the command into the terminal again. | holds |
| `IntentBeforeSend` | Nothing is sent before the intent record is in the log. | A send that no log entry can account for. | holds |
| `HonestAnswer` | An answer that says "not sent" is true, and an answer 200 has a send. | The person sends again after a false "not sent". | holds |

## Coverage record

| Model part | Code |
|---|---|
| `Admit`: the lock, the lookup, the intent | `src/effects/operator/write-run.ts:145-171` |
| `IdempotentAdmission` | `write-run.ts:152-153` |
| `Admit`: the cooldown | `src/effects/operator/advisor-seat-route.ts:141-158,193-205` |
| `UnresolvedCounts`, `ReconcileCounts` | `maySend`, `advisor-seat-route.ts:126-131` |
| `ReadBack` | `advisor-seat-route.ts:207-222` |
| `ChildFails` | `ADVISOR_SEAT_NOT_SENT`, `src/core/board/advisor-seat.ts:55-59` |
| `SendReturns`, `SendTimesOut` | `advisor-seat-route.ts:65-100`, `src/effects/operator/board-read.ts:172-181` |
| `Record` | `write-run.ts:181-197` |

`Admit` is one step of the model because the lookup, the intent append, the read of the log and the cooldown decision run with no `await` between them. A change that puts an `await` there makes the model wrong: split the step before you run the check.

A change touches the verified code when `git diff b9dee51ee0390b300951123607144d680add2339 -- src/effects/operator/write-run.ts src/effects/operator/advisor-seat-route.ts src/effects/operator/write-audit.ts src/core/board/advisor-seat.ts src/effects/operator/board-read.ts` is not empty.

## Run

```sh
TLA2TOOLS_JAR=<tla2tools.jar of TLA+ v1.7.4> bash specs/tla/check.sh BossCommandSend
```

The run takes about 10 s and needs Java 11 or later. The script takes the version and the SHA-256 of the jar from `scripts/contract-closeout-tla.sh`. `specs/tla/checks.tsv` holds the expectation of each config: `holds`, `breaks` (one guard is off, and TLC must report the named rule) or `finding` (the code breaks these rules now).

Bounds of `BossCommandSend.cfg`: one binding, three calls (two with one request_id), a cooldown of 2 clock ticks, a clock of 0 to 3, one crash: 72,018 states.

Read each counterexample as a path through the actions in the spec header. `BossCommandSend.tla` has more states than a chart can show.

## Change the code

1. Find the changed lines in the coverage record and in the header of the spec.
2. Change the model first, from the code: the action, or the constant of the guard. Do not shape it by the result.
3. Run the check.
   - A `holds` config fails: replay the counterexample against the code, one step for each action. When each step can occur, the change has a bug. When a step cannot occur, the model is wrong: correct the model and say what was wrong.
   - A `breaks` config passes: the model lost the ability to fail. Find the guard in the new code and model it.
   - A `finding` config holds: the change repaired the finding. Set its row in `checks.tsv` to `holds` and name the PR.
4. Set the sync commit to the commit that you checked.

## Evidence at the sync commit

The tests catch each of the three guard removals: `tests/cli/operator-serve.test.ts` (`boss commands`) fails for both changes of `maySend`, and `tests/effects/operator-write-channel.test.ts` fails with the request lookup off. The model adds the crash at each step boundary and each order of three calls.

## Assumptions

- A child that reports a code of `ADVISOR_SEAT_NOT_SENT` did not run `hc send`.
- A send child can outlive a crashed server and send later.
- The target lock gives mutual exclusion between live runs, and a dead owner loses it. The lock code (`src/effects/locking/exclusive-directory-lock.ts`) is not in the model.
- An append to the audit log is complete or absent, and the clock does not go back.

## Not covered

- The free-text message route, which shares the target lock, and two sends that reach one seat at the same time.
- Two `operator serve` processes on one home.
- The text of a command, and the advisor after it gets the text.
