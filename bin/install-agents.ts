#!/usr/bin/env bun
// agenticat agent converter/installer for harnesses without a native agent installer.
// claude code -> /plugin install agents@agenticat ; gemini -> gemini extensions install <repo>
// this script covers the gap: opencode + codex (cursor reads claude format natively).
//
// usage:
//   bun bin/install-agents.ts --to opencode|codex|all [--project] [--dest <dir>] [names...]
//   bun bin/install-agents.ts --update [--dest <dir>]  # reinstall the manifest's agents (a full install: the whole current catalog), apply renames, prune defs the catalog dropped; git pull unless --dest
//   bun bin/install-agents.ts --list

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { AGENT_NAME } from "./agent-name";

const REPO = dirname(dirname(fileURLToPath(import.meta.url))); // repo root (bin/..)
const AGENTS_DIR = join(REPO, "agents");
const MANIFEST = ".agenticat.json";

// claude alias -> opencode provider/model id. edit when models rotate.
const MODEL_MAP: Record<string, string> = {
  sonnet: "anthropic/claude-sonnet-5",
  opus: "anthropic/claude-opus-4-8",
  haiku: "anthropic/claude-haiku-4-5",
};

// claude agent name -> current name, for defs renamed since a manifest was written.
// a new rename re-points every older row to the new name: resolution is one hop.
const RENAMES: Record<string, string> = {
  "ts-reviewer": "web-reviewer",
  "frontend-builder": "web-pro",
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
  disallowedTools?: string[];
  model?: string;
  body: string;
}

const splitList = (v?: string) =>
  v ? v.split(",").map((t) => t.trim()).filter(Boolean) : undefined;

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
    tools: splitList(fm.tools),
    disallowedTools: splitList(fm.disallowedTools),
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
  } else if (a.disallowedTools) {
    // denylist form: everything else inherits, so only the denials are emitted.
    // an unmapped denial (NotebookEdit) is a no-op in opencode, not a warning.
    const denied = a.disallowedTools.map((t) => TOOL_MAP[t]).filter(Boolean);
    if (denied.length) {
      lines.push("tools:");
      for (const t of denied) lines.push(`  ${t}: false`);
    }
  }
  return `---\n${lines.join("\n")}\n---\n\n${a.body}\n`;
}

