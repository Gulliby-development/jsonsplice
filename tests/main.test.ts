import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("real entry point rejects malformed UTF-8 from stdin with exact byte output", () => {
  const result = Bun.spawnSync([process.execPath, "src/main.ts", "check", "-"], {
    cwd: repositoryRoot,
    stdin: new Uint8Array([0x7b, 0xff, 0x0a]),
    stdout: "pipe",
    stderr: "pipe",
    timeout: 30_000,
  });

  expect(result.exitCode).toBe(2);
  expect(new Uint8Array(result.stdout)).toEqual(new Uint8Array());
  expect(new Uint8Array(result.stderr)).toEqual(
    new TextEncoder().encode("jsonsplice: <stdin>: input is not valid UTF-8\n"),
  );
}, 30_000);

test("README examples, headings, and complete source/test inventory match the project", () => {
  const readme = readFileSync(resolve(repositoryRoot, "README.md"), "utf8").replace(/\r\n/g, "\n");

  expect(readme).toContain("## Install");
  expect(readme).toContain("## Usage");
  expect(readme).toContain("## Commands");
  expect(readme).toContain("## Exit codes");
  expect(readme).toContain("## Development");
  expect(readme).toContain("## Layout");
  expect(readme).toContain("people who maintain configuration files");
  expect(readme).toContain("offline command-line tool");
  expect(readme).toContain("comments, indentation, line endings");
  expect(readme).toContain("`jsonsplice` is shorthand for `bun run src/main.ts`");
  expect(readme).toContain("`-` as FILE");
  expect(readme).toContain("strict JSON (not JSONC)");
  expect(readme).toContain("`--write`");
  expect(readme).toContain("`0`: success.");
  expect(readme).toContain("`1`: `check` found problems");
  expect(readme).toContain("`2`: an error occurred");
  expect(readme).toContain("bun run typecheck");
  expect(readme).toContain("bun run lint");
  expect(readme).toContain("bun test");
  expect(readme).toContain("`jsonsplice paths config.jsonc` prints:");
  expect(readme).toContain("`jsonsplice set config.jsonc limits.min 1` prints the document");

  const helpFirst = `${[
    "```text",
    "usage: jsonsplice check FILE",
    "       jsonsplice get FILE PATH",
    "       jsonsplice paths FILE [PATH]",
    "       jsonsplice layout FILE",
  ].join("\n")}\n`;
  const helpLast = [
    "       jsonsplice set FILE PATH VALUE [--write]",
    "       jsonsplice insert FILE PATH VALUE [--write]",
    "       jsonsplice delete FILE PATH [--write]",
    "```",
    "",
  ].join("\n");
  const helpStart = readme.indexOf(helpFirst);
  expect(helpStart).toBeGreaterThanOrEqual(0);
  expect(readme.indexOf(helpLast, helpStart)).toBe(helpStart + helpFirst.length);

  const configFirst = `${[
    "```jsonc",
    "{",
    "  // server settings",
    '  "name": "api",',
    '  "port": 8080, // default port',
  ].join("\n")}\n`;
  const configLast = [
    '  "tags": ["a", "b"],',
    '  "limits": {',
    '    "max": 10',
    "  }",
    "}",
    "```",
    "",
  ].join("\n");
  const configStart = readme.indexOf(configFirst);
  expect(configStart).toBeGreaterThanOrEqual(0);
  expect(readme.indexOf(configLast, configStart)).toBe(configStart + configFirst.length);

  const pathsFirst = `${[
    "```text",
    "path          kind    line  col  value",
    "$             object  1     1    -",
    '$.name        string  3     11   "api"',
    "$.port        number  4     11   8080",
    "$.tags        array   5     11   -",
    '$.tags[0]     string  5     12   "a"',
  ].join("\n")}\n`;
  const pathsLast = [
    '$.tags[1]     string  5     17   "b"',
    "$.limits      object  6     13   -",
    "$.limits.max  number  7     12   10",
    "values      8",
    "```",
    "",
  ].join("\n");
  const pathsStart = readme.indexOf(pathsFirst);
  expect(pathsStart).toBeGreaterThanOrEqual(0);
  expect(readme.indexOf(pathsLast, pathsStart)).toBe(pathsStart + pathsFirst.length);

  const setFirst = `${[
    "```jsonc",
    "{",
    "  // server settings",
    '  "name": "api",',
    '  "port": 8080, // default port',
  ].join("\n")}\n`;
  const setLast = [
    '  "tags": ["a", "b"],',
    '  "limits": {',
    '    "max": 10,',
    '    "min": 1',
    "  }",
    "}",
    "```",
    "",
  ].join("\n");
  const setCommand = readme.indexOf("`jsonsplice set config.jsonc limits.min 1`");
  expect(setCommand).toBeGreaterThanOrEqual(0);
  const setStart = readme.indexOf(setFirst, setCommand);
  expect(setStart).toBeGreaterThanOrEqual(0);
  expect(readme.indexOf(setLast, setStart)).toBe(setStart + setFirst.length);

  const layoutStart = readme.indexOf("## Layout");
  expect(layoutStart).toBeGreaterThanOrEqual(0);
  const layoutBullets = readme
    .slice(layoutStart)
    .split(String.fromCharCode(10))
    .filter((line) => line.startsWith("- `"));
  expect(layoutBullets).toHaveLength(49);
  expect(layoutBullets.slice(0, 17)).toEqual([
    "- `src/`",
    "- `src/main.ts`",
    "- `src/base/`",
    "- `src/base/fail.ts`",
    "- `src/base/text.ts`",
    "- `src/base/options.ts`",
    "- `src/base/inputs.ts`",
    "- `src/syntax/`",
    "- `src/syntax/source.ts`",
    "- `src/syntax/scanner.ts`",
    "- `src/syntax/tree.ts`",
    "- `src/syntax/parser.ts`",
    "- `src/path/`",
    "- `src/path/steps.ts`",
    "- `src/path/resolve.ts`",
    "- `src/layout/`",
    "- `src/layout/layout.ts`",
  ]);
  expect(layoutBullets.slice(17, 35)).toEqual([
    "- `src/layout/render.ts`",
    "- `src/edit/`",
    "- `src/edit/splice.ts`",
    "- `src/edit/grow.ts`",
    "- `src/edit/shrink.ts`",
    "- `src/edit/change.ts`",
    "- `src/cli/`",
    "- `src/cli/cmd-check.ts`",
    "- `src/cli/cmd-get.ts`",
    "- `src/cli/cmd-paths.ts`",
    "- `src/cli/cmd-layout.ts`",
    "- `src/cli/cmd-set.ts`",
    "- `src/cli/cmd-insert.ts`",
    "- `src/cli/cmd-delete.ts`",
    "- `src/cli/cli.ts`",
    "- `tests/`",
    "- `tests/text.test.ts`",
    "- `tests/options.test.ts`",
  ]);
  expect(layoutBullets.slice(35)).toEqual([
    "- `tests/source.test.ts`",
    "- `tests/scanner.test.ts`",
    "- `tests/parser.test.ts`",
    "- `tests/steps.test.ts`",
    "- `tests/resolve.test.ts`",
    "- `tests/layout.test.ts`",
    "- `tests/render.test.ts`",
    "- `tests/grow.test.ts`",
    "- `tests/shrink.test.ts`",
    "- `tests/change.test.ts`",
    "- `tests/read.test.ts`",
    "- `tests/info.test.ts`",
    "- `tests/write.test.ts`",
    "- `tests/main.test.ts`",
  ]);

  const entryNames = (path: string) =>
    readdirSync(resolve(repositoryRoot, path), { withFileTypes: true })
      .map((entry) =>
        entry.isDirectory()
          ? `${entry.name}/`
          : entry.isFile()
            ? entry.name
            : `${entry.name}[special]`,
      )
      .sort();

  expect(entryNames("src")).toEqual([
    "base/",
    "cli/",
    "edit/",
    "layout/",
    "main.ts",
    "path/",
    "syntax/",
  ]);
  expect(entryNames("src/base")).toEqual(["fail.ts", "inputs.ts", "options.ts", "text.ts"]);
  expect(entryNames("src/syntax")).toEqual(["parser.ts", "scanner.ts", "source.ts", "tree.ts"]);
  expect(entryNames("src/path")).toEqual(["resolve.ts", "steps.ts"]);
  expect(entryNames("src/layout")).toEqual(["layout.ts", "render.ts"]);
  expect(entryNames("src/edit")).toEqual(["change.ts", "grow.ts", "shrink.ts", "splice.ts"]);
  expect(entryNames("src/cli")).toEqual([
    "cli.ts",
    "cmd-check.ts",
    "cmd-delete.ts",
    "cmd-get.ts",
    "cmd-insert.ts",
    "cmd-layout.ts",
    "cmd-paths.ts",
    "cmd-set.ts",
  ]);
  expect(entryNames("tests")).toEqual([
    "change.test.ts",
    "grow.test.ts",
    "info.test.ts",
    "layout.test.ts",
    "main.test.ts",
    "options.test.ts",
    "parser.test.ts",
    "read.test.ts",
    "render.test.ts",
    "resolve.test.ts",
    "scanner.test.ts",
    "shrink.test.ts",
    "source.test.ts",
    "steps.test.ts",
    "text.test.ts",
    "write.test.ts",
  ]);
}, 30_000);
