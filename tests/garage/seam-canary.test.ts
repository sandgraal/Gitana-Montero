/**
 * T2-201 canary — **T2-202 deletes this whole file.**
 *
 * The declaration-tier graders in `tests/garage/` are marked `it.fails`: they
 * are expected to throw today because `supabase/` does not exist. That marker
 * is only honest if the throw is the *seam* throw. A grader that failed
 * because of a typo'd path, a renamed export, or a regex that matches nothing
 * looks identical in the Vitest report, and would leave a green suite
 * guarding an empty promise — for row-level security, of all things.
 *
 * `harness-contract.test.ts` proves the instrument works. This file proves the
 * subject is genuinely absent, and absent in the one way the graders expect.
 *
 * ## Activation (T2-202)
 *
 * Once `supabase/migrations/` and `supabase/config.toml` exist, every
 * assertion here becomes false — the readers stop throwing. So this file must
 * be deleted in the same commit that lands them. It is self-enforcing:
 * leaving it behind turns `npm test` red.
 *
 * refs specs/002-montero-garage (MIG-03)
 */
import { isAbsolute } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONFIG_PATH,
  MIGRATIONS_DIR,
  SEAM_NOT_IMPLEMENTED,
  migrationsExist,
  readMigrationSql,
  readSupabaseConfig,
} from "./sql.ts";

const seamError = new RegExp(SEAM_NOT_IMPLEMENTED);

describe("T2-201 seam contract (delete this file in T2-202)", () => {
  it("agrees on the seam message the declaration graders rely on", () => {
    expect(SEAM_NOT_IMPLEMENTED).toBe("not implemented: T2-202");
  });

  it("looks for the DDL where the Supabase CLI actually puts it", () => {
    // If this path is wrong, every declaration grader "fails as expected"
    // forever and nothing would ever say so.
    expect(MIGRATIONS_DIR.replaceAll("\\", "/")).toMatch(
      /\/supabase\/migrations\/?$/
    );
    expect(CONFIG_PATH.replaceAll("\\", "/")).toMatch(
      /\/supabase\/config\.toml$/
    );
  });

  it("resolves those paths against the repo root, not the cwd or tests/", () => {
    // Vitest runs from the repo root today, so a cwd-relative path would pass
    // here and break the day anything runs it from elsewhere; and a path
    // resolved one `../` short would look for `tests/supabase/`.
    expect(isAbsolute(MIGRATIONS_DIR)).toBe(true);
    expect(MIGRATIONS_DIR.replaceAll("\\", "/")).not.toContain("/tests/");
  });

  it("reports no migrations today", () => {
    expect(migrationsExist()).toBe(false);
  });

  it.each<[string, () => unknown]>([
    ["readMigrationSql", () => readMigrationSql()],
    ["readSupabaseConfig", () => readSupabaseConfig()],
  ])("%s throws the T2-202 seam error, not a bare ENOENT", (_name, touch) => {
    expect(touch).toThrow(seamError);
  });

  it("says in the throw who is supposed to fix it", () => {
    expect(readMigrationSql).toThrow(/T2-202 \[PLATFORM\]/);
    expect(readMigrationSql).toThrow(/specs\/002-montero-garage/);
  });
});
