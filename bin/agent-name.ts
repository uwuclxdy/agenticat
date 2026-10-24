// the def format the converter and the linter must read the same way: the shared name
// pattern, the frontmatter parser, the marker comments it does not carry, and the
// permission refusals both of them preview.

// the installer lets a manifest name reach a path join only when it matches this, and the
// linter holds every def's name to it, so no def installs once and is dropped on --update.
export const AGENT_NAME = /^[a-z0-9][a-z0-9-]*$/;

// one-line quoted form for untrusted text in a printed line: after JSON.stringify (which escapes
// C0), every remaining control, format character (bidi controls, a byte order mark, an
// Arabic letter mark) and line or paragraph separator is escaped by its Unicode category,
// since each would print as itself or reorder the line.
export const quote = (text: unknown) =>
  (JSON.stringify(text) ?? String(text)).replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, (c) =>
    c
      .split("")
      .map((u) => `\\u${u.charCodeAt(0).toString(16).padStart(4, "0")}`)
      .join(""),
  );

const SANDBOX_STEM = "sandbox";
const ALLOW_KEY = "opencode-bash-allow";
// the harness prefix and the bash infix are both droppable in a lookalike, and either
// spelling still names the marker, so a reader that skipped it would drop the checks.
const ALLOW_STEM = "(?:opencode[-_ ]?)?bash[-_ ]?allow|opencode[-_ ]?allow";

// a `#...` span is a YAML comment only when removing it to the end of its line leaves the
// block's parse unchanged. Inside a quoted or block scalar the same removal changes the
// value, so the span is data; a block the parser rejects refuses earlier, and a span no
// parse can settle stays data.
function hashIsComment(lines: string[], index: number, hash: number): boolean {
  let original: string | undefined;
  try {
    original = JSON.stringify(Bun.YAML.parse(lines.join("\n")));
  } catch {
    return false;
  }
  const without = [...lines.slice(0, index), lines[index].slice(0, hash), ...lines.slice(index + 1)];
  try {
    return JSON.stringify(Bun.YAML.parse(without.join("\n"))) === original;
  } catch {
    return false;
  }
}

// the exact form of a frontmatter marker is `#` at column 0, optional spaces or tabs,
// then the lowercase key and its colon. any other spelling is a near miss: a reader that
// skips it ships the marker unchecked, so every caller refuses one. a near miss is a hash
// comment naming the key's stem (capitalised, suffixed, or a space before the colon) or
// the stem written as a top-level YAML key, which alone can start at column 0: a nested
// key shares the line's indentation and is data.
export function markerForm(lines: string[], index: number, key: string, stem: string): "exact" | "near-miss" | "none" {
  const line = lines[index];
  if (new RegExp(`^#[ \\t]*${key}:`).test(line)) return "exact";
  // no word boundary: a suffixed key (`sandboxed`, `linter`) is a lookalike too.
  for (const match of line.matchAll(new RegExp(`(?:^|\\s)(#)\\s*(?:${stem})`, "gi"))) {
    if (hashIsComment(lines, index, match.index! + match[0].indexOf("#"))) return "near-miss";
  }
  if (new RegExp(`^(?:${stem})[\\w-]*\\s*:`, "i").test(line)) return "near-miss";
  return "none";
}

// Every harness that reads the catalog parses the block as YAML, so the scripts read it
// through the same parser: a block YAML rejects, a repeated top-level key, or a top-level
// line that is not a plain `key: value` entry is a catalog defect, never a value to guess
// at. A field the scripts read as text must be one.
export type Frontmatter = Record<string, unknown>;

// the delimiter match copies Claude Code's own frontmatter reader: one leading byte order
// mark is stripped, the opener is `---` plus optional spaces or tabs, and the block closes
// on the first later `---` plus optional spaces or tabs followed by a line end. taking the
// same shape is what makes an accepted def one Claude Code parses. only the block's line
// ends are folded, CRLF and a lone CR alike (both are YAML line breaks), so every reader of
// the block sees the same lines; the body is copied out as written ("" when the closer
// ends the file).
export function splitFrontmatter(raw: string): { block: string; body: string } | undefined {
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const m = text.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/);
  return m ? { block: m[1].replace(/\r\n?/g, "\n"), body: text.slice(m[0].length) } : undefined;
}

