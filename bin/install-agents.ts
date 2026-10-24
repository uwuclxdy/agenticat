#!/usr/bin/env bun
// agenticat agent converter/installer for harnesses without a native agent installer.
// claude code -> /plugin install agents@agenticat ; gemini -> gemini extensions install <repo>
// this script covers the gap: opencode + codex (cursor reads claude format natively).
//
// usage: run with --help

import { accessSync, constants, lstatSync, mkdirSync, type Stats, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join, basename, dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { AGENT_NAME, allowDefect, grantsBash, OPENCODE_DENIES, quote, readFrontmatter, readMarkers, splitFrontmatter, stringField, writesFiles } from "./agent-name";

const REPO = dirname(dirname(fileURLToPath(import.meta.url))); // repo root (bin/..)
const AGENTS_DIR = join(REPO, "agents");
const MANIFEST = ".agenticat.json";

const USAGE = `usage: bun bin/install-agents.ts [--to opencode|codex|all] [--project] [--dest <dir>] [names...]
       bun bin/install-agents.ts --update [--project] [--dest <dir>]  # reinstall the manifest's agents (a full install: the whole current catalog), apply renames, prune defs the catalog dropped; git pull before reinstalling, unless --dest
       bun bin/install-agents.ts --list
       bun bin/install-agents.ts -h, --help`;

// bad input from the user or their files (an argument, an unknown agent, a malformed
// manifest, a target path that cannot be created, or a file path that is blocked or
// unwritable) throws this; the top-level catch prints the message alone, plus the usage
// for argument errors.
// a genuine failure rethrows and keeps its trace: a catalog defect, a git failure, or a
// write-time failure that is not about the path (space, quota or a resource limit, IO, or
// a missing code).
class InputError extends Error {
  constructor(message: string, readonly showUsage = false) {
    super(message);
  }
}

const refuse = (reason: string): never => {
  throw new InputError(reason, true);
};

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
// opencode inherits a tool unless it is named, so the allowlist form must emit each
// mutating tool the def does not grant as false; a granted bash stays true.
const MUTATING = ["write", "edit", "bash"];

interface AgentDef {
  name: string;
  description: string;
  tools?: string[];
  disallowedTools?: string[];
  model?: string;
  sandbox?: string;
  bashAllow: string[];
  body: string;
}

const splitList = (v?: string) =>
  v ? v.split(",").map((t) => t.trim()).filter(Boolean) : undefined;

function parseAgent(path: string): AgentDef {
  const raw = readFileSync(path, "utf8");
  const split = splitFrontmatter(raw);
  if (!split) throw new Error(`${path}: no frontmatter block`);
  const frontmatter = readFrontmatter(split.block);
  if ("defect" in frontmatter) throw new Error(`${path}: ${frontmatter.defect}`);
  const field = (key: string): string | undefined => {
    const reading = stringField(frontmatter.fields, key);
    if ("defect" in reading) throw new Error(`${path}: ${reading.defect}`);
    return reading.value;
  };
  const name = field("name");
  const description = field("description");
  if (!name || !description) throw new Error(`${path}: name + description required`);
  // both targets read the markers from here, so both refuse a defect before any write.
  const markers = readMarkers(split.block);
  if ("defect" in markers) throw new Error(`${name}: ${markers.defect}`);
  const def: AgentDef = {
    name,
    description,
    tools: splitList(field("tools")),
    disallowedTools: splitList(field("disallowedTools")),
    model: field("model"),
    // YAML comments, so no harness's frontmatter parser reads them as a key; the lint's
    // own exemptions live the same way.
    sandbox: markers.markers.sandbox,
    bashAllow: markers.markers.bashAllow,
    body: split.body.trim(),
  };
  // the allow checks are shared with the lint, so its gate previews every refusal here.
  const defect = allowDefect(def);
  if (defect) throw new Error(`${def.name}: ${defect}`);
  return def;
}

// the def grants a way to spawn a subagent, or names neither tool and inherits both.
function grantsAgents(a: AgentDef): boolean {
  if (a.tools) return a.tools.includes("Agent") || a.tools.includes("Task");
  if (a.disallowedTools) return !(a.disallowedTools.includes("Agent") || a.disallowedTools.includes("Task"));
  return true;
}

// opencode splits a command line into its commands and matches each command's text, and
// the LAST matching rule wins. the catch-all deny comes first, the read allows next, and
// every pattern that can write or spawn through an allowed read command comes last.
const OPENCODE_READS = [
  "rg *",
  "ls *",
  "cat *",
  "git log *",
  "git show *",
  "git blame *",
  "git diff-tree *",
  "git diff-index *",
  "git diff-files *",
  "git ls-files *",
  "git --no-optional-locks status *",
  "git merge-base *",
  "git rev-parse *",
  // exact, so `git hash-object -w x` stays denied; the unborn-repo fallback
  // `git diff-index -p "$(git hash-object -t tree /dev/null)"` needs it.
  "git hash-object -t tree /dev/null",
];

function toOpencode(a: AgentDef, announce = true): string {
  const lines = [`description: ${JSON.stringify(a.description)}`, "mode: subagent"];
  const model = a.model && MODEL_MAP[a.model];
  if (model) lines.push(`model: ${model}`);
  if (a.tools) {
    lines.push("tools:");
    // a repeated key makes opencode drop the whole frontmatter and grant every tool, so
    // each emitted key appears once.
    const mapped = [...new Set(a.tools.map((t) => TOOL_MAP[t]).filter(Boolean))];
    for (const t of mapped) lines.push(`  ${t}: true`);
    for (const t of MUTATING) if (!mapped.includes(t)) lines.push(`  ${t}: false`);
    const unknown = a.tools.filter((t) => !TOOL_MAP[t]);
    if (unknown.length && announce) console.warn(`  warn: ${a.name}: no opencode mapping for ${unknown.join(", ")}, skipped`);
  } else if (a.disallowedTools) {
    // denylist form: everything else inherits, so only the denials are emitted.
    // an unmapped denial (NotebookEdit) is a no-op in opencode, not a warning.
    const denied = [...new Set(a.disallowedTools.map((t) => TOOL_MAP[t]).filter(Boolean))];
    if (denied.length) {
      lines.push("tools:");
      for (const t of denied) lines.push(`  ${t}: false`);
    }
  }
  // a read-only def that grants bash needs the allowlist that keeps that bash from
  // writing; a def that denies Bash gets no map, since opencode puts permission rules
  // after the `tools:` booleans and the map would re-grant the tool. the task rule
  // follows the tools grant for every def, so it can stand without a bash map.
  const taskDenied = !grantsAgents(a);
  const bashMap = !writesFiles(a) && grantsBash(a);
  if (taskDenied || bashMap) {
    lines.push("permission:");
    if (taskDenied) lines.push("  task: deny");
    if (bashMap) {
      lines.push("  bash:");
      lines.push('    "*": deny');
      // a repeated key makes opencode drop the whole frontmatter and grant every tool, so
      // each allow key is emitted once, first occurrence wins.
      for (const pattern of new Set([...OPENCODE_READS, ...a.bashAllow])) lines.push(`    ${JSON.stringify(pattern)}: allow`);
      for (const pattern of OPENCODE_DENIES) lines.push(`    ${JSON.stringify(pattern)}: deny`);
    }
  }
  return `---\n${lines.join("\n")}\n---\n\n${a.body}\n`;
}

// a TOML basic string carries no raw control byte but tab and the CR of a CRLF pair;
// JSON.stringify escapes every C0 byte but leaves DEL raw, so a value holding one is a
// catalog defect like the ''' case below.
const TOML_VALUE_UNSAFE = /\x7f/;
const TOML_BODY_UNSAFE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]|\r(?!\n)/;

