// Runs the converter as a subprocess against a throwaway catalog: the script is copied
// beside a fixture agents/ dir, so it resolves that dir as its repo, and every run gets a
// scratch HOME and an explicit --dest, so no real user path is read or written.

import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// every case spawns a bun subprocess or sets up a tree, so a loaded box can push one past
// bun's 5000 ms default without the case doing anything wrong.
setDefaultTimeout(30000);

const SCRIPT = join(import.meta.dir, "install-agents.ts");
const MANIFEST = ".agenticat.json";
const scratch: string[] = [];

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function agentDef(name: string): string {
  return `---\nname: ${name}\ndescription: "fixture ${name}"\n---\n\nbody of ${name}\n`;
}

// A throwaway repo (bin/ + agents/) plus a separate dest dir and HOME.
function fixture(names: string[]) {
  const root = mkdtempSync(join(tmpdir(), "agenticat-installer-"));
  scratch.push(root);
  const repo = join(root, "repo");
  mkdirSync(join(repo, "bin"), { recursive: true });
  mkdirSync(join(repo, "agents"), { recursive: true });
  copyFileSync(SCRIPT, join(repo, "bin", "install-agents.ts"));
  copyFileSync(join(import.meta.dir, "agent-name.ts"), join(repo, "bin", "agent-name.ts"));
  const addDef = (name: string) => writeFileSync(join(repo, "agents", `${name}.md`), agentDef(name));
  const dropDef = (name: string) => rmSync(join(repo, "agents", `${name}.md`));
  for (const name of names) addDef(name);
  const dest = join(root, "dest");
  const home = join(root, "home");
  mkdirSync(home);
  const runIn = (cwd: string, ...args: string[]) =>
    spawnSync("bun", [join(repo, "bin", "install-agents.ts"), ...args], {
      cwd,
      env: { ...process.env, HOME: home },
      encoding: "utf8",
    });
  const run = (...args: string[]) => runIn(root, ...args);
  return { root, repo, dest, home, run, runIn, addDef, dropDef };
}

function writeManifest(dir: string, target: string, agents: string[]) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, MANIFEST),
    JSON.stringify({ source: "/old/checkout", target, project: false, agents, installedAt: "2026-10-01T00:00:00.000Z" }) + "\n",
  );
}

const readManifest = (dir: string) => JSON.parse(readFileSync(join(dir, MANIFEST), "utf8"));

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

