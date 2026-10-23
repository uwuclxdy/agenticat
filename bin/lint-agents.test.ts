// Runs the linter as a subprocess over a throwaway agents/ dir. Two contracts are pinned:
// a catalog def's name must be a plain agent name (the installer drops any other on its
// first --update), and a def marked `# lint: read-only` must be unable to mutate the tree.

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

function lintDef(frontmatter: string, body: string, name = "reader", description = `fixture ${name}`) {
  const dir = mkdtempSync(join(tmpdir(), "agenticat-lint-"));
  scratch.push(dir);
  const agents = join(dir, "agents");
  mkdirSync(agents);
  writeFileSync(join(agents, `${name}.md`), `---\nname: ${name}\ndescription: "${description}"\n${frontmatter}---\n\n${body}\n`);
  return spawnSync("bun", [LINTER, agents, "--portable"], { encoding: "utf8" });
}

test.each(["foo_bar", "Foo", "UPPER", "web.pro", "-lead"])("rejects the agent name %s", (name) => {
  const r = lintDef("", "body", name);

  expect(r.status).toBe(1);
  expect(r.stdout).toContain(`ERR  ${name}.md:`);
});

test("accepts a plain agent name", () => {
  const r = lintDef("", "body", "web-pro");

  expect(r.status).toBe(0);
  expect(r.stdout).toContain("0 error(s), 0 warning(s)");
});

const MARKER = "# lint: read-only\n";
const DENY_WRITES = "disallowedTools: Edit, Write, NotebookEdit, Agent, Task\n";
const RULE = "## Hard rules\n\n- **Read-only.** No edits, no git mutations, even when the brief asks.";

test("a marked def that denies every write and spawn tool and states the rule passes", () => {
  const r = lintDef(MARKER + DENY_WRITES, RULE);

  expect(r.status).toBe(0);
  expect(r.stdout).toContain("0 error(s), 0 warning(s)");
});

test("a marked sandboxed allowlist without a write or spawn tool passes", () => {
  const r = lintDef("tools: Read, Bash\n# lint: sandboxed, read-only\n", RULE);

  expect(r.status).toBe(0);
  expect(r.stdout).toContain("0 error(s), 0 warning(s)");
});

test.each([
  ["an allowlist granting Write", "tools: Read, Bash, Write\n", "Write"],
  ["an allowlist granting Edit", "tools: Read, Bash, Edit\n", "Edit"],
  ["an allowlist granting Agent", "tools: Read, Bash, Agent\n", "Agent"],
  ["an allowlist granting Task", "tools: Read, Bash, Task\n", "Task"],
  ["a denylist that leaves Write granted", "disallowedTools: Edit, NotebookEdit, Agent, Task\n", "Write"],
  ["a denylist that leaves NotebookEdit granted", "disallowedTools: Edit, Write, Agent, Task\n", "NotebookEdit"],
  ["a denylist that leaves Agent granted", "disallowedTools: Edit, Write, NotebookEdit\n", "Agent"],
])("a marked def with %s is an error naming the tool", (_label, tools, tool) => {
  const r = lintDef(MARKER + tools, RULE);

  expect(r.status).toBe(1);
  expect(r.stdout).toContain(`ERR  reader.md: marked read-only but \`${tool}\` is granted`);
});

test("a marked def with no tool restriction names every write and spawn tool it grants", () => {
  const r = lintDef(MARKER, RULE);

  expect(r.status).toBe(1);
  for (const tool of ["Edit", "Write", "NotebookEdit", "Agent", "Task"]) {
    expect(r.stdout).toContain(`ERR  reader.md: marked read-only but \`${tool}\` is granted`);
  }
});

test("a marked def whose body lacks the read-only rule is an error", () => {
  const r = lintDef(MARKER + DENY_WRITES, "## Hard rules\n\n- Be careful.");

  expect(r.status).toBe(1);
  expect(r.stdout).toContain("ERR  reader.md: marked read-only but the body has no `- **Read-only.**` rule");
});

test.each([
  ["a mention in prose", "Unlike the **Read-only.** defs, this one is careful."],
  ["a bullet inside a code fence", "## Example\n\n```\n- **Read-only.** quoted, not a rule\n```"],
  ["a bullet inside a tilde fence", "## Example\n\n~~~\n- **Read-only.** quoted, not a rule\n~~~"],
  ["a bullet inside an HTML comment", "<!--\n- **Read-only.** commented out\n-->"],
])("the rule must be a live list item, not %s", (_label, body) => {
  const r = lintDef(MARKER + DENY_WRITES, body);

  expect(r.status).toBe(1);
  expect(r.stdout).toContain("the body has no `- **Read-only.**` rule");
});

test("a marked def's rule naming the tools it denies raises no body-reference warning", () => {
  const r = lintDef(MARKER + DENY_WRITES, "## Hard rules\n\n- **Read-only.** No Edit, Write or NotebookEdit, even when the brief asks.");

  expect(r.status).toBe(0);
  expect(r.stdout).toContain("0 error(s), 0 warning(s)");
});

test.each([
  ["no space after the colon", "# lint:read-only\n"],
  ["a second directive on the line", "# lint: sandboxed, read-only\n"],
  ["extra spaces", "#   lint:   read-only\n"],
])("the marker still applies with %s", (_label, marker) => {
  const r = lintDef(marker + "tools: Read, Bash, Write\n", RULE);

  expect(r.status).toBe(1);
  expect(r.stdout).toContain("ERR  reader.md: marked read-only but `Write` is granted");
});