function toCodex(a: AgentDef): string {
  if (TOML_VALUE_UNSAFE.test(a.name)) throw new Error(`${quote(a.name)}: name holds a character TOML cannot carry`);
  if (TOML_VALUE_UNSAFE.test(a.description)) throw new Error(`${a.name}: description holds a character TOML cannot carry`);
  if (TOML_BODY_UNSAFE.test(a.body)) throw new Error(`${a.name}: body holds a control character TOML cannot carry`);
  // Bash alone stays read-only: our read-only agents carry it for git diff/checks,
  // and codex's read-only sandbox still allows command execution, just no fs writes.
  // denylist form: read-only only when both write tools are denied; deny-Edit-only
  // agents (testers writing scratch/screenshots) still need workspace-write.
  // a def whose Bash is its whole job writes no target file, so the tool grant alone
  // would call it read-only; the frontmatter marker opts it into a writable sandbox.
  const sandbox = writesFiles(a) ? "workspace-write" : "read-only";
  // TOML literal multi-line string: no escape processing, so regex/backslashes in
  // bodies survive verbatim. A body containing ''' cannot be represented; fail loud.
  if (a.body.includes("'''")) throw new Error(`${a.name}: body contains ''' (unrepresentable in TOML literal string)`);
  return [
    `name = ${JSON.stringify(a.name)}`,
    `description = ${JSON.stringify(a.description)}`,
    `sandbox_mode = ${JSON.stringify(sandbox)}`,
    "",
    `developer_instructions = '''`,
    a.body,
    `'''`,
    "",
  ].join("\n");
}

