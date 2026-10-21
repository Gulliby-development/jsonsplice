import { expect, test } from "bun:test";
import { Fail } from "../src/base/fail";
import type { Io } from "../src/base/inputs";
import {
  ARGS as CHECK_ARGS,
  MAX as CHECK_MAX,
  SPECS as CHECK_SPECS,
  USAGE as CHECK_USAGE,
  runCheck,
} from "../src/cli/cmd-check";
import {
  ARGS as GET_ARGS,
  MAX as GET_MAX,
  SPECS as GET_SPECS,
  USAGE as GET_USAGE,
  runGet,
} from "../src/cli/cmd-get";

type FakeIo = Io & { calls: string[] };

function fakeIo(options: { stdin?: Uint8Array; files?: Map<string, Uint8Array> } = {}): FakeIo {
  const calls: string[] = [];
  const stdin = options.stdin ?? new Uint8Array();
  const files = options.files ?? new Map<string, Uint8Array>();

  return {
    calls,
    readStdin() {
      calls.push("readStdin");
      return stdin;
    },
    readFile(path: string) {
      calls.push(`readFile:${path}`);
      const bytes = files.get(path);
      if (bytes === undefined) {
        throw new Error("file read failed");
      }
      return bytes;
    },
    writeFile(path: string, _data: Uint8Array) {
      calls.push(`writeFile:${path}`);
    },
    out(text: string) {
      calls.push(`out:${text}`);
    },
    err(text: string) {
      calls.push(`err:${text}`);
    },
  };
}

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function failureFrom(action: () => unknown): Error {
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
  const failure = failureFrom(action);
  expect(failure).toBeInstanceOf(Fail);
  expect(failure.message).toBe(message);
}

test("check and get export the required metadata and handler signatures", () => {
  const check: typeof runCheck = runCheck;
  const get: typeof runGet = runGet;

  expect(check).toBe(runCheck);
  expect(get).toBe(runGet);
  expect([CHECK_USAGE, CHECK_ARGS, CHECK_MAX, CHECK_SPECS]).toEqual([
    "jsonsplice check FILE",
    ["FILE"],
    1,
    [],
  ]);
  expect([GET_USAGE, GET_ARGS, GET_MAX, GET_SPECS]).toEqual([
    "jsonsplice get FILE PATH",
    ["FILE", "PATH"],
    2,
    [],
  ]);
});

test("runCheck counts each valid JSONC document including the root", () => {
  const scalarIo = fakeIo({ files: new Map([["input.jsonc", bytes("null")]]) });
  const nestedIo = fakeIo({
    files: new Map([["input.jsonc", bytes('{"a":[1,true,null],}')]]),
  });
  const commentIo = fakeIo({
    files: new Map([["input.jsonc", bytes("/* before */ [1,] // after")]]),
  });

  expect(runCheck(["input.jsonc"], new Set(), scalarIo)).toEqual({
    out: "ok, 1 value\n",
    code: 0,
  });
  expect(runCheck(["input.jsonc"], new Set(), nestedIo)).toEqual({
    out: "ok, 5 values\n",
    code: 0,
  });
  expect(runCheck(["input.jsonc"], new Set(), commentIo)).toEqual({
    out: "ok, 2 values\n",
    code: 0,
  });
  expect(scalarIo.calls).toEqual(["readFile:input.jsonc"]);
  expect(nestedIo.calls).toEqual(["readFile:input.jsonc"]);
  expect(commentIo.calls).toEqual(["readFile:input.jsonc"]);
});

test("runCheck reports the first syntax problem before duplicate keys", () => {
  const malformedIo = fakeIo({
    files: new Map([["input.jsonc", bytes('{"a": 1,, "b": 2}')]]),
  });
  const syntaxAfterDuplicatesIo = fakeIo({
    files: new Map([["input.jsonc", bytes('{"a":1,"a":2} x')]]),
  });

  expect(runCheck(["input.jsonc"], new Set(), malformedIo)).toEqual({
    out: 'JS001 unexpected character "," at 1:9\n1 problem\n',
    code: 1,
  });
  expect(runCheck(["input.jsonc"], new Set(), syntaxAfterDuplicatesIo)).toEqual({
    out: 'JS001 unexpected character "x" at 1:15\n1 problem\n',
    code: 1,
  });
  expect(malformedIo.calls).toEqual(["readFile:input.jsonc"]);
  expect(syntaxAfterDuplicatesIo.calls).toEqual(["readFile:input.jsonc"]);
});

