import { expect, test } from "bun:test";
import { Fail } from "../src/base/fail";
import type { Io } from "../src/base/inputs";
import {
  ARGS as LAYOUT_ARGS,
  MAX as LAYOUT_MAX,
  SPECS as LAYOUT_SPECS,
  USAGE as LAYOUT_USAGE,
  runLayout,
} from "../src/cli/cmd-layout";
import {
  ARGS as PATHS_ARGS,
  MAX as PATHS_MAX,
  SPECS as PATHS_SPECS,
  USAGE as PATHS_USAGE,
  runPaths,
} from "../src/cli/cmd-paths";

type FakeIo = Io & { calls: string[] };

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function fakeIo(
  options: { files?: Map<string, Uint8Array>; stdin?: Uint8Array; failedFiles?: Set<string> } = {},
): FakeIo {
  const calls: string[] = [];
  const files = options.files ?? new Map<string, Uint8Array>();
  const stdin = options.stdin ?? new Uint8Array();
  const failedFiles = options.failedFiles ?? new Set<string>();

  return {
    calls,
    readStdin() {
      calls.push("readStdin");
      return stdin;
    },
    readFile(path: string) {
      calls.push(`readFile:${path}`);
      const contents = files.get(path);
      if (failedFiles.has(path) || contents === undefined) {
        throw new Error("file read failed");
      }
      return contents;
    },
    writeFile(path: string, data: Uint8Array) {
      calls.push(`writeFile:${path}:${data.length}`);
    },
    out(text: string) {
      calls.push(`out:${text}`);
    },
    err(text: string) {
      calls.push(`err:${text}`);
    },
  };
}

function errorFrom(action: () => unknown): Error {
  try {
    action();
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
    throw new Error("Expected an Error");
  }
  throw new Error("Expected operation to throw");
}

function expectFail(action: () => unknown, message: string): void {
  const failure = errorFrom(action);
  expect(failure).toBeInstanceOf(Fail);
  expect(failure.message).toBe(message);
}

test("paths and layout export the required metadata and callable handlers", () => {
  const pathsHandler: typeof runPaths = runPaths;
  const layoutHandler: typeof runLayout = runLayout;

  expect(PATHS_USAGE).toBe("jsonsplice paths FILE [PATH]");
  expect(PATHS_ARGS).toEqual(["FILE"]);
  expect(PATHS_MAX).toBe(2);
  expect(PATHS_SPECS).toEqual([]);
  expect(LAYOUT_USAGE).toBe("jsonsplice layout FILE");
  expect(LAYOUT_ARGS).toEqual(["FILE"]);
  expect(LAYOUT_MAX).toBe(1);
  expect(LAYOUT_SPECS).toEqual([]);
  expect(pathsHandler).toBe(runPaths);
  expect(layoutHandler).toBe(runLayout);
});

test("paths lists the omitted and explicit root in document order", () => {
  const io = fakeIo({ files: new Map([["a.jsonc", utf8('{"a":1}')]]) });

  expect(runPaths(["a.jsonc"], new Set(), io)).toEqual({
    out: "path  kind    line  col  value\n$     object  1     1    -\n$.a   number  1     6    1\nvalues      2\n",
    code: 0,
  });
  expect(runPaths(["a.jsonc", "$"], new Set(), io)).toEqual({
    out: "path  kind    line  col  value\n$     object  1     1    -\n$.a   number  1     6    1\nvalues      2\n",
    code: 0,
  });
  expect(io.calls).toEqual(["readFile:a.jsonc", "readFile:a.jsonc"]);
});

test("paths lists a selected scalar with its absolute path", () => {
  const io = fakeIo({ files: new Map([["a.jsonc", utf8('{"a":1}')]]) });

  expect(runPaths(["a.jsonc", "a"], new Set(), io)).toEqual({
    out: "path  kind    line  col  value\n$.a   number  1     6    1\nvalues      1\n",
    code: 0,
  });
  expect(io.calls).toEqual(["readFile:a.jsonc"]);
});

test("paths includes duplicate members and selects the last duplicate subtree", () => {
  const io = fakeIo({ files: new Map([["dup.jsonc", utf8('{"a":1,"a":[2]}')]]) });

  expect(runPaths(["dup.jsonc"], new Set(), io)).toEqual({
    out: "path    kind    line  col  value\n$       object  1     1    -\n$.a     number  1     6    1\n$.a     array   1     12   -\n$.a[0]  number  1     13   2\nvalues      4\n",
    code: 0,
  });
  expect(runPaths(["dup.jsonc", "a"], new Set(), io)).toEqual({
    out: "path    kind    line  col  value\n$.a     array   1     12   -\n$.a[0]  number  1     13   2\nvalues      2\n",
    code: 0,
  });
  expect(io.calls).toEqual(["readFile:dup.jsonc", "readFile:dup.jsonc"]);
});

test("paths returns a negative answer for an absent selected path", () => {
  const io = fakeIo({ files: new Map([["a.jsonc", utf8('{"a":1}')]]) });

  expect(runPaths(["a.jsonc", "missing"], new Set(), io)).toEqual({ out: "", code: 1 });
  expect(io.calls).toEqual(["readFile:a.jsonc"]);
});