function destFor(target: string, project: boolean, override?: string): string {
  if (override !== undefined) return join(override, target);
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

const cannotCreate = (dest: string, reason?: string) =>
  new InputError(`${quote(dest)}: cannot create (${reason}); fix that path or pass a --dest that is a writable directory`);

const cannotWrite = (dest: string, reason?: string) =>
  new InputError(`${quote(dest)}: cannot write (${reason}); fix that path or pass a --dest that is a writable directory`);

const cannotRemove = (dest: string, reason?: string) =>
  new InputError(`${quote(dest)}: cannot remove (${reason}); fix that path or pass a --dest that is a writable directory`);

const cannotRead = (path: string, reason: string | undefined, reinstall: string) =>
  new InputError(`${quote(path)}: cannot read (${reason}); remove or fix the permissions of that path, then reinstall with: ${reinstall}`);

// a failure of the system, not of the path: space, quota, file-size or descriptor limits,
// buffers, or IO; it keeps its own trace.
const GENUINE_WRITE_CODES = ["ENOSPC", "EDQUOT", "EFBIG", "EMFILE", "ENFILE", "ENOMEM", "ENOBUFS", "EIO"];

// a write or unlink that fails after the preflight could not foresee it. a genuine system
// failure (space, quota, a resource limit, IO) or a missing code keeps its own trace;
// every other code is the path's own and becomes the matching refusal, which names the fix.
// bun's uncaught-error printer prints the message and the `path` property bare, and a `stack`
// materialized before the rewrite still says the original message, so all three get the
// escaped form; they are writable properties, so they are assigned, never deleted.
function fsError(path: string, err: unknown, verb: "create" | "write" | "remove"): Error {
  const code = (err as { code?: string }).code;
  if (code && !GENUINE_WRITE_CODES.includes(code)) {
    return { create: cannotCreate, write: cannotWrite, remove: cannotRemove }[verb](path, code);
  }
  const e = err as Error & { path?: unknown; stack?: unknown };
  const message = `${quote(path)}: cannot ${verb} (${code ?? "unexpected"})`;
  if (typeof e.stack === "string" && e.message) e.stack = e.stack.replace(e.message, () => message);
  e.message = message;
  if (typeof e.path === "string") e.path = quote(e.path).slice(1, -1);
  return e;
}

// a directory where a file goes, a dangling symlink (the write would follow it), a FIFO
// (the open would block) or a socket (the open would fail), an existing file the user cannot
// write, and a stat failure other than "not there yet" all refuse the write; finding them
// in the preflight keeps the failure from landing after another target was written. the
// stat follows a link, so a link to any of them is caught too; any other non-regular file
// (a character device such as /dev/full or /dev/null) is written through. a deliberate
// limit: a write the kernel refuses only when it happens (a device or a /proc file, which
// stats as a regular file) still lands after an earlier target was written, as the quoted
// refusal or trace.
function blockedWrite(p: string): string | undefined {
  let info;
  try {
    info = statSync(p);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== "ENOENT") return code;
    // a dangling symlink stats ENOENT like an absent path, but writeFileSync follows the
    // link and throws, so the preflight refuses it before any target has been written; a
    // symlink to an existing file stats normally and falls through to the write check.
    let isLink = false;
    try {
      isLink = lstatSync(p).isSymbolicLink();
    } catch {
      // absent: stat and lstat both read ENOENT
    }
    return isLink ? "a dangling symlink" : undefined;
  }
  if (info.isDirectory()) return "EISDIR";
  if (info.isFIFO()) return "a FIFO";
  if (info.isSocket()) return "a socket";
  try {
    accessSync(p, constants.W_OK);
  } catch (err) {
    return (err as { code?: string }).code;
  }
  return undefined;
}

