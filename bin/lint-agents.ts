#!/usr/bin/env bun
// Lints claude-format subagent defs. Catches the failure class where a def's frontmatter
// silently withholds something its body depends on, which surfaces mid-run as
// "No such tool available: X. X exists but is not enabled in this context."
//
//   bun bin/lint-agents.ts [dir ...] [--portable] [--quiet]
//
// --portable: absolute machine paths (tilde and home-dir prefixes) are errors instead of
//             existence-checked. Use for anything that ships to other machines.
// Exit 1 on any error; warnings alone exit 0.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { AGENT_NAME, allowDefect, markerForm, readFrontmatter, readMarkers, splitFrontmatter, stringField } from "./agent-name";

// Every tool a subagent can be granted. A name outside this set resolves to nothing at
// spawn time; if ALL of them do, Claude Code refuses to launch the agent.
const TOOLS = new Set([
  "Agent", "Task", "AskUserQuestion", "Bash", "CronCreate", "CronDelete", "CronList",
  "Edit", "EndConversation", "EnterPlanMode", "EnterWorktree", "ExitPlanMode",
  "ExitWorktree", "Glob", "Grep", "ListMcpResourcesTool", "LSP", "Monitor",
  "NotebookEdit", "Read", "ReadMcpResourceTool", "RemoteTrigger", "ReportFindings",
  "ScheduleWakeup", "SendMessage", "Skill", "TaskCreate", "TaskGet", "TaskList",
  "TaskOutput", "TaskStop", "TaskUpdate", "TodoWrite", "ToolSearch", "WebFetch",
  "WebSearch", "Write",
]);

// Tool names a body can reference. Bare "Read"/"Write" are too common as English to match.
const MENTIONABLE = ["WebFetch", "WebSearch", "NotebookEdit", "TodoWrite", "ToolSearch", "Glob", "Grep", "Bash"];

// A read-only def holds no edit, spawn or worktree tool; its Bash may still write where its
// body allows. EnterWorktree creates a worktree, a git write, and is granted by default like
// the spawn tools. A denylist def still inherits every tool it does not name (MCP tools and
// built-ins such as SendMessage), which this list cannot enumerate.
const READ_ONLY_TOOLS = ["Edit", "Write", "NotebookEdit", "Agent", "Task", "EnterWorktree"];
const LINT_DIRECTIVES = new Set(["sandboxed", "read-only"]);

