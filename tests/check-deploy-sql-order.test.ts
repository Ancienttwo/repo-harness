import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { installSqlCheck } from "./helpers/helper-script-fixture";
import { run, tmpWorkspace } from "./helpers/repo-fixture";

setDefaultTimeout(30000);

describe("check-deploy-sql-order helper integration", () => {
  test("check-deploy-sql-order should enforce deploy SQL location and ascending prefixes", () => {
    const cwd = tmpWorkspace("helper-check-deploy-sql");
    try {
      installSqlCheck(cwd);
      mkdirSync(join(cwd, "deploy/sql"), { recursive: true });
      writeFileSync(join(cwd, "deploy/sql/0001_create_users.sql"), "create table users(id integer);\n");
      writeFileSync(join(cwd, "deploy/sql/0002_add_orders.sql"), "create table orders(id integer);\n");

      const ok = run("bash", ["scripts/check-deploy-sql-order.sh"], cwd);
      expect(ok.status).toBe(0);
      expect(ok.stdout).toContain("[deploy-sql] OK");

      const assertedDefault = run("bash", ["scripts/check-deploy-sql-order.sh", "--root", "deploy/sql"], cwd);
      expect(assertedDefault.status).toBe(0);

      const rejectedOverride = run("bash", ["scripts/check-deploy-sql-order.sh", "--root", "deploy/other"], cwd);
      expect(rejectedOverride.status).toBe(1);
      expect(rejectedOverride.stderr).toContain("fixed deploy/sql assertion");

      const repeatedOverride = run(
        "bash",
        ["scripts/check-deploy-sql-order.sh", "--root", "deploy/other", "--root", "deploy/sql"],
        cwd,
      );
      expect(repeatedOverride.status).toBe(1);
      expect(repeatedOverride.stderr).toContain("fixed deploy/sql assertion");

      const helpAfterOverride = run(
        "bash",
        ["scripts/check-deploy-sql-order.sh", "--root", "deploy/other", "--help"],
        cwd,
      );
      expect(helpAfterOverride.status).toBe(1);
      expect(helpAfterOverride.stderr).toContain("fixed deploy/sql assertion");

      mkdirSync(join(cwd, "tests/sql"), { recursive: true });
      writeFileSync(
        join(cwd, "tests/sql/control_plane_invariants.sql"),
        "-- covers deploy/sql/0001_create_users.sql only\n",
      );
      const missingInvariant = run("bash", ["scripts/check-deploy-sql-order.sh"], cwd);
      expect(missingInvariant.status).toBe(1);
      expect(missingInvariant.stdout).toContain("SQL migration must be referenced");

      writeFileSync(
        join(cwd, "tests/sql/control_plane_invariants.sql"),
        [
          "-- covers deploy/sql/0001_create_users.sql",
          "-- covers deploy/sql/0002_add_orders.sql",
          "",
        ].join("\n"),
      );
      const invariantOk = run("bash", ["scripts/check-deploy-sql-order.sh"], cwd);
      expect(invariantOk.status).toBe(0);
      expect(invariantOk.stdout).toContain("[deploy-sql] OK");

      for (const [actualSuffix, forgedSuffix] of [
        ["a+b", "ab"],
        ["x*", "x"],
        ["x?", "x"],
        ["x[ab]", "xa"],
        ["x(ab)", "xab"],
        ["x|y", "x"],
      ]) {
        const actualPath = `deploy/sql/0003_${actualSuffix}.sql`;
        writeFileSync(join(cwd, actualPath), "select 1;\n");
        writeFileSync(
          join(cwd, "tests/sql/control_plane_invariants.sql"),
          [
            "-- covers deploy/sql/0001_create_users.sql",
            "-- covers deploy/sql/0002_add_orders.sql",
            `-- different path deploy/sql/0003_${forgedSuffix}.sql`,
            "",
          ].join("\n"),
        );
        const regexForgery = run("bash", ["scripts/check-deploy-sql-order.sh"], cwd);
        expect(regexForgery.status).toBe(1);
        expect(regexForgery.stdout).toContain(actualPath);
        rmSync(join(cwd, actualPath), { force: true });
      }

      writeFileSync(join(cwd, "deploy/sql/0002_duplicate_orders.sql"), "-- duplicate prefix\n");
      const duplicate = run("bash", ["scripts/check-deploy-sql-order.sh"], cwd);
      expect(duplicate.status).toBe(1);
      expect(duplicate.stdout).toContain("strictly ascending");

      rmSync(join(cwd, "deploy/sql/0002_duplicate_orders.sql"), { force: true });
      mkdirSync(join(cwd, "deploy/runbooks"), { recursive: true });
      writeFileSync(join(cwd, "deploy/runbooks/query.sql"), "select 1;\n");
      const misplaced = run("bash", ["scripts/check-deploy-sql-order.sh"], cwd);
      expect(misplaced.status).toBe(1);
      expect(misplaced.stdout).toContain("Deploy SQL file must live under deploy/sql/");

      rmSync(join(cwd, "deploy/runbooks/query.sql"), { force: true });
      writeFileSync(join(cwd, "deploy/sql/3_bad.sql"), "select 1;\n");
      const badName = run("bash", ["scripts/check-deploy-sql-order.sh"], cwd);
      expect(badName.status).toBe(1);
      expect(badName.stdout).toContain("4-digit prefix");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("check-deploy-sql-order should accept an explicit multi-root SQL policy", () => {
    const cwd = tmpWorkspace("helper-check-deploy-sql-policy");
    try {
      installSqlCheck(cwd);
      mkdirSync(join(cwd, "deploy/database/migrations"), { recursive: true });
      mkdirSync(join(cwd, "deploy/database/roles"), { recursive: true });
      mkdirSync(join(cwd, "deploy/account"), { recursive: true });
      writeFileSync(
        join(cwd, ".ai/harness/policy.json"),
        JSON.stringify({
          operations: {
            deploy_sql: {
              roots: [
                { path: "deploy/database/migrations", naming: "timestamp14" },
                { path: "deploy/database/roles", naming: "descriptive" },
                { path: "deploy/account", naming: "descriptive" },
              ],
              invariant_file: null,
            },
          },
        }),
      );
      writeFileSync(
        join(cwd, "deploy/database/migrations/20260713010000_create_users.sql"),
        "create table users(id integer);\n",
      );
      writeFileSync(join(cwd, "deploy/database/roles/runtime-reader.sql"), "select 1;\n");
      writeFileSync(join(cwd, "deploy/account/staging-access.sql"), "select 1;\n");

      const ok = run("bash", ["scripts/check-deploy-sql-order.sh", "--root", "deploy/sql"], cwd);
      expect(ok.status).toBe(0);
      expect(ok.stdout).toContain("[deploy-sql] OK");

      writeFileSync(join(cwd, "deploy/database/migrations/20260713_bad.sql"), "select 1;\n");
      const badTimestamp = run("bash", ["scripts/check-deploy-sql-order.sh"], cwd);
      expect(badTimestamp.status).toBe(1);
      expect(badTimestamp.stdout).toContain("14-digit timestamp prefix");

      rmSync(join(cwd, "deploy/database/migrations/20260713_bad.sql"), { force: true });
      mkdirSync(join(cwd, "deploy/other"), { recursive: true });
      writeFileSync(join(cwd, "deploy/other/unowned.sql"), "select 1;\n");
      const unowned = run("bash", ["scripts/check-deploy-sql-order.sh"], cwd);
      expect(unowned.status).toBe(1);
      expect(unowned.stdout).toContain("not covered by operations.deploy_sql.roots");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("check-deploy-sql-order should reject invalid, overlapping, or unknown SQL policy roots", () => {
    const cwd = tmpWorkspace("helper-check-deploy-sql-policy-invalid");
    try {
      installSqlCheck(cwd);
      mkdirSync(join(cwd, "deploy/database/migrations"), { recursive: true });
      writeFileSync(
        join(cwd, ".ai/harness/policy.json"),
        JSON.stringify({
          operations: {
            deploy_sql: {
              roots: [
                { path: "deploy/database", naming: "descriptive" },
                { path: "deploy/database/migrations", naming: "timestamp14" },
              ],
            },
          },
        }),
      );

      const overlap = run("bash", ["scripts/check-deploy-sql-order.sh"], cwd);
      expect(overlap.status).toBe(1);
      expect(overlap.stdout).toContain("must not overlap");

      writeFileSync(
        join(cwd, ".ai/harness/policy.json"),
        JSON.stringify({
          operations: {
            deploy_sql: {
              roots: [{ path: "../outside", naming: "descriptive" }],
            },
          },
        }),
      );
      const outside = run("bash", ["scripts/check-deploy-sql-order.sh"], cwd);
      expect(outside.status).toBe(1);
      expect(outside.stdout).toContain("canonical path under deploy/");

      writeFileSync(
        join(cwd, ".ai/harness/policy.json"),
        JSON.stringify({
          operations: {
            deploy_sql: {
              roots: [{ path: "deploy/./database/migrations", naming: "timestamp14" }],
            },
          },
        }),
      );
      const alias = run("bash", ["scripts/check-deploy-sql-order.sh"], cwd);
      expect(alias.status).toBe(1);
      expect(alias.stdout).toContain("canonical path under deploy/");

      writeFileSync(
        join(cwd, ".ai/harness/policy.json"),
        JSON.stringify({
          operations: {
            deploy_sql: {
              roots: [{ path: "deploy/database/migrations", naming: "unchecked" }],
            },
          },
        }),
      );
      const unknownNaming = run("bash", ["scripts/check-deploy-sql-order.sh"], cwd);
      expect(unknownNaming.status).toBe(1);
      expect(unknownNaming.stdout).toContain("unsupported naming mode");

      writeFileSync(
        join(cwd, ".ai/harness/policy.json"),
        JSON.stringify({
          operations: {
            deploy_sql: {
              roots: [{ path: "deploy/missing", naming: "descriptive" }],
            },
          },
        }),
      );
      const missing = run("bash", ["scripts/check-deploy-sql-order.sh"], cwd);
      expect(missing.status).toBe(1);
      expect(missing.stdout).toContain("Missing SQL policy root");

      const outsideDir = mkdtempSync(join(tmpdir(), "helper-check-deploy-sql-root-outside-"));
      try {
        symlinkSync(outsideDir, join(cwd, "deploy/external"));
        writeFileSync(
          join(cwd, ".ai/harness/policy.json"),
          JSON.stringify({
            operations: {
              deploy_sql: {
                roots: [{ path: "deploy/external", naming: "descriptive" }],
              },
            },
          }),
        );
        const symlinkEscape = run("bash", ["scripts/check-deploy-sql-order.sh"], cwd);
        expect(symlinkEscape.status).toBe(1);
        expect(symlinkEscape.stdout).toContain("must not contain symlink components");
        expect(symlinkEscape.stdout).toContain("must resolve inside deploy/");
      } finally {
        rmSync(outsideDir, { recursive: true, force: true });
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("check-deploy-sql-order should reject forged or missing explicit invariant policy", () => {
    const cwd = tmpWorkspace("helper-check-deploy-sql-invariant-policy");
    try {
      installSqlCheck(cwd);
      mkdirSync(join(cwd, "deploy/sql"), { recursive: true });
      writeFileSync(join(cwd, "deploy/sql/0001_create_users.sql"), "select 1;\n");

      const writePolicy = (invariant_file: string) =>
        writeFileSync(
          join(cwd, ".ai/harness/policy.json"),
          JSON.stringify({
            operations: {
              deploy_sql: {
                roots: [{ path: "deploy/sql", naming: "ordered4" }],
                invariant_file,
              },
            },
          }),
        );

      writePolicy("tests/sql/required_invariants.sql");
      const missing = run("bash", ["scripts/check-deploy-sql-order.sh"], cwd);
      expect(missing.status).toBe(1);
      expect(missing.stdout).toContain("Missing SQL invariant file required by operations.deploy_sql");

      writePolicy("tests/x\nROOT\tdeploy/sql\tunchecked\nCONFIG\t");
      const forgedRecord = run("bash", ["scripts/check-deploy-sql-order.sh"], cwd);
      expect(forgedRecord.status).toBe(1);
      expect(forgedRecord.stdout).toContain("invariant_file must be null or a canonical tests/ path");

      writePolicy("");
      const emptyInvariant = run("bash", ["scripts/check-deploy-sql-order.sh"], cwd);
      expect(emptyInvariant.status).toBe(1);
      expect(emptyInvariant.stdout).toContain("invariant_file must be null or a canonical tests/ path");

      mkdirSync(join(cwd, "tests/sql"), { recursive: true });
      writeFileSync(join(cwd, "tests/sql/required_invariants.sql"), "-- covers 0001_create_users.sql\n");
      writePolicy("tests/sql/required_invariants.sql");
      const singleRootBasename = run("bash", ["scripts/check-deploy-sql-order.sh"], cwd);
      expect(singleRootBasename.status).toBe(0);
      expect(singleRootBasename.stdout).toContain("[deploy-sql] OK");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("check-deploy-sql-order should require unambiguous full-path invariant references for configured roots", () => {
    const cwd = tmpWorkspace("helper-check-deploy-sql-invariant-collision");
    try {
      installSqlCheck(cwd);
      mkdirSync(join(cwd, "deploy/a"), { recursive: true });
      mkdirSync(join(cwd, "deploy/b"), { recursive: true });
      mkdirSync(join(cwd, "tests/sql"), { recursive: true });
      writeFileSync(join(cwd, "deploy/a/runtime-reader.sql"), "select 1;\n");
      writeFileSync(join(cwd, "deploy/b/runtime-reader.sql"), "select 2;\n");
      writeFileSync(
        join(cwd, "tests/sql/control_plane_invariants.sql"),
        "-- covers deploy/a/runtime-reader.sql only\n",
      );
      writeFileSync(
        join(cwd, ".ai/harness/policy.json"),
        JSON.stringify({
          operations: {
            deploy_sql: {
              roots: [
                { path: "deploy/a", naming: "descriptive" },
                { path: "deploy/b", naming: "descriptive" },
              ],
              invariant_file: "tests/sql/control_plane_invariants.sql",
            },
          },
        }),
      );

      const collision = run("bash", ["scripts/check-deploy-sql-order.sh"], cwd);
      expect(collision.status).toBe(1);
      expect(collision.stdout).toContain("SQL migration must be referenced");
      expect(collision.stdout).toContain("deploy/b/runtime-reader.sql");

      writeFileSync(
        join(cwd, "tests/sql/control_plane_invariants.sql"),
        "-- longer text deploy/a/runtime-reader.sql.bak and deploy/b/runtime-reader.sql.bak is not coverage\n",
      );
      const longerPath = run("bash", ["scripts/check-deploy-sql-order.sh"], cwd);
      expect(longerPath.status).toBe(1);
      expect(longerPath.stdout).toContain("deploy/a/runtime-reader.sql");
      expect(longerPath.stdout).toContain("deploy/b/runtime-reader.sql");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("check-deploy-sql-order should reject regular and escaping SQL symlinks", () => {
    const cwd = tmpWorkspace("helper-check-deploy-sql-symlinks");
    const outsideDir = mkdtempSync(join(tmpdir(), "helper-check-deploy-sql-file-outside-"));
    try {
      installSqlCheck(cwd);
      mkdirSync(join(cwd, "deploy/sql"), { recursive: true });
      writeFileSync(join(cwd, "deploy/sql/0001_create_users.sql"), "select 1;\n");
      symlinkSync("0001_create_users.sql", join(cwd, "deploy/sql/0002_regular_link.sql"));

      const regular = run("bash", ["scripts/check-deploy-sql-order.sh"], cwd);
      expect(regular.status).toBe(1);
      expect(regular.stdout).toContain("SQL migration must not be a symlink");
      expect(regular.stdout).toContain("0002_regular_link.sql");

      rmSync(join(cwd, "deploy/sql/0002_regular_link.sql"), { force: true });
      writeFileSync(join(outsideDir, "external.sql"), "select 2;\n");
      symlinkSync(join(outsideDir, "external.sql"), join(cwd, "deploy/sql/0002_escape.sql"));

      const escaping = run("bash", ["scripts/check-deploy-sql-order.sh"], cwd);
      expect(escaping.status).toBe(1);
      expect(escaping.stdout).toContain("SQL migration must not be a symlink");
      expect(escaping.stdout).toContain("0002_escape.sql");

      rmSync(join(cwd, "deploy/sql/0002_escape.sql"), { force: true });
      mkdirSync(join(cwd, "migrations"), { recursive: true });
      writeFileSync(join(cwd, "migrations/0002_hidden.sql"), "select 3;\n");
      symlinkSync(join(cwd, "migrations"), join(cwd, "deploy/sql/linked-migrations"), "dir");
      const internalDirectory = run("bash", ["scripts/check-deploy-sql-order.sh"], cwd);
      expect(internalDirectory.status).toBe(1);
      expect(internalDirectory.stdout).toContain("must not contain directory symlinks");
      expect(internalDirectory.stdout).toContain("linked-migrations");

      rmSync(join(cwd, "deploy/sql/linked-migrations"), { force: true });
      symlinkSync(outsideDir, join(cwd, "deploy/sql/escaping-migrations"), "dir");
      const escapingDirectory = run("bash", ["scripts/check-deploy-sql-order.sh"], cwd);
      expect(escapingDirectory.status).toBe(1);
      expect(escapingDirectory.stdout).toContain("must not contain directory symlinks");
      expect(escapingDirectory.stdout).toContain("escaping-migrations");

      rmSync(join(cwd, "deploy/sql/escaping-migrations"), { force: true });
      symlinkSync(join(cwd, "migrations"), join(cwd, "deploy/sql/linked\nmigrations"), "dir");
      const newlineDirectory = run("bash", ["scripts/check-deploy-sql-order.sh"], cwd);
      expect(newlineDirectory.status).toBe(1);
      expect(newlineDirectory.stdout).toContain("must not contain directory symlinks");
      expect(newlineDirectory.stdout).toContain("linked\nmigrations");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(outsideDir, { recursive: true, force: true });
    }
  }, 30_000);

  test("check-deploy-sql-order should fail closed when SQL enumeration fails", () => {
    const cwd = tmpWorkspace("helper-check-deploy-sql-enumeration-failure");
    try {
      installSqlCheck(cwd);
      mkdirSync(join(cwd, "deploy/sql"), { recursive: true });
      writeFileSync(join(cwd, "deploy/sql/0001_create_users.sql"), "select 1;\n");
      mkdirSync(join(cwd, "bin"), { recursive: true });
      const fakeFind = join(cwd, "bin/find");
      writeFileSync(fakeFind, "#!/bin/bash\necho 'fixture find failure' >&2\nexit 1\n");
      chmodSync(fakeFind, 0o755);

      const failed = run("bash", ["scripts/check-deploy-sql-order.sh"], cwd, {
        PATH: `${join(cwd, "bin")}:${process.env.PATH ?? ""}`,
      });
      expect(failed.status).toBe(1);
      expect(failed.stderr).toContain("fixture find failure");
      expect(failed.stdout).toContain("Could not enumerate deploy SQL surface");
      expect(failed.stdout).not.toContain("[deploy-sql] OK");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);
});