describe("--update --dest", () => {
  test("carries a renamed agent to its new name and deletes the old converted file", () => {
    const f = fixture(["web-reviewer", "web-pro"]);
    const codex = join(f.dest, "codex");
    writeManifest(codex, "codex", ["ts-reviewer", "frontend-builder"]);
    writeFileSync(join(codex, "ts-reviewer.toml"), "stale\n");
    writeFileSync(join(codex, "frontend-builder.toml"), "stale\n");

    const r = f.run("--update", "--dest", f.dest);

    expect(r.stderr).not.toContain("unknown agents");
    expect(r.status).toBe(0);
    expect(existsSync(join(codex, "web-reviewer.toml"))).toBe(true);
    expect(existsSync(join(codex, "web-pro.toml"))).toBe(true);
    expect(existsSync(join(codex, "ts-reviewer.toml"))).toBe(false);
    expect(existsSync(join(codex, "frontend-builder.toml"))).toBe(false);
    expect([...readManifest(codex).agents].sort()).toEqual(["web-pro", "web-reviewer"]);
    expect(r.stdout).toContain("ts-reviewer -> web-reviewer");
    expect(r.stdout).toContain("frontend-builder -> web-pro");
  });

  test("a manifest naming both the old and the new name installs the new one once", () => {
    const f = fixture(["web-reviewer"]);
    const codex = join(f.dest, "codex");
    writeManifest(codex, "codex", ["ts-reviewer", "web-reviewer"]);

    const r = f.run("--update", "--dest", f.dest);

    expect(r.status).toBe(0);
    expect(readManifest(codex).agents).toEqual(["web-reviewer"]);
  });

  test("drops a name the catalog no longer holds and deletes its converted file", () => {
    const f = fixture(["kept"]);
    const opencode = join(f.dest, "opencode");
    writeManifest(opencode, "opencode", ["gone", "kept"]);
    writeFileSync(join(opencode, "gone.md"), "stale\n");

    const r = f.run("--update", "--dest", f.dest);

    expect(r.status).toBe(0);
    expect(existsSync(join(opencode, "gone.md"))).toBe(false);
    expect(existsSync(join(opencode, "kept.md"))).toBe(true);
    expect(readManifest(opencode).agents).toEqual(["kept"]);
  });

  test("a named manifest whose every name left the catalog installs nothing else", () => {
    const f = fixture(["unrelated"]);
    const codex = join(f.dest, "codex");
    writeManifest(codex, "codex", ["gone"]);
    writeFileSync(join(codex, "gone.toml"), "stale\n");

    const r = f.run("--update", "--dest", f.dest);

    expect(r.status).toBe(0);
    expect(existsSync(join(codex, "gone.toml"))).toBe(false);
    expect(existsSync(join(codex, "unrelated.toml"))).toBe(false);
  });

  test("never deletes a file outside the target dir for a manifest name that is not an agent name", () => {
    const f = fixture(["kept"]);
    const codex = join(f.dest, "codex");
    writeManifest(codex, "codex", ["../outside", "kept"]);
    writeFileSync(join(f.dest, "outside.toml"), "not ours\n");

    const r = f.run("--update", "--dest", f.dest);

    expect(r.status).toBe(0);
    expect(existsSync(join(f.dest, "outside.toml"))).toBe(true);
    expect(existsSync(join(codex, "kept.toml"))).toBe(true);
    expect(r.stderr).toContain('"../outside"');
  });

  test("a malformed manifest stops the other target's valid manifest too", () => {
    const f = fixture(["kept"]);
    const opencode = join(f.dest, "opencode");
    const codex = join(f.dest, "codex");
    writeManifest(opencode, "opencode", ["gone", "kept"]);
    writeFileSync(join(opencode, "gone.md"), "stale\n");
    const opencodeManifest = readFileSync(join(opencode, MANIFEST), "utf8");
    mkdirSync(codex, { recursive: true });
    writeFileSync(join(codex, MANIFEST), JSON.stringify({ target: "codex", agents: "kept" }));

    const r = f.run("--update", "--dest", f.dest);

    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain(`${JSON.stringify(join(codex, MANIFEST))}: no "agents" array`);
    expect(existsSync(join(opencode, "gone.md"))).toBe(true);
    expect(existsSync(join(opencode, "kept.md"))).toBe(false);
    expect(readFileSync(join(opencode, MANIFEST), "utf8")).toBe(opencodeManifest);
  });

  test("a malformed manifest's error names the reinstall command for the same location", () => {
    const f = fixture(["kept"]);
    const codex = join(f.dest, "codex");
    mkdirSync(codex, { recursive: true });
    writeFileSync(join(codex, MANIFEST), "{\"agents\": [");

    const r = f.run("--update", "--dest", f.dest);

    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain(`reinstall with: '${join(f.repo, "install.sh")}' --to codex --dest '${f.dest}'`);
  });

  test("a relative --dest is printed resolved, so the reinstall command works from any directory", () => {
    const f = fixture(["kept"]);
    const work = join(f.root, "work");
    const codex = join(work, "rel", "codex");
    mkdirSync(codex, { recursive: true });
    writeFileSync(join(codex, MANIFEST), "{\"agents\": [");

    const r = f.runIn(work, "--update", "--dest", "rel");

    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain(`reinstall with: '${join(f.repo, "install.sh")}' --to codex --dest '${join(work, "rel")}'`);
  });

  test("--dest wins over --project in the reinstall command, since it sets the location", () => {
    const f = fixture(["kept"]);
    const codex = join(f.dest, "codex");
    mkdirSync(codex, { recursive: true });
    writeFileSync(join(codex, MANIFEST), "{\"agents\": [");

    const r = f.run("--update", "--project", "--dest", f.dest);

    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain(`reinstall with: '${join(f.repo, "install.sh")}' --to codex --dest '${f.dest}'`);
  });

  test("a quote in --dest is shell-escaped in the reinstall command", () => {
    const f = fixture(["kept"]);
    const dest = join(f.root, "it's");
    const codex = join(dest, "codex");
    mkdirSync(codex, { recursive: true });
    writeFileSync(join(codex, MANIFEST), "{\"agents\": [");

    const r = f.run("--update", "--dest", dest);

    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain(`--dest '${join(f.root, "it")}'\\''s'`);
  });

  test("an unreadable manifest reports the read error, not a parse error", () => {
    const f = fixture(["kept"]);
    const codex = join(f.dest, "codex");
    mkdirSync(join(codex, MANIFEST), { recursive: true });

    const r = f.run("--update", "--dest", f.dest);

    expect(r.status).not.toBe(0);
    expect(r.stderr).toBe(
      `${JSON.stringify(join(codex, MANIFEST))}: cannot read (EISDIR); remove or fix the permissions of that path, then reinstall with: '${join(f.repo, "install.sh")}' --to codex --dest '${f.dest}'\n`,
    );
  });

  test("a malformed manifest's refusal opens on the quoted path", () => {
    const f = fixture(["kept"]);
    const codex = join(f.dest, "codex");
    mkdirSync(codex, { recursive: true });
    writeFileSync(join(codex, MANIFEST), "{\"agents\": [");

    const r = f.run("--update", "--dest", f.dest);

    expect(r.status).toBe(1);
    expect(r.stderr.startsWith(`${JSON.stringify(join(codex, MANIFEST))}: not valid JSON (`)).toBe(true);
  });

  test("a control character in --dest is ANSI-C quoted, so a manifest refusal stays one line", () => {
    const f = fixture(["kept"]);
    const dest = join(f.root, "n\nl");
    const codex = join(dest, "codex");
    mkdirSync(codex, { recursive: true });
    writeFileSync(join(codex, MANIFEST), "{\"agents\": [");

    const r = f.run("--update", "--dest", dest);

    expect(r.status).toBe(1);
    expect(r.stderr.split("\n")).toHaveLength(2);
    expect(r.stderr.startsWith(`${JSON.stringify(join(codex, MANIFEST))}: not valid JSON (`)).toBe(true);
    expect(r.stderr.endsWith(`reinstall with: '${join(f.repo, "install.sh")}' --to codex --dest $'${join(f.root, "n")}\\nl'\n`)).toBe(true);
  });

  test("a control byte in a malformed manifest never reaches stderr raw", () => {
    const f = fixture(["kept"]);
    const codex = join(f.dest, "codex");
    mkdirSync(codex, { recursive: true });
    writeFileSync(join(codex, MANIFEST), "{\x1b");

    const r = f.run("--update", "--dest", f.dest);

    expect(r.status).toBe(1);
    expect(r.stderr.startsWith(`${JSON.stringify(join(codex, MANIFEST))}: not valid JSON (`)).toBe(true);
    expect(r.stderr.slice(0, -1)).not.toMatch(/[\x00-\x1f\x7f]/);
    expect(r.stderr.endsWith("\n")).toBe(true);
  });

  test("keeps an old name while its rename target is not in the catalog yet", () => {
    const f = fixture(["ts-reviewer"]);
    const codex = join(f.dest, "codex");
    writeManifest(codex, "codex", ["ts-reviewer"]);
    writeFileSync(join(codex, "ts-reviewer.toml"), "stale\n");

    const r = f.run("--update", "--dest", f.dest);

    expect(r.status).toBe(0);
    expect(existsSync(join(codex, "ts-reviewer.toml"))).toBe(true);
    expect(readManifest(codex).agents).toEqual(["ts-reviewer"]);
    expect(r.stdout).not.toContain("ts-reviewer -> web-reviewer");
  });

  test.each([
    ["a string agents field", JSON.stringify({ target: "codex", agents: "kept" })],
    ["an object agents field", JSON.stringify({ target: "codex", agents: { 0: "kept" } })],
    ["a top-level array", JSON.stringify(["kept"])],
    ["null", "null"],
    ["invalid JSON", "{\"agents\": ["],
  ])("fails loudly on a manifest holding %s and leaves it untouched", (_label, content) => {
    const f = fixture(["kept"]);
    const codex = join(f.dest, "codex");
    mkdirSync(codex, { recursive: true });
    writeFileSync(join(codex, MANIFEST), content);

    const r = f.run("--update", "--dest", f.dest);

    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain(join(codex, MANIFEST));
    expect(readFileSync(join(codex, MANIFEST), "utf8")).toBe(content);
    expect(existsSync(join(codex, "kept.toml"))).toBe(false);
  });

  test("reads only the manifests under --dest, never the HOME install dirs", () => {
    const f = fixture(["kept"]);
    const homeCodex = join(f.home, ".codex", "agents");
    writeManifest(homeCodex, "codex", ["kept"]);
    writeManifest(join(f.dest, "opencode"), "opencode", ["kept"]);

    const r = f.run("--update", "--dest", f.dest);

    expect(r.status).toBe(0);
    expect(existsSync(join(f.dest, "opencode", "kept.md"))).toBe(true);
    expect(existsSync(join(homeCodex, "kept.toml"))).toBe(false);
  });
});

