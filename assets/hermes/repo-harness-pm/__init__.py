"""Native Hermes transport. The CLI owns PM validation and task state."""

import copy
import json
import subprocess
from pathlib import Path

TOOLSET = "repo_harness_pm"
OPERATIONS = ("capabilities", "status", "dispatch", "follow-up", "collect")


def invoke(cli, request):
    result = subprocess.run(
        [cli, "pm", "request"], input=json.dumps(request), text=True,
        capture_output=True, shell=False, timeout=60,
    )
    try:
        response = json.loads(result.stdout)
    except (ValueError, TypeError) as error:
        raise RuntimeError("PM CLI did not return a JSON response") from error
    if (not isinstance(response, dict) or response.get("protocol") != 1
            or response.get("kind") != "repo-harness-pm-response"
            or response.get("operation") != request["operation"]
            or type(response.get("ok")) is not bool
            or (result.returncode != 0 and response["ok"])):
        raise RuntimeError("PM CLI response does not match the request")
    return response


def input_schema(schema):
    projected = copy.deepcopy(schema)
    for key in ("protocol", "operation", "repo_id"):
        projected["properties"].pop(key, None)
    projected["required"] = [key for key in projected.get("required", [])
                             if key not in ("protocol", "operation", "repo_id")]
    return projected


def handler(cli, repo_id, operation, schema):
    def call(args):
        if (not isinstance(args, dict) or set(args) - schema["properties"].keys()
                or set(schema.get("required", [])) - args.keys()):
            return json.dumps({"error": "PM tool arguments do not match the closed schema"})
        request = {**args, "protocol": 1, "operation": operation}
        if operation != "capabilities":
            request["repo_id"] = repo_id
        return json.dumps(invoke(cli, request))
    return call


def register(ctx):
    cli = ctx.get_config("cli")
    repo_id = ctx.get_config("repo_id")
    rules_path = ctx.get_config("rules_file")
    if not isinstance(cli, str) or not Path(cli).is_absolute() or not Path(cli).is_file():
        raise ValueError("Operator must bind an absolute installed PM CLI")
    if not isinstance(repo_id, str) or not repo_id:
        raise ValueError("Operator must bind a registered repository ID")
    if not isinstance(rules_path, str) or not Path(rules_path).is_absolute():
        raise ValueError("Operator must bind a static PM rules file")
    rules = Path(rules_path).read_text(encoding="utf-8")
    if not rules.strip() or len(rules) > 4000:
        raise ValueError("PM rules must contain 1 to 4000 characters")
    response = invoke(cli, {"protocol": 1, "operation": "capabilities"})
    if not response["ok"]:
        raise RuntimeError("PM capability readback failed")
    schemas = response["data"]["operations"]
    if not isinstance(schemas, dict) or set(schemas) != set(OPERATIONS):
        raise ValueError("PM CLI operation inventory is not supported")
    ctx.register_system_prompt_section("repo-harness.pm", rules, max_chars=4000)
    for operation in OPERATIONS:
        schema = input_schema(schemas[operation])
        if schema.get("additionalProperties") is not False:
            raise ValueError("PM CLI must publish closed input schemas")
        name = "pm_" + operation.replace("-", "_")
        ctx.register_tool(
            name=name, toolset=TOOLSET,
            schema={"name": name, "description": "Shared PM operation: " + operation,
                    "parameters": schema},
            handler=handler(cli, repo_id, operation, schema),
        )
