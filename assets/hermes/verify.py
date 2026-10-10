"""Run native Hermes PM checks without a provider or live user state."""

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
from setup import readback, EXPECTED


def run_checks(args, root):
    os.environ["HOME"] = str(root)
    os.environ["HERMES_HOME"] = str(root / "hermes")
    os.environ["REPO_HARNESS_HOME"] = str(root / "harness")
    os.environ["HERMES_RUNTIME_DIR"] = str(root / "runtime")
    os.environ["HERMES_DISABLE_LAZY_INSTALLS"] = "1"
    os.environ.pop("HERMES_TUI_TOOLSETS", None)
    os.environ.pop("HERMES_ENABLE_PROJECT_PLUGINS", None)
    sys.path.insert(0, str(Path(args.hermes_source).resolve()))
    import hermes_yaml as yaml
    home = root / "hermes"
    home.mkdir()
    original = {"model": {"default": "fixture-no-provider"}, "custom_setting": "keep"}
    (home / "config.yaml").write_text(yaml.safe_dump(original))
    base = [sys.executable, str(Path(__file__).with_name("setup.py")),
            "--home", str(home), "--hermes-source", args.hermes_source]
    options = ["--cli", args.cli, "--repo-id", "repo_0000000000000000", "--rules", args.rules]
    def command(action, extra=()):
        result = subprocess.run([*base, action, *extra], capture_output=True, text=True,
                                shell=False, timeout=90)
        if result.returncode:
            raise AssertionError(result.stdout + result.stderr)
        return json.loads(result.stdout)
    assert command("dry-run", options)["dry_run"]
    assert yaml.safe_load((home / "config.yaml").read_text()) == original
    assert not (home / "plugins").exists()
    assert command("install", options)["installed"]
    observed = readback()
    print(json.dumps({"check": "native-inventory", **observed}), flush=True)
    from hermes_cli.plugins import render_system_prompt_sections
    sections = render_system_prompt_sections({})
    assert any(section.id == "repo-harness.pm" and section.content == Path(args.rules).read_text().strip()
               for section in sections)
    from hermes_cli.config import load_config
    from model_tools import get_tool_definitions
    from tui_gateway.server import _load_enabled_toolsets
    disabled = load_config()["agent"]["disabled_toolsets"]
    for override in ("terminal", "repo_harness_pm,terminal,file,code_execution,delegation,skills"):
        os.environ["HERMES_TUI_TOOLSETS"] = override
        selected = _load_enabled_toolsets("tui")
        names = {item["function"]["name"] for item in get_tool_definitions(
            enabled_toolsets=selected, disabled_toolsets=disabled, quiet_mode=True)}
        assert names <= EXPECTED, names
    os.environ.pop("HERMES_TUI_TOOLSETS")
    print("PASS: session toolset overrides cannot restore native execution tools", flush=True)

    from tools.registry import registry
    for name in EXPECTED:
        parameters = registry.get_entry(name).schema["parameters"]
        assert not {"cli", "repo_id", "operation", "protocol", "runtime", "endpoint"} & parameters["properties"].keys()
        refused = json.loads(registry.dispatch(name, {"command": "touch forbidden", "repo_id": "forged"}))
        assert "error" in refused
    capabilities = json.loads(registry.dispatch("pm_capabilities", {}))
    assert capabilities["ok"] and capabilities["data"]["restriction"] == "model-tool-boundary"
    status = json.loads(registry.dispatch("pm_status", {}))
    assert status["ok"] is False  # The fixed fixture repository is not registered.
    print("PASS: real PM CLI schema projection, capability readback and unknown-repository refusal", flush=True)

    from agent.turn_tool_validation import validate_tool_calls
    from run_agent import AIAgent
    sentinel = root / "source.txt"
    sentinel.write_text("unchanged")
    denied = ("terminal", "process", "write_file", "patch", "execute_code",
              "skill_manage", "delegate_task", "tool_call", "browser_navigate", "mcp__fake__exec")
    for name in denied:
        call = SimpleNamespace(id="denied-" + name, type="function", function=SimpleNamespace(
            name=name, arguments=json.dumps({"command": "touch " + str(sentinel),
                                             "path": str(sentinel), "content": "changed"})))
        agent = AIAgent.__new__(AIAgent)
        agent.valid_tool_names = EXPECTED
        agent._invalid_tool_retries = 0
        agent._vprint = lambda *a, **k: None
        agent._buffer_vprint = lambda *a, **k: None
        agent.log_prefix = ""
        agent.tools = []
        agent._build_assistant_message = lambda *a: {"role": "assistant", "content": ""}
        verdict = validate_tool_calls(agent, SimpleNamespace(tool_calls=[call]), "tool_calls",
            messages=[], conversation_history=[], api_call_count=1, effective_task_id="fixture")
        assert verdict.action == "continue", (name, verdict)
        assert sentinel.read_text() == "unchanged"
    print("PASS: native turn validation denies 10 synthetic model calls; source unchanged", flush=True)
    restored = command("rollback")
    assert restored["restored"]
    final = yaml.safe_load((home / "config.yaml").read_text())
    assert final["model"] == original["model"] and final["custom_setting"] == "keep"
    for parent, key in (("platform_toolsets", "cli"), ("plugins", "enabled"), ("agent", "disabled_toolsets")):
        assert key not in final.get(parent, {})
    print("PASS: rollback restores changed fields and preserves user settings", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hermes-source", required=True)
    parser.add_argument("--cli", required=True)
    parser.add_argument("--rules", required=True)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="repo-harness-hermes-pm-") as directory:
        run_checks(args, Path(directory))
    print("PASS: native Hermes PM checks. Live provider coverage: omitted.")


if __name__ == "__main__":
    main()
