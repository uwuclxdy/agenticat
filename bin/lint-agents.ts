#!/usr/bin/env bun
// Lints claude-format subagent defs. Catches the failure class where a def's frontmatter
// silently withholds something its body depends on, which surfaces mid-run as
// "No such tool available: X. X exists but is not enabled in this context."
//
//   bun bin/lint-agents.ts [dir ...] [--portable] [--quiet]
//
// --portable: absolute machine paths (~/..., /home/...) are errors instead of
//             existence-checked. Use for anything that ships to other machines.
// Exit 1 on any error; warnings alone exit 0.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

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

const READONLY_CLAIM = /\b(read-only|never edits?|reviewer, not a fixer|investigation only)\b/i;
const ABS_PATH = /(?:^|[\s`(])(~\/[\w./-]+|\/home\/[\w./-]+)/g;

interface Finding { level: "error" | "warn"; file: string; msg: string }

function lint(path: string, portable: boolean): Finding[] {
  const out: Finding[] = [];
  const file = basename(path);
  const err = (msg: string) => out.push({ level: "error", file, msg });
  const warn = (msg: string) => out.push({ level: "warn", file, msg });

  const raw = readFileSync(path, "utf8");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return [{ level: "error", file, msg: "no frontmatter block" }];

  const fm: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
  }
  const body = m[2];
  const list = (v?: string) => (v ? v.split(",").map((t) => t.trim()).filter(Boolean) : []);
  const tools = list(fm.tools);
  const denied = list(fm.disallowedTools);

  if (!fm.name) err("missing `name`");
  else if (fm.name !== file.replace(/\.md$/, "")) err(`name \`${fm.name}\` does not match filename`);
  if (!fm.description) err("missing `description`");

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
  if (tools.length && !/^\s*#\s*lint: sandboxed/m.test(m[1])) {
    const hasMcp = tools.some((t) => t.startsWith("mcp__"));
    if (!tools.includes("ToolSearch") && !hasMcp) {
      warn("`tools` allowlist without `ToolSearch` or any `mcp__*` entry: this agent cannot reach any MCP server");
    }
  }

  const grants = (t: string) => (tools.length ? tools.includes(t) : !denied.includes(t));
  for (const t of MENTIONABLE) {
    if (new RegExp(`\\b${t}\\b`).test(body) && !grants(t)) {
      warn(`body references \`${t}\` but the frontmatter does not grant it`);
    }
  }

  // A def that calls itself read-only should not be able to mutate the tree. A description
  // that already qualifies its writes ("writes only the threat-model doc") is self-consistent.
  if (READONLY_CLAIM.test(fm.description ?? "") && !/\b(writes?|copies|builds|stages)\b/i.test(fm.description ?? "")) {
    for (const t of ["Edit", "Write", "NotebookEdit"]) {
      if (grants(t) && !/scratch|screenshot|evidence|brief|ledger|report to/i.test(body)) {
        warn(`description claims read-only but \`${t}\` is granted`);
        break;
      }
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