// unlink refuses a real directory (EISDIR) and a mount point (EBUSY), and any other stat
// failure but "not there yet" is that path's own refusal; a symlink is removed itself
// whatever it points at. no preflight check tells a mount point apart reliably: a
// same-filesystem bind keeps its parent's device, and a mount table entry is hidden by a
// later mount over its parent, so the kernel's refusal lands at the prune, after the writes.
function blockedRemove(p: string): string | undefined {
  try {
    return lstatSync(p).isDirectory() ? "EISDIR" : undefined;
  } catch (err) {
    const reason = (err as { code?: string }).code;
    return reason === "ENOENT" ? undefined : reason;
  }
}

// a path whose nearest existing ancestor (or itself) is not a directory cannot be
// created, and an existing target dir (or the nearest ancestor when it does not exist
// yet) the user cannot write cannot be written; deriving both before any mkdir keeps a
// later target's failure from leaving an earlier target's directory behind.
function uncreatableCode(dest: string): { verb: "create" | "write"; code?: string } | undefined {
  let cur = resolve(dest);
  const missing: string[] = [];
  // lstat sees a dangling symlink; existsSync follows it and would walk past the link.
  // only ENOENT means the path may still be creatable from a higher ancestor: a symlink
  // loop is this path's own refusal.
  for (;;) {
    try {
      lstatSync(cur);
      break;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== "ENOENT" || dirname(cur) === cur) return { verb: "create", code };
      missing.unshift(basename(cur));
      cur = dirname(cur);
    }
  }
  // a component past the filesystem's name limit reports ENAMETOOLONG only where its
  // parent exists, so the walk above sees ENOENT under a missing ancestor; probing each
  // component under the nearest existing ancestor catches it before any mkdir runs.
  for (const part of missing) {
    try {
      lstatSync(join(cur, part));
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "ENAMETOOLONG") return { verb: "create", code };
    }
  }
  let isDir: boolean;
  try {
    isDir = statSync(cur).isDirectory();
  } catch (err) {
    return { verb: "create", code: (err as { code?: string }).code };
  }
  if (!isDir) return { verb: "create", code: "ENOTDIR" };
  try {
    // a dir the user can write but not search refuses every write inside it with EACCES,
    // so the write leg needs both bits.
    accessSync(cur, constants.W_OK | constants.X_OK);
  } catch (err) {
    return { verb: "write", code: (err as { code?: string }).code };
  }
  return undefined;
}

interface Plan {
  target: string;
  dest: string;
  files: { path: string; content: string }[];
  manifestPath: string;
  manifest: string;
  prune: string[];
}

// every rendered file is built here, before the first mkdir: a catalog defect throws
// before any target has been written.
function buildPlan(target: string, defs: AgentDef[], all: boolean, project: boolean, destOverride?: string, prune: string[] = [], announce = true): Plan {
  const dest = destFor(target, project, destOverride);
  return {
    target,
    dest,
    files: defs.map((a: AgentDef) => ({
      path: join(dest, fileName(target, a.name)),
      content: target === "opencode" ? toOpencode(a, announce) : toCodex(a),
    })),
    manifestPath: join(dest, MANIFEST),
    manifest: JSON.stringify({ source: REPO, target, project, all, agents: defs.map((d: AgentDef) => d.name), installedAt: new Date().toISOString() }, null, 2) + "\n",
    prune,
  };
}

// a dir-level refusal depends only on the dest paths; preflight runs it with the per-file
// checks, so both land before the first write.
function preflightDirs(dests: string[]) {
  for (const dest of dests) {
    const problem = uncreatableCode(dest);
    if (problem) throw problem.verb === "write" ? cannotWrite(dest, problem.code) : cannotCreate(dest, problem.code);
  }
}

