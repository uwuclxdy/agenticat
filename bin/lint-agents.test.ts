// Runs the linter as a subprocess over a throwaway agents/ dir. Two contracts are pinned:
// a catalog def's name must be a plain agent name (the installer drops any other on its
// first --update), and a def marked `# lint: read-only` must be unable to mutate the tree.

import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
const DENY_WRITES = "disallowedTools: Edit, Write, NotebookEdit, Agent, Task, EnterWorktree\n";
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
  ["an allowlist granting EnterWorktree", "tools: Read, Bash, EnterWorktree\n", "EnterWorktree"],
  ["a denylist that leaves Write granted", "disallowedTools: Edit, NotebookEdit, Agent, Task, EnterWorktree\n", "Write"],
  ["a denylist that leaves NotebookEdit granted", "disallowedTools: Edit, Write, Agent, Task, EnterWorktree\n", "NotebookEdit"],
  ["a denylist that leaves Agent granted", "disallowedTools: Edit, Write, NotebookEdit, EnterWorktree\n", "Agent"],
  ["a denylist that leaves EnterWorktree granted", "disallowedTools: Edit, Write, NotebookEdit, Agent, Task\n", "EnterWorktree"],
])("a marked def with %s is an error naming the tool", (_label, tools, tool) => {
  const r = lintDef(MARKER + tools, RULE);

  expect(r.status).toBe(1);
  expect(r.stdout).toContain(`ERR  reader.md: marked read-only but \`${tool}\` is granted`);
});