describe("full installs follow the catalog", () => {
  test("a no-names install picks up an agent added to the catalog later", () => {
    const f = fixture(["a"]);
    expect(f.run("--to", "codex", "--dest", f.dest).status).toBe(0);
    f.addDef("b");

    const r = f.run("--update", "--dest", f.dest);

    expect(r.status).toBe(0);
    expect(existsSync(join(f.dest, "codex", "b.toml"))).toBe(true);
    expect([...readManifest(join(f.dest, "codex")).agents].sort()).toEqual(["a", "b"]);
  });

  test("a no-names install prunes an agent deleted from the catalog", () => {
    const f = fixture(["a", "b"]);
    expect(f.run("--to", "codex", "--dest", f.dest).status).toBe(0);
    f.dropDef("a");

    const r = f.run("--update", "--dest", f.dest);

    expect(r.status).toBe(0);
    expect(existsSync(join(f.dest, "codex", "a.toml"))).toBe(false);
    expect(readManifest(join(f.dest, "codex")).agents).toEqual(["b"]);
  });

  test("prints the rename line when a full install's agent was renamed", () => {
    const f = fixture(["web-reviewer"]);
    const codex = join(f.dest, "codex");
    writeManifest(codex, "codex", ["ts-reviewer"]);
    const manifest = readManifest(codex);
    writeFileSync(join(codex, MANIFEST), JSON.stringify({ ...manifest, all: true }) + "\n");
    writeFileSync(join(codex, "ts-reviewer.toml"), "stale\n");

    const r = f.run("--update", "--dest", f.dest);

    expect(r.status).toBe(0);
    expect(r.stdout).toContain("ts-reviewer -> web-reviewer");
    expect(existsSync(join(codex, "ts-reviewer.toml"))).toBe(false);
    expect(existsSync(join(codex, "web-reviewer.toml"))).toBe(true);
  });

  test("never deletes a file outside the target dir for a full install's manifest name either", () => {
    const f = fixture(["kept"]);
    const codex = join(f.dest, "codex");
    writeManifest(codex, "codex", ["../outside"]);
    const manifest = readManifest(codex);
    writeFileSync(join(codex, MANIFEST), JSON.stringify({ ...manifest, all: true }) + "\n");
    writeFileSync(join(f.dest, "outside.toml"), "not ours\n");

    const r = f.run("--update", "--dest", f.dest);

    expect(r.status).toBe(0);
    expect(existsSync(join(f.dest, "outside.toml"))).toBe(true);
    expect(existsSync(join(codex, "kept.toml"))).toBe(true);
  });

  test("a named install stays the named list after the catalog grows", () => {
    const f = fixture(["a"]);
    expect(f.run("--to", "codex", "--dest", f.dest, "a").status).toBe(0);
    f.addDef("b");

    const r = f.run("--update", "--dest", f.dest);

    expect(r.status).toBe(0);
    expect(existsSync(join(f.dest, "codex", "b.toml"))).toBe(false);
    expect(readManifest(join(f.dest, "codex")).agents).toEqual(["a"]);
  });
});

