# Test Directory Structure

> **Test is the new Spec. 测试是唯一的真理。**

## Asset Hierarchy

Tests are IMMUTABLE ASSETS. Implementation is DISPOSABLE.

## Rules

- Test code quantity ≥ Implementation code quantity
- Test failure = Delete module and rewrite
- Never modify tests to make buggy code pass

## Running Tests

```bash
bun run test:full      # Run all tests. The owner schedules local full runs.
bun run test:coverage  # With coverage
bun run test:files <affected tests> --watch # Watch mode
```
