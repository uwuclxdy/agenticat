// Runs the converter as a subprocess against a throwaway catalog: the script is copied
// beside a fixture agents/ dir, so it resolves that dir as its repo, and every run gets a
// scratch HOME and an explicit --dest, so no real user path is read or written.

import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

  // An inode-exhausted filesystem fails the mkdir itself: a genuine failure, not a bad path.
  const canUnshare = spawnSync("unshare", ["-rm", "true"]).status === 0;
  (canUnshare ? test : test.skip)("a full filesystem under --dest keeps its trace instead of a path hint", () => {
    const f = fixture(["web-pro"]);
    const mnt = join(f.root, "mnt");
    mkdirSync(mnt);

    const r = spawnSync(
      "unshare",
      ["-rm", "sh", "-c", 'mount -t tmpfs -o size=1m,nr_inodes=3 none "$1" && exec bun "$2" --dest "$1/a/b/c" web-pro', "sh", mnt, join(f.repo, "bin", "install-agents.ts")],
      { cwd: f.root, env: { ...process.env, HOME: f.home }, encoding: "utf8" },
    );

    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("ENOSPC");
    expect(r.stderr).not.toContain(HINT);
  });

  // the runtime prints a failed call's own `path` beside its message, so a genuine failure's
  // trace must not carry the raw --dest either; 1 inode fails the mkdir, 3 fail the open.
  test.skipIf(!canUnshare).each([
    ["the dest mkdir", "1", "codex", "create", ""],
    ["a file's open", "3", "codex/kept.toml", "write", "/codex/kept.toml"],
  ])("a full filesystem failing %s prints the path escaped everywhere", (_label, inodes, rel, verb, failedAt) => {
    const f = fixture(["kept"]);
    const mnt = join(f.root, "mnt");
    mkdirSync(mnt);

    const r = spawnSync(
      "unshare",
      ["-rm", "sh", "-c", `mount -t tmpfs -o size=1m,nr_inodes=${inodes} none "$1" && exec bun "$2" --to codex --dest "$1/d${String.fromCharCode(0x202e)}x" kept`, "sh", mnt, join(f.repo, "bin", "install-agents.ts")],
      { cwd: f.root, env: { ...process.env, HOME: f.home }, encoding: "utf8" },
    );

    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain(`error: "${mnt}/d\\u202ex/${rel}": cannot ${verb} (ENOSPC)\n`);
    expect(r.stderr).toContain(`    path: "${mnt}/d\\\\u202ex${failedAt}",\n`);
    expect(r.stderr).not.toContain(HINT);
    for (const line of r.stderr.split("\n")) expect(line).not.toMatch(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u);
  });

  test("--update with a --dest that is a file finds no manifest and exits 0", () => {
    const f = fixture(["web-pro"]);
    writeFileSync(f.dest, "a file where --dest points\n");

    const r = f.run("--update", "--dest", f.dest);

    expect(r.status).toBe(0);
    expect(r.stdout).toContain("no agenticat manifest found");
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

  // chmod binds nothing for root.
  (process.getuid?.() === 0 ? test.skip : test)("a target dir refused for its permissions leaves the checkout where it was", () => {
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
    writeManifest(homeCodex, "codex", ["kept"]);
    chmodSync(homeCodex, 0o555);

    const r = spawnSync("bun", [join(clone, "bin", "install-agents.ts"), "--update"], { cwd: f.root, env, encoding: "utf8" });
    chmodSync(homeCodex, 0o755);

    expect(r.status).toBe(1);
    expect(r.stderr).toBe(`${JSON.stringify(homeCodex)}: cannot write (EACCES); fix that path or pass a --dest that is a writable directory\n`);
    expect(git(clone, "rev-parse", "HEAD")).toBe(before);
  });

  // A catalog defect in the local checkout is what an update's pull exists to repair.
  test("a broken def in the checkout still lets the update pull its fix and install", () => {
    const f = fixture([]);
    const env = gitEnv(f.home);
    const git = (cwd: string, ...args: string[]) => {
      const r = spawnSync("git", args, { cwd, env, encoding: "utf8" });
      if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
      return r.stdout.trim();
    };
    writeFileSync(join(f.repo, "agents", "tui.md"), `---\nname: tui\ndescription: "fixture tui"\n---\n\nbefore\x1bafter\n`);
    git(f.repo, "init", "-q", "-b", "main");
    git(f.repo, "add", ".");
    git(f.repo, "commit", "-qm", "broken");
    const clone = join(f.root, "clone");
    git(f.root, "clone", "-q", f.repo, clone);
    f.addDef("tui");
    git(f.repo, "add", ".");
    git(f.repo, "commit", "-qm", "fixed");
    const fixedHead = git(f.repo, "rev-parse", "HEAD");
    const homeCodex = join(f.home, ".codex", "agents");
    writeManifest(homeCodex, "codex", ["tui"]);
    writeFileSync(join(homeCodex, MANIFEST), JSON.stringify({ ...readManifest(homeCodex), all: true }) + "\n");

    const r = spawnSync("bun", [join(clone, "bin", "install-agents.ts"), "--update"], { cwd: f.root, env, encoding: "utf8" });

    expect(r.status).toBe(0);
    expect(git(clone, "rev-parse", "HEAD")).toBe(fixedHead);
    expect(existsSync(join(homeCodex, "tui.toml"))).toBe(true);
  });

  (process.getuid?.() === 0 ? test.skip : test)("a broken def in the checkout does not skip the target dir check before the pull", () => {
    const f = fixture([]);
    const env = gitEnv(f.home);
    const git = (cwd: string, ...args: string[]) => {
      const r = spawnSync("git", args, { cwd, env, encoding: "utf8" });
      if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
      return r.stdout.trim();
    };
    writeFileSync(join(f.repo, "agents", "tui.md"), `---\nname: tui\ndescription: "fixture tui"\n---\n\nbefore\x1bafter\n`);
    git(f.repo, "init", "-q", "-b", "main");
    git(f.repo, "add", ".");
    git(f.repo, "commit", "-qm", "broken");
    const clone = join(f.root, "clone");
    git(f.root, "clone", "-q", f.repo, clone);
    f.addDef("tui");
    git(f.repo, "add", ".");
    git(f.repo, "commit", "-qm", "fixed");
    const before = git(clone, "rev-parse", "HEAD");
    const homeCodex = join(f.home, ".codex", "agents");
    writeManifest(homeCodex, "codex", ["tui"]);
    writeFileSync(join(homeCodex, MANIFEST), JSON.stringify({ ...readManifest(homeCodex), all: true }) + "\n");
    chmodSync(homeCodex, 0o555);

    const r = spawnSync("bun", [join(clone, "bin", "install-agents.ts"), "--update"], { cwd: f.root, env, encoding: "utf8" });
    chmodSync(homeCodex, 0o755);

    expect(r.status).toBe(1);
    expect(r.stderr).toBe(`${JSON.stringify(homeCodex)}: cannot write (EACCES); fix that path or pass a --dest that is a writable directory\n`);
    expect(git(clone, "rev-parse", "HEAD")).toBe(before);
  });

  test("an update without --dest prints each rename and each manifest warning once", () => {
    const f = fixture(["web-reviewer"]);
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
    const homeCodex = join(f.home, ".codex", "agents");
    writeManifest(homeCodex, "codex", ["ts-reviewer", "../outside"]);

    const r = spawnSync("bun", [join(clone, "bin", "install-agents.ts"), "--update"], { cwd: f.root, env, encoding: "utf8" });

    expect(r.status).toBe(0);
    expect(r.stdout.split("ts-reviewer -> web-reviewer").length - 1).toBe(1);
    expect(r.stderr.split('"../outside"').length - 1).toBe(1);
  });

  test("a blocked file path the checkout already plans leaves the checkout where it was", () => {
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
    writeManifest(homeCodex, "codex", ["kept"]);
    const blocked = join(homeCodex, "kept.toml");
    mkdirSync(blocked);

    const r = spawnSync("bun", [join(clone, "bin", "install-agents.ts"), "--update"], { cwd: f.root, env, encoding: "utf8" });

    expect(r.status).toBe(1);
    expect(r.stderr).toBe(`${JSON.stringify(blocked)}: cannot write (EISDIR); fix that path or pass a --dest that is a writable directory\n`);
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

  test("an unknown sandbox marker value is a catalog defect naming the def", () => {
    const f = fixture([]);
    writeFileSync(join(f.repo, "agents", "runner.md"), `---\nname: runner\ndescription: "fixture runner"\ntools: Bash, Read\n# sandbox: workspace_write\n---\n\nbody\n`);

    const r = f.run("--to", "codex", "--dest", f.dest);

    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('runner: unknown sandbox marker "workspace_write" (expected "workspace-write")');
    expect(existsSync(join(f.dest, "codex", "runner.toml"))).toBe(false);
  });

  // `# lint:` takes prose after a full stop; this marker never does, so a contributor copying
  // that form must be told, not silently shipped read-only.
  test("a sandbox marker with anything after its value is a catalog defect", () => {
    const f = fixture([]);
    writeFileSync(join(f.repo, "agents", "runner.md"), `---\nname: runner\ndescription: "fixture runner"\ntools: Bash, Read\n# sandbox: workspace-write. builds write\n---\n\nbody\n`);

    const r = f.run("--to", "codex", "--dest", f.dest);

    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('runner: sandbox marker "# sandbox: workspace-write. builds write" must be exactly "# sandbox: <value>" with nothing after the value');
    expect(existsSync(join(f.dest, "codex", "runner.toml"))).toBe(false);
  });

  // a later marker line goes unchecked, and a lookalike spelling is read as no marker, so
  // either would ship a sandbox no line asked for.
  test.each([
    ["a bad value on a second marker line", "# sandbox: workspace-write\n# sandbox: workspace_write\n", 'runner: unknown sandbox marker "workspace_write" (expected "workspace-write")'],
    ["a second marker line naming another value", "# sandbox: workspace-write\n# sandbox: read-only\n", 'runner: unknown sandbox marker "read-only" (expected "workspace-write")'],
    ["a capitalized marker key", "# Sandbox: workspace-write\n", 'runner: sandbox marker "# Sandbox: workspace-write" must be exactly "# sandbox: <value>" with nothing after the value'],
    ["a longer marker key", "# sandboxed: workspace-write\n", 'runner: sandbox marker "# sandboxed: workspace-write" must be exactly "# sandbox: <value>" with nothing after the value'],
    ["an indented marker", " # sandbox: workspace-write\n", 'runner: sandbox marker " # sandbox: workspace-write" must be exactly "# sandbox: <value>" with nothing after the value'],
    ["a bare sandbox key", "sandbox: workspace-write\n", 'runner: sandbox marker "sandbox: workspace-write" must be exactly "# sandbox: <value>" with nothing after the value'],
  ])("%s is a catalog defect on both targets", (_label, marker, named) => {
    for (const target of ["codex", "opencode"]) {
      const f = fixture([]);
      writeFileSync(join(f.repo, "agents", "runner.md"), `---\nname: runner\ndescription: "fixture runner"\ntools: Bash, Read\n${marker}---\n\nbody\n`);

      const r = f.run("--to", target, "--dest", f.dest);

      expect([target, r.status === 0]).toEqual([target, false]);
      expect(r.stderr).toContain(named);
      expect(existsSync(join(f.dest, target))).toBe(false);
    }
  });

  // a top-level key sits at column 0, so a nested key that merely shares a marker's stem is data.
  test.each([
    ["a nested sandbox key", "mcpServers:\n  sandbox:\n    command: e2b\n"],
    ["a nested opencode-bash-allow key", "mcpServers:\n  opencode-bash-allow:\n    command: x\n"],
  ])("%s is no marker on either target", (_label, lines) => {
    for (const target of ["codex", "opencode"]) {
      const f = fixture([]);
      writeFileSync(join(f.repo, "agents", "runner.md"), `---\nname: runner\ndescription: "fixture runner"\n${lines}---\n\nbody\n`);

      expect([target, f.run("--to", target, "--dest", f.dest).status]).toEqual([target, 0]);
    }
  });

  // a hash inside a quoted value is data, whatever YAML escape sits before it.
  test.each([
    ["a double-quoted description", 'description: "runs in a # sandbox"'],
    ["an escaped quote before it", 'description: "say \\"hi\\" in a # sandbox"'],
    ["a doubled single quote before it", "description: 'it''s a # sandbox'"],
  ])("a # sandbox inside %s is data on both targets", (_label, descriptionLine) => {
    for (const target of ["codex", "opencode"]) {
      const f = fixture([]);
      writeFileSync(join(f.repo, "agents", "runner.md"), `---\nname: runner\n${descriptionLine}\ntools: Bash, Read\n---\n\nbody\n`);

      expect([target, f.run("--to", target, "--dest", f.dest).status]).toEqual([target, 0]);
    }
  });

  test.each([
    ["an escaped double quote", 'description: "say \\"hi\\" now"', 'say "hi" now'],
    ["a doubled single quote", "description: 'it''s fine'", "it's fine"],
    ["a hex escape", 'description: "\\x41bc"', "Abc"],
    ["a raw tab beside an escaped quote", 'description: "a\tb \\"c\\""', 'a\tb "c"'],
    ["a trailing comment after the closing quote", 'description: "say hi" # a note', "say hi"],
  ])("a description holding %s reaches both targets as YAML reads it", (_label, descriptionLine, expected) => {
    const f = fixture([]);
    writeFileSync(join(f.repo, "agents", "runner.md"), `---\nname: runner\n${descriptionLine}\n---\n\nbody\n`);

    expect(f.run("--dest", f.dest).status).toBe(0);
    expect((Bun.TOML.parse(readFileSync(join(f.dest, "codex", "runner.toml"), "utf8")) as { description: string }).description).toBe(expected);
    const opencode = readFileSync(join(f.dest, "opencode", "runner.md"), "utf8").split("\n---\n")[0].replace(/^---\n/, "");
    expect((Bun.YAML.parse(opencode) as { description: string }).description).toBe(expected);
  });

  test("a frontmatter YAML cannot read is a catalog defect on both targets", () => {
    for (const target of ["codex", "opencode"]) {
      const f = fixture([]);
      writeFileSync(join(f.repo, "agents", "runner.md"), `---\nname: runner\ndescription: "say hi\n---\n\nbody\n`);

      const r = f.run("--to", target, "--dest", f.dest);

      expect([target, r.status === 0]).toEqual([target, false]);
      expect(r.stderr).toContain(`${join(f.repo, "agents", "runner.md")}: frontmatter is not valid YAML (`);
      expect(existsSync(join(f.dest, target))).toBe(false);
    }
  });

  // the YAML reader keeps a repeated key's last value, so the first copy would ship unread;
  // a marker-shaped line in that copy's block scalar must not be read as a marker either.
  test.each([
    ["a repeated key", "description: again\n", "description"],
    ["a repeated key whose first copy is a block scalar holding a marker line", "notes: |\n  # sandbox: bogus\nnotes: plain\n", "notes"],
  ])("%s is a catalog defect on both targets", (_label, extra, key) => {
    for (const target of ["codex", "opencode"]) {
      const f = fixture([]);
      writeFileSync(join(f.repo, "agents", "runner.md"), `---\nname: runner\ndescription: "fixture runner"\ntools: Bash, Read\n${extra}---\n\nbody\n`);

      const r = f.run("--to", target, "--dest", f.dest);

      expect([target, r.status === 0]).toEqual([target, false]);
      expect(r.stderr).toContain(`${join(f.repo, "agents", "runner.md")}: frontmatter key "${key}" appears more than once; YAML keeps only the last\n`);
      expect(r.stderr).not.toContain("sandbox marker");
      expect(existsSync(join(f.dest, target))).toBe(false);
    }
  });

  // whole files: the first copy of the repeated key comes before the fields the fixture
  // above always writes, or the file opens with a byte order mark.
  test.each([
    ["a block-scalar description repeated after other keys", "---\nname: runner\ndescription: |\n  fixture runner\n  # sandbox: bogus\ntools: Bash, Read\ndescription: second\n---\n\nbody\n", "description"],
    ["a repeat whose first copy holds an alias and a marker-shaped block line", "---\nname: runner\ndescription: fixture runner\nbase: &b 1\nnotes:\n  a: *b\n  text: |\n    # sandbox: bogus\nnotes: plain\n---\n\nbody\n", "notes"],
    ["a repeat in a file that opens with a byte order mark", "\ufeff---\nname: runner\ndescription: fixture runner\nname: again\n---\n\nbody\n", "name"],
    ["a repeat behind a lone carriage return", "---\nname: runner\ndescription: fixture runner\nnotes: a\rnotes: b\n---\n\nbody\n", "notes"],
  ])("%s is a catalog defect on both targets", (_label, file, key) => {
    for (const target of ["codex", "opencode"]) {
      const f = fixture([]);
      writeFileSync(join(f.repo, "agents", "runner.md"), file);

      const r = f.run("--to", target, "--dest", f.dest);

      expect([target, r.status === 0]).toEqual([target, false]);
      expect(r.stderr).toContain(`${join(f.repo, "agents", "runner.md")}: frontmatter key "${key}" appears more than once; YAML keeps only the last\n`);
      expect(r.stderr).not.toContain("sandbox marker");
      expect(existsSync(join(f.dest, target))).toBe(false);
    }
  });

  // a top-level key must be a plain name at column 0, so the repeat check reads every key
  // straight off its line; any other spelling could hide a key the parser still reads.
  test.each([
    ["a quoted key", 'name: runner\ndescription: fixture runner\n"description": again\n', String.raw`"\"description\": again"`],
    ["an explicit key", "name: runner\ndescription: fixture runner\n? a\n: 1\n", '"? a"'],
    ["a merge key", "name: runner\ndescription: fixture runner\nbase: &a\n  k: anchored\n<<: *a\n", '"<<: *a"'],
    ["a key that starts with three dashes", "name: runner\ndescription: fixture runner\n---x: 1\n", '"---x: 1"'],
    ["a flow-mapping block", '{\nname: runner,\ndescription: fixture runner\n}\n', '"{"'],
    ["a tagged key", "name: runner\ndescription: fixture runner\n!!str k: v\n", '"!!str k: v"'],
    ["a byte order mark inside the block", "name: runner\ndescription: fixture runner\n\ufeffname: again\n", String.raw`"\ufeffname: again"`],
    ["an indented root mapping", "  name: first\n  description: fixture runner\n  name: runner\n", '"  name: first"'],
    ["an indented root mapping behind a comment", "# c\n  name: first\n  description: fixture runner\n  name: runner\n", '"  name: first"'],
    ["a key behind a lone carriage return", "name: runner\ndescription: fixture runner\nx: a\r!!str k: v\n", '"!!str k: v"'],
    ["a core-schema boolean key", "name: runner\ndescription: fixture runner\nTRUE: a\n", '"TRUE: a"'],
    ["a core-schema null key", "name: runner\ndescription: fixture runner\nnull: a\n", '"null: a"'],
    ["a digit-first key", "name: runner\ndescription: fixture runner\n1: x\n", '"1: x"'],
    ["a key holding a colon", "name: runner\ndescription: fixture runner\nx:y: 1\n", '"x:y: 1"'],
  ])("%s is a catalog defect on both targets", (_label, block, quoted) => {
    for (const target of ["codex", "opencode"]) {
      const f = fixture([]);
      writeFileSync(join(f.repo, "agents", "runner.md"), `---\n${block}---\n\nbody\n`);

      const r = f.run("--to", target, "--dest", f.dest);

      expect([target, r.status === 0]).toEqual([target, false]);
      expect(r.stderr).toContain(`${join(f.repo, "agents", "runner.md")}: frontmatter line ${quoted} is not a plain top-level \`key: value\` entry\n`);
      expect(existsSync(join(f.dest, target))).toBe(false);
    }
  });

  // what a harness's own frontmatter reader accepts converts too: a closer with trailing
  // whitespace, CRLF line ends, a byte order mark before the opener; nor is a key name
  // inside a block scalar, or an anchor or alias in a value, a repeated key.
  test.each([
    ["a key name inside a block scalar body", '---\nname: runner\ndescription: "fixture runner"\nnotes: |\n  description: inside\n  name: also inside\n---\n\nbody\n'],
    ["anchors and aliases in values", '---\nname: runner\ndescription: "fixture runner"\nbase: &b 1\nnotes:\n  a: *b\n---\n\nbody\n'],
    ["a closer with trailing whitespace", '---\nname: runner\ndescription: "fixture runner"\n--- \t\n\nbody\n'],
    ["CRLF line ends", '---\r\nname: runner\r\ndescription: "fixture runner"\r\nnotes:\r\n  a: 1\r\n---\r\n\r\nbody\r\n'],
    ["a byte order mark before the opener", '\ufeff---\nname: runner\ndescription: "fixture runner"\n---\n\nbody\n'],
    ["an opener with trailing whitespace", '--- \nname: runner\ndescription: "fixture runner"\n---\n\nbody\n'],
    ["a blank line between keys", '---\nname: runner\n\ndescription: "fixture runner"\n---\n\nbody\n'],
    ["a tab after a key's colon", '---\nname:\trunner\ndescription: "fixture runner"\n---\n\nbody\n'],
    ["a column-0 sequence under a key", '---\nname: runner\ndescription: "fixture runner"\nskills:\n- a\n- b\n---\n\nbody\n'],
    ["an indented comment before the first key", '---\n  # c\nname: runner\ndescription: "fixture runner"\n---\n\nbody\n'],
    ["a tab-only line before the first key", '---\n\t\nname: runner\ndescription: "fixture runner"\n---\n\nbody\n'],
  ])("%s converts on both targets", (_label, file) => {
    for (const target of ["codex", "opencode"]) {
      const f = fixture([]);
      writeFileSync(join(f.repo, "agents", "runner.md"), file);

      const r = f.run("--to", target, "--dest", f.dest);

      expect([target, r.status, r.stderr]).toEqual([target, 0, ""]);
      expect(existsSync(join(f.dest, target, `runner.${target === "codex" ? "toml" : "md"}`))).toBe(true);
    }
  });

  // every reader of the block, the marker reader included, sees the same lines: a marker
  // after a CRLF or a lone CR line end is read exactly.
  test.each([
    ["CRLF line ends", '---\r\nname: runner\r\ndescription: "fixture runner"\r\ntools: Bash, Read\r\n# sandbox: workspace-write\r\n---\r\n\r\nbody\r\n'],
    ["a lone carriage return before it", '---\nname: runner\ndescription: "fixture runner"\ntools: Bash, Read\r# sandbox: workspace-write\n---\n\nbody\n'],
  ])("a sandbox marker after %s is read", (_label, file) => {
    const f = fixture([]);
    writeFileSync(join(f.repo, "agents", "runner.md"), file);

    const r = f.run("--to", "codex", "--dest", f.dest);

    expect([r.status, r.stderr]).toEqual([0, ""]);
    expect(readFileSync(join(f.dest, "codex", "runner.toml"), "utf8")).toContain('sandbox_mode = "workspace-write"');
  });

  // the frontmatter's line ends are folded for the readers, but the body is copied as written.
  test("a CRLF body keeps its line ends in the converted def", () => {
    const f = fixture([]);
    writeFileSync(join(f.repo, "agents", "runner.md"), '---\nname: runner\ndescription: "fixture runner"\n---\n\nline one\r\nline two\n');

    const r = f.run("--to", "opencode", "--dest", f.dest);

    expect([r.status, r.stderr]).toEqual([0, ""]);
    expect(readFileSync(join(f.dest, "opencode", "runner.md"), "utf8")).toContain("line one\r\nline two");
  });

  // a field read as text that YAML reads as a list or a number would drop silently (a denylist
  // read as absent gives a read-only def every tool), so it is a defect.
  test.each([
    ["a denylist written as a YAML list", "disallowedTools: [Edit, Write]\n", "disallowedTools"],
    ["an allowlist written as a block list", "tools:\n  - Read\n  - Bash\n", "tools"],
    ["a numeric model", "model: 4\n", "model"],
  ])("%s is a catalog defect on both targets", (_label, lines, key) => {
    for (const target of ["codex", "opencode"]) {
      const f = fixture([]);
      writeFileSync(join(f.repo, "agents", "runner.md"), `---\nname: runner\ndescription: "fixture runner"\n${lines}---\n\nbody\n`);

      const r = f.run("--to", target, "--dest", f.dest);

      expect([target, r.status === 0]).toEqual([target, false]);
      expect(r.stderr).toContain(`${join(f.repo, "agents", "runner.md")}: frontmatter field "${key}" is not a string`);
      expect(existsSync(join(f.dest, target))).toBe(false);
    }
  });

  // a `#` line YAML reads as scalar text (a block scalar's body) is data, not a marker comment.
  test.each([
    ["a block-scalar description line", "description: |\n  runs in a\n  # sandbox of its own\n", "runs in a\n# sandbox of its own\n"],
    ["a block-scalar line with a mid-line hash", "description: >-\n  builds # sandbox images\n", "builds # sandbox images"],
  ])("%s holding a marker stem is data on both targets", (_label, lines, expected) => {
    for (const target of ["codex", "opencode"]) {
      const f = fixture([]);
      writeFileSync(join(f.repo, "agents", "runner.md"), `---\nname: runner\n${lines}tools: Bash, Read\n---\n\nbody\n`);

      expect([target, f.run("--to", target, "--dest", f.dest).status]).toEqual([target, 0]);
    }
    const f = fixture([]);
    writeFileSync(join(f.repo, "agents", "runner.md"), `---\nname: runner\n${lines}tools: Bash, Read\n---\n\nbody\n`);
    expect(f.run("--to", "codex", "--dest", f.dest).status).toBe(0);
    const toml = Bun.TOML.parse(readFileSync(join(f.dest, "codex", "runner.toml"), "utf8")) as { description: string; sandbox_mode: string };
    expect([toml.description, toml.sandbox_mode]).toEqual([expected, "read-only"]);
  });
});

describe("untrusted text in a refusal", () => {
  // Every refusal is one line a terminal prints verbatim: a control byte, a C1 control or a
  // line separator from a path, a manifest or an argument must arrive escaped.
  // Every control, format character (bidi, byte order mark, zero-width) and line or paragraph
  // separator, by Unicode category, so the escape set is held to the standard, not to itself.
  const RAW_UNSAFE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

  test.each([
    ["an unknown agent name", ["--to", "codex", "a\x7fb"], true],
    ["a --to value", ["--to", "co\u2028dex"], true],
    ["an unknown option", ["--bo\u0085gus"], true],
    ["a pair of unknown options", ["--bo\u0085gus", "--x\u2028y"], true],
    ["an agent name after --update", ["--update", "a\x7fb"], true],
    ["an agent name after --list", ["--list", "a\x7fb"], false],
    ["a --to value holding a bidi override", ["--to", "co\u202edex"], true],
    ["an unknown agent name holding a byte order mark", ["--to", "codex", "a\ufeffb"], true],
    ["a --to value holding an Arabic letter mark", ["--to", `co${String.fromCharCode(0x61c)}dex`], true],
  ])("%s never reaches stderr raw", (_label, args, withDest) => {
    const f = fixture(["kept"]);

    const r = withDest ? f.run(...args, "--dest", f.dest) : f.run(...args);

    expect(r.status).toBe(1);
    for (const line of r.stderr.split("\n")) expect(line).not.toMatch(RAW_UNSAFE);
  });

  // a format character past U+FFFF is two UTF-16 units, and each must arrive escaped.
  test("a --to value holding an astral format character prints both halves escaped", () => {
    const f = fixture(["kept"]);

    const r = f.run("--to", `co${String.fromCodePoint(0xe0001)}dex`, "--dest", f.dest);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain(String.raw`(got: "co\udb40\udc01dex")`);
  });

  test("a manifest name that is not an agent name is warned about as written, escaped", () => {
    const f = fixture(["kept"]);
    const codex = join(f.dest, "codex");
    mkdirSync(codex, { recursive: true });
    writeFileSync(join(codex, MANIFEST), JSON.stringify({ target: "codex", agents: [["kept"], "a\x7fb", "kept"] }) + "\n");

    const r = f.run("--update", "--dest", f.dest);

    expect(r.status).toBe(0);
    expect(r.stderr).toContain('manifest name ["kept"] is not an agent name');
    expect(r.stderr).toContain('manifest name "a\\u007fb" is not an agent name');
    for (const line of r.stderr.split("\n")) expect(line).not.toMatch(RAW_UNSAFE);
  });

  test.each([
    ["DEL", "{\x7f"],
    ["a C1 control", "{\u009b"],
    ["a line separator", "{\u2028"],
  ])("a malformed manifest holding %s never echoes it raw", (_label, content) => {
    const f = fixture(["kept"]);
    const codex = join(f.dest, "codex");
    mkdirSync(codex, { recursive: true });
    writeFileSync(join(codex, MANIFEST), content);

    const r = f.run("--update", "--dest", f.dest);

    expect(r.status).toBe(1);
    expect(r.stderr.endsWith("\n")).toBe(true);
    expect(r.stderr.slice(0, -1)).not.toMatch(RAW_UNSAFE);
  });

  // The reinstall tail must survive bash: extract the --dest word and let bash print it.
  test.each([
    ["a control byte before a hex digit", "a\x01b"],
    ["a quote and a newline", "q'\nq"],
    ["a backslash and a newline", "b\\\nb"],
    ["an ESC", "e\x1be"],
    ["a DEL", "d\x7fd"],
    ["a C1 control", "c\u009bc"],
    ["a carriage return", "c\rr"],
    ["a bidi override", `r${String.fromCharCode(0x202e)}r`],
    ["an astral format character", `a${String.fromCodePoint(0xe0001)}a`],
  ])("a --dest holding %s prints a reinstall command bash reads back to the same path", (_label, name) => {
    const f = fixture(["kept"]);
    const dest = join(f.root, name);
    const codex = join(dest, "codex");
    mkdirSync(codex, { recursive: true });
    writeFileSync(join(codex, MANIFEST), "{\"agents\": [");

    const r = f.run("--update", "--dest", dest);

    expect(r.status).toBe(1);
    expect(r.stderr.endsWith("\n")).toBe(true);
    expect(r.stderr.slice(0, -1)).not.toMatch(RAW_UNSAFE);
    const word = r.stderr.slice(r.stderr.indexOf("--dest ") + "--dest ".length, -1);
    const echoed = spawnSync("bash", ["-c", `printf %s ${word}`], { encoding: "utf8" });
    expect(echoed.status).toBe(0);
    expect(echoed.stdout).toBe(dest);
  });
});

describe("untrusted text in a success line", () => {
  // a --dest reaches every written and removed path, so each success line quotes its path
  // the way a refusal does; a plain path is quoted too, so the line has one shape.
  test("a written path under a --dest holding an ESC prints escaped", () => {
    const f = fixture(["kept"]);
    const dest = join(f.root, "a\x1bb");

    const r = f.run("--to", "opencode", "--dest", dest, "kept");

    expect(r.status).toBe(0);
    expect(r.stdout).toBe(`  opencode: "${f.root}/a\\u001bb/opencode/kept.md"\ninstalled 1 agent(s) -> opencode\n`);
    expect(r.stderr).toBe("");
  });

  test("a written path under a plain --dest prints quoted", () => {
    const f = fixture(["kept"]);

    const r = f.run("--to", "codex", "--dest", f.dest, "kept");

    expect(r.status).toBe(0);
    expect(r.stdout).toBe(`  codex: "${f.dest}/codex/kept.toml"\ninstalled 1 agent(s) -> codex\n`);
    expect(r.stderr).toBe("");
  });

  test("a removed path under a --dest holding a line separator prints escaped", () => {
    const f = fixture(["kept"]);
    const dest = join(f.root, `l${String.fromCharCode(0x2028)}s`);
    const codex = join(dest, "codex");
    writeManifest(codex, "codex", ["kept", "gone"]);
    writeFileSync(join(codex, "gone.toml"), "stale\n");

    const r = f.run("--update", "--dest", dest);

    expect(r.status).toBe(0);
    expect(existsSync(join(codex, "gone.toml"))).toBe(false);
    expect(r.stdout).toBe(
      `  codex: "${f.root}/l\\u2028s/codex/kept.toml"\n` +
        `  codex: removed "${f.root}/l\\u2028s/codex/gone.toml"\n` +
        "installed 1 agent(s) -> codex\n",
    );
    expect(r.stderr).toBe("");
  });
});

describe("opencode permission map", () => {
  // opencode's own matcher (packages/core/src/util/wildcard.ts): `*` is any run of characters,
  // `?` one character, a trailing ` *` also matches the bare command, and the LAST matching
  // rule wins (no match: ask). opencode first splits a command line into its commands, each
  // carrying only the redirects attached to it; this double matches one command as given, so
  // it cannot see a redirect on a group or loop (`{ cat a; } > out`), which no pattern blocks.
  const wildcard = (pattern: string) => {
    let source = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
    if (source.endsWith(" .*")) source = `${source.slice(0, -3)}( .*)?`;
    return new RegExp(`^${source}$`, "s");
  };
  const decide = (rules: Record<string, string>, command: string) =>
    Object.entries(rules).findLast(([pattern]) => wildcard(pattern).test(command))?.[1] ?? "ask";
  const frontmatter = (file: string) => Bun.YAML.parse(readFileSync(file, "utf8").split("\n---\n")[0].replace(/^---\n/, "")) as {
    permission?: { bash?: Record<string, string>; task?: string };
  };
  const install = (frontmatterLines: string) => {
    const f = fixture([]);
    writeFileSync(join(f.repo, "agents", "reader.md"), `---\nname: reader\ndescription: "fixture reader"\n${frontmatterLines}---\n\nbody\n`);
    const r = f.run("--to", "opencode", "--dest", f.dest);
    expect(r.status).toBe(0);
    return frontmatter(join(f.dest, "opencode", "reader.md"));
  };

  const READS = [
    "git log --oneline -5",
    "git show HEAD",
    "git blame src/a.ts",
    "rg foo src/",
    "ls -la",
    "cat README.md",
    "git diff-tree -r -p -M main side",
    "git diff-index -p -M HEAD",
    "git diff-files -p",
    "git ls-files --others --exclude-standard --full-name :/",
    "git --no-optional-locks status --porcelain",
    "git merge-base main side",
    "git rev-parse --show-toplevel",
    "git hash-object -t tree /dev/null",
  ];
  const WRITES = [
    "touch x",
    "rm -rf y",
    "mv a b",
    "cp a b",
    "tee f",
    "git commit -m x",
    "git push",
    "git checkout main",
    "git log > out.txt",
    "git log >> out.txt",
    "cat README.md > copy.md",
    "git log --output=o.txt",
    "sed -i s/a/b/ f",
    "cat a >b",
    "cat a>b",
    "rg x >o",
    "git log >out",
    "git log 1>out",
    "cat a 2>e",
    "cat a 2> e",
    "cat a &>out",
    "cat a &> out",
    "cat >out <<'EOF'",
    "rg --pre cat x",
    "rg --hostname-bin ./hn.sh --hyperlink-format default needle f.txt",
    "rg --hostname-bin=./hn.sh needle",
    "git diff --ext-diff",
    "git log --textconv -p",
    "git hash-object -w x",
  ];

  test("a read-only def's map allows the shared reads and refuses writes", () => {
    const fm = install("tools: Read, Bash\n");

    const bash = fm.permission?.bash ?? {};
    expect(Object.keys(bash)[0]).toBe("*");
    expect(bash["*"]).toBe("deny");
    for (const command of READS) expect([command, decide(bash, command)]).toEqual([command, "allow"]);
    for (const command of WRITES) expect([command, decide(bash, command)]).toEqual([command, "deny"]);
  });

  test("a denylist read-only def gets the same map", () => {
    const fm = install("disallowedTools: Edit, Write, NotebookEdit, Agent, Task\n");

    const bash = fm.permission?.bash ?? {};
    for (const command of READS) expect([command, decide(bash, command)]).toEqual([command, "allow"]);
    for (const command of WRITES) expect([command, decide(bash, command)]).toEqual([command, "deny"]);
  });

  test("a def's own declared checks are allowed and still cannot redirect", () => {
    const fm = install("tools: Read, Bash\n# opencode-bash-allow: cargo clippy *, cargo check *\n");

    const bash = fm.permission?.bash ?? {};
    expect(decide(bash, "cargo clippy --all-targets")).toBe("allow");
    expect(decide(bash, "cargo check")).toBe("allow");
    expect(decide(bash, "cargo build")).toBe("deny");
    expect(decide(bash, "cargo clippy > o.txt")).toBe("deny");
  });

  test("several opencode-bash-allow lines merge", () => {
    const fm = install("tools: Read, Bash\n# opencode-bash-allow: cargo clippy *\n# opencode-bash-allow: cargo check *\n");

    const bash = fm.permission?.bash ?? {};
    expect(decide(bash, "cargo clippy --all-targets")).toBe("allow");
    expect(decide(bash, "cargo check")).toBe("allow");
  });

  // opencode reads a frontmatter whose map repeats a key as no frontmatter at all and then
  // grants every tool; Bun.YAML accepts the repeat, so the key paths are read off the emitted
  // text (keyPaths, below).
  test.each([
    ["a pattern repeated across marker lines", "# opencode-bash-allow: cargo check *\n# opencode-bash-allow: cargo clippy *, cargo check *\n"],
    ["a pattern the shared reads already hold", "# opencode-bash-allow: rg *\n"],
  ])("%s is emitted once", (_label, allow) => {
    const f = fixture([]);
    writeFileSync(join(f.repo, "agents", "reader.md"), `---\nname: reader\ndescription: "fixture reader"\ntools: Read, Bash\n${allow}---\n\nbody\n`);
    expect(f.run("--to", "opencode", "--dest", f.dest).status).toBe(0);

    const paths = keyPaths(join(f.dest, "opencode", "reader.md"));
    expect(paths).toContain('permission.bash."rg *"');
    expect(paths.filter((k, i) => paths.indexOf(k) !== i)).toEqual([]);
  });

  test("an allow pattern that is also a deny is a catalog defect on both targets", () => {
    for (const target of ["codex", "opencode"]) {
      const f = fixture([]);
      writeFileSync(join(f.repo, "agents", "reader.md"), `---\nname: reader\ndescription: "fixture reader"\ntools: Read, Bash\n# opencode-bash-allow: cargo check *, * --fix *\n---\n\nbody\n`);

      const r = f.run("--to", target, "--dest", f.dest);

      expect([target, r.status === 0]).toEqual([target, false]);
      expect(r.stderr).toContain('reader: opencode-bash-allow pattern "* --fix *" is also a deny rule');
      expect(existsSync(join(f.dest, target))).toBe(false);
    }
  });

  test.each([
    ["a plural key", "# opencode-bash-allows: cargo check"],
    ["a capitalized key", "# Opencode-bash-allow: cargo check"],
    ["an indented marker", " # opencode-bash-allow: cargo check"],
    ["underscores for hyphens", "# opencode_bash_allow: cargo check"],
    ["a missing colon", "# opencode-bash-allow cargo check"],
    ["a bare key", "opencode-bash-allow: cargo check"],
    ["no harness prefix", "# bash-allow: cargo check"],
    ["no bash infix", "# opencode-allow: cargo check"],
  ])("an allow marker with %s is a catalog defect on both targets", (_label, line) => {
    for (const target of ["codex", "opencode"]) {
      const f = fixture([]);
      writeFileSync(join(f.repo, "agents", "reader.md"), `---\nname: reader\ndescription: "fixture reader"\ntools: Read, Bash\n${line}\n---\n\nbody\n`);

      const r = f.run("--to", target, "--dest", f.dest);

      expect([target, r.status === 0]).toEqual([target, false]);
      expect(r.stderr).toContain(`reader: opencode-bash-allow marker ${JSON.stringify(line)} must be exactly "# opencode-bash-allow: <pattern>, <pattern>"`);
      expect(existsSync(join(f.dest, target))).toBe(false);
    }
  });

  // a wildcard in the command word matches commands no check names, so the deny-all is void.
  test.each(["* --help", "*", "cargo* *", "?argo check"])("an allow pattern %p is a catalog defect on both targets", (pattern) => {
    for (const target of ["codex", "opencode"]) {
      const f = fixture([]);
      writeFileSync(join(f.repo, "agents", "reader.md"), `---\nname: reader\ndescription: "fixture reader"\ntools: Read, Bash\n# opencode-bash-allow: ${pattern}\n---\n\nbody\n`);

      const r = f.run("--to", target, "--dest", f.dest);

      expect([target, r.status === 0]).toEqual([target, false]);
      expect(r.stderr).toContain(`reader: opencode-bash-allow pattern ${JSON.stringify(pattern)} has a wildcard in its command word, which matches commands no check names`);
      expect(existsSync(join(f.dest, target))).toBe(false);
    }
  });

  // a wildcard before the last word lets any subcommand or flag in (`cargo run -- --help`); only a
  // trailing path or argument slot may be open. A command word that runs its arguments (`env`,
  // `sh -c`) is a residual no shape check sees: the shipped allow lines are pinned by equality below.
  test.each(["cargo * --help", "git * x", "gh pr * view *"])("an allow pattern %p is a catalog defect on both targets", (pattern) => {
    for (const target of ["codex", "opencode"]) {
      const f = fixture([]);
      writeFileSync(join(f.repo, "agents", "reader.md"), `---\nname: reader\ndescription: "fixture reader"\ntools: Read, Bash\n# opencode-bash-allow: ${pattern}\n---\n\nbody\n`);

      const r = f.run("--to", target, "--dest", f.dest);

      expect([target, r.status === 0]).toEqual([target, false]);
      expect(r.stderr).toContain(`reader: opencode-bash-allow pattern ${JSON.stringify(pattern)} has a wildcard before its last word, which matches commands no check names`);
      expect(existsSync(join(f.dest, target))).toBe(false);
    }
  });

  // every key path of the emitted frontmatter, so a repeat anywhere (not only in the bash map) shows.
  const keyPaths = (file: string) => {
    const stack: [number, string][] = [];
    const paths: string[] = [];
    for (const line of readFileSync(file, "utf8").split("\n---\n")[0].replace(/^---\n/, "").split("\n")) {
      const m = line.match(/^( *)("(?:[^"\\]|\\.)*"|[^\s:"][^:]*):(?: |$)/);
      if (!m) continue;
      while (stack.length && stack[stack.length - 1][0] >= m[1].length) stack.pop();
      stack.push([m[1].length, m[2]]);
      paths.push(stack.map(([, k]) => k).join("."));
    }
    return paths;
  };

  test.each([
    ["a repeated allowlist tool", "tools: Read, Read, Bash\n"],
    ["a repeated denylist tool", "disallowedTools: Edit, Write, Write, NotebookEdit, Agent, Task\n"],
  ])("a def with %s emits every frontmatter key once", (_label, lines) => {
    const f = fixture([]);
    writeFileSync(join(f.repo, "agents", "reader.md"), `---\nname: reader\ndescription: "fixture reader"\n${lines}---\n\nbody\n`);
    expect(f.run("--to", "opencode", "--dest", f.dest).status).toBe(0);

    const paths = keyPaths(join(f.dest, "opencode", "reader.md"));
    expect(paths).toContain("tools.write");
    expect(paths.filter((k, i) => paths.indexOf(k) !== i)).toEqual([]);
  });

  test("an empty opencode-bash-allow line adds nothing and leaves the next line alone", () => {
    const fm = install("tools: Read, Bash\n# opencode-bash-allow:\nmodel: sonnet\n# opencode-bash-allow: cargo check *\n");

    expect(allowsOf(fm.permission?.bash ?? {})).toEqual([...SHARED_READS, "cargo check *"].sort());
  });

  test.each([
    ["no tool restriction", ""],
    ["a Write grant", "tools: Read, Bash, Write\n"],
    ["the workspace-write marker", "tools: Bash, Read\n# sandbox: workspace-write\n"],
  ])("a def with %s gets no bash permission map", (_label, lines) => {
    const fm = install(lines);

    expect(fm.permission?.bash).toBeUndefined();
  });

  test.each([
    ["Agent and Task", "disallowedTools: Edit, Write, NotebookEdit, Agent, Task\n"],
    ["Agent alone", "disallowedTools: Edit, Write, NotebookEdit, Agent\n"],
    ["Task alone", "disallowedTools: Edit, Write, NotebookEdit, Task\n"],
  ])("a def denying %s cannot spawn agents on opencode", (_label, lines) => {
    const fm = install(lines);

    expect(fm.permission?.task).toBe("deny");
  });

  test("plain git diff, which rewrites the index, is refused to a read-only def", () => {
    const fm = install("tools: Read, Bash\n");

    expect(decide(fm.permission?.bash ?? {}, "git diff HEAD")).toBe("deny");
  });

  test("a bash allow list on a def that can write is a catalog defect on the codex target too", () => {
    const f = fixture([]);
    writeFileSync(join(f.repo, "agents", "reader.md"), `---\nname: reader\ndescription: "fixture reader"\ntools: Bash, Read, Write\n# opencode-bash-allow: cargo clippy *\n---\n\nbody\n`);

    const r = f.run("--to", "codex", "--dest", f.dest);

    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("reader:");
    expect(r.stderr).toContain("opencode-bash-allow");
    expect(existsSync(join(f.dest, "codex"))).toBe(false);
  });

  test("a writing def whose allowlist names no Agent cannot spawn agents on opencode either", () => {
    const fm = install("tools: Bash, Read\n# sandbox: workspace-write\n");

    expect(fm.permission?.task).toBe("deny");
    expect(fm.permission?.bash).toBeUndefined();
  });

  test("a def denying Bash keeps bash off: no map turns it back on", () => {
    const fm = install("disallowedTools: Bash, Edit, Write, NotebookEdit\n") as { permission?: { bash?: unknown }; tools?: Record<string, boolean> };

    expect(fm.permission?.bash).toBeUndefined();
    expect(fm.tools?.bash).toBe(false);
  });

  test.each([
    ["an unknown sandbox marker", "tools: Bash, Read\n# sandbox: workspace_write\n", '"workspace_write"'],
    ["a bash allow list on a def that can write", "tools: Bash, Read, Write\n# opencode-bash-allow: cargo clippy *\n", "opencode-bash-allow"],
  ])("%s is a catalog defect on the opencode target too", (_label, lines, named) => {
    const f = fixture([]);
    writeFileSync(join(f.repo, "agents", "reader.md"), `---\nname: reader\ndescription: "fixture reader"\n${lines}---\n\nbody\n`);

    const r = f.run("--to", "opencode", "--dest", f.dest);

    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("reader:");
    expect(r.stderr).toContain(named);
    expect(existsSync(join(f.dest, "opencode"))).toBe(false);
  });

  // The shipped read-only defs: each fixed tool check its body names must run on opencode (a
  // test run or a repo script stays refused, since it runs the reviewed repo's code), and
  // web-researcher's GitHub reads must stay reads.
  const shippedMap = (name: string) => {
    const f = fixture([]);
    copyFileSync(join(import.meta.dir, "..", "agents", `${name}.md`), join(f.repo, "agents", `${name}.md`));
    const r = f.run("--to", "opencode", "--dest", f.dest);
    expect(r.status).toBe(0);
    return frontmatter(join(f.dest, "opencode", `${name}.md`)).permission?.bash ?? {};
  };

  // The whole allow set of each shipped map, by equality: a widened allow line reds here.
  const SHARED_READS = [
    "rg *", "ls *", "cat *", "git log *", "git show *", "git blame *", "git diff-tree *", "git diff-index *",
    "git diff-files *", "git ls-files *", "git --no-optional-locks status *", "git merge-base *", "git rev-parse *",
    "git hash-object -t tree /dev/null",
  ];
  const allowsOf = (bash: Record<string, string>) => Object.entries(bash).filter(([, v]) => v === "allow").map(([k]) => k).sort();

  const DECLARED_CHECKS: [string, string[]][] = [
    ["code-explorer", []],
    ["flutter-reviewer", []],
    ["ux-reviewer", []],
    ["rust-reviewer", ["cargo check", "cargo check --all-targets", "cargo check --workspace --all-targets", "cargo clippy", "cargo clippy --all-targets", "cargo clippy --workspace --all-targets", "cargo clippy --all-targets -- -D warnings", "cargo clippy --workspace --all-targets -- -D warnings"]],
    ["shell-reviewer", ["shellcheck *", "bash -n -- *"]],
    ["python-reviewer", ["ruff check --no-fix -- *", "mypy --no-install-types --interactive -- *"]],
    ["web-reviewer", ["tsc --noEmit", "tsc --noEmit -p .", "tsc --noEmit -p tsconfig.json"]],
    ["web-researcher", ["gh pr view *", "gh pr diff *", "gh pr list *", "gh pr checks *", "gh issue view *", "gh issue list *", "gh search *"]],
  ];

  test.each(DECLARED_CHECKS)("the shipped %s map allows the shared reads plus exactly its declared checks", (name, own) => {
    expect(allowsOf(shippedMap(name))).toEqual([...SHARED_READS, ...own].sort());
  });

  test("every shipped def the converter gives a bash map is pinned above", () => {
    const f = fixture([]);
    const shipped = join(import.meta.dir, "..", "agents");
    const names = readdirSync(shipped).filter((n) => n.endsWith(".md")).map((n) => n.replace(/\.md$/, ""));
    for (const name of names) copyFileSync(join(shipped, `${name}.md`), join(f.repo, "agents", `${name}.md`));
    expect(f.run("--to", "opencode", "--dest", f.dest).status).toBe(0);

    const mapped = names.filter((name) => frontmatter(join(f.dest, "opencode", `${name}.md`)).permission?.bash !== undefined).sort();
    expect(mapped).toEqual(DECLARED_CHECKS.map(([name]) => name).sort());
    for (const name of names) {
      const paths = keyPaths(join(f.dest, "opencode", `${name}.md`));
      expect([name, paths.filter((k, i) => paths.indexOf(k) !== i)]).toEqual([name, []]);
    }
  });

  test.each([
    // each check allow is an exact command or ends in `--` before its paths, so no flag the agent
    // adds, in any spelling (glued, abbreviated, `false`, `@file`, quote-split), reaches the check
    ["rust-reviewer", ["cargo check", "cargo clippy --all-targets", "cargo clippy --workspace --all-targets -- -D warnings"], ["cargo build", "cargo fix", "cargo clippy --fix --allow-dirty", "cargo clippy -- --emit=llvm-ir=src/main.rs", "cargo check --target-dir src/t", "cargo check --config build.rustc-wrapper=./w.sh", "cargo clippy --all-targets -- --emit=llvm-ir=x", "cargo clippy --all-target''s"]],
    ["shell-reviewer", ["shellcheck install.sh", "bash -n -- install.sh"], ["bash -n +n s.sh", "bash s.sh"]],
    // a repo config can turn a plain check into a write (`fix = true` for ruff; `install_types` +
    // `non_interactive` for mypy, which then pip-installs), so only the overriding flags are allowed;
    // `pytest --collect-only` imports the reviewed tree's conftest.py, and a tox env install runs pip
    ["python-reviewer", ["ruff check --no-fix -- src", "ruff check --no-fix -- .", "mypy --no-install-types --interactive -- src"], ["ruff check src", "ruff check --no-fix src", "ruff check --fix .", "ruff check --no-fix -oX.txt src", "ruff check --no-fix --output-file r.txt -- src", "ruff check --no-fix -''o q.txt -- src", "mypy src", "mypy --no-install-types --interactive src", "mypy --no-install-types --interactive --junit-x o.xml -- src", "mypy --install-ty --non-inter src", "pytest --collect-only -q", "tox -e py"]],
    ["web-reviewer", ["tsc --noEmit", "tsc --noEmit -p .", "tsc --noEmit -p tsconfig.json"], ["tsc", "npx tsc --noEmit", "tsc --noEmitOnError a.ts", "tsc --noEmit false", "tsc --noEmit @args.txt", "tsc --noEmit -i", "tsc --noEmit --init", "tsc --noEmit -p web/", "tsc --noEmit fal''se"]],
    // a write no flag shows stays a residual: a repo config that turns one on (ruff
    // `output-file`, a tsconfig `incremental`), and each check's own cache (`target/`, `.mypy_cache/`)
  ])("the shipped %s may run exactly its declared checks and no flag added to them", (name, allowed, denied) => {
    const bash = shippedMap(name);

    for (const command of allowed) expect([command, decide(bash, command)]).toEqual([command, "allow"]);
    for (const command of denied) expect([command, decide(bash, command)]).toEqual([command, "deny"]);
  });

  test("the shipped web-researcher reads GitHub threads and never writes to them", () => {
    const bash = shippedMap("web-researcher");

    for (const command of ["gh pr view 12 --comments", "gh pr diff 12", "gh issue view 7", "gh pr list --state all", "gh search prs is:open repo:o/r"])
      expect([command, decide(bash, command)]).toEqual([command, "allow"]);
    for (const command of ["gh pr comment 12 -b x", "gh pr merge 12", "gh issue close 7", "gh api -X POST repos/o/r/issues", "gh api repos/o/r/issues -f title=x"])
      expect([command, decide(bash, command)]).toEqual([command, "deny"]);
  });
});