describe("argument parsing", () => {
  const USAGE_FORMS = ["[--to opencode|codex|all]", "--update [--project] [--dest <dir>]", "--list", "--help"];

  const TO_REASON = (value: string) =>
    `--to must be opencode, codex, or all (got: ${JSON.stringify(value)}); claude code and gemini have native installers, cursor reads agents/ as claude format`;

  // bun itself creates HOME/.bun on every run; anything else in HOME or the cwd is a write.
  const written = (dir: string) => readdirSync(dir).filter((entry) => entry !== ".bun");

  test.each([[["--help"]], [["-h"]], [["--bogus", "--help"]], [["web-pro", "-h"]], [["--to", "codex", "--help"]]])("%j prints the usage and installs nothing", (args) => {
    const f = fixture(["web-pro"]);

    const r = f.run(...args, "--dest", f.dest);

    expect(r.status).toBe(0);
    expect(r.stderr).toBe("");
    for (const form of USAGE_FORMS) expect(r.stdout).toContain(form);
    expect(existsSync(f.dest)).toBe(false);
  });

  // Each refusal: exit 1, the named reason on stderr's first line, the usage after it,
  // and nothing written to the cwd or to HOME (where a missing --dest installs).
  test.each([
    [["--bogus"], 'unknown option: "--bogus"'],
    [["--bogus", "-z"], 'unknown options: "--bogus", "-z"'],
    [["--to", "codex", "--dest"], "--dest needs a value"],
    [["--dest", "--to", "codex"], "--dest needs a value"],
    [["--to", "codex", "--dest", "", "web-pro"], "--dest needs a value"],
    [["--to", "codex", "--dest", "--", "web-pro"], "--dest needs a value"],
    [["--to"], "--to needs a value"],
    [["--to", "--list"], "--to needs a value"],
    [["--to", "--"], "--to needs a value"],
    [["--to", "claude"], TO_REASON("claude")],
    [["--to", ""], TO_REASON("")],
    [["--to", "co\ndex"], TO_REASON("co\ndex")],
    [["--dest", "a", "--dest", "b"], "--dest given twice"],
    [["--project", "--project"], "--project given twice"],
    [["--update", "web-pro"], '--update takes no agent names: "web-pro"'],
    [["--update", "web-pro", "x"], '--update takes no agent names: "web-pro", "x"'],
    [["--list", "web-pro"], '--list takes no agent names: "web-pro"'],
    [["--list", "web-pro", "x"], '--list takes no agent names: "web-pro", "x"'],
    [["--update", "--to", "codex"], "--to has no effect with --update"],
    [["--list", "--to", "codex"], "--to has no effect with --list"],
    [["--update", "--list"], "--list and --update are separate modes"],
    [["--list", "--dest", "x"], "--dest has no effect with --list"],
    [["--list", "--project"], "--project has no effect with --list"],
  ])("%j is refused with its reason and the usage", (args, reason) => {
    const f = fixture(["web-pro"]);
    const cwd = join(f.root, "cwd");
    mkdirSync(cwd);

    const r = f.runIn(cwd, ...args);

    expect(r.status).toBe(1);
    expect(r.stdout).toBe("");
    const [first, ...rest] = r.stderr.split("\n");
    expect(first).toBe(reason);
    for (const form of USAGE_FORMS) expect(rest.join("\n")).toContain(form);
    expect(written(cwd)).toEqual([]);
    expect(written(f.home)).toEqual([]);
  });

  // A fresh cwd and no --dest, so a refusal that still installs lands in HOME or the cwd.
  test.each([
    [["nosuch", "nope"], 'unknown agents: "nosuch", "nope" (see --list)'],
    [["toString", "web-pro"], 'unknown agents: "toString" (see --list)'],
  ])("%j: unknown agent names are refused in one line, with no stack trace", (names, reason) => {
    const f = fixture(["web-pro"]);
    const cwd = join(f.root, "cwd");
    mkdirSync(cwd);

    const r = f.runIn(cwd, "--to", "codex", ...names);

    expect(r.status).toBe(1);
    expect(r.stderr).toBe(`${reason}\n`);
    expect(written(cwd)).toEqual([]);
    expect(written(f.home)).toEqual([]);
  });

  test("a --dest value that only starts with a dash is a directory name", () => {
    const f = fixture(["web-pro"]);

    const r = f.runIn(f.root, "--to", "codex", "--dest", "-x", "web-pro");

    expect(r.status).toBe(0);
    expect(existsSync(join(f.root, "-x", "codex", "web-pro.toml"))).toBe(true);
  });

  const HINT = "fix that path or pass a --dest that is a writable directory";

  test("a target dir that cannot be created is refused in one line before any target is written", () => {
    const f = fixture(["web-pro"]);
    const cwd = join(f.root, "cwd");
    mkdirSync(cwd);
    mkdirSync(f.dest);
    writeFileSync(join(f.dest, "codex"), "a file where the codex dir would go\n");

    const r = f.runIn(cwd, "--dest", f.dest, "web-pro");

    expect(r.status).toBe(1);
    expect(r.stderr).toBe(`${JSON.stringify(join(f.dest, "codex"))}: cannot create (ENOTDIR); ${HINT}\n`);
    expect(existsSync(join(f.dest, "opencode"))).toBe(false);
    expect(written(cwd)).toEqual([]);
    expect(written(f.home)).toEqual([]);
  });

  test("a file in an ancestor of the HOME install dir is refused before the other target's dir is made", () => {
    const f = fixture(["web-pro"]);
    const cwd = join(f.root, "cwd");
    mkdirSync(cwd);
    writeFileSync(join(f.home, ".codex"), "a file where the codex dir would go\n");

    const r = f.runIn(cwd, "web-pro");

    expect(r.status).toBe(1);
    expect(r.stderr).toBe(`${JSON.stringify(join(f.home, ".codex", "agents"))}: cannot create (ENOTDIR); ${HINT}\n`);
    expect(existsSync(join(f.home, ".config"))).toBe(false);
    expect(written(cwd)).toEqual([]);
    expect(written(f.home)).toEqual([".codex"]);
  });

  test("a dangling symlink where a target dir goes is refused in one line before any target is written", () => {
    const f = fixture(["web-pro"]);
    const cwd = join(f.root, "cwd");
    mkdirSync(cwd);
    mkdirSync(f.dest);
    symlinkSync(join(f.root, "nowhere"), join(f.dest, "codex"));

    const r = f.runIn(cwd, "--dest", f.dest, "web-pro");

    expect(r.status).toBe(1);
    expect(r.stderr).toBe(`${JSON.stringify(join(f.dest, "codex"))}: cannot create (ENOENT); ${HINT}\n`);
    expect(existsSync(join(f.dest, "opencode"))).toBe(false);
    expect(written(cwd)).toEqual([]);
    expect(written(f.home)).toEqual([]);
  });

  test("a path with a newline stays a one-line reason", () => {
    const f = fixture(["web-pro"]);
    const cwd = join(f.root, "cwd");
    mkdirSync(cwd);
    const dest = join(f.root, "a\nb");
    writeFileSync(dest, "a file where --dest points\n");

    const r = f.runIn(cwd, "--dest", dest, "web-pro");

    expect(r.status).toBe(1);
    expect(r.stderr).toBe(`${JSON.stringify(join(dest, "opencode"))}: cannot create (ENOTDIR); ${HINT}\n`);
    expect(written(cwd)).toEqual([]);
    expect(written(f.home)).toEqual([]);
  });

  // chmod binds nothing for root, so these run only as a regular user.
  const asUser = process.getuid?.() === 0 ? test.skip : test;

  asUser("an existing target dir the user cannot write is refused in one line before any target is written", () => {
    const f = fixture(["web-pro"]);
    const cwd = join(f.root, "cwd");
    mkdirSync(cwd);
    const codex = join(f.dest, "codex");
    mkdirSync(codex, { recursive: true });
    chmodSync(codex, 0o555);

    const r = f.runIn(cwd, "--dest", f.dest, "web-pro");
    chmodSync(codex, 0o755);

    expect(r.status).toBe(1);
    expect(r.stderr).toBe(`${JSON.stringify(codex)}: cannot write (EACCES); ${HINT}\n`);
    expect(existsSync(join(f.dest, "opencode"))).toBe(false);
    expect(written(cwd)).toEqual([]);
    expect(written(f.home)).toEqual([]);
  });

  asUser("--update refuses an unwritable target before updating the other one", () => {
    const f = fixture(["web-pro"]);
    const cwd = join(f.root, "cwd");
    mkdirSync(cwd);
    const opencode = join(f.dest, "opencode");
    const codex = join(f.dest, "codex");
    writeManifest(opencode, "opencode", ["web-pro"]);
    writeManifest(codex, "codex", ["web-pro"]);
    const opencodeManifest = readFileSync(join(opencode, MANIFEST), "utf8");
    chmodSync(codex, 0o555);

    const r = f.runIn(cwd, "--update", "--dest", f.dest);
    chmodSync(codex, 0o755);

    expect(r.status).toBe(1);
    expect(r.stderr).toBe(`${JSON.stringify(codex)}: cannot write (EACCES); ${HINT}\n`);
    expect(existsSync(join(opencode, "web-pro.md"))).toBe(false);
    expect(readFileSync(join(opencode, MANIFEST), "utf8")).toBe(opencodeManifest);
    expect(written(cwd)).toEqual([]);
    expect(written(f.home)).toEqual([]);
  });

  asUser("an existing target dir the user can write but not search is refused before any target is written", () => {
    const f = fixture(["web-pro"]);
    const cwd = join(f.root, "cwd");
    mkdirSync(cwd);
    const codex = join(f.dest, "codex");
    mkdirSync(codex, { recursive: true });
    chmodSync(codex, 0o644);

    const r = f.runIn(cwd, "--dest", f.dest, "web-pro");
    chmodSync(codex, 0o755);

    expect(r.status).toBe(1);
    expect(r.stderr).toBe(`${JSON.stringify(codex)}: cannot write (EACCES); ${HINT}\n`);
    expect(existsSync(join(f.dest, "opencode"))).toBe(false);
    expect(written(cwd)).toEqual([]);
    expect(written(f.home)).toEqual([]);
  });

  asUser("a missing target dir under an unwritable ancestor is refused as a write, before any target is made", () => {
    const f = fixture(["web-pro"]);
    const cwd = join(f.root, "cwd");
    mkdirSync(cwd);
    mkdirSync(f.dest);
    chmodSync(f.dest, 0o555);

    const r = f.runIn(cwd, "--dest", f.dest, "web-pro");
    chmodSync(f.dest, 0o755);

    expect(r.status).toBe(1);
    expect(r.stderr).toBe(`${JSON.stringify(join(f.dest, "opencode"))}: cannot write (EACCES); ${HINT}\n`);
    expect(readdirSync(f.dest)).toEqual([]);
    expect(written(cwd)).toEqual([]);
    expect(written(f.home)).toEqual([]);
  });

  asUser("--update reports a manifest it cannot stat instead of skipping its target", () => {
    const f = fixture(["web-pro"]);
    const opencode = join(f.dest, "opencode");
    const codex = join(f.dest, "codex");
    writeManifest(opencode, "opencode", ["web-pro"]);
    writeManifest(codex, "codex", ["web-pro"]);
    const opencodeManifest = readFileSync(join(opencode, MANIFEST), "utf8");
    chmodSync(codex, 0o644);

    const r = f.run("--update", "--dest", f.dest);
    chmodSync(codex, 0o755);

    expect(r.status).toBe(1);
    expect(r.stderr).toBe(
      `${JSON.stringify(join(codex, MANIFEST))}: cannot read (EACCES); remove or fix the permissions of that path, then reinstall with: '${join(f.repo, "install.sh")}' --to codex --dest '${f.dest}'\n`,
    );
    expect(existsSync(join(opencode, "web-pro.md"))).toBe(false);
    expect(readFileSync(join(opencode, MANIFEST), "utf8")).toBe(opencodeManifest);
  });

  test.each([
    ["a converted file", (dest: string) => join(dest, "codex", "web-pro.toml")],
    ["the manifest", (dest: string) => join(dest, "codex", MANIFEST)],
  ])("a directory where %s goes is refused in one line before any target is written", (_label, at) => {
    const f = fixture(["web-pro"]);
    const cwd = join(f.root, "cwd");
    mkdirSync(cwd);
    const blocked = at(f.dest);
    mkdirSync(blocked, { recursive: true });

    const r = f.runIn(cwd, "--dest", f.dest, "web-pro");

    expect(r.status).toBe(1);
    expect(r.stderr).toBe(`${JSON.stringify(blocked)}: cannot write (EISDIR); ${HINT}\n`);
    expect(existsSync(join(f.dest, "opencode"))).toBe(false);
    expect(written(cwd)).toEqual([]);
    expect(written(f.home)).toEqual([]);
  });

  test("a --dest component past the name limit is refused and creates nothing", () => {
    const f = fixture(["web-pro"]);
    const cwd = join(f.root, "cwd");
    mkdirSync(cwd);
    const dest = join(f.root, "new", "x".repeat(300));

    const r = f.runIn(cwd, "--dest", dest, "web-pro");

    expect(r.status).toBe(1);
    expect(r.stderr).toBe(`${JSON.stringify(join(dest, "opencode"))}: cannot create (ENAMETOOLONG); ${HINT}\n`);
    expect(existsSync(join(f.root, "new"))).toBe(false);
    expect(written(cwd)).toEqual([]);
    expect(written(f.home)).toEqual([]);
  });

  test("--update refuses a blocked file path of any target before updating any target", () => {
    const f = fixture(["web-pro"]);
    const opencode = join(f.dest, "opencode");
    const codex = join(f.dest, "codex");
    writeManifest(opencode, "opencode", ["web-pro"]);
    writeManifest(codex, "codex", ["web-pro"]);
    const opencodeManifest = readFileSync(join(opencode, MANIFEST), "utf8");
    const blocked = join(codex, "web-pro.toml");
    mkdirSync(blocked);

    const r = f.run("--update", "--dest", f.dest);

    expect(r.status).toBe(1);
    expect(r.stderr).toBe(`${JSON.stringify(blocked)}: cannot write (EISDIR); ${HINT}\n`);
    expect(readFileSync(join(opencode, MANIFEST), "utf8")).toBe(opencodeManifest);
    expect(existsSync(join(opencode, "web-pro.md"))).toBe(false);
  });

  test("--update refuses a directory where a stale file would be pruned, before updating any target", () => {
    const f = fixture(["web-pro"]);
    const opencode = join(f.dest, "opencode");
    const codex = join(f.dest, "codex");
    writeManifest(opencode, "opencode", ["web-pro", "gone"]);
    writeManifest(codex, "codex", ["web-pro"]);
    const opencodeManifest = readFileSync(join(opencode, MANIFEST), "utf8");
    const codexManifest = readFileSync(join(codex, MANIFEST), "utf8");
    const blocked = join(opencode, "gone.md");
    mkdirSync(blocked);

    const r = f.run("--update", "--dest", f.dest);

    expect(r.status).toBe(1);
    expect(r.stderr).toBe(`${JSON.stringify(blocked)}: cannot remove (EISDIR); ${HINT}\n`);
    expect(readFileSync(join(opencode, MANIFEST), "utf8")).toBe(opencodeManifest);
    expect(readFileSync(join(codex, MANIFEST), "utf8")).toBe(codexManifest);
    expect(existsSync(join(opencode, "web-pro.md"))).toBe(false);
    expect(existsSync(join(codex, "web-pro.toml"))).toBe(false);
  });

  test("a converted-file path past the path limit is refused and creates nothing", () => {
    const f = fixture(["web-pro"]);
    const cwd = join(f.root, "cwd");
    mkdirSync(cwd);
    // the dirs fit PATH_MAX (4096 with the NUL) while `<dest>/opencode/web-pro.md` does not
    let dest = join(f.root, "deep");
    while (4080 - dest.length - 1 >= 1) dest = join(dest, "d".repeat(Math.min(200, 4080 - dest.length - 1)));
    const file = join(dest, "opencode", "web-pro.md");
    expect(join(dest, "opencode").length).toBeLessThan(4096);
    expect(file.length).toBeGreaterThan(4095);

    const r = f.runIn(cwd, "--dest", dest, "web-pro");

    expect(r.status).toBe(1);
    expect(r.stderr).toBe(`${JSON.stringify(file)}: cannot write (ENAMETOOLONG); ${HINT}\n`);
    expect(existsSync(join(f.root, "deep"))).toBe(false);
    expect(written(cwd)).toEqual([]);
    expect(written(f.home)).toEqual([]);
  });

  asUser("an existing converted file the user cannot write is refused before any target is written", () => {
    const f = fixture(["web-pro"]);
    const codex = join(f.dest, "codex");
    mkdirSync(codex, { recursive: true });
    const file = join(codex, "web-pro.toml");
    writeFileSync(file, "old\n");
    chmodSync(file, 0o444);

    const r = f.run("--dest", f.dest, "web-pro");

    expect(r.status).toBe(1);
    expect(r.stderr).toBe(`${JSON.stringify(file)}: cannot write (EACCES); ${HINT}\n`);
    expect(existsSync(join(f.dest, "opencode"))).toBe(false);
  });

  test("a symlink loop where a converted file goes is refused before any target is written", () => {
    const f = fixture(["web-pro"]);
    const codex = join(f.dest, "codex");
    mkdirSync(codex, { recursive: true });
    const file = join(codex, "web-pro.toml");
    symlinkSync("web-pro.toml", file);

    const r = f.run("--dest", f.dest, "web-pro");

    expect(r.status).toBe(1);
    expect(r.stderr).toBe(`${JSON.stringify(file)}: cannot write (ELOOP); ${HINT}\n`);
    expect(existsSync(join(f.dest, "opencode"))).toBe(false);
  });

  test("a broken catalog def is a bug, not a usage error, and keeps its stack trace", () => {
    const f = fixture(["web-pro"]);
    writeFileSync(join(f.repo, "agents", "broken.md"), "no frontmatter here\n");

    const r = f.run("--list");

    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("no frontmatter block");
    expect(r.stderr).toContain("parseAgent");
  });
});