export function readFrontmatter(block: string): { fields: Frontmatter } | { defect: string } {
  let parsed: unknown;
  try {
    parsed = Bun.YAML.parse(block);
  } catch (err) {
    return { defect: `frontmatter is not valid YAML (${(err as Error).message})` };
  }
  if (parsed === null) return { fields: {} };
  if (typeof parsed !== "object" || Array.isArray(parsed))
    return { defect: "frontmatter is not a YAML mapping" };
  // Bun.YAML.parse keeps a repeated key's last value silently, and only a plain key can be
  // read off its line exactly, so every top-level line is held to a plain `key: value`
  // entry and the repeat check runs over those names alone. that covers every top-level
  // line, not only keys: a `[ \t]`-led line holding content before the first key (only an
  // indented root mapping puts one there) and a core-schema spelling (`true`/`True`,
  // `null`/`NULL`, ...) that resolves to one key each are refused too.
  const seen = new Set<string>();
  for (const line of block.split("\n")) {
    if (/^[ \t]*(?:#|$)/.test(line)) continue;
    // once the parse returns a mapping, a column-0 `-` item can only belong to the key
    // above: a column-0 sequence anywhere else fails the parse. skipped so a block sequence
    // value, a valid def, is not refused as a top-level line; `-x:` and `---x` stay read.
    if (/^-([ \t]|$)/.test(line)) continue;
    if (/^[ \t]/.test(line)) {
      if (seen.size === 0)
        return { defect: `frontmatter line ${quote(line)} is not a plain top-level \`key: value\` entry` };
      continue;
    }
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):(?=[ \t]|$)/);
    if (!m || /^(?:null|Null|NULL|true|True|TRUE|false|False|FALSE)$/.test(m[1]))
      return { defect: `frontmatter line ${quote(line)} is not a plain top-level \`key: value\` entry` };
    const key = m[1];
    if (seen.has(key))
      return { defect: `frontmatter key ${quote(key)} appears more than once; YAML keeps only the last` };
    seen.add(key);
  }
  return { fields: parsed as Frontmatter };
}

export function stringField(fields: Frontmatter, key: string): { value?: string } | { defect: string } {
  const value = fields[key];
  if (value === undefined || value === null) return { value: undefined };
  if (typeof value !== "string") return { defect: `frontmatter field "${key}" is not a string` };
  return { value };
}

export interface Markers {
  sandbox?: string;
  bashAllow: string[];
}