test("runCheck reports singular and offset-ordered plural duplicate diagnostics", () => {
  const singularIo = fakeIo({
    files: new Map([["input.jsonc", bytes('{"a":1,"a":2}')]]),
  });
  const pluralIo = fakeIo({
    files: new Map([["input.jsonc", bytes('{"a": 1, "b": {"a": 2, "a": 3}, "a": 4}')]]),
  });

  expect(runCheck(["input.jsonc"], new Set(), singularIo)).toEqual({
    out: 'JS009 duplicate key "a" at 1:8\n1 problem\n',
    code: 1,
  });
  expect(runCheck(["input.jsonc"], new Set(), pluralIo)).toEqual({
    out: 'JS009 duplicate key "a" at 1:24\nJS009 duplicate key "a" at 1:33\n2 problems\n',
    code: 1,
  });
  expect(singularIo.calls).toEqual(["readFile:input.jsonc"]);
  expect(pluralIo.calls).toEqual(["readFile:input.jsonc"]);
});

test("runGet preserves scalar tokens and container comments and line endings", () => {
  const text = '/* lead */ {"n":1e+02,"s":"\\u0061","box":{\r\n  /* keep */ "x": 1,\r\n}} // tail';
  const io = fakeIo({ files: new Map([["input.jsonc", bytes(text)]]) });

  expect(runGet(["input.jsonc", "n"], new Set(), io)).toEqual({ out: "1e+02\n", code: 0 });
  expect(runGet(["input.jsonc", "s"], new Set(), io)).toEqual({
    out: '"\\u0061"\n',
    code: 0,
  });
  expect(runGet(["input.jsonc", "box"], new Set(), io)).toEqual({
    out: '{\r\n  /* keep */ "x": 1,\r\n}\n',
    code: 0,
  });
  expect(runGet(["input.jsonc", "$"], new Set(), io)).toEqual({
    out: '{"n":1e+02,"s":"\\u0061","box":{\r\n  /* keep */ "x": 1,\r\n}}\n',
    code: 0,
  });
  expect(io.calls).toEqual([
    "readFile:input.jsonc",
    "readFile:input.jsonc",
    "readFile:input.jsonc",
    "readFile:input.jsonc",
  ]);
});

test("runGet selects the last duplicate and returns empty results for absent paths", () => {
  const io = fakeIo({
    files: new Map([["input.jsonc", bytes('{"a":1,"a":2,"name":"api","tags":["a","b"]}')]]),
  });

  expect(runGet(["input.jsonc", "a"], new Set(), io)).toEqual({ out: "2\n", code: 0 });
  expect(runGet(["input.jsonc", "tags[1]"], new Set(), io)).toEqual({
    out: '"b"\n',
    code: 0,
  });
  expect(runGet(["input.jsonc", "missing.x"], new Set(), io)).toEqual({ out: "", code: 1 });
  expect(runGet(["input.jsonc", "tags[2]"], new Set(), io)).toEqual({ out: "", code: 1 });
  expect(io.calls).toEqual([
    "readFile:input.jsonc",
    "readFile:input.jsonc",
    "readFile:input.jsonc",
    "readFile:input.jsonc",
  ]);
});

test("runGet propagates malformed path and kind mismatch failures", () => {
  const io = fakeIo({
    files: new Map([["input.jsonc", bytes('{"name":"api"}')]]),
  });

  expectFail(
    () => runGet(["input.jsonc", "a..b"], new Set(), io),
    'invalid path "a..b" at character 3',
  );
  expectFail(
    () => runGet(["input.jsonc", "tags[1"], new Set(), io),
    'invalid path "tags[1" at character 7',
  );
  expectFail(
    () => runGet(["input.jsonc", "name.x"], new Set(), io),
    "at $.name the value is a string, not an object",
  );
  expectFail(
    () => runGet(["input.jsonc", "name[0]"], new Set(), io),
    "at $.name the value is a string, not an array",
  );
  expect(io.calls).toEqual([
    "readFile:input.jsonc",
    "readFile:input.jsonc",
    "readFile:input.jsonc",
    "readFile:input.jsonc",
  ]);
});

