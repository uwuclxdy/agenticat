// The installer acts on a manifest name only when it is a plain agent name, so a catalog
// def named outside that shape would install once and be dropped on its first --update:
// the linter rejects such a name before it ships.

import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LINTER = join(import.meta.dir, "lint-agents.ts");
const scratch: string[] = [];

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function lintOne(name: string) {
  const dir = mkdtempSync(join(tmpdir(), "agenticat-lint-"));
  scratch.push(dir);
  const agents = join(dir, "agents");
  mkdirSync(agents);
  writeFileSync(join(agents, `${name}.md`), `---\nname: ${name}\ndescription: "fixture ${name}"\n---\n\nbody\n`);
  return spawnSync("bun", [LINTER, agents, "--portable"], { encoding: "utf8" });
}

test.each(["foo_bar", "Foo", "UPPER", "web.pro", "-lead"])("rejects the agent name %s", (name) => {
  const r = lintOne(name);

  expect(r.status).toBe(1);
  expect(r.stdout).toContain(`ERR  ${name}.md:`);
});

test("accepts a plain agent name", () => {
  const r = lintOne("web-pro");

  expect(r.status).toBe(0);
  expect(r.stdout).toContain("0 error(s), 0 warning(s)");
});