// one preflight over every target's plan, so a failure on any one writes none of them.
function preflight(plans: Plan[]) {
  preflightDirs(plans.map((plan) => plan.dest));
  for (const plan of plans) {
    for (const path of [...plan.files.map((f) => f.path), plan.manifestPath]) {
      const reason = blockedWrite(path);
      if (reason) throw cannotWrite(path, reason);
    }
    for (const path of plan.prune) {
      const reason = blockedRemove(path);
      if (reason) throw cannotRemove(path, reason);
    }
  }
}

function apply(plans: Plan[]) {
  preflight(plans);
  for (const { dest } of plans) {
    try {
      mkdirSync(dest, { recursive: true });
    } catch (err) {
      throw fsError(dest, err, "create");
    }
  }
  for (const { target, files, manifestPath, manifest } of plans) {
    for (const file of files) {
      try {
        writeFileSync(file.path, file.content);
      } catch (err) {
        throw fsError(file.path, err, "write");
      }
      console.log(`  ${target}: ${quote(file.path)}`);
    }
    try {
      writeFileSync(manifestPath, manifest);
    } catch (err) {
      throw fsError(manifestPath, err, "write");
    }
  }
  for (const { target, prune } of plans) {
    for (const path of prune) {
      // unlink removes a link itself whatever it points at; only a path that is not there
      // at all skips the removal, so a stale link is dropped rather than left behind.
      try {
        unlinkSync(path);
      } catch (err) {
        if ((err as { code?: string }).code === "ENOENT") continue;
        throw fsError(path, err, "remove");
      }
      console.log(`  ${target}: removed ${quote(path)}`);
    }
  }
  for (const { target, files } of plans) console.log(`installed ${files.length} agent(s) -> ${target}`);
}

// names: null = the whole current catalog, [] = nothing. An empty list is not "all".
function install(targets: string[], names: string[] | null, project: boolean, destOverride?: string, catalog: AgentDef[] = readCatalog()) {
  const defs = names === null ? catalog : catalog.filter((a: AgentDef) => names.includes(a.name));
  const missing = names === null ? [] : names.filter((n: string) => !catalog.some((a: AgentDef) => a.name === n));
  if (missing.length) throw new InputError(`unknown agents: ${missing.map((n: string) => quote(n)).join(", ")} (see --list)`);
  apply(targets.map((target) => buildPlan(target, defs, names === null, project, destOverride)));
}