describe("the rename table", () => {
  // Rename resolution is one hop, so a chain (a -> b, b -> c) would strand users on `a`:
  // a new rename re-points every older row instead.
  test("no row's new name is another row's old name", () => {
    const source = readFileSync(SCRIPT, "utf8");
    const block = source.match(/const RENAMES[^{]*\{([^}]*)\}/);
    expect(block).not.toBeNull();
    const lines = block![1].split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("//"));
    const row = /^(["'])([^"']+)\1:\s*(["'])([^"']+)\3,?$/;
    expect(lines.filter((line) => !row.test(line))).toEqual([]);
    const rows = lines.map((line) => {
      const [, , from, , to] = line.match(row)!;
      return [from, to];
    });
    const oldNames = new Set(rows.map(([from]) => from));
    expect(rows.filter(([, to]) => oldNames.has(to))).toEqual([]);
  });
});

describe("--update without --dest", () => {
  // git with no inherited GIT_* state (a hook's GIT_DIR/GIT_INDEX_FILE) and no user or
  // system config, so the fixture repos never see the box's hooks or identity.
  const gitEnv = (home: string) => ({
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))),
    HOME: home,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "fixture",
    GIT_AUTHOR_EMAIL: "fixture@example.invalid",
    GIT_COMMITTER_NAME: "fixture",
    GIT_COMMITTER_EMAIL: "fixture@example.invalid",
  });

  test("a refused run leaves the checkout where it was", () => {
    const f = fixture(["kept"]);
    const env = gitEnv(f.home);
    const git = (cwd: string, ...args: string[]) => {
      const r = spawnSync("git", args, { cwd, env, encoding: "utf8" });
      if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
      return r.stdout.trim();
    };
    git(f.repo, "init", "-q", "-b", "main");
    git(f.repo, "add", ".");
    git(f.repo, "commit", "-qm", "first");
    const clone = join(f.root, "clone");
    git(f.root, "clone", "-q", f.repo, clone);
    f.addDef("later");
    git(f.repo, "add", ".");
    git(f.repo, "commit", "-qm", "second");
    const before = git(clone, "rev-parse", "HEAD");
    const homeCodex = join(f.home, ".codex", "agents");
    mkdirSync(homeCodex, { recursive: true });
    writeFileSync(join(homeCodex, MANIFEST), "{\"agents\": [");

    const r = spawnSync("bun", [join(clone, "bin", "install-agents.ts"), "--update"], { cwd: f.root, env, encoding: "utf8" });

    expect(r.status).toBe(1);
    expect(r.stderr.startsWith(`${JSON.stringify(join(homeCodex, MANIFEST))}: not valid JSON (`)).toBe(true);
    expect(git(clone, "rev-parse", "HEAD")).toBe(before);
  });
});