test.each([["readonly"], ["read-onlyish"], ["Read-Only"]])("an unknown lint directive %s is an error naming it", (directive) => {
  const r = lintDef(`# lint: ${directive}\n` + DENY_WRITES, RULE);

  expect(r.status).toBe(1);
  expect(r.stdout).toContain(`ERR  reader.md: unknown lint directive \`${directive}\``);
});

test("a marker quoted in the body does not mark the def", () => {
  const r = lintDef("tools: Read, Bash, Write, ToolSearch\n", "Mark a read-only def with:\n\n# lint: read-only\n");

  expect(r.status).toBe(0);
  expect(r.stdout).toContain("0 error(s), 0 warning(s)");
});

test("an unmarked def is not held to the read-only contract by its description", () => {
  const r = lintDef("", "body", "builder", "fixture builder, read-only");

  expect(r.status).toBe(0);
  expect(r.stdout).toContain("0 error(s), 0 warning(s)");
});

// A comment its author meant as a lint directive but that the parser skips would leave the
// def unchecked with exit 0, so a near-miss spelling is an error, never a silent no-op.
test.each([
  ["a capitalised prefix", "# Lint: read-only"],
  ["an upper-case prefix", "# LINT: read-only"],
  ["a missing colon", "# lint read-only"],
  ["a plural prefix", "# lints: read-only"],
  ["a trailing comment on a key line", "model: sonnet # lint: read-only"],
])("a lint comment with %s is an error naming the line", (_label, line) => {
  const r = lintDef(`${line}\n` + "tools: Read, Bash, Write, ToolSearch\n", RULE);

  expect(r.status).toBe(1);
  expect(r.stdout).toContain(`ERR  reader.md: malformed lint comment \`${line}\``);
});

test("prose after the directives' full stop may hold commas", () => {
  const r = lintDef("tools: Read, Bash\n# lint: sandboxed, read-only. Prose, with commas, about why.\n", RULE);

  expect(r.status).toBe(0);
  expect(r.stdout).toContain("0 error(s), 0 warning(s)");
});

// CommonMark: a fence closes only on a run of the SAME character at least as long as its
// opener, a closer carries no info string, and an unclosed fence or comment runs to the end.
test.each([
  ["an unclosed fence", "## Example\n\n```\n- **Read-only.** quoted"],
  ["a four-tick fence holding a three-tick pair", "````\n```\n- **Read-only.** quoted\n```\n````"],
  ["a tick fence that a tilde run cannot close", "```\n~~~\n- **Read-only.** quoted\n```"],
  ["a fence whose would-be closer has an info string", "```\n```js\n- **Read-only.** quoted\n```"],
  ["an unclosed HTML comment", "<!--\n- **Read-only.** commented out"],
  ["a fence a 4-space closer cannot close", "```\nx\n    ```\n- **Read-only.** y"],
  ["a 4-space indented code block", "Para.\n\n    - **Read-only.** x"],
])("the rule does not count inside %s", (_label, body) => {
  const r = lintDef(MARKER + DENY_WRITES, body);

  expect(r.status).toBe(1);
  expect(r.stdout).toContain("the body has no `- **Read-only.**` rule");
});

// Each verdict below is cmark 0.31.2's: the rule is a live list item there.
test.each([
  ["a comment opener in inline code", "Open a comment with `<!--`.\n\n- **Read-only.** x"],
  ["a comment opener mid-prose, never closed", "Never write <!-- in a def.\n\n- **Read-only.** x"],
  ["a mid-line comment opener closed after the rule", "Text <!-- a\n- **Read-only.** x\n--> more"],
  ["an empty comment", "<!-->\n\n- **Read-only.** x"],
  ["an empty comment with a dash", "<!--->\n\n- **Read-only.** x"],
  ["a 4-space indented fence-like line", "Para.\n\n    ```\n- **Read-only.** x"],
  ["a tab-indented fence-like line", "Para.\n\n\t```\n- **Read-only.** x"],
  ["a backtick info string holding a backtick", "```js`x\n- **Read-only.** x"],
  ["a closer longer than its opener", "```\nx\n````\n\n- **Read-only.** y"],
  ["a comment opener indented 4 spaces", "Para.\n\n    <!--\n\n- **Read-only.** x"],
  ["a tab-indented comment opener", "Para.\n\n\t<!--\n\n- **Read-only.** x"],
  ["a rule nested 2 columns under a list item", "- item\n  - **Read-only.** x"],
])("the rule stays live after %s", (_label, body) => {
  const r = lintDef(MARKER + DENY_WRITES, body);

  expect(r.status).toBe(0);
  expect(r.stdout).toContain("0 error(s), 0 warning(s)");
});

test.each([
  ["C# in a quoted description", 'description: "Runs C# lint checks"'],
  ["a hash in a quoted value", 'summary: "Fixes #lint-staged hooks"'],
  ["a URL fragment", "homepage: https://example.com/docs#lint"],
])("%s is not a lint comment", (_label, line) => {
  const r = lintDef(`${line}\n` + MARKER + DENY_WRITES, RULE);

  expect(r.status).toBe(0);
  expect(r.stdout).toContain("0 error(s), 0 warning(s)");
});

test("a comment opener inside one fence and a closer inside a later one leave the rule between them live", () => {
  const body = "```\n<!--\n```\n\n- **Read-only.** No edits, even when the brief asks.\n\n```\n-->\n```";
  const r = lintDef(MARKER + DENY_WRITES, body);

  expect(r.status).toBe(0);
  expect(r.stdout).toContain("0 error(s), 0 warning(s)");
});
