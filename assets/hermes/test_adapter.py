"""Transport unit checks. Native inventory checks live in verify.py."""

import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("pm_adapter", Path(__file__).parent / "repo-harness-pm" / "__init__.py")
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)


class AdapterTests(unittest.TestCase):
    def test_fixed_argv_and_operator_binding(self):
        schema = {"properties": {"message": {"type": "string"}}, "required": ["message"]}
        call = adapter.handler("/installed/cli", "repo_fixed", "follow-up", schema)
        response = {"protocol": 1, "kind": "repo-harness-pm-response", "operation": "follow-up",
                    "ok": True, "data": {}}
        with patch.object(adapter.subprocess, "run", return_value=SimpleNamespace(
                stdout=json.dumps(response), returncode=0)) as run:
            self.assertTrue(json.loads(call({"message": "$(touch forbidden); `id`"}))["ok"])
        args, kwargs = run.call_args
        self.assertEqual(args, (["/installed/cli", "pm", "request"],))
        self.assertIs(kwargs["shell"], False)
        self.assertEqual(json.loads(kwargs["input"]), {"protocol": 1, "operation": "follow-up",
            "repo_id": "repo_fixed", "message": "$(touch forbidden); `id`"})
        self.assertNotIn("env", kwargs)
        self.assertNotIn("cwd", kwargs)

    def test_unknown_fields_and_missing_fields_never_launch(self):
        schema = {"properties": {"message": {"type": "string"}}, "required": ["message"]}
        call = adapter.handler("/installed/cli", "repo_fixed", "follow-up", schema)
        with patch.object(adapter.subprocess, "run") as run:
            for field in ("repo_id", "cli", "runtime", "endpoint", "env", "command", "operation", "protocol"):
                self.assertIn("error", json.loads(call({"message": "hello", field: "forged"})))
            self.assertIn("error", json.loads(call({})))
            self.assertIn("error", json.loads(call([])))
            run.assert_not_called()

    def test_projection_does_not_mutate_shared_schema(self):
        schema = {"type": "object", "additionalProperties": False,
            "properties": {"protocol": {"const": 1}, "operation": {"const": "status"},
                           "repo_id": {"type": "string"}},
            "required": ["protocol", "operation", "repo_id"]}
        projected = adapter.input_schema(schema)
        self.assertEqual(projected["properties"], {})
        self.assertEqual(projected["required"], [])
        self.assertEqual(len(schema["properties"]), 3)

    def test_invalid_or_mismatched_response_fails_closed(self):
        valid = {"protocol": 1, "kind": "repo-harness-pm-response", "operation": "status", "ok": True, "data": {}}
        for response, code in (("not json", 0), ([], 0), ({**valid, "operation": "dispatch"}, 0),
                               ({**valid, "ok": 1}, 0), (valid, 1)):
            with patch.object(adapter.subprocess, "run", return_value=SimpleNamespace(
                    stdout=response if isinstance(response, str) else json.dumps(response), returncode=code)):
                with self.assertRaises(RuntimeError):
                    adapter.invoke("/installed/cli", {"protocol": 1, "operation": "status"})


if __name__ == "__main__":
    unittest.main()
