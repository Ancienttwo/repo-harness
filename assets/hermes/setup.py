"""Operator-only installation and readback for a dedicated Hermes PM profile."""

import argparse
import copy
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
from types import SimpleNamespace

PLUGIN = "repo-harness-pm"
TOOLSET = "repo_harness_pm"
EXPECTED = {"pm_capabilities", "pm_status", "pm_dispatch", "pm_follow_up", "pm_collect"}
FIELDS = (
    ("platform_toolsets", "cli"), ("agent", "disabled_toolsets"),
    ("agent", "coding_context"), ("tools", "tool_search"),
    ("plugins", "enabled"), ("plugins", "entries", PLUGIN),
)


def atomic_write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False) as stream:
        stream.write(text)
        stream.flush()
        os.fsync(stream.fileno())
        temporary = stream.name
    os.replace(temporary, path)


def field(config, keys):
    cursor = config
    for key in keys[:-1]:
        cursor = cursor.get(key, {})
    return {"present": keys[-1] in cursor, "value": copy.deepcopy(cursor.get(keys[-1]))}


def restore(config, keys, saved):
    cursor = config
    for key in keys[:-1]:
        cursor = cursor.setdefault(key, {})
    if saved["present"]:
        cursor[keys[-1]] = saved["value"]
    else:
        cursor.pop(keys[-1], None)


def install(args, config, yaml):
    from toolsets import TOOLSETS
    home = Path(args.home).resolve()
    destination = home / "plugins" / PLUGIN
    backup = home / "repo-harness-pm.rollback.json"
    if destination.exists() or backup.exists():
        raise ValueError("An existing PM installation must be reviewed first")
    # Use a dedicated profile. Do not repurpose another agent's integrations.
    if config.get("mcp_servers") or (config.get("plugins") or {}).get("enabled"):
        raise ValueError("Use a dedicated profile without MCP servers or enabled plugins")
    cli = Path(args.cli).resolve(strict=True)
    rules = Path(args.rules).resolve(strict=True)
    content = rules.read_text(encoding="utf-8")
    if not cli.is_file() or not os.access(cli, os.X_OK):
        raise ValueError("CLI must be an installed executable")
    if not 0 < len(content.strip()) <= len(content) <= 4000:
        raise ValueError("Static PM rules must contain 1 to 4000 characters")
    if args.action == "dry-run":
        return {"dry_run": True, "fields": [".".join(keys) for keys in FIELDS],
                "expected_tools": sorted(EXPECTED), "restart_required": True,
                "boundary": "model-tool-boundary; not an OS sandbox"}
    saved = [{"keys": list(keys), **field(config, keys)} for keys in FIELDS]
    atomic_write(backup, json.dumps(saved, indent=2))
    shutil.copytree(Path(__file__).parent / PLUGIN, destination)
    rules_copy = destination / "pm-rules.md"
    atomic_write(rules_copy, content)
    config.setdefault("platform_toolsets", {})["cli"] = [TOOLSET, "no_mcp"]
    agent = config.setdefault("agent", {})
    agent["disabled_toolsets"] = sorted(set(TOOLSETS)
        | set(agent.get("disabled_toolsets", [])))
    agent["coding_context"] = "off"
    config.setdefault("tools", {})["tool_search"] = {"enabled": "off"}
    config.setdefault("plugins", {})["enabled"] = [PLUGIN]
    config["plugins"].setdefault("entries", {})[PLUGIN] = {"settings": {
        "cli": str(cli), "repo_id": args.repo_id, "rules_file": str(rules_copy)}}
    atomic_write(home / "config.yaml", yaml.safe_dump(config, sort_keys=False))
    return {"installed": True, "restart_required": True,
            "readback_required": True, "boundary": "model-tool-boundary; not an OS sandbox"}


def readback():
    from hermes_cli.config import load_config
    from hermes_cli.tools_config import _get_platform_tools
    from agent.agent_init import _load_tools, _inject_context_engine_tools
    from agent.memory_manager import inject_memory_provider_tools
    from tui_gateway.server import _load_enabled_toolsets
    config = load_config()
    disabled = config.get("agent", {}).get("disabled_toolsets", [])
    selections = {"cli": sorted(_get_platform_tools(config, "cli")),
                  "tui": _load_enabled_toolsets("tui"),
                  "web": _load_enabled_toolsets("web")}
    inventories = {}
    for surface, selection in selections.items():
        if selection is None:
            raise RuntimeError(surface + " resolved to unrestricted toolsets")
        agent = SimpleNamespace(platform=surface, quiet_mode=True,
            enabled_toolsets=selection, context_compressor=None, _memory_manager=None)
        _load_tools(agent, selection, disabled)
        inject_memory_provider_tools(agent)
        _inject_context_engine_tools(agent)
        names = agent.valid_tool_names
        if names != EXPECTED:
            raise RuntimeError(surface + " PM inventory mismatch: " + ", ".join(sorted(names)))
        inventories[surface] = sorted(names)
    return {"ok": True, "inventories": inventories,
            "boundary": "model-tool-boundary; not an OS sandbox",
            "live_provider_verified": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("dry-run", "install", "readback", "rollback"))
    parser.add_argument("--home", required=True)
    parser.add_argument("--hermes-source", required=True)
    parser.add_argument("--cli")
    parser.add_argument("--repo-id")
    parser.add_argument("--rules")
    args = parser.parse_args()
    home = Path(args.home).resolve()
    if not Path(args.home).is_absolute():
        parser.error("--home must be absolute")
    os.environ["HERMES_HOME"] = str(home)
    os.environ["HERMES_DISABLE_LAZY_INSTALLS"] = "1"
    sys.path.insert(0, str(Path(args.hermes_source).resolve(strict=True)))
    import hermes_yaml as yaml
    path = home / "config.yaml"
    config = yaml.safe_load(path.read_text()) if path.exists() else {}
    config = config or {}
    if args.action in ("install", "dry-run"):
        if not args.cli or not args.repo_id or not args.rules:
            parser.error("install requires --cli, --repo-id and --rules")
        result = install(args, config, yaml)
    elif args.action == "readback":
        result = readback()
    else:
        for saved in json.loads((home / "repo-harness-pm.rollback.json").read_text()):
            restore(config, saved["keys"], saved)
        atomic_write(path, yaml.safe_dump(config, sort_keys=False))
        result = {"restored": True, "restart_required": True,
                  "retained": "Plugin files and rollback data remain for operator review"}
    print(json.dumps(result))


if __name__ == "__main__":
    main()
