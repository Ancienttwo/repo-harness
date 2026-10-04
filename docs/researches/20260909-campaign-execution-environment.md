# Campaign execution environment supply

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

## Verified failure boundary

The frozen Codex-only image did not contain repo-harness. A real no-auth container test returned exit 127 before invoking verify-sprint. The prior live worker additionally hit a missing Linux ARM64 Rolldown binding in host-prepared node_modules, before test discovery. A successful Codex version probe proves neither task-tool availability nor platform-native dependency readiness.

Root cause ownership: deploy/campaign-container/Dockerfile supplies executable tooling; target bun.lock owns target dependency resolution. campaign-container owns isolation and terminal evidence. No source changes to containment or runtime recovery are required to provision tools correctly.

## Operator runbook

Build from the selected harness checkout with `bash scripts/build-campaign-image.sh`. The build packages that checkout using the canonical prepack path, prints tarball/lock hashes, installs frozen Linux production dependencies in /opt/repo-harness, exposes the real CLI and emits the immutable local image ID. There is no registry publication or host-global installation. An image must be rebuilt when its selected package changes; the package version alone does not identify source content.

Use `bun scripts/run-campaign-preflight.ts --image <image-id> --worktree <absolute-worktree> --timeout-ms 180000 --writable -- /usr/local/bin/bun install --frozen-lockfile --ignore-scripts --cache-dir node_modules/.cache/bun` to prepare target Linux dependencies in a disposable target checkout first. This uses the existing containment request/readback and PID1 deadline. No auth file is mounted. The target's actual lockfile owns packages; do not locally guess native package names or copy host binaries. Projects requiring lifecycle scripts need their own approved installation command and evidence.

Then use the same explicit preflight command entry to execute the target's narrow test command and its required packaged helpers. A readonly invocation gets no network and cannot write the workspace; `--writable` enables the existing workspace-write/bridge profile for installation and verification output. The executable must be an absolute path. The command result includes the protected host container handle/receipt and exact stdout/stderr; nonzero, cancelled, incomplete or non-inactive results fail. This operator tool has no campaign/provider budget mutation or grant authority. It must never be described as live worker/verifier acceptance.

After the recorded deadline, clean only the tool's returned container using the existing `scripts/cleanup-campaign-container.ts` entry and its journal directory. Do not erase evidence or touch another run's containers. Unknown results must be reconciled by original journal identity before retrying.

## Verification and remaining boundary

Regression guard: tests/effects/campaign-environment.test.ts runs the actual package CLI and trusted verify-sprint helper under the same container isolation with no credentials. Original-image RED is tasks/evidence/campaign-execution-environment-pre-fix.log. Existing containment tests pin exact mounts, security settings and the watchdog.

This slice does not revive a stopped grant, change counters, reopen a retired dispatch, or implement adopted-successor recovery. The latter requires a separate settled-execution proof and work-package. BRC14/BRC15 remain incomplete until the real delivery and fresh audit close.

The helper also requires jq for evidence emission (verify-sprint.sh). The image supplies jq explicitly. A default Bun cache in the 64 MiB ephemeral HOME failed with ENOSPC during the real target probe; place its explicit cache under ignored node_modules/.cache/bun in the writable disposable workspace, retaining existing tmpfs and memory limits. Do not treat download failures from this ENOSPC result as a registry outage.

## Real target platform proof

An independent clone at BYOK 664cc075652c2f4f2d6c21de9a01c87fa9d9f221 completed frozen Linux installation after relocating the cache (417 packages, exit 0). The unchanged SDK README regression then discovered all three tests and returned exactly the original 2 failures / 1 pass; there was no missing native-binding error. This is expected bug evidence and platform-readiness proof, not a passing task result. Original acquired worker WIP was not copied, edited or reset. Raw no-auth container results are retained in the canary scratch evidence under codex-environment-linux-prepare.json and codex-environment-linux-readme-probe.json.