test("a marked def with no tool restriction names every write and spawn tool it grants", () => {
  const r = lintDef(MARKER, RULE);

  expect(r.status).toBe(1);
  for (const tool of ["Edit", "Write", "NotebookEdit", "Agent", "Task", "EnterWorktree"]) {
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
  ["a longer key", "# linter: read-only"],
  ["a past-tense key", "# linted: read-only"],
  ["a bare key", "lint: read-only"],
  ["an indented marker", "  # lint: read-only"],
  ["a space before the colon", "# lint : read-only"],
])("a lint comment with %s is an error naming the line", (_label, line) => {
  const r = lintDef(`${line}\n` + "tools: Read, Bash, Write, ToolSearch\n", RULE);

  expect(r.status).toBe(1);
  expect(r.stdout).toContain(`ERR  reader.md: malformed lint comment \`${line}\``);
});

// the converter refuses these markers, so the lint reports them first, in the converter's words.
test.each([
  ["a sandbox lookalike key", "sandbox_profile: strict\n", 'sandbox marker "sandbox_profile: strict" must be exactly "# sandbox: <value>" with nothing after the value'],
  ["an unknown sandbox value", "# sandbox: bogus\n", 'unknown sandbox marker "bogus" (expected "workspace-write")'],
  ["an allow-marker lookalike", "# opencode-bash-allows: cargo check\n", 'opencode-bash-allow marker "# opencode-bash-allows: cargo check" must be exactly "# opencode-bash-allow: <pattern>, <pattern>"'],
])("%s is a lint error in the converter's words", (_label, frontmatter, message) => {
  const r = lintDef(frontmatter, "body");

  expect(r.status).toBe(1);
  expect(r.stdout).toContain(`ERR  reader.md: ${message}`);
});

// every converter refusal the def text can trigger shows in the lint first.
test.each([
  ["a numeric model", "model: 4\n", 'frontmatter field "model" is not a string'],
  ["an allow pattern that is also a deny", "tools: Read, Bash\n# opencode-bash-allow: * --fix *\n", 'opencode-bash-allow pattern "* --fix *" is also a deny rule'],
  ["a wildcard command word", "tools: Read, Bash\n# opencode-bash-allow: * --help\n", 'opencode-bash-allow pattern "* --help" has a wildcard in its command word, which matches commands no check names'],
  ["a wildcard before the last word", "tools: Read, Bash\n# opencode-bash-allow: cargo * --help\n", 'opencode-bash-allow pattern "cargo * --help" has a wildcard before its last word, which matches commands no check names'],
  ["an allow line on a def that writes", "tools: Read, Bash, Write\n# opencode-bash-allow: cargo check\n", "opencode-bash-allow has no bash map to extend (the def writes files or grants no Bash)"],
  ["a frontmatter YAML cannot read", 'notes: "unterminated\n', "frontmatter is not valid YAML ("],
  ["a repeated key", "description: again\n", 'frontmatter key "description" appears more than once; YAML keeps only the last\n'],
  ["a repeated key whose first copy is a block scalar holding a marker line", "notes: |\n  # sandbox: bogus\nnotes: plain\n", 'frontmatter key "notes" appears more than once; YAML keeps only the last\n'],
])("%s is a lint error in the converter's words", (_label, frontmatter, message) => {
  const r = lintDef(frontmatter, "body");

  expect(r.status).toBe(1);
  expect(r.stdout).toContain(`ERR  reader.md: ${message}`);
});

// the converter stops at a def's first defect, so the lint adds no refusal that defect hides.
test("a tool list that is not text reports that defect alone", () => {
  const r = lintDef("tools: [Read, Bash]\n# opencode-bash-allow: cargo check\n", "body");

  expect(r.status).toBe(1);
  expect(r.stdout).toContain('ERR  reader.md: frontmatter field "tools" is not a string');
  expect(r.stdout).not.toContain("no bash map to extend");
});

test.each([
  ["a key name inside a block scalar body", "notes: |\n  description: inside\n  name: also inside\n"],
  ["anchors and aliases in values", "base: &b 1\nnotes:\n  a: *b\n"],
  ["a blank line between keys", "\nnotes: x\n"],
  ["a tab after a key's colon", "notes:\tx\n"],
  ["a column-0 sequence under a key", "skills:\n- a\n- b\n"],
  ["a column-0 sequence with a tab item and a bare item", "skills:\n-\ta\n-\n"],
])("%s is not a repeated key", (_label, frontmatter) => {
  const r = lintDef(frontmatter, "body");

  expect(r.status).toBe(0);
  expect(r.stdout).toContain("0 error(s), 0 warning(s)");
});

// a top-level key must be a plain name at column 0, so the repeat check reads every key
// straight off its line; any other spelling could hide a key the parser still reads.
test.each([
  ["a quoted key", '"description": again\n', String.raw`"\"description\": again"`],
  ["an explicit key", "? a\n: 1\n", '"? a"'],
  ["a merge key", "base: &a\n  k: anchored\n<<: *a\n", '"<<: *a"'],
  ["a key that starts with three dashes", "---x: 1\n", '"---x: 1"'],
  ["a tagged key", "!!str k: v\n", '"!!str k: v"'],
  ["a key that starts with a colon", ":x: 1\n", '":x: 1"'],
  ["a key behind a lone carriage return", "x: a\r!!str k: v\n", '"!!str k: v"'],
  ["a core-schema boolean key", "true: a\n", '"true: a"'],
  ["a core-schema null key", "Null: a\n", '"Null: a"'],
  ["a capitalised core-schema boolean key", "True: a\n", '"True: a"'],
  ["an upper-case core-schema false key", "False: a\n", '"False: a"'],
  ["an upper-case core-schema null key", "NULL: a\n", '"NULL: a"'],
  ["a key that starts with a dash", "-x: 1\n", '"-x: 1"'],
  ["a digit-first key", "1: x\n", '"1: x"'],
  ["a key holding a colon", "x:y: 1\n", '"x:y: 1"'],
])("%s is a lint error in the converter's words", (_label, frontmatter, quoted) => {
  const r = lintDef(frontmatter, "body");

  expect(r.status).toBe(1);
  expect(r.stdout).toContain(`ERR  reader.md: frontmatter line ${quoted} is not a plain top-level \`key: value\` entry\n`);
  expect(r.stdout).not.toContain("sandbox marker");
});

test.each([
  ["a repeat whose first copy holds an alias and a marker-shaped block line", "base: &b 1\nnotes:\n  a: *b\n  text: |\n    # sandbox: bogus\nnotes: plain\n", "notes"],
])("%s is a lint error in the converter's words", (_label, frontmatter, key) => {
  const r = lintDef(frontmatter, "body");

  expect(r.status).toBe(1);
  expect(r.stdout).toContain(`ERR  reader.md: frontmatter key "${key}" appears more than once; YAML keeps only the last\n`);
  expect(r.stdout).not.toContain("sandbox marker");
});

// a hash glued to a word is data even inside a comment, so the stem after it is no marker.
test("a comment holding the lint stem right after a word is no lint comment", () => {
  const r = lintDef("# see foo#lint-staged for hooks\n", "body");

  expect(r.status).toBe(0);
  expect(r.stdout).toContain("0 error(s), 0 warning(s)");
});

test("a block-scalar line holding the lint stem is data", () => {
  const r = lintDef("notes: |\n  run a\n  # lint pass first\n", "body");

  expect(r.status).toBe(0);
  expect(r.stdout).toContain("0 error(s), 0 warning(s)");
});

test("a nested key that shares the lint stem is no lint comment", () => {
  const r = lintDef("mcpServers:\n  linter-mcp:\n    command: x\n", "body");

  expect(r.status).toBe(0);
  expect(r.stdout).toContain("0 error(s), 0 warning(s)");
});

// a hash inside a quoted value is data, whatever YAML escape sits before it.
test.each([
  ["an escaped quote", 'say \\"hi\\" in a # lint'],
  ["a plain quoted value", "runs a # lint pass"],
])("a # lint inside a description with %s is data", (_label, description) => {
  const r = lintDef("", "body", "reader", description);

  expect(r.status).toBe(0);
  expect(r.stdout).toContain("0 error(s), 0 warning(s)");
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

test("C# in a quoted description is not a lint comment", () => {
  const r = lintDef(MARKER + DENY_WRITES, RULE, "reader", "Runs C# lint checks");

  expect(r.status).toBe(0);
  expect(r.stdout).toContain("0 error(s), 0 warning(s)");
});

test.each([
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

// The shipped catalog: a def that can neither Edit nor Write is read-only by its tool
// grant (prober opts into codex's workspace-write with a marker), so it must carry the
// marker the lint holds it to.
const SHIPPED = join(import.meta.dir, "..", "agents");
const frontmatterOf = (raw: string) => raw.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? "";
const listOf = (fm: string, key: string) => fm.match(new RegExp(`^${key}:\\s*(.*)$`, "m"))?.[1].split(",").map((t) => t.trim()) ?? null;
const cannotWrite = (fm: string) => {
  const tools = listOf(fm, "tools");
  const denied = listOf(fm, "disallowedTools");
  if (tools) return !tools.includes("Edit") && !tools.includes("Write");
  return denied !== null && denied.includes("Edit") && denied.includes("Write");
};

function lintShipped(name: string, edit: (raw: string) => string) {
  const dir = mkdtempSync(join(tmpdir(), "agenticat-lint-"));
  scratch.push(dir);
  const agents = join(dir, "agents");
  mkdirSync(agents);
  const raw = readFileSync(join(SHIPPED, `${name}.md`), "utf8");
  const edited = edit(raw);
  expect(edited).not.toBe(raw);
  writeFileSync(join(agents, `${name}.md`), edited);
  return spawnSync("bun", [LINTER, agents, "--portable"], { encoding: "utf8" });
}

// The lint itself decides: a shipped def that can neither Edit nor Write, re-granted Write,
// must be refused, which holds only while its marker is a live directive.
const READ_ONLY_SHIPPED = readdirSync(SHIPPED)
  .filter((f) => f.endsWith(".md") && cannotWrite(frontmatterOf(readFileSync(join(SHIPPED, f), "utf8"))))
  .map((f) => f.replace(/\.md$/, ""));

test("the shipped catalog holds read-only defs to check", () => {
  expect([...READ_ONLY_SHIPPED].sort()).toEqual([
    "code-explorer", "flutter-reviewer", "prober", "python-reviewer", "rust-reviewer",
    "shell-reviewer", "ux-reviewer", "web-researcher", "web-reviewer",
  ]);
});

const regrant = (tool: string) => (raw: string) =>
  /^tools:/m.test(raw)
    ? raw.replace(/^tools:\s*(.*)$/m, (_line, list: string) => `tools: ${list}, ${tool}`)
    : raw.replace(/^disallowedTools:\s*(.*)$/m, (_line, list: string) => `disallowedTools: ${list.split(",").map((t) => t.trim()).filter((t) => t !== tool).join(", ")}`);
const regrantWrite = regrant("Write");

test.each(READ_ONLY_SHIPPED)("the shipped %s granted Write is an error", (name) => {
  const r = lintShipped(name, regrantWrite);

  expect(r.status).toBe(1);
  expect(r.stdout).toContain(`ERR  ${name}.md: marked read-only but \`Write\` is granted`);
});

test.each(READ_ONLY_SHIPPED)("the shipped %s granted EnterWorktree is an error", (name) => {
  const r = lintShipped(name, regrant("EnterWorktree"));

  expect(r.status).toBe(1);
  expect(r.stdout).toContain(`ERR  ${name}.md: marked read-only but \`EnterWorktree\` is granted`);
});

test("the shipped code-explorer without its read-only rule is an error", () => {
  const r = lintShipped("code-explorer", (raw) => raw.replace(/^- \*\*Read-only\.\*\*.*\n/m, ""));

  expect(r.status).toBe(1);
  expect(r.stdout).toContain("ERR  code-explorer.md: marked read-only but the body has no `- **Read-only.**` rule");
});