function manifestNames(names: unknown[], announce = true): string[] {
  const valid: string[] = [];
  for (const name of names) {
    if (typeof name === "string" && AGENT_NAME.test(name)) valid.push(name);
    else if (announce) console.warn(`  warn: manifest name ${quote(name)} is not an agent name; skipped`);
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
function reconcile(target: string, names: unknown[], catalog: string[], announce = true) {
  const wanted: string[] = [];
  const stale: string[] = [];
  for (const name of manifestNames(names, announce)) {
    const renamed = renameTarget(name, catalog);
    const current = renamed ?? name;
    if (!catalog.includes(current)) {
      stale.push(name);
      continue;
    }
    if (current !== name) {
      if (announce) console.log(`  ${target}: ${name} -> ${current}`);
      stale.push(name);
    }
    wanted.push(current);
  }
  return { wanted, stale };
}

// a newline in a path would split a one-line refusal, so a path holding any character in
// Unicode categories Cc, Cf, Zl or Zp (controls, format characters such as bidi overrides
// and zero-width marks, and line or paragraph separators) takes bash ANSI-C quoting; every
// other path keeps the plain single-quoted form. Each quoted character is emitted as its
// UTF-8 bytes, which is what bash reads back.
const ansiCQuote = (p: string) =>
  p
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t")
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, (c) =>
      [...Buffer.from(c, "utf8")].map((b) => `\\x${b.toString(16).padStart(2, "0")}`).join(""),
    );

const shellQuote = (p: string) =>
  /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(p) ? `$'${ansiCQuote(p)}'` : `'${p.replace(/'/g, "'\\''")}'`;

// the fix a malformed manifest's error prints must repair the install it names,
// from any directory: install.sh is relative to the repo and changes into it, so
// a cwd-relative location (a relative --dest, every --project) is replayed directly.
function reinstallCommand(target: string, project: boolean, destOverride?: string): string {
  if (destOverride !== undefined) return `${shellQuote(join(REPO, "install.sh"))} --to ${target} --dest ${shellQuote(resolve(destOverride))}`;
  if (project) return `cd ${shellQuote(process.cwd())} && bun ${shellQuote(join(REPO, "bin/install-agents.ts"))} --to ${target} --project`;
  return `${shellQuote(join(REPO, "install.sh"))} --to ${target}`;
}

// a manifest feeds a path join and a rewrite, so validate it at the boundary before either;
// the caller's stat refuses a FIFO or a device, whose read never ends (it blocks, or runs
// out of memory), before the open.
function readManifest(path: string, info: Stats | undefined, reinstall: string): { agents: unknown[]; all: boolean } {
  if (info?.isFIFO()) throw cannotRead(path, "a FIFO", reinstall);
  if (info?.isCharacterDevice() || info?.isBlockDevice()) throw cannotRead(path, "a device", reinstall);
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    throw cannotRead(path, (err as { code?: string }).code, reinstall);
  }
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch (err) {
    // the parser quotes the offending input, so a raw control byte from the manifest
    // would reach stderr; the quoted message keeps the refusal one clean line.
    throw new InputError(`${quote(path)}: not valid JSON (${quote((err as Error).message)}); reinstall with: ${reinstall}`);
  }
  if (m === null || !Array.isArray((m as { agents?: unknown }).agents)) {
    throw new InputError(`${quote(path)}: no "agents" array; reinstall with: ${reinstall}`);
  }
  const { agents, all } = m as { agents: unknown[]; all?: unknown };
  return { agents, all: all === true };
}

function update(project: boolean, destOverride?: string) {
  // read and validate every present manifest before acting on any: a bad one must not
  // leave another target half-updated.
  const pending: { target: string; dest: string; agents: unknown[]; all: boolean }[] = [];
  for (const target of ["opencode", "codex"]) {
    const dest = destFor(target, project, destOverride);
    const mf = join(dest, MANIFEST);
    // existsSync reads an EACCES as absent; only a manifest the path layout says is not
    // there may skip its target, and anything else reaches readManifest, which refuses a
    // FIFO from this stat and every other failure with its read error.
    let info: Stats | undefined;
    try {
      info = statSync(mf);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "ENOENT" || code === "ENOTDIR") continue;
    }
    pending.push({ target, dest, ...readManifest(mf, info, reinstallCommand(target, project, destOverride)) });
  }
  if (!pending.length) {
    console.log("no agenticat manifest found; nothing to update (install first)");
    return;
  }
  // every manifest is validated before the pull, so a malformed one leaves the checkout
  // where it was. when the local catalog can be read, the plan and its full preflight run
  // against it too, so a blocked path the current catalog already plans refuses before the
  // pull; after it, only a path the pulled catalog newly adds can still reach the preflight late.
  const plan = (catalog: AgentDef[], announce: boolean) => {
    const catalogNames = catalog.map((a: AgentDef) => a.name);
    return pending.map(({ target, dest, agents, all }) => {
      let wanted: string[] | null = null;
      let stale: string[];
      if (all) {
        stale = manifestNames(agents, announce).filter((n: string) => !catalogNames.includes(n));
        if (announce) {
          for (const name of stale) {
            const renamed = renameTarget(name, catalogNames);
            if (renamed) console.log(`  ${target}: ${name} -> ${renamed}`);
          }
        }
      } else {
        // a manifest written before `all` existed carries no flag and stays a fixed list.
        ({ wanted, stale } = reconcile(target, agents, catalogNames, announce));
      }
      const defs = wanted === null ? catalog : catalog.filter((a: AgentDef) => wanted!.includes(a.name));
      return buildPlan(target, defs, all, project, destOverride, stale.map((name) => join(dest, fileName(target, name))), announce);
    });
  };
  if (destOverride === undefined) {
    // a dir-level refusal needs no catalog, so it lands before the pull even when the local
    // catalog is too broken to plan. a defect in the local catalog is what this pull may
    // repair, so the rest of the pre-pull pass only refuses on an InputError (a path refusal
    // the checkout already shows) and swallows any other read, parse or render error for this
    // pass alone; the post-pull pass fails loudly with the trace if the defect survived. it
    // stays silent so nothing prints twice.
    preflightDirs(pending.map(({ dest }) => dest));
    try {
      preflight(plan(readCatalog(), false));
    } catch (err) {
      if (err instanceof InputError) throw err;
    }
    execFileSync("git", ["pull", "--ff-only"], { cwd: REPO, stdio: "inherit" });
  }
  apply(plan(readCatalog(), true));
}

