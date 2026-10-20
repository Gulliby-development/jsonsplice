<p align="center"><img src="docs/logo.svg" width="96" alt="" /></p>

# jsonsplice

jsonsplice is an offline command-line tool for people who maintain configuration files that use JSON with comments (JSONC), including TypeScript and editor settings. It checks and reads JSONC, lists paths and detected layout, and edits values while preserving comments, indentation, line endings, and all untouched source text.

[![CI](https://github.com/Gulliby-development/jsonsplice/actions/workflows/ci.yml/badge.svg)](https://github.com/Gulliby-development/jsonsplice/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Why

Editing `tsconfig.json`-style files with a generic JSON tool usually throws the comments away and re-indents the whole file. jsonsplice changes only the value you name: it splices the new text into the original source, so a one-line edit stays a one-line diff in version control.

## Install

Install [Bun](https://bun.sh/) 1.4 or newer, then clone this repository and install its development dependencies from the repository root:

```sh
git clone https://github.com/Gulliby-development/jsonsplice.git
cd jsonsplice
bun install
```

There is no separately installed `jsonsplice` executable. Run the entry point with Bun:

```sh
bun run src/main.ts
```

In the command examples below, `jsonsplice` is shorthand for `bun run src/main.ts`; for example, run `bun run src/main.ts check config.jsonc` from the repository root.

## Usage

The general form is:

```text
bun run src/main.ts COMMAND FILE [PATH] [VALUE] [--write]
```

Use `-` as FILE to read a document from standard input. `set` and `insert` accept VALUE as strict JSON (not JSONC); quote the value as needed for your shell. By default, editing commands print the changed document and do not write the file. Add `--write` to update the named file in place. The editor preserves the input's final-newline state rather than adding a newline unconditionally.

The example file `config.jsonc`:

```jsonc
{
  // server settings
  "name": "api",
  "port": 8080, // default port
  "tags": ["a", "b"],
  "limits": {
    "max": 10
  }
}
```

## Commands

The help output lists every command and its arguments:

```text
usage: jsonsplice check FILE
       jsonsplice get FILE PATH
       jsonsplice paths FILE [PATH]
       jsonsplice layout FILE
       jsonsplice set FILE PATH VALUE [--write]
       jsonsplice insert FILE PATH VALUE [--write]
       jsonsplice delete FILE PATH [--write]
```

- `check FILE` validates JSONC and reports syntax or duplicate-key problems.
- `get FILE PATH` prints the selected value exactly as it appears in the source.
- `paths FILE [PATH]` lists the selected value and its descendants with positions.
- `layout FILE` reports newline, indentation, trailing-comma, final-newline, and BOM information.
- `set FILE PATH VALUE [--write]` replaces a value or adds a missing object key / array element.
- `insert FILE PATH VALUE [--write]` inserts a value at an array index.
- `delete FILE PATH [--write]` removes a selected value.

The path may be omitted only for `paths`. JSONC documents may contain line and block comments and a trailing comma; VALUE arguments use strict JSON.

For example, `jsonsplice paths config.jsonc` prints:

```text
path          kind    line  col  value
$             object  1     1    -
$.name        string  3     11   "api"
$.port        number  4     11   8080
$.tags        array   5     11   -
$.tags[0]     string  5     12   "a"
$.tags[1]     string  5     17   "b"
$.limits      object  6     13   -
$.limits.max  number  7     12   10
values      8
```

`jsonsplice set config.jsonc limits.min 1` prints the document with the new member while retaining the surrounding source:

```jsonc
{
  // server settings
  "name": "api",
  "port": 8080, // default port
  "tags": ["a", "b"],
  "limits": {
    "max": 10,
    "min": 1
  }
}
```

## Exit codes

- `0`: success.
- `1`: `check` found problems, or `get`, `paths`, or `delete` found no matching path.
- `2`: an error occurred, such as invalid input or an unreadable file.

## Development

Run the checks from the repository root:

```sh
bun run typecheck
bun run lint
bun test
```

## Layout

The repository's source and test inventory is:

- `src/`
- `src/main.ts`
- `src/base/`
- `src/base/fail.ts`
- `src/base/text.ts`
- `src/base/options.ts`
- `src/base/inputs.ts`
- `src/syntax/`
- `src/syntax/source.ts`
- `src/syntax/scanner.ts`
- `src/syntax/tree.ts`
- `src/syntax/parser.ts`
- `src/path/`
- `src/path/steps.ts`
- `src/path/resolve.ts`
- `src/layout/`
- `src/layout/layout.ts`
- `src/layout/render.ts`
- `src/edit/`
- `src/edit/splice.ts`
- `src/edit/grow.ts`
- `src/edit/shrink.ts`
- `src/edit/change.ts`
- `src/cli/`
- `src/cli/cmd-check.ts`
- `src/cli/cmd-get.ts`
- `src/cli/cmd-paths.ts`
- `src/cli/cmd-layout.ts`
- `src/cli/cmd-set.ts`
- `src/cli/cmd-insert.ts`
- `src/cli/cmd-delete.ts`
- `src/cli/cli.ts`
- `tests/`
- `tests/text.test.ts`
- `tests/options.test.ts`
- `tests/source.test.ts`
- `tests/scanner.test.ts`
- `tests/parser.test.ts`
- `tests/steps.test.ts`
- `tests/resolve.test.ts`
- `tests/layout.test.ts`
- `tests/render.test.ts`
- `tests/grow.test.ts`
- `tests/shrink.test.ts`
- `tests/change.test.ts`
- `tests/read.test.ts`
- `tests/info.test.ts`
- `tests/write.test.ts`
- `tests/main.test.ts`

## License

MIT, see [LICENSE](LICENSE).

---

Built with BAKED
