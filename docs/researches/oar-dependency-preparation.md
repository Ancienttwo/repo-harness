# OAR dependency preparation

Pin `@botiverse/oar` to 0.13.3 for subsequent provider integration through its
public runtime and Session APIs. This published version depends on Pi
coding-agent and Pi AI 1.0.0. The package is not a live worker: this change adds
no production import, adapter/parser, permission policy or provider launch.

## Runtime and package boundary

OAR owns ACP framing, provider control, typed events and turn/disposal behavior.
Future applications must consume those existing APIs instead of parsing vendor
CLI output. Pi's RpcClient is Pi-specific; it must not be rewritten as a Grok
ACP client. The root manifest pins the OAR version; bun.lock owns the exact
transitive graph. No existing package versions or declarations are upgraded.

OAR requires Node >=24. Use Node 24 for an OAR host and for the public consumer
checks. The root Node engine range is aligned to `>=24 <26`, preserving the existing
upper bound. This prevents advertising Node 22 installations that a mandatory
OAR dependency would reject under npm engine-strict. No Node binary or other
dependency is upgraded by this metadata change.

## D4 declaration checking decision

Aimpact explicitly selected `skipLibCheck: true`, as in E2 D4. Root source and
tests keep `strict: true`. All `.d.ts` bodies are unchecked, including local
`src/operator-web/styles.d.ts` and SDK/transitive declarations; their exported
types still constrain application usage. This is an accepted checking boundary,
not a repair or certification of those declaration bodies.

The known upstream issues remain unchanged:

- Pi 1.0.0's `dist/core/tools/find.d.ts` references `path.PlatformPath`, absent
  from the locked Node 26 declarations.
- gaxios 7.3.1's `FetchCompliance` requires the full `typeof fetch`; Bun adds
  `preconnect`, which the ordinary method does not expose.

No upstream/package declaration patch, ambient shim, private import or runtime
compatibility fallback is added. The focused public-consumer checks verify
that the real Session API compiles with Bun and Node ambient types and that an
invalid application `cwd` remains rejected under strict checking.

## Verification and remaining integration

`tests/oar-public-types.test.ts` owns this distinct public-declaration boundary.
It invokes only the compiler, never the consumer Session or a provider. The
existing root typecheck and integrity checks remain required. No broad model
canary is needed to validate a dependency/type-policy preparation slice.

Read-only containment, Result publication, model identity, resume, blocked
interaction and owned process cleanup still belong to a subsequent runtime
integration and its real proof surfaces. The library's automatic permission
approval is not an outer sandbox. No such capabilities are declared verified
by adding this dependency, and no Generic review/Receipt implementation is
included here.