describe("a symlink at a planned file", () => {
  // the write follows the link, so a link whose target is gone fails mid-install; the
  // preflight refuses it before any target is written.
  test("a dangling symlink refuses the whole install before any target is written", () => {
    const f = fixture(["kept"]);
    const codex = join(f.dest, "codex");
    mkdirSync(codex, { recursive: true });
    symlinkSync(join(f.root, "gone", "kept.toml"), join(codex, "kept.toml"));

    const r = f.run("--to", "all", "--dest", f.dest, "kept");

    expect(r.status).toBe(1);
    expect(r.stderr).toBe(`"${codex}/kept.toml": cannot write (a dangling symlink); fix that path or pass a --dest that is a writable directory\n`);
    expect(r.stdout).toBe("");
    expect(existsSync(join(f.dest, "opencode"))).toBe(false);
    expect(existsSync(join(codex, ".agenticat.json"))).toBe(false);
  });

  test("a symlink to an existing file is written through and stays a link", () => {
    const f = fixture(["kept"]);
    const codex = join(f.dest, "codex");
    mkdirSync(codex, { recursive: true });
    const target = join(f.root, "dotfiles-kept.toml");
    writeFileSync(target, "old\n");
    symlinkSync(target, join(codex, "kept.toml"));

    const r = f.run("--to", "codex", "--dest", f.dest, "kept");

    expect(r.status).toBe(0);
    expect(lstatSync(join(codex, "kept.toml")).isSymbolicLink()).toBe(true);
    expect(readFileSync(target, "utf8")).toContain('name = "kept"');
  });

  test("a stale converted file left as a dangling symlink is pruned on --update", () => {
    const f = fixture(["kept"]);
    const codex = join(f.dest, "codex");
    writeManifest(codex, "codex", ["kept", "gone"]);
    symlinkSync(join(f.root, "missing", "gone.toml"), join(codex, "gone.toml"));

    const r = f.run("--update", "--dest", f.dest);

    expect(r.status).toBe(0);
    expect(() => lstatSync(join(codex, "gone.toml"))).toThrow();
    expect(r.stdout).toContain(`  codex: removed "${codex}/gone.toml"\n`);
  });

  // a write the preflight cannot foresee (here a full device behind the link) still names
  // its path, escaped like every other printed path.
  test("a write failing mid-install names its path escaped", () => {
    const f = fixture(["kept"]);
    const dest = join(f.root, "a\x1bb");
    const codex = join(dest, "codex");
    mkdirSync(codex, { recursive: true });
    symlinkSync("/dev/full", join(codex, "kept.toml"));

    const r = f.run("--to", "codex", "--dest", dest, "kept");

    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain(`error: "${f.root}/a\\u001bb/codex/kept.toml": cannot write (ENOSPC)\n`);
    for (const line of r.stderr.split("\n")) expect(line).not.toMatch(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u);
  });

  test("a dangling symlink whose target directory exists is refused too, and its target is never created", () => {
    const f = fixture(["kept"]);
    const codex = join(f.dest, "codex");
    mkdirSync(codex, { recursive: true });
    const target = join(f.root, "dotfiles", "kept.toml");
    mkdirSync(join(f.root, "dotfiles"));
    symlinkSync(target, join(codex, "kept.toml"));

    const r = f.run("--to", "all", "--dest", f.dest, "kept");

    expect(r.status).toBe(1);
    expect(r.stderr).toBe(`"${codex}/kept.toml": cannot write (a dangling symlink); fix that path or pass a --dest that is a writable directory\n`);
    expect(existsSync(target)).toBe(false);
    expect(existsSync(join(f.dest, "opencode"))).toBe(false);
  });

  test("a manifest write failing mid-install names its path escaped", () => {
    const f = fixture(["kept"]);
    const dest = join(f.root, `m${String.fromCharCode(0x202e)}n`);
    const codex = join(dest, "codex");
    mkdirSync(codex, { recursive: true });
    symlinkSync("/dev/full", join(codex, ".agenticat.json"));

    const r = f.run("--to", "codex", "--dest", dest, "kept");

    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain(`error: "${f.root}/m\\u202en/codex/.agenticat.json": cannot write (ENOSPC)\n`);
    for (const line of r.stderr.split("\n")) expect(line).not.toMatch(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u);
  });

  // a write the preflight passes but the kernel refuses for that path is the user's to fix,
  // so it is the one-line refusal, never a trace.
  test("a write refused for its path mid-install is the one-line refusal", () => {
    const f = fixture(["kept"]);
    const codex = join(f.dest, "codex");
    mkdirSync(codex, { recursive: true });
    symlinkSync("/proc/self/uid_map", join(codex, "kept.toml"));

    const r = f.run("--to", "codex", "--dest", f.dest, "kept");

    expect(r.status).toBe(1);
    expect(r.stderr).toBe(`"${codex}/kept.toml": cannot write (EPERM); fix that path or pass a --dest that is a writable directory\n`);
  });

  // opening a FIFO blocks and a socket cannot be opened, so either at a planned file would
  // stop the install after another target was written; the run is bounded so an open of
  // the FIFO fails the test instead of hanging it.
  test.each([
    ["a FIFO", (at: string) => spawnSync("mkfifo", [at])],
    ["a socket", (at: string) => spawnSync("python3", ["-I", "-c", "import socket,sys; socket.socket(socket.AF_UNIX).bind(sys.argv[1])", at])],
  ])("a symlink to %s refuses the whole install before any target is written", (kind, make) => {
    const f = fixture(["kept"]);
    const codex = join(f.dest, "codex");
    mkdirSync(codex, { recursive: true });
    const special = join(f.root, "special");
    expect(make(special).status).toBe(0);
    symlinkSync(special, join(codex, "kept.toml"));

    const r = spawnSync("bun", [join(f.repo, "bin", "install-agents.ts"), "--to", "all", "--dest", f.dest, "kept"], {
      cwd: f.root,
      env: { ...process.env, HOME: f.home },
      encoding: "utf8",
      timeout: 10000,
    });

    expect(r.status).toBe(1);
    expect(r.stderr).toBe(`"${codex}/kept.toml": cannot write (${kind}); fix that path or pass a --dest that is a writable directory\n`);
    expect(existsSync(join(f.dest, "opencode"))).toBe(false);
  });

  // unlink cannot remove a mount point, and no preflight check tells one apart reliably (a
  // same-filesystem bind keeps its device, a mount table entry can be hidden), so this prune
  // fails after the writes: a deliberate limit, which still names its path escaped.
  test.skipIf(spawnSync("unshare", ["-rm", "true"]).status !== 0)("a stale converted file that is a mount point fails the prune with its path escaped", () => {
    const f = fixture(["kept"]);
    const dest = join(f.root, `d${String.fromCharCode(0x202e)}x`);
    const codex = join(dest, "codex");
    writeManifest(codex, "codex", ["kept", "gone"]);
    writeFileSync(join(codex, "gone.toml"), "stale\n");
    const over = join(f.root, "over.toml");
    writeFileSync(over, "mounted\n");

    const r = spawnSync(
      "unshare",
      ["-rm", "sh", "-c", 'mount --bind "$1" "$2" && exec bun "$3" --update --dest "$4"', "sh", over, join(codex, "gone.toml"), join(f.repo, "bin", "install-agents.ts"), dest],
      { cwd: f.root, env: { ...process.env, HOME: f.home }, encoding: "utf8" },
    );

    expect(r.status).toBe(1);
    expect(r.stderr).toBe(`"${f.root}/d\\u202ex/codex/gone.toml": cannot remove (EBUSY); fix that path or pass a --dest that is a writable directory\n`);
  });

  // a write the kernel refuses for that path is the user's to fix, whatever its code; EPERM,
  // EINVAL and EBUSY are pinned, and other codes (ENXIO, ETXTBSY) take the same branch.
  test("a write refused with EINVAL mid-install is the one-line refusal", () => {
    const f = fixture(["kept"]);
    const codex = join(f.dest, "codex");
    mkdirSync(codex, { recursive: true });
    symlinkSync("/proc/self/oom_score_adj", join(codex, "kept.toml"));

    const r = f.run("--to", "codex", "--dest", f.dest, "kept");

    expect(r.status).toBe(1);
    expect(r.stderr).toBe(`"${codex}/kept.toml": cannot write (EINVAL); fix that path or pass a --dest that is a writable directory\n`);
  });

  // a file-size limit is the system failing, not the path: it keeps its trace. EDQUOT,
  // EMFILE, ENFILE, ENOMEM, ENOBUFS and EIO share that branch but no unprivileged fixture
  // raises them through the converter, so only ENOSPC and EFBIG are pinned.
  test("a write over the file-size limit keeps its trace, its path escaped", () => {
    const f = fixture(["kept"]);
    const dest = join(f.root, `f${String.fromCharCode(0x202e)}z`);

    const r = spawnSync("sh", ["-c", 'trap "" XFSZ; ulimit -f 0; exec bun "$1" --to codex --dest "$2" kept', "sh", join(f.repo, "bin", "install-agents.ts"), dest], {
      cwd: f.root,
      env: { ...process.env, HOME: f.home },
      encoding: "utf8",
    });

    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain(`error: "${f.root}/f\\u202ez/codex/kept.toml": cannot write (EFBIG)\n`);
    expect(r.stderr).not.toContain("fix that path");
    for (const line of r.stderr.split("\n")) expect(line).not.toMatch(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u);
  });

  // reading a FIFO blocks, so a manifest that is one is refused before the read; bounded
  // so a blocking read fails the test instead of hanging it.
  test("a manifest that is a FIFO refuses --update instead of blocking", () => {
    const f = fixture(["kept"]);
    const codex = join(f.dest, "codex");
    mkdirSync(codex, { recursive: true });
    expect(spawnSync("mkfifo", [join(codex, ".agenticat.json")]).status).toBe(0);

    const r = spawnSync("bun", [join(f.repo, "bin", "install-agents.ts"), "--update", "--dest", f.dest], {
      cwd: f.root,
      env: { ...process.env, HOME: f.home },
      encoding: "utf8",
      timeout: 10000,
    });

    expect(r.status).toBe(1);
    expect(r.stderr).toBe(`"${codex}/.agenticat.json": cannot read (a FIFO); remove or fix the permissions of that path, then reinstall with: '${join(f.repo, "install.sh")}' --to codex --dest '${f.dest}'\n`);
  });

  // a device never ends its read (a terminal blocks, /dev/zero runs out of memory), so a
  // manifest that is one is refused before the read like a FIFO.
  test("a manifest that is a device refuses --update instead of reading it", () => {
    const f = fixture(["kept"]);
    const codex = join(f.dest, "codex");
    mkdirSync(codex, { recursive: true });
    symlinkSync("/dev/zero", join(codex, ".agenticat.json"));

    const r = spawnSync("bun", [join(f.repo, "bin", "install-agents.ts"), "--update", "--dest", f.dest], {
      cwd: f.root,
      env: { ...process.env, HOME: f.home },
      encoding: "utf8",
      timeout: 10000,
    });

    expect(r.status).toBe(1);
    expect(r.stderr).toBe(`"${codex}/.agenticat.json": cannot read (a device); remove or fix the permissions of that path, then reinstall with: '${join(f.repo, "install.sh")}' --to codex --dest '${f.dest}'\n`);
  });

  // unlink removes the link itself, so a stale converted file that is a link to a directory
  // or a link loop is pruned like any other stale file.
  test.each([
    ["a link to a directory", (f: { root: string }, at: string) => (mkdirSync(join(f.root, "somedir")), symlinkSync(join(f.root, "somedir"), at))],
    ["a link loop", (_f: { root: string }, at: string) => symlinkSync(at, at)],
  ])("a stale converted file that is %s is pruned on --update", (_label, plant) => {
    const f = fixture(["kept"]);
    const codex = join(f.dest, "codex");
    writeManifest(codex, "codex", ["kept", "gone"]);
    plant(f, join(codex, "gone.toml"));

    const r = f.run("--update", "--dest", f.dest);

    expect([r.status, r.stderr]).toEqual([0, ""]);
    expect(() => lstatSync(join(codex, "gone.toml"))).toThrow();
    expect(r.stdout).toContain(`  codex: removed "${codex}/gone.toml"\n`);
  });
});