test("handlers validate FILE before PATH and preserve BOM, UTF-8, read, and syntax failures", () => {
  const badIo = fakeIo({
    files: new Map([["bad.jsonc", bytes('{"a": 1,, "b": 2}')]]),
  });
  const tailIo = fakeIo({
    files: new Map([["tail.jsonc", bytes('{"a":1} x')]]),
  });
  const missingIo = fakeIo();
  const bomIo = fakeIo({ stdin: new Uint8Array([239, 187, 191, 49]) });
  const invalidStdinIo = fakeIo({ stdin: new Uint8Array([123, 255, 10]) });
  const invalidFileIo = fakeIo({
    files: new Map([["bad.jsonc", new Uint8Array([123, 255, 10])]]),
  });
  const incompleteStdinIo = fakeIo({ stdin: bytes("{") });

  expectFail(
    () => runGet(["bad.jsonc", "a..b"], new Set(), badIo),
    '"bad.jsonc": JS001 unexpected character "," at 1:9',
  );
  expectFail(
    () => runGet(["tail.jsonc", "a..b"], new Set(), tailIo),
    '"tail.jsonc": JS001 unexpected character "x" at 1:9',
  );
  expectFail(
    () => runGet(["nowhere.jsonc", "a..b"], new Set(), missingIo),
    '"nowhere.jsonc": cannot read the file',
  );
  expect(runCheck(["-"], new Set(), bomIo)).toEqual({ out: "ok, 1 value\n", code: 0 });
  expect(runGet(["-", "$"], new Set(), bomIo)).toEqual({ out: "1\n", code: 0 });
  expectFail(() => runCheck(["-"], new Set(), invalidStdinIo), "<stdin>: input is not valid UTF-8");
  expectFail(
    () => runGet(["-", "$"], new Set(), invalidStdinIo),
    "<stdin>: input is not valid UTF-8",
  );
  expectFail(
    () => runCheck(["bad.jsonc"], new Set(), invalidFileIo),
    '"bad.jsonc": input is not valid UTF-8',
  );
  expectFail(
    () => runGet(["bad.jsonc", "$"], new Set(), invalidFileIo),
    '"bad.jsonc": input is not valid UTF-8',
  );
  expectFail(
    () => runGet(["-", "a..b"], new Set(), incompleteStdinIo),
    "<stdin>: JS002 unexpected end of input at 1:2",
  );
  expectFail(
    () => runCheck(["nowhere.jsonc"], new Set(), missingIo),
    '"nowhere.jsonc": cannot read the file',
  );
  expect(badIo.calls).toEqual(["readFile:bad.jsonc"]);
  expect(tailIo.calls).toEqual(["readFile:tail.jsonc"]);
  expect(missingIo.calls).toEqual(["readFile:nowhere.jsonc", "readFile:nowhere.jsonc"]);
  expect(bomIo.calls).toEqual(["readStdin", "readStdin"]);
  expect(invalidStdinIo.calls).toEqual(["readStdin", "readStdin"]);
  expect(invalidFileIo.calls).toEqual(["readFile:bad.jsonc", "readFile:bad.jsonc"]);
  expect(incompleteStdinIo.calls).toEqual(["readStdin"]);
});

test("runGet fully validates malformed, trailing, and unreadable files before PATH", () => {
  const malformedIo = fakeIo({
    files: new Map([["bad.jsonc", bytes('{"a": 1,, "b": 2}')]]),
  });
  const trailingIo = fakeIo({ files: new Map([["tail.jsonc", bytes('{"a":1} x')]]) });
  const unreadableIo = fakeIo();

  expectFail(
    () => runGet(["bad.jsonc", "a..b"], new Set(), malformedIo),
    '"bad.jsonc": JS001 unexpected character "," at 1:9',
  );
  expectFail(
    () => runGet(["tail.jsonc", "a..b"], new Set(), trailingIo),
    '"tail.jsonc": JS001 unexpected character "x" at 1:9',
  );
  expectFail(
    () => runGet(["nowhere.jsonc", "a..b"], new Set(), unreadableIo),
    '"nowhere.jsonc": cannot read the file',
  );
  expect(malformedIo.calls).toEqual(["readFile:bad.jsonc"]);
  expect(trailingIo.calls).toEqual(["readFile:tail.jsonc"]);
  expect(unreadableIo.calls).toEqual(["readFile:nowhere.jsonc"]);
});

