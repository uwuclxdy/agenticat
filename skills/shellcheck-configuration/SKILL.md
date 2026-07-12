---
name: shellcheck-configuration
description: "ShellCheck rc-file and directive discipline. Use when adding a `.shellcheckrc`, silencing warnings (`# shellcheck disable=`), or gating CI."
metadata:
  author: uwuclxdy
  version: "1.0"
---

# ShellCheck Configuration

## Field Reality

Healthy shell code runs ShellCheck near default: rare directives, each with a reason, not a blanket-exclusion `.shellcheckrc` or a script full of `disable=`.

## `.shellcheckrc`

ShellCheck looks for `.shellcheckrc` (or `shellcheckrc`) in the script's directory, then walks up through parent directories. If none is found it falls back to `~/.shellcheckrc` / `$XDG_CONFIG_HOME/shellcheckrc`. `--norc` skips discovery; `--rcfile PATH` forces one (editors/LSPs that shell out inherit this).

Useful keys (same names as inline directives, applied file-wide):

- `shell=bash|sh|dash|ksh|busybox`: pin the dialect instead of relying on the shebang.
- `source-path=DIR`, repeatable, or `source-path=SCRIPTDIR`: where `source`/`.` statements resolve.
- `external-sources=true`: follow `source` targets outside the files passed on the command line.
- `disable=`, `enable=`: same semantics as the inline forms below.

Severity has no rc key. Gate it with `-S`/`--severity` on the invocation, not in the file.

Minimal, defensible:
```
shell=bash
source-path=SCRIPTDIR
external-sources=true
enable=quote-safe-variables
enable=check-unassigned-uppercase
```

Don't blanket-`disable=` a list of codes with no per-line reason attached.

## Inline Directives

```sh
# shellcheck key=value key=value
command-or-block
```

Placement decides scope. A directive before the first command in the file is file-wide; anywhere else it applies only to the command or block immediately below it (a function, a loop, a brace group):

```sh
# shellcheck disable=SC2016  # single-quoted on purpose, template written verbatim for envsubst
{
  echo 'PATH=foo:$PATH' >> ~/.bashrc
}
```

Every `disable=` carries a same-line reason comment.

The one directive real fleets need is runtime-resolved sourcing:
```sh
# shellcheck source=./lib.sh
source "$(find_install_dir)/lib.sh"
# shellcheck source=/dev/null
source "$dynamic_path"
```
`source=/dev/null` tells ShellCheck to stop guessing a path it can never resolve at analysis time.

`shell=` works inline too, for files with no shebang (sourced libraries, `.bashrc` fragments):
```sh
# shellcheck shell=bash
```

## Codes Worth Touching

| code | means | honest fix | when disable is legitimate |
|---|---|---|---|
| SC1090 / SC1091 | can't follow a non-constant or missing source | add `# shellcheck source=path` | path is runtime-only; use `source=/dev/null` |
| SC2034 | variable appears unused | check for a typo or dead assignment | variable is consumed only by the file that sources this one |
| SC2154 | variable referenced but never assigned | assign it, or check the actual name | variable comes from a sourced config file ShellCheck can't see |

Disabling any of these without one of those reasons is hiding a real bug, not documenting an exception.

## Severity, Exit Codes, Output

`-S error|warning|info|style` sets the reporting floor. Default is `style`, the loosest setting: it reports everything down to style nits. Tighten CI with `-S warning` to skip stylistic noise.

Exit codes: `0` clean, `1` issues found, `2` a file could not be processed, `3` bad invocation syntax, `4` bad option value. CI should fail on any non-zero exit, not just `1`.

Output formats: `-f gcc` for editors that parse compiler output, `-f json1` for tooling, `-f diff` for a unified diff of the auto-fixable issues. Pipe `-f diff` straight into an apply step to auto-fix:
```sh
shellcheck -f diff script.sh | git apply
```

## CI

```sh
shopt -s globstar
shellcheck -S warning **/*.sh
shfmt -d .
```
`shellcheck` catches correctness, `shfmt -d` catches formatting drift. Run both; fail on either.