describe("codex conversion", () => {
  const defWithBody = (name: string, body: string) => `---\nname: ${name}\ndescription: "fixture ${name}"\n---\n\n${body}\n`;

  test.each([
    ["an ESC byte", "before\x1bafter"],
    ["a DEL byte", "before\x7fafter"],
    ["a bare CR", "before\rafter"],
  ])("a def body holding %s fails the conversion loudly and writes no codex file", (_label, body) => {
    const f = fixture([]);
    writeFileSync(join(f.repo, "agents", "bad.md"), defWithBody("bad", body));

    const r = f.run("--to", "codex", "--dest", f.dest);

    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("bad: body holds a control character TOML cannot carry");
    expect(existsSync(join(f.dest, "codex", "bad.toml"))).toBe(false);
  });

  test.each([
    ["a CRLF line end", "before\r\nafter"],
    ["a tab", "before\tafter"],
    ["backslashes and quotes", "a \\d+ regex and \"quotes\" and 'single' ones"],
  ])("a def body holding %s converts to a codex file that parses as TOML", (_label, body) => {
    const f = fixture([]);
    writeFileSync(join(f.repo, "agents", "ok.md"), defWithBody("ok", body));

    const r = f.run("--to", "codex", "--dest", f.dest);

    expect(r.status).toBe(0);
    const parsed = Bun.TOML.parse(readFileSync(join(f.dest, "codex", "ok.toml"), "utf8")) as { name: string; developer_instructions: string };
    expect(parsed.name).toBe("ok");
    // the TOML spec lets a parser normalize a newline inside a multi-line string; bun's reads CRLF as LF.
    expect(parsed.developer_instructions.trim()).toBe(body.replace(/\r\n/g, "\n"));
  });

  test.each([
    ["no marker", "", "read-only"],
    ["the workspace-write marker", "# sandbox: workspace-write\n", "workspace-write"],
  ])("a Bash-and-Read def with %s gets its codex sandbox", (_label, marker, mode) => {
    const f = fixture([]);
    writeFileSync(join(f.repo, "agents", "runner.md"), `---\nname: runner\ndescription: "fixture runner"\ntools: Bash, Read\n${marker}---\n\nbody\n`);

    const r = f.run("--to", "codex", "--dest", f.dest);

    expect(r.status).toBe(0);
    expect((Bun.TOML.parse(readFileSync(join(f.dest, "codex", "runner.toml"), "utf8")) as { sandbox_mode: string }).sandbox_mode).toBe(mode);
  });

  test("the shipped prober runs its builds under workspace-write while a shipped reviewer stays read-only", () => {
    const f = fixture([]);
    for (const name of ["prober", "rust-reviewer"]) copyFileSync(join(import.meta.dir, "..", "agents", `${name}.md`), join(f.repo, "agents", `${name}.md`));

    const r = f.run("--to", "codex", "--dest", f.dest);

    expect(r.status).toBe(0);
    const sandbox = (name: string) => (Bun.TOML.parse(readFileSync(join(f.dest, "codex", `${name}.toml`), "utf8")) as { sandbox_mode: string }).sandbox_mode;
    expect(sandbox("prober")).toBe("workspace-write");
    expect(sandbox("rust-reviewer")).toBe("read-only");
  });

  test("a control byte in a description never yields a codex file that fails to parse", () => {
    const f = fixture([]);
    writeFileSync(join(f.repo, "agents", "desc.md"), `---\nname: desc\ndescription: "fixture\x7fdesc"\n---\n\nbody\n`);

    const r = f.run("--to", "codex", "--dest", f.dest);

    const toml = join(f.dest, "codex", "desc.toml");
    if (r.status === 0) expect(() => Bun.TOML.parse(readFileSync(toml, "utf8"))).not.toThrow();
    else expect(existsSync(toml)).toBe(false);
  });

  test("a DEL in a def name fails the conversion loudly", () => {
    const f = fixture([]);
    writeFileSync(join(f.repo, "agents", "bad.md"), `---\nname: ba\x7fd\ndescription: "fixture bad"\n---\n\nbody\n`);

    const r = f.run("--to", "codex", "--dest", f.dest);

    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("name holds a character TOML cannot carry");
    expect(existsSync(join(f.dest, "codex"))).toBe(false);
  });

  test("a def codex cannot carry stops the install before any target is written", () => {
    const f = fixture(["aaa"]);
    writeFileSync(join(f.repo, "agents", "zzz.md"), defWithBody("zzz", "before\x1bafter"));

    const r = f.run("--dest", f.dest);

    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("zzz: body holds a control character TOML cannot carry");
    expect(existsSync(f.dest)).toBe(false);
  });
});
