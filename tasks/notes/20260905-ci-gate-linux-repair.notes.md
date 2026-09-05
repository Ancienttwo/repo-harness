# CI gate repair: Linux deadline fixture and source-checkout task-sync resolution

> **Substantive Change SHA256**: `sha256:1098bba847b301aa497c4a911edcb2b604a65348c696f781832c2366ae1260a6`

Two faults kept `Required / CI` red on `main` from `7fe02beb` onward; the first masked the second because `check:ci` stops at the first failing test file.

- `tests/architecture-projection-provider.test.ts` ran its slow-node probe under `PATH=''`. Under dash a bare `sleep` is not found, the script echoes its version immediately, and runtime selection succeeds before the deadline. macOS only passed because bun's cold supervisor start exceeded the 100 ms deadline first. The probe now calls `/bin/sleep`, and a scratch mutation removing the deadline re-check at `archctx-provider.ts:161` still fails the corrected test.
- `scripts/check-task-sync.sh` resolved the workflow profile only through an installed `repo-harness` binary, which CI never installs. The self-host checkout now resolves through `bun src/cli/index.ts` when `package.json` names `repo-harness`, the same selection `check-architecture-sync.sh` already makes; every other repo keeps the installed CLI. The helper projection under `assets/templates/helpers/` is regenerated from the script.

Verification: provider test 23/23 on macOS and 3/3 native Linux (`oven/bun:1.4.0`); `tests/check-task-sync.test.ts` and `tests/helper-scripts.test.ts` 181/181; `check-task-sync.sh` resolves the profile with `repo-harness` absent from `PATH`.
