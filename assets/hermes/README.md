# Hermes PM adapter

Use a dedicated Hermes profile. This native plugin exposes five shared PM
operations. The installed repo-harness CLI owns the schemas, task records,
dispatch admission and result validation. The plugin adds no task store.

The operator binds the installed CLI, registered repository ID and shared PM
rules before startup. Model arguments cannot change these bindings. Each tool
uses fixed argv and JSON stdin with `shell=False`. The rules file is copied once
and loaded as a static native prompt section. Hermes 0.21.6 limits that section
to 4000 characters. Longer rules fail closed.

## Install and read back

Use the existing Hermes Python environment. Do not install Python dependencies
with this adapter. Set these absolute paths to the reviewed installation:

```sh
pm_python=/absolute/hermes/venv/bin/python
pm_source=/absolute/hermes/hermes-agent
pm_assets=/absolute/repo-harness/assets/hermes
pm_home=/absolute/dedicated-pm-profile
pm_cli=/absolute/installed/repo-harness
pm_rules=/absolute/repo-harness/references/pm-boundary.md
pm_repo=repo_0123456789abcdef

PYTHONDONTWRITEBYTECODE=1 "$pm_python" "$pm_assets/setup.py" dry-run \
  --home "$pm_home" --hermes-source "$pm_source" \
  --cli "$pm_cli" --repo-id "$pm_repo" --rules "$pm_rules"
```

After the operator approves this exact profile, run the same command with
`install` in place of `dry-run`. The installer refuses existing PM files,
configured MCP servers and enabled plugins. It preserves other settings. It
saves only the changed configuration fields to `repo-harness-pm.rollback.json`.
It does not read or copy `.env` files.

Run readback in a new process before starting a conversation:

```sh
PYTHONDONTWRITEBYTECODE=1 "$pm_python" "$pm_assets/setup.py" readback \
  --home "$pm_home" --hermes-source "$pm_source"
```

Readback must return `ok: true`. CLI, TUI and Web must each expose exactly
`pm_capabilities`, `pm_status`, `pm_dispatch`, `pm_follow_up` and `pm_collect`.
The persistent `platform_toolsets.cli` setting covers these surfaces. The
native deny list also removes the TUI/Web `project` fold-in. It suppresses
native tools even when a session asks for a broader toolset. Tool Search and
coding-context expansion are off. No tool hook supplies this boundary.

Restart existing sessions with this profile. Readback checks native tool
assembly and provider-tool injection gates without creating a provider client.
It does not start a service or make a model request. Run readback again after
Hermes, plugins, managed configuration or operator settings change. A failed
readback does not authorize a broader tool list.

## Verification

The native check uses the real Hermes libraries and a temporary HOME, runtime
store and repo-harness home. It checks installation, static rules, inventory,
session overrides, the real PM CLI, synthetic model-call denial and rollback:

```sh
PYTHONDONTWRITEBYTECODE=1 "$pm_python" "$pm_assets/verify.py" \
  --hermes-source "$pm_source" --cli "$pm_cli" --rules "$pm_rules"
```

Synthetic calls test native tool validation. They are not real LLM evidence.
This check does not verify a live provider, service startup or coding dispatch.

## Rollback and limits

Stop the PM session. Restore the saved configuration fields:

```sh
PYTHONDONTWRITEBYTECODE=1 "$pm_python" "$pm_assets/setup.py" rollback \
  --home "$pm_home" --hermes-source "$pm_source"
```

Restart Hermes. The plugin files and rollback data remain for operator review.
Rollback does not delete task records or unrelated profile settings.

This is a model tool boundary. It is not an OS sandbox for the Hermes process.
The operator can change configuration or use host slash commands. Direct
Python registry calls are outside the model turn boundary. Managed settings,
new integrations and operator changes require a new inventory readback.
Gateway platforms, Desktop and ACP are outside this adapter's verified scope.