// Marker comments are YAML comments, so the parser above drops them; each frontmatter line
// is read as a comment instead. A line the reader cannot read exactly would silently ship
// the wrong sandbox or drop a check, so a near miss and an unknown value are both defects.
export function readMarkers(block: string): { markers: Markers } | { defect: string } {
  const lines = block.split("\n");
  let sandbox: string | undefined;
  for (const [i, line] of lines.entries()) {
    const form = markerForm(lines, i, SANDBOX_STEM, SANDBOX_STEM);
    if (form === "none") continue;
    const value = form === "exact" ? line.match(/^#[ \t]*sandbox:[ \t]*(\S+)[ \t]*$/)?.[1] : undefined;
    if (value === undefined)
      return { defect: `sandbox marker ${quote(line)} must be exactly "# sandbox: <value>" with nothing after the value` };
    if (value !== "workspace-write")
      return { defect: `unknown sandbox marker ${quote(value)} (expected "workspace-write")` };
    sandbox ??= value;
  }
  // every marker line merges, in order: a def may list its checks on more than one line.
  // a line is read alone, so an empty marker cannot swallow the next line.
  const bashAllow: string[] = [];
  for (const [i, line] of lines.entries()) {
    const form = markerForm(lines, i, ALLOW_KEY, ALLOW_STEM);
    if (form === "near-miss")
      return { defect: `opencode-bash-allow marker ${quote(line)} must be exactly "# opencode-bash-allow: <pattern>, <pattern>"` };
    if (form === "none") continue;
    const rest = line.match(/^#[ \t]*opencode-bash-allow:[ \t]*(.*)$/)?.[1] ?? "";
    for (const pattern of rest.split(",").map((p) => p.trim()).filter(Boolean)) bashAllow.push(pattern);
  }
  return { markers: { sandbox, bashAllow } };
}

// the tool grants the shared permission checks read.
export interface ToolGrants {
  tools?: string[];
  disallowedTools?: string[];
  sandbox?: string;
}

// a def that writes the filesystem: the codex sandbox rule and the opencode bash
// allowlist both key on it.
export function writesFiles(a: ToolGrants): boolean {
  const mutates = a.tools
    ? a.tools.some((t) => ["Write", "Edit"].includes(t))
    : a.disallowedTools
      ? !["Write", "Edit"].every((t) => a.disallowedTools!.includes(t))
      : true;
  return mutates || a.sandbox === "workspace-write";
}

// a def that grants Bash: the allowlist form names it, the denylist form does not deny
// it, and a def with neither inherits it.
export function grantsBash(a: ToolGrants): boolean {
  if (a.tools) return a.tools.includes("Bash");
  if (a.disallowedTools) return !a.disallowedTools.includes("Bash");
  return true;
}

// anything holding `>` refuses every redirect spelling attached to the matched command
// (`cat a >b`, `cat a>b`, `git log 2>&1`), and each remaining pattern is a flag spelling
// that writes or spawns through an allowed read command. opencode sees a redirect only
// when it is attached to the command node, so a redirect on a group or a loop
// (`{ cat a; } > out`) and a bare `>out` reach the shell unblocked; `*>*` also refuses a
// search whose pattern holds `>` (`rg '->'`).
// `git diff` stays out of the read allows: it refreshes the index (a write) and runs a
// configured diff.external by default. `git log -p`, `git show` and `git blame` run a
// configured textconv driver too; a driver's command comes from the box's git config, and
// the tree's .gitattributes only selects one, so the flag denies below stop a caller
// asking for a driver, not a configured one.
// a flag deny on a shared read stops an accidental flag, not a deliberate one: opencode
// matches the command's raw text, and the shell then joins quote-split words, so
// `rg --p''re ./x.sh` reaches the allowed `rg *` as one command (measured). a check whose
// command offers a writing or executing flag is allowed only as an exact command or with a
// literal `--` before its paths, so its prefix must match and no added flag fits; one whose
// command offers no flag that writes (`shellcheck *`, `bash -n -- *`, the `gh` reads) may
// use a wildcard.
export const OPENCODE_DENIES = [
  "*>*",
  "git * --output*",
  "git * --ext-diff*",
  "git * --textconv*",
  "rg *--pre*",
  // `--hostname-bin` executes the named program, the same class as `--pre`.
  "rg *--hostname-bin*",
  // a flag that writes source or installs packages, reached through an allowed check:
  // `cargo clippy --fix`, `ruff check --fix`, `--fix-only`, `--add-noqa`, `mypy
  // --install-types`. `* --fix *` also refuses a search whose arguments hold the literal
  // (`rg -F -- --fix src`), the same collateral class as `*>*`.
  "* --fix *",
  "* --fix-only*",
  "* --add-noqa*",
  "* --install-types*",
];

// every allow-marker refusal the def text alone can trigger: an allow pattern a deny rule
// also matches, a wildcard where only the last word may stay open, and a marker on a def
// with no bash map to extend. both scripts report one, each adding its own prefix.
export function allowDefect(a: ToolGrants & { bashAllow: string[] }): string | undefined {
  for (const pattern of a.bashAllow) {
    if (OPENCODE_DENIES.includes(pattern))
      return `opencode-bash-allow pattern ${quote(pattern)} is also a deny rule`;
    const words = pattern.split(/[ \t]+/);
    // a wildcard command word matches commands no check names, so the deny-all is void.
    if (/[*?]/.test(words[0]))
      return `opencode-bash-allow pattern ${quote(pattern)} has a wildcard in its command word, which matches commands no check names`;
    // only the last word, a trailing path or argument slot, may stay open: a wildcard
    // before it admits any subcommand or flag. a command word that runs its arguments
    // (`env`, `sh -c`) stays a residual no shape check sees.
    if (words.slice(0, -1).some((word) => /[*?]/.test(word)))
      return `opencode-bash-allow pattern ${quote(pattern)} has a wildcard before its last word, which matches commands no check names`;
  }
  // the marker extends the read-only bash map, so on a def without one it is a catalog
  // defect rather than a silent no-op; both targets read the catalog, so both refuse.
  if (a.bashAllow.length && (writesFiles(a) || !grantsBash(a)))
    return "opencode-bash-allow has no bash map to extend (the def writes files or grants no Bash)";
  return undefined;
}