test("both handlers parse stdin after readText strips its leading BOM", () => {
  const checkIo = fakeIo({ stdin: new Uint8Array([239, 187, 191, 49]) });
  const getIo = fakeIo({ stdin: new Uint8Array([239, 187, 191, 49]) });

  expect(runCheck(["-"], new Set(), checkIo)).toEqual({ out: "ok, 1 value\n", code: 0 });
  expect(runGet(["-", "$"], new Set(), getIo)).toEqual({ out: "1\n", code: 0 });
  expect(checkIo.calls).toEqual(["readStdin"]);
  expect(getIo.calls).toEqual(["readStdin"]);
});

test("both handlers reject malformed UTF-8 bytes from stdin and named files", () => {
  const invalidStdinCheckIo = fakeIo({ stdin: new Uint8Array([123, 255, 10]) });
  const invalidStdinGetIo = fakeIo({ stdin: new Uint8Array([123, 255, 10]) });
  const invalidFileCheckIo = fakeIo({
    files: new Map([["bad.jsonc", new Uint8Array([123, 255, 10])]]),
  });
  const invalidFileGetIo = fakeIo({
    files: new Map([["bad.jsonc", new Uint8Array([123, 255, 10])]]),
  });

  expectFail(
    () => runCheck(["-"], new Set(), invalidStdinCheckIo),
    "<stdin>: input is not valid UTF-8",
  );
  expectFail(
    () => runGet(["-", "$"], new Set(), invalidStdinGetIo),
    "<stdin>: input is not valid UTF-8",
  );
  expectFail(
    () => runCheck(["bad.jsonc"], new Set(), invalidFileCheckIo),
    '"bad.jsonc": input is not valid UTF-8',
  );
  expectFail(
    () => runGet(["bad.jsonc", "$"], new Set(), invalidFileGetIo),
    '"bad.jsonc": input is not valid UTF-8',
  );
  expect(invalidStdinCheckIo.calls).toEqual(["readStdin"]);
  expect(invalidStdinGetIo.calls).toEqual(["readStdin"]);
  expect(invalidFileCheckIo.calls).toEqual(["readFile:bad.jsonc"]);
  expect(invalidFileGetIo.calls).toEqual(["readFile:bad.jsonc"]);
});

test("get validates stdin syntax before PATH and check propagates an unreadable file", () => {
  const syntaxIo = fakeIo({ stdin: bytes("{") });
  const unreadableIo = fakeIo();

  expectFail(
    () => runGet(["-", "a..b"], new Set(), syntaxIo),
    "<stdin>: JS002 unexpected end of input at 1:2",
  );
  expectFail(
    () => runCheck(["nowhere.jsonc"], new Set(), unreadableIo),
    '"nowhere.jsonc": cannot read the file',
  );
  expect(syntaxIo.calls).toEqual(["readStdin"]);
  expect(unreadableIo.calls).toEqual(["readFile:nowhere.jsonc"]);
});

test("runGet counts negative indexes from the end of an array", () => {
  const io = fakeIo({
    files: new Map([["input.jsonc", bytes('{"tags": ["a", "b"], "n": [[1], [2, 3]]}')]]),
  });

  expect(runGet(["input.jsonc", "tags[-1]"], new Set(), io)).toEqual({ out: '"b"\n', code: 0 });
  expect(runGet(["input.jsonc", "tags[-2]"], new Set(), io)).toEqual({ out: '"a"\n', code: 0 });
  expect(runGet(["input.jsonc", "tags[-3]"], new Set(), io)).toEqual({ out: "", code: 1 });
  expect(runGet(["input.jsonc", "$.n[-1][-1]"], new Set(), io)).toEqual({
    out: "3\n",
    code: 0,
  });
  expectFail(
    () => runGet(["input.jsonc", "tags[-1].x"], new Set(), io),
    "at $.tags[-1] the value is a string, not an object",
  );
  expectFail(
    () => runGet(["input.jsonc", "tags[-0]"], new Set(), io),
    'invalid path "tags[-0]" at character 7',
  );
  expectFail(
    () => runGet(["input.jsonc", "tags[-1000000]"], new Set(), io),
    'invalid path "tags[-1000000]" at character 13',
  );
});