// Fenced code and HTML comments quote text; only live body text counts as a rule. One
// leftmost-first pass, per CommonMark: a fence opener and closer, and a comment opener,
// sit at most three columns in (four is an indented code block), a backtick info string
// holds no backtick, a fence closes only on the same character repeated at least as long
// as the opener, and an unclosed construct runs to the end. A regex cannot track list
// containers, so a rule nested four-plus columns under a list item reads as missing: a
// loud error, never a silent pass.
function withoutQuoted(body: string): string {
  return body.replace(
    /^ {0,3}(([`~])\2{2,})(?!(?<=`)[^\n]*`)[^\n]*\n[\s\S]*?(?:^ {0,3}\1\2*[ \t]*$|(?![\s\S]))|^ {0,3}(?=<!--)(?:[^\n]*?-->[^\n]*|[\s\S]*?-->[^\n]*|[\s\S]*)/gm,
    "",
  );
}

const ABS_PATH = /(?:^|[\s`(])(~\/[\w./-]+|\/home\/[\w./-]+)/g;

interface Finding { level: "error" | "warn"; file: string; msg: string }

function lint(path: string, portable: boolean): Finding[] {
  const out: Finding[] = [];
  const file = basename(path);
  const err = (msg: string) => out.push({ level: "error", file, msg });
  const warn = (msg: string) => out.push({ level: "warn", file, msg });

  const raw = readFileSync(path, "utf8");
  const split = splitFrontmatter(raw);
  if (!split) return [{ level: "error", file, msg: "no frontmatter block" }];

  // The block is what every harness parses, so a block YAML rejects, a repeated top-level
  // key, a top-level line that is not a plain `key: value` entry, or a text field that is
  // not one, is a defect here too.
  const frontmatter = readFrontmatter(split.block);
  if ("defect" in frontmatter) return [{ level: "error", file, msg: frontmatter.defect }];
  const name = stringField(frontmatter.fields, "name");
  const description = stringField(frontmatter.fields, "description");
  const body = split.body;
  const list = (v?: string) => (v ? v.split(",").map((t) => t.trim()).filter(Boolean) : []);
  // undefined keeps "field absent" distinct from "field empty": the shared allow checks
  // read an absent tool list as the inherited every-tool grant. A defect read also yields
  // undefined, so the flag keeps it from earning that same verdict.
  let toolListDefect = false;
  const toolList = (key: string): string[] | undefined => {
    const reading = stringField(frontmatter.fields, key);
    if ("defect" in reading) {
      err(reading.defect);
      toolListDefect = true;
      return undefined;
    }
    return reading.value === undefined ? undefined : list(reading.value);
  };
  const declaredTools = toolList("tools");
  const declaredDenied = toolList("disallowedTools");
  const tools = declaredTools ?? [];
  const denied = declaredDenied ?? [];
  const model = stringField(frontmatter.fields, "model");
  if ("defect" in model) err(model.defect);

  // The converter refuses these markers and allow patterns on both targets, so the lint
  // reports the same defect first: one gate previews every refusal.
  const markers = readMarkers(split.block);
  if ("defect" in markers) err(markers.defect);
  else if (!toolListDefect) {
    const defect = allowDefect({
      tools: declaredTools,
      disallowedTools: declaredDenied,
      sandbox: markers.markers.sandbox,
      bashAllow: markers.markers.bashAllow,
    });
    if (defect) err(defect);
  }

  // Every `# lint: <directives>` comment line in the frontmatter is one directive source;
  // prose after the first full stop is a note, not more directives. A near-miss spelling
  // would leave the def unchecked with exit 0, so it is an error instead.
  const directives = new Set<string>();
  const frontmatterLines = split.block.split("\n");
  for (const [i, line] of frontmatterLines.entries()) {
    const form = markerForm(frontmatterLines, i, "lint", "lint");
    if (form === "near-miss") {
      err(`malformed lint comment \`${line}\``);
      continue;
    }
    if (form === "none") continue;
    for (const d of (line.match(/^#[ \t]*lint:[ \t]*(.*)$/)?.[1] ?? "").split(".")[0].split(/[,\s]+/).filter(Boolean))
      directives.add(d);
  }
  for (const d of directives) {
    if (!LINT_DIRECTIVES.has(d)) err(`unknown lint directive \`${d}\``);
  }
  const readOnly = directives.has("read-only");

  if ("defect" in name) err(name.defect);
  else if (!name.value) err("missing `name`");
  else {
    if (name.value !== file.replace(/\.md$/, "")) err(`name \`${name.value}\` does not match filename`);
    if (!AGENT_NAME.test(name.value)) err(`name \`${name.value}\` is not a plain agent name (${AGENT_NAME})`);
  }
  if ("defect" in description) err(description.defect);
  else if (!description.value) err("missing `description`");

  // Claude Code ignores disallowedTools whenever tools is set, so a def carrying both
  // reads as a denylist while behaving as a pure allowlist.
  if (tools.length && denied.length) err("`tools` and `disallowedTools` both set; `disallowedTools` is ignored when `tools` is present");

  for (const t of [...tools, ...denied]) {
    if (!TOOLS.has(t) && !t.startsWith("mcp__")) err(`unknown tool \`${t}\` (typo? it resolves to nothing at spawn)`);
  }
  if (tools.length && tools.every((t) => !TOOLS.has(t) && !t.startsWith("mcp__"))) {
    err("no entry in `tools` resolves; Claude Code refuses to spawn this agent");
  }

  // An allowlist is exact: MCP tools are excluded unless named, and without ToolSearch a
  // deferred MCP tool can never be loaded. A def that wants the tight sandbox says so with
  // a `# lint: sandboxed` YAML comment in its frontmatter.
  if (tools.length && !directives.has("sandboxed")) {
    const hasMcp = tools.some((t) => t.startsWith("mcp__"));
    if (!tools.includes("ToolSearch") && !hasMcp) {
      warn("`tools` allowlist without `ToolSearch` or any `mcp__*` entry: this agent cannot reach any MCP server");
    }
  }

  const grants = (t: string) => (tools.length ? tools.includes(t) : !denied.includes(t));
  for (const t of MENTIONABLE) {
    // A rule that names the tools it denies states no dependency on them.
    if (readOnly && READ_ONLY_TOOLS.includes(t)) continue;
    if (new RegExp(`\\b${t}\\b`).test(body) && !grants(t)) {
      warn(`body references \`${t}\` but the frontmatter does not grant it`);
    }
  }

  // A def's `# lint: read-only` marker is the only read-only trigger: an unmarked def is
  // checked by nothing.
  if (readOnly) {
    for (const t of READ_ONLY_TOOLS) {
      if (grants(t)) err(`marked read-only but \`${t}\` is granted`);
    }
    if (!/^ {0,3}- \*\*Read-only\.\*\*/m.test(withoutQuoted(body))) {
      err("marked read-only but the body has no `- **Read-only.**` rule");
    }
  }

  // The class that motivated this: a body pointing at a skill/reference that moved or
  // was renamed. The agent reads nothing and silently reviews against memory instead.
  // Only readable references are existence-checked; a bare dir may be a build artifact
  // (~/repos/rs/target) that legitimately does not exist yet.
  const seen = new Set<string>();
  for (const [, p] of body.matchAll(ABS_PATH)) {
    if (seen.has(p)) continue;
    seen.add(p);
    if (portable) { err(`absolute machine path \`${p}\` in a portable def`); continue; }
    const readable = /\.(md|py|sh|ts|json|toml|ya?ml)$/.test(p) || p.includes("/skills/");
    if (readable && !existsSync(p.replace(/^~/, homedir()))) err(`referenced path does not exist: \`${p}\``);
  }

  // A skill named without a path needs the Skill tool to be reachable at all.
  for (const [, name] of body.matchAll(/\bthe \*{0,2}`?([a-z][a-z0-9-]{2,})`?\*{0,2} skill\b/g)) {
    if (!body.includes(`skills/${name}/`) && !grants("Skill")) {
      warn(`body names the \`${name}\` skill with no path, but \`Skill\` is not granted`);
    }
  }
  return out;
}

const argv = process.argv.slice(2);
const portable = argv.includes("--portable");
const quiet = argv.includes("--quiet");
const dirs = argv.filter((a) => !a.startsWith("--"));
if (!dirs.length) dirs.push(join(dirname(dirname(fileURLToPath(import.meta.url))), "agents"));

let errors = 0, warns = 0;
for (const dir of dirs) {
  if (!existsSync(dir)) { console.error(`no such dir: ${dir}`); process.exit(1); }
  const files = readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
  if (!files.length) console.warn(`warn: no agent defs in ${dir}`);
  console.log(`\n${dir} (${files.length} defs${portable ? ", portable" : ""})`);
  for (const f of files) {
    for (const x of lint(join(dir, f), portable)) {
      if (x.level === "error") errors++; else { warns++; if (quiet) continue; }
      console.log(`  ${x.level === "error" ? "ERR " : "warn"} ${x.file}: ${x.msg}`);
    }
  }
}
console.log(`\n${errors} error(s), ${warns} warning(s)`);
process.exit(errors ? 1 : 0);