// --- args
function main(): void {
  const argv = process.argv.slice(2);

  // help wins over every other argument, a mistyped one included.
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    process.exit(0);
  }

  let destOverride: string | undefined;
  let to: string | undefined;
  let project = false;
  let doList = false;
  let doUpdate = false;
  // one table per kind drives both the branch and the known-option set, so a new option
  // cannot be added to one and missed in the other.
  const valueSetters: Record<string, (value: string) => void> = {
    "--dest": (value) => { destOverride = value; },
    "--to": (value) => { to = value; },
  };
  const flagSetters: Record<string, () => void> = {
    "--project": () => { project = true; },
    "--list": () => { doList = true; },
    "--update": () => { doUpdate = true; },
  };
  // also the set that ends an option's value: a known flag right after --dest/--to
  // refuses the run instead of becoming its value.
  const KNOWN_OPTS = [...Object.keys(valueSetters), ...Object.keys(flagSetters)];
  const seen = new Set<string>();
  const leftover: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (Object.hasOwn(valueSetters, a)) {
      if (seen.has(a)) refuse(`${a} given twice`);
      seen.add(a);
      const next = argv[i + 1];
      // an empty --dest would read as absent downstream and install into the real HOME;
      // an empty --to still reaches the value check below, which names it.
      if (next === undefined || next === "--" || KNOWN_OPTS.includes(next) || (a === "--dest" && next === ""))
        refuse(`${a} needs a value`);
      valueSetters[a](next);
      i++;
    } else if (Object.hasOwn(flagSetters, a)) {
      if (seen.has(a)) refuse(`${a} given twice`);
      seen.add(a);
      flagSetters[a]();
    } else {
      leftover.push(a);
    }
  }

  // agent names never start with "-" (AGENT_NAME), so a leftover dash token is a mistyped
  // flag: refuse it by name instead of throwing it as an unknown agent.
  const unknownOptions = leftover.filter((a) => a.startsWith("-"));
  if (unknownOptions.length) {
    refuse(
      unknownOptions.length === 1
        ? `unknown option: ${quote(unknownOptions[0])}`
        : `unknown options: ${unknownOptions.map((n) => quote(n)).join(", ")}`,
    );
  }
  const names = leftover;

  if (to !== undefined && !["opencode", "codex", "all"].includes(to)) {
    refuse(`--to must be opencode, codex, or all (got: ${quote(to)}); claude code and gemini have native installers, cursor reads agents/ as claude format`);
  }
  const targets = to === undefined || to === "all" ? ["opencode", "codex"] : [to];

  if (doUpdate && doList) refuse("--list and --update are separate modes");
  if (doList && destOverride !== undefined) refuse("--dest has no effect with --list");
  if (doList && project) refuse("--project has no effect with --list");
  if (to !== undefined && doUpdate) refuse("--to has no effect with --update");
  if (to !== undefined && doList) refuse("--to has no effect with --list");
  if (doUpdate && names.length) refuse(`--update takes no agent names: ${names.map((n) => quote(n)).join(", ")}`);
  if (doList && names.length) refuse(`--list takes no agent names: ${names.map((n) => quote(n)).join(", ")}`);

  if (doList) {
    for (const a of readCatalog()) console.log(`${a.name}: ${a.description.slice(0, 90)}`);
  } else if (doUpdate) {
    update(project, destOverride);
  } else {
    install(targets, names.length ? names : null, project, destOverride);
  }
}

try {
  main();
} catch (err) {
  if (err instanceof InputError) {
    console.error(err.message);
    if (err.showUsage) console.error(USAGE);
    process.exit(1);
  }
  throw err;
}