function toCodex(a: AgentDef): string {
  // Bash alone stays read-only: our read-only agents carry it for git diff/checks,
  // and codex's read-only sandbox still allows command execution, just no fs writes.
  // denylist form: read-only only when both write tools are denied; deny-Edit-only
  // agents (testers writing scratch/screenshots) still need workspace-write.
  const mutates = a.tools
    ? a.tools.some((t) => ["Write", "Edit"].includes(t))
    : a.disallowedTools
      ? !["Write", "Edit"].every((t) => a.disallowedTools!.includes(t))
      : true;
  // TOML literal multi-line string: no escape processing, so regex/backslashes in
  // bodies survive verbatim. A body containing ''' cannot be represented; fail loud.
  if (a.body.includes("'''")) throw new Error(`${a.name}: body contains ''' (unrepresentable in TOML literal string)`);
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

const fileName = (target: string, name: string) => `${name}${target === "opencode" ? ".md" : ".toml"}`;

function readCatalog(): AgentDef[] {
  return readdirSync(AGENTS_DIR)
    .filter((f: string) => f.endsWith(".md"))
    .map((f: string) => parseAgent(join(AGENTS_DIR, f)));
}

// names: null = the whole current catalog, [] = nothing. An empty list is not "all".
function install(targets: string[], names: string[] | null, project: boolean, destOverride?: string, catalog: AgentDef[] = readCatalog()) {
  const defs = names === null ? catalog : catalog.filter((a: AgentDef) => names.includes(a.name));
  const missing = names === null ? [] : names.filter((n: string) => !catalog.some((a: AgentDef) => a.name === n));
  if (missing.length) throw new Error(`unknown agents: ${missing.join(", ")} (see --list)`);
  for (const target of targets) {
    const dest = destFor(target, project, destOverride);
    mkdirSync(dest, { recursive: true });
    for (const a of defs) {
      const file = fileName(target, a.name);
      writeFileSync(join(dest, file), target === "opencode" ? toOpencode(a) : toCodex(a));
      console.log(`  ${target}: ${join(dest, file)}`);
    }
    writeFileSync(
      join(dest, MANIFEST),
      JSON.stringify({ source: REPO, target, project, all: names === null, agents: defs.map((d: AgentDef) => d.name), installedAt: new Date().toISOString() }, null, 2) + "\n",
    );
  }
  console.log(`installed ${defs.length} agent(s) -> ${targets.join(", ")}`);
}

function manifestNames(names: unknown[]): string[] {
  const valid: string[] = [];
  for (const name of names) {
    if (typeof name === "string" && AGENT_NAME.test(name)) valid.push(name);
    else console.warn(`  warn: manifest name ${JSON.stringify(name)} is not an agent name; skipped`);
  }
  return valid;
}

// the rename table can land before the catalog does: keep an old name the catalog still
// holds rather than delete it for a replacement that is not there yet.
function renameTarget(name: string, catalog: string[]): string | undefined {
  const renamed = RENAMES[name];
  return renamed && catalog.includes(renamed) ? renamed : undefined;
}

// fixed-list manifest -> current names, plus the old names whose converted files must go.
function reconcile(target: string, names: unknown[], catalog: string[]) {
  const wanted: string[] = [];
  const stale: string[] = [];
  for (const name of manifestNames(names)) {
    const renamed = renameTarget(name, catalog);
    const current = renamed ?? name;
    if (!catalog.includes(current)) {
      stale.push(name);
      continue;
    }
    if (current !== name) {
      console.log(`  ${target}: ${name} -> ${current}`);
      stale.push(name);
    }
    wanted.push(current);
  }
  return { wanted, stale };
}

function prune(dest: string, target: string, names: string[]) {
  for (const name of names) {
    const file = join(dest, fileName(target, name));
    if (!existsSync(file)) continue;
    unlinkSync(file);
    console.log(`  ${target}: removed ${file}`);
  }
}

const shellQuote = (p: string) => `'${p.replace(/'/g, "'\\''")}'`;

// the fix a malformed manifest's error prints must repair the install it names,
// from any directory: install.sh is relative to the repo and changes into it, so
// a cwd-relative location (a relative --dest, every --project) is replayed directly.
function reinstallCommand(target: string, project: boolean, destOverride?: string): string {
  if (destOverride) return `${shellQuote(join(REPO, "install.sh"))} --to ${target} --dest ${shellQuote(resolve(destOverride))}`;
  if (project) return `cd ${shellQuote(process.cwd())} && bun ${shellQuote(join(REPO, "bin/install-agents.ts"))} --to ${target} --project`;
  return `${shellQuote(join(REPO, "install.sh"))} --to ${target}`;
}

// a manifest feeds a path join and a rewrite, so validate it at the boundary before either.
function readManifest(path: string, reinstall: string): { agents: unknown[]; all: boolean } {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    throw new Error(`${path}: cannot read (${(err as { code?: string }).code}); remove or fix the permissions of that path, then reinstall with: ${reinstall}`);
  }
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${path}: not valid JSON (${(err as Error).message}); reinstall with: ${reinstall}`);
  }
  if (m === null || !Array.isArray((m as { agents?: unknown }).agents)) {
    throw new Error(`${path}: no "agents" array; reinstall with: ${reinstall}`);
  }
  const { agents, all } = m as { agents: unknown[]; all?: unknown };
  return { agents, all: all === true };
}

function update(project: boolean, destOverride?: string) {
  if (!destOverride) execFileSync("git", ["pull", "--ff-only"], { cwd: REPO, stdio: "inherit" });
  const catalog = readCatalog();
  const catalogNames = catalog.map((a: AgentDef) => a.name);
  // read and validate every present manifest before acting on any: a bad one must not
  // leave another target half-updated.
  const pending: { target: string; dest: string; agents: unknown[]; all: boolean }[] = [];
  for (const target of ["opencode", "codex"]) {
    const dest = destFor(target, project, destOverride);
    const mf = join(dest, MANIFEST);
    if (!existsSync(mf)) continue;
    pending.push({ target, dest, ...readManifest(mf, reinstallCommand(target, project, destOverride)) });
  }
  if (!pending.length) {
    console.log("no agenticat manifest found; nothing to update (install first)");
    return;
  }
  for (const { target, dest, agents, all } of pending) {
    let wanted: string[] | null = null;
    let stale: string[];
    if (all) {
      stale = manifestNames(agents).filter((n: string) => !catalogNames.includes(n));
      for (const name of stale) {
        const renamed = renameTarget(name, catalogNames);
        if (renamed) console.log(`  ${target}: ${name} -> ${renamed}`);
      }
    } else {
      // a manifest written before `all` existed carries no flag and stays a fixed list.
      ({ wanted, stale } = reconcile(target, agents, catalogNames));
    }
    install([target], wanted, project, destOverride, catalog);
    prune(dest, target, stale);
  }
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
  for (const a of readCatalog()) console.log(`${a.name}: ${a.description.slice(0, 90)}`);
} else if (doUpdate) {
  update(project, destOverride);
} else {
  install(targets, argv.length ? argv : null, project, destOverride);
}
