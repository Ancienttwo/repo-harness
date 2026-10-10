# PM late review fixes

Base: `daa49e202b49068418ead6a78e399d851ddf3d73`.

## Goal and source trace

Close the three late review findings on PR #615. Do not change Bot scheduling,
task authority, approval identity, or provider admission. Do not include #617.

1. HTTP ingress and the session timer read the live profile. The PM effect guard
   checks only the token and operator scope. A request can wait for a lock after
   ingress. Connect the live HTTP configuration check to that same trusted guard.
   Keep CLI and stdio independent from HTTP configuration.
2. `sendTaskRequest` receives a successful delivery ACK, then runs the guard in
   the delivery catch block. A later denial overwrites acceptance as unknown.
   Record accepted delivery before the later guard. Keep real failed delivery
   unknown and never replay the same request.
3. PM calls and tool listing can expose raw exception messages. Map remote
   errors to fixed public codes and messages. Cover capabilities probe reasons
   and worker errors inside successful status responses. Keep internal worker
   diagnostics intact. Add no diagnostic logger.

## Verification

Write regression tests before changing implementation. Use the existing real
task, topology and session locks with explicit entry signals. Change HTTP
enabled/profile/version/revision while the operation waits. Assert no new
dispatch input or collected result. Restore configuration and prove a new valid
call works. Keep CLI/stdio tests independent.

Exercise delivery with an explicit ACK followed by guard denial. Assert one
delivery and retained accepted evidence. Exercise failed delivery and unknown
evidence. Inject path and secret-like sentinels into returned failures, thrown
errors and tools/list; assert none reach the remote response.
Use a test-only child observer that calls the real verifier and captures the
real PM response. Require that response even if the session timer closes SSE.
Delivery uses an isolated transport fixture. It does not prove provider ACKs.

Record RED/GREEN results. Run typecheck, affected tests and the required full
candidate acceptance. Obtain independent security and test-bending review.
Create a new Draft PR and verify its remote head and exact-head CI. Do not merge,
deploy or create real provider/OAuth credentials.