test("paths preserves key and index kind-mismatch failures", () => {
  const io = fakeIo({ files: new Map([["a.jsonc", utf8('{"a":1}')]]) });

  expectFail(
    () => runPaths(["a.jsonc", "a.x"], new Set(), io),
    "at $.a the value is a number, not an object",
  );
  expectFail(
    () => runPaths(["a.jsonc", "a[0]"], new Set(), io),
    "at $.a the value is a number, not an array",
  );
  expect(io.calls).toEqual(["readFile:a.jsonc", "readFile:a.jsonc"]);
});

test("paths preserves malformed and empty path diagnostics", () => {
  const io = fakeIo({ files: new Map([["a.jsonc", utf8('{"a":1}')]]) });

  expectFail(
    () => runPaths(["a.jsonc", "a..b"], new Set(), io),
    'invalid path "a..b" at character 3',
  );
  expectFail(() => runPaths(["a.jsonc", ""], new Set(), io), 'invalid path "" at character 1');
  expect(io.calls).toEqual(["readFile:a.jsonc", "readFile:a.jsonc"]);
});

test("FILE parsing errors precede PATH parsing and are prefixed for both commands", () => {
  const pathIo = fakeIo({
    files: new Map([["bad.jsonc", utf8('{"a": 1,, "b": 2}')]]),
  });
  const layoutIo = fakeIo({
    files: new Map([["bad.jsonc", utf8('{"a": 1,, "b": 2}')]]),
  });

  expectFail(
    () => runPaths(["bad.jsonc", "a..b"], new Set(), pathIo),
    '"bad.jsonc": JS001 unexpected character "," at 1:9',
  );
  expectFail(
    () => runLayout(["bad.jsonc"], new Set(), layoutIo),
    '"bad.jsonc": JS001 unexpected character "," at 1:9',
  );
  expect(pathIo.calls).toEqual(["readFile:bad.jsonc"]);
  expect(layoutIo.calls).toEqual(["readFile:bad.jsonc"]);
});

test("file read failures and malformed stdin bytes are preserved without side effects", () => {
  const missingIo = fakeIo();
  const pathStdinIo = fakeIo({ stdin: new Uint8Array([123, 255, 10]) });
  const layoutStdinIo = fakeIo({ stdin: new Uint8Array([123, 255, 10]) });

  expectFail(
    () => runPaths(["missing.jsonc", "a..b"], new Set(), missingIo),
    '"missing.jsonc": cannot read the file',
  );
  expectFail(() => runPaths(["-"], new Set(), pathStdinIo), "<stdin>: input is not valid UTF-8");
  expectFail(() => runLayout(["-"], new Set(), layoutStdinIo), "<stdin>: input is not valid UTF-8");
  expect(missingIo.calls).toEqual(["readFile:missing.jsonc"]);
  expect(pathStdinIo.calls).toEqual(["readStdin"]);
  expect(layoutStdinIo.calls).toEqual(["readStdin"]);
});

test("layout reports plain LF input with exact output", () => {
  const io = fakeIo({ files: new Map([["plain.jsonc", utf8("{}\n")]]) });

  expect(runLayout(["plain.jsonc"], new Set(), io)).toEqual({
    out: "newline     lf\nindent      2 spaces\ntrailing    no\nfinal       yes\nbom         no\n",
    code: 0,
  });
  expect(io.calls).toEqual(["readFile:plain.jsonc"]);
});

test("layout reports BOM, CRLF, tab indentation, trailing comma, and no final LF", () => {
  const io = fakeIo({
    files: new Map([["win.jsonc", utf8('\uFEFF{\r\n\t"a": 1,\r\n\t"b": [1, 2],\r\n}')]]),
  });

  expect(runLayout(["win.jsonc"], new Set(), io)).toEqual({
    out: "newline     crlf\nindent      1 tab\ntrailing    yes\nfinal       no\nbom         yes\n",
    code: 0,
  });
  expect(io.calls).toEqual(["readFile:win.jsonc"]);
});

test("layout reports mixed indentation from stdin with LF output", () => {
  const io = fakeIo({ stdin: utf8('{\n \t"a":1\n}') });

  expect(runLayout(["-"], new Set(), io)).toEqual({
    out: "newline     lf\nindent      mixed\ntrailing    no\nfinal       no\nbom         no\n",
    code: 0,
  });
  expect(io.calls).toEqual(["readStdin"]);
});

test("paths strips a BOM, accepts comments and trailing commas, and sanitizes values", () => {
  const io = fakeIo({ stdin: utf8('\uFEFF{/*c*/"a b":["é",],}') });

  expect(runPaths(["-", '["a b"][0]'], new Set(), io)).toEqual({
    out: 'path         kind    line  col  value\n$["a b"][0]  string  1     14   "?"\nvalues      1\n',
    code: 0,
  });
  expect(io.calls).toEqual(["readStdin"]);
});

test("paths lists absolute indexes for a negative index and nothing for a missing one", () => {
  const io = fakeIo({ files: new Map([["n.jsonc", utf8('{"tags": ["a", ["b", "c"]]}')]]) });

  expect(runPaths(["n.jsonc", "tags[-1]"], new Set(), io)).toEqual({
    out: 'path          kind    line  col  value\n$.tags[1]     array   1     16   -\n$.tags[1][0]  string  1     17   "b"\n$.tags[1][1]  string  1     22   "c"\nvalues      3\n',
    code: 0,
  });
  expect(runPaths(["n.jsonc", "tags[-3]"], new Set(), io)).toEqual({ out: "", code: 1 });
});
