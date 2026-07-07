#!/usr/bin/env bun
// agenticat agent converter/installer for harnesses without a native agent installer.
// claude code -> /plugin install agenticat@agenticat ; gemini -> gemini extensions install <repo>
// this script covers the gap: opencode + codex (cursor reads claude format natively).
//
// usage:
//   bun bin/install-agents.ts --to opencode|codex|all [--project] [--dest <dir>] [names...]
//   bun bin/install-agents.ts --update        # git pull + reinstall what the manifest lists
//   bun bin/install-agents.ts --list

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO = dirname(dirname(fileURLToPath(import.meta.url))); // repo root (bin/..)
const AGENTS_DIR = join(REPO, "agents");
const MANIFEST = ".agenticat.json";

// claude alias -> opencode provider/model id. edit when models rotate.
const MODEL_MAP: Record<string, string> = {
  sonnet: "anthropic/claude-sonnet-5",
  opus: "anthropic/claude-opus-4-8",
  haiku: "anthropic/claude-haiku-4-5",
};

// claude tool name -> opencode tool key
const TOOL_MAP: Record<string, string> = {
  Read: "read", Write: "write", Edit: "edit", Bash: "bash",
  Grep: "grep", Glob: "glob", WebFetch: "webfetch", WebSearch: "websearch",
};
// always emitted explicitly so a read-only agent stays read-only after conversion
const MUTATING = ["write", "edit", "bash"];

interface AgentDef {
  name: string;
  description: string;
  tools?: string[];
  model?: string;
  body: string;
}

function parseAgent(path: string): AgentDef {
  const raw = readFileSync(path, "utf8");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`${path}: no frontmatter block`);
  const fm: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
  }
  if (!fm.name || !fm.description) throw new Error(`${path}: name + description required`);
  return {
    name: fm.name,
    description: fm.description,
    tools: fm.tools ? fm.tools.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
    model: fm.model,
    body: m[2].trim(),
  };
}

function toOpencode(a: AgentDef): string {
  const lines = [`description: ${JSON.stringify(a.description)}`, "mode: subagent"];
  const model = a.model && MODEL_MAP[a.model];
  if (model) lines.push(`model: ${model}`);
  if (a.tools) {
    lines.push("tools:");
    const mapped = a.tools.map((t) => TOOL_MAP[t]).filter(Boolean);
    for (const t of mapped) lines.push(`  ${t}: true`);
    for (const t of MUTATING) if (!mapped.includes(t)) lines.push(`  ${t}: false`);
    const unknown = a.tools.filter((t) => !TOOL_MAP[t]);
    if (unknown.length) console.warn(`  warn: ${a.name}: no opencode mapping for ${unknown.join(", ")}, skipped`);
  }
  return `---\n${lines.join("\n")}\n---\n\n${a.body}\n`;
}

function toCodex(a: AgentDef): string {
  // Bash alone stays read-only: our read-only agents carry it for git diff/checks,
  // and codex's read-only sandbox still allows command execution, just no fs writes.
  const mutates = a.tools?.some((t) => ["Write", "Edit"].includes(t)) ?? true;
  // TOML literal multi-line string: no escape processing, so regex/backslashes in
  // bodies survive verbatim. A body containing ''' cannot be represented — fail loud.
  if (a.body.includes("'''")) throw new Error(`${a.name}: body contains ''' — unrepresentable in TOML literal string`);
  return [
    `name = ${JSON.stringify(a.name)}`,
    `description = ${JSON.stringify(a.description)}`,
    `sandbox_mode = ${JSON.stringify(mutates ? "workspace-write" : "read-only")}`,
    "",
    `developer_instructions = '''`,
    a.body,
    `'''`,
    "",
  ].join("\n");
}

function destFor(target: string, project: boolean, override?: string): string {
  if (override) return join(override, target);
  if (target === "opencode")
    return project ? ".opencode/agents" : join(homedir(), ".config/opencode/agents");
  return project ? ".codex/agents" : join(homedir(), ".codex/agents");
}

function install(targets: string[], names: string[], project: boolean, destOverride?: string) {
  const all = readdirSync(AGENTS_DIR).filter((f: string) => f.endsWith(".md")).map((f: string) => join(AGENTS_DIR, f));
  const defs = all.map(parseAgent).filter((a: AgentDef) => !names.length || names.includes(a.name));
  const missing = names.filter((n) => !defs.some((d: AgentDef) => d.name === n));
  if (missing.length) throw new Error(`unknown agents: ${missing.join(", ")} (see --list)`);
  for (const target of targets) {
    const dest = destFor(target, project, destOverride);
    mkdirSync(dest, { recursive: true });
    for (const a of defs) {
      const [file, content] =
        target === "opencode" ? [`${a.name}.md`, toOpencode(a)] : [`${a.name}.toml`, toCodex(a)];
      writeFileSync(join(dest, file), content);
      console.log(`  ${target}: ${join(dest, file)}`);
    }
    writeFileSync(
      join(dest, MANIFEST),
      JSON.stringify({ source: REPO, target, project, agents: defs.map((d: AgentDef) => d.name), installedAt: new Date().toISOString() }, null, 2) + "\n",
    );
  }
  console.log(`installed ${defs.length} agent(s) -> ${targets.join(", ")}`);
}

function update(project: boolean) {
  execFileSync("git", ["pull", "--ff-only"], { cwd: REPO, stdio: "inherit" });
  let found = false;
  for (const target of ["opencode", "codex"]) {
    const dest = destFor(target, project);
    const mf = join(dest, MANIFEST);
    if (!existsSync(mf)) continue;
    found = true;
    const m = JSON.parse(readFileSync(mf, "utf8"));
    install([target], m.agents, project);
  }
  if (!found) console.log("no agenticat manifest found; nothing to update (install first)");
}

// --- args
const argv = process.argv.slice(2);
const flag = (f: string) => {
  const i = argv.indexOf(f);
  if (i === -1) return undefined;
  return argv.splice(i, 1) && true;
};
const opt = (f: string) => {
  const i = argv.indexOf(f);
  if (i === -1) return undefined;
  return argv.splice(i, 2)[1];
};

const project = !!flag("--project");
const doList = !!flag("--list");
const doUpdate = !!flag("--update");
const destOverride = opt("--dest");
const to = opt("--to") ?? "all";
const targets = to === "all" ? ["opencode", "codex"] : [to];
if (targets.some((t) => !["opencode", "codex"].includes(t))) {
  console.error(`--to must be opencode, codex, or all (got: ${to})`);
  console.error("claude code and gemini have native installers; cursor reads agents/ as claude format.");
  process.exit(1);
}

if (doList) {
  for (const f of readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".md"))) {
    const a = parseAgent(join(AGENTS_DIR, f));
    console.log(`${a.name} — ${a.description.slice(0, 90)}`);
  }
} else if (doUpdate) {
  update(project);
} else {
  install(targets, argv, project, destOverride);
}
