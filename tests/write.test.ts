import { expect, test } from "bun:test";
import type { Io } from "../src/base/inputs";
import { run } from "../src/cli/cli";
import {
  ARGS as DELETE_ARGS,
  MAX as DELETE_MAX,
  SPECS as DELETE_SPECS,
  USAGE as DELETE_USAGE,
  runDelete,
} from "../src/cli/cmd-delete";
import {
  ARGS as INSERT_ARGS,
  MAX as INSERT_MAX,
  SPECS as INSERT_SPECS,
  USAGE as INSERT_USAGE,
  runInsert,
} from "../src/cli/cmd-insert";
import {
  runSet,
  ARGS as SET_ARGS,
  MAX as SET_MAX,
  SPECS as SET_SPECS,
  USAGE as SET_USAGE,
} from "../src/cli/cmd-set";

type FakeIo = Io & {
  reads: string[];
  writes: Array<{ path: string; data: Uint8Array }>;
  outputs: string[];
  errors: string[];
};

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function fakeIo(files: Map<string, Uint8Array>, failWrite = false): FakeIo {
  const reads: string[] = [];
  const writes: Array<{ path: string; data: Uint8Array }> = [];
  const outputs: string[] = [];
  const errors: string[] = [];

  return {
    reads,
    writes,
    outputs,
    errors,
    readStdin() {
      reads.push("stdin");
      return new Uint8Array();
    },
    readFile(path: string) {
      reads.push(path);
      const data = files.get(path);
      if (data === undefined) {
        throw new Error("file read failed");
      }
      return data;
    },
    writeFile(path: string, data: Uint8Array) {
      if (failWrite) {
        throw new Error("file write failed");
      }
      writes.push({ path, data });
    },
    out(text: string) {
      outputs.push(text);
    },
    err(text: string) {
      errors.push(text);
    },
  };
}

function expectRunFailure(files: Map<string, Uint8Array>, argv: string[], message: string): FakeIo {
  const io = fakeIo(files);
  expect(run(argv, io)).toBe(2);
  expect(io.outputs).toEqual([]);
  expect(io.errors).toEqual([`jsonsplice: ${message}\n`]);
  expect(io.writes).toEqual([]);
  return io;
}

test("write adapters export their prescribed metadata and handlers", () => {
  const setHandler: typeof runSet = runSet;
  const insertHandler: typeof runInsert = runInsert;
  const deleteHandler: typeof runDelete = runDelete;

  expect([SET_USAGE, SET_ARGS, SET_MAX, SET_SPECS]).toEqual([
    "jsonsplice set FILE PATH VALUE [--write]",
    ["FILE", "PATH", "VALUE"],
    3,
    ["--write"],
  ]);
  expect([INSERT_USAGE, INSERT_ARGS, INSERT_MAX, INSERT_SPECS]).toEqual([
    "jsonsplice insert FILE PATH VALUE [--write]",
    ["FILE", "PATH", "VALUE"],
    3,
    ["--write"],
  ]);
  expect([DELETE_USAGE, DELETE_ARGS, DELETE_MAX, DELETE_SPECS]).toEqual([
    "jsonsplice delete FILE PATH [--write]",
    ["FILE", "PATH"],
    2,
    ["--write"],
  ]);
  expect(setHandler).toBe(runSet);
  expect(insertHandler).toBe(runInsert);
  expect(deleteHandler).toBe(runDelete);
});

test("write handlers return exact source-preserving edits without printing or writing", () => {
  const io = fakeIo(
    new Map([
      ["inline.jsonc", utf8('{"a": 1, "b": 2}')],
      ["comment.jsonc", utf8('{\n  "a": 1 // one\n}\n')],
      ["array.jsonc", utf8('["a", "c"]')],
      ["numbers.jsonc", utf8("[1, 2, 3]")],
      [
        "bom.jsonc",
        new Uint8Array([239, 187, 191, 123, 13, 10, 9, 34, 97, 34, 58, 32, 49, 44, 13, 10, 125]),
      ],
      ["root.jsonc", utf8("/*keep*/0\n")],
      ["duplicate.jsonc", utf8('{"a":1,"a":2}')],
    ]),
  );

  expect(runSet(["inline.jsonc", "c", "3"], new Set(), io)).toEqual({
    out: '{"a": 1, "b": 2, "c": 3}',
    code: 0,
  });
  expect(runSet(["comment.jsonc", "b", "2"], new Set(), io)).toEqual({
    out: '{\n  "a": 1, // one\n  "b": 2\n}\n',
    code: 0,
  });
  expect(runInsert(["array.jsonc", "[1]", '"b"'], new Set(), io)).toEqual({
    out: '["a", "b", "c"]',
    code: 0,
  });
  expect(runDelete(["numbers.jsonc", "[1]"], new Set(), io)).toEqual({
    out: "[1, 3]",
    code: 0,
  });
  expect(runSet(["bom.jsonc", "a", "2"], new Set(), io)).toEqual({
    out: '\uFEFF{\r\n\t"a": 2,\r\n}',
    code: 0,
  });
  expect(runSet(["root.jsonc", "$", ' { "x" : [1, 2] } '], new Set(), io)).toEqual({
    out: '/*keep*/{"x": [1, 2]}\n',
    code: 0,
  });
  expect(runSet(["duplicate.jsonc", "a", "3"], new Set(), io)).toEqual({
    out: '{"a":1,"a":3}',
    code: 0,
  });
  expect(io.reads).toEqual([
    "inline.jsonc",
    "comment.jsonc",
    "array.jsonc",
    "numbers.jsonc",
    "bom.jsonc",
    "root.jsonc",
    "duplicate.jsonc",
  ]);
  expect(io.writes).toEqual([]);
  expect(io.outputs).toEqual([]);
  expect(io.errors).toEqual([]);
});

test("dispatcher reports semantic edit and strict VALUE failures exactly once", () => {
  const files = new Map([["config.jsonc", utf8('{"port":8080,"tags":["a","b"]}')]]);

  expectRunFailure(files, ["set", "config.jsonc", "a.b", "1"], "no value at $.a");
  expectRunFailure(
    files,
    ["set", "config.jsonc", "tags[5]", "1"],
    "cannot set [5]: the array at $.tags has 2 elements",
  );
  expectRunFailure(
    files,
    ["insert", "config.jsonc", "port", "1"],
    "insert needs a path that ends with an array index",
  );
  expectRunFailure(
    files,
    ["insert", "config.jsonc", "tags[3]", "1"],
    "cannot insert at [3]: the array at $.tags has 2 elements",
  );
  expectRunFailure(files, ["delete", "config.jsonc", "$"], "cannot delete the root value");
  expectRunFailure(
    files,
    ["set", "config.jsonc", "$", "[1,]"],
    'invalid value: JS001 unexpected character "]" at 1:4',
  );
  expectRunFailure(
    files,
    ["insert", "config.jsonc", "tags[0]", "/*x*/1"],
    'invalid value: JS001 unexpected character "/" at 1:1',
  );
});

test("strict VALUE accepts JSON scalar, string, array, and object examples", () => {
  const io = fakeIo(new Map([["input.jsonc", utf8("0")]]));

  expect(runSet(["input.jsonc", "$", ' "x" '], new Set(), io)).toEqual({
    out: '"x"',
    code: 0,
  });
  expect(runSet(["input.jsonc", "$", " 1 "], new Set(), io)).toEqual({ out: "1", code: 0 });
  expect(runSet(["input.jsonc", "$", "true"], new Set(), io)).toEqual({ out: "true", code: 0 });
  expect(runSet(["input.jsonc", "$", "false"], new Set(), io)).toEqual({ out: "false", code: 0 });
  expect(runSet(["input.jsonc", "$", "null"], new Set(), io)).toEqual({ out: "null", code: 0 });
  expect(runSet(["input.jsonc", "$", "[1,2]"], new Set(), io)).toEqual({
    out: "[1, 2]",
    code: 0,
  });
  expect(runSet(["input.jsonc", "$", '{"a":1}'], new Set(), io)).toEqual({
    out: '{"a": 1}',
    code: 0,
  });
  expect(io.outputs).toEqual([]);
  expect(io.errors).toEqual([]);
  expect(io.writes).toEqual([]);
});

test("dispatcher applies option, arity, FILE, PATH, and VALUE precedence", () => {
  const malformedFiles = new Map([["bad.jsonc", utf8('{"a": 1,, "b": 2}')]]);
  const validFiles = new Map([["ok.jsonc", utf8('{"a":1}')]]);

  const unknownOption = expectRunFailure(
    malformedFiles,
    ["set", "bad.jsonc", "a..b", "{x", "--bogus"],
    'unknown option "--bogus"',
  );
  const missingValue = expectRunFailure(
    malformedFiles,
    ["set", "bad.jsonc", "a..b"],
    "missing VALUE",
  );
  const unreadableFile = expectRunFailure(
    new Map(),
    ["set", "nowhere.jsonc", "a..b", "{x"],
    '"nowhere.jsonc": cannot read the file',
  );
  const malformedFile = expectRunFailure(
    malformedFiles,
    ["set", "bad.jsonc", "a..b", "{x"],
    '"bad.jsonc": JS001 unexpected character "," at 1:9',
  );
  const invalidPath = expectRunFailure(
    validFiles,
    ["set", "ok.jsonc", "a..b", "{x"],
    'invalid path "a..b" at character 3',
  );
  const invalidValue = expectRunFailure(
    validFiles,
    ["set", "ok.jsonc", "a", "{x"],
    'invalid value: JS001 unexpected character "x" at 1:2',
  );

  expect(unknownOption.reads).toEqual([]);
  expect(missingValue.reads).toEqual([]);
  expect(unreadableFile.reads).toEqual(["nowhere.jsonc"]);
  expect(malformedFile.reads).toEqual(["bad.jsonc"]);
  expect(invalidPath.reads).toEqual(["ok.jsonc"]);
  expect(invalidValue.reads).toEqual(["ok.jsonc"]);
});

test("write mode rejects stdin before reads and writes each successful edit as UTF-8 bytes", () => {
  const stdinFiles = new Map<string, Uint8Array>();
  const setStdin = expectRunFailure(
    stdinFiles,
    ["set", "-", "$", "1", "--write"],
    "--write needs a file, not -",
  );
  const insertStdin = expectRunFailure(
    stdinFiles,
    ["insert", "-", "[0]", "1", "--write"],
    "--write needs a file, not -",
  );
  const deleteStdin = expectRunFailure(
    stdinFiles,
    ["delete", "-", "$", "--write"],
    "--write needs a file, not -",
  );
  expect(setStdin.reads).toEqual([]);
  expect(insertStdin.reads).toEqual([]);
  expect(deleteStdin.reads).toEqual([]);

  const setIo = fakeIo(new Map([["set.jsonc", utf8('{"a":1}')]]));
  const insertIo = fakeIo(new Map([["insert.jsonc", utf8('["a", "c"]')]]));
  const deleteIo = fakeIo(new Map([["delete.jsonc", utf8('{"a":1}')]]));
  const bomIo = fakeIo(new Map([["bom.jsonc", new Uint8Array([239, 187, 191, 49])]]));

  expect(run(["set", "set.jsonc", "a", "2", "--write"], setIo)).toBe(0);
  expect(setIo.reads).toEqual(["set.jsonc"]);
  expect(setIo.writes).toEqual([{ path: "set.jsonc", data: utf8('{"a":2}') }]);
  expect(setIo.outputs).toEqual([""]);
  expect(setIo.errors).toEqual([]);

  expect(run(["insert", "insert.jsonc", "[1]", '"b"', "--write"], insertIo)).toBe(0);
  expect(insertIo.reads).toEqual(["insert.jsonc"]);
  expect(insertIo.writes).toEqual([{ path: "insert.jsonc", data: utf8('["a", "b", "c"]') }]);
  expect(insertIo.outputs).toEqual([""]);
  expect(insertIo.errors).toEqual([]);

  expect(run(["delete", "delete.jsonc", "a", "--write"], deleteIo)).toBe(0);
  expect(deleteIo.reads).toEqual(["delete.jsonc"]);
  expect(deleteIo.writes).toEqual([{ path: "delete.jsonc", data: utf8("{}") }]);
  expect(deleteIo.outputs).toEqual([""]);
  expect(deleteIo.errors).toEqual([]);

  expect(run(["set", "bom.jsonc", "$", "2", "--write"], bomIo)).toBe(0);
  expect(bomIo.reads).toEqual(["bom.jsonc"]);
  expect(bomIo.writes).toEqual([{ path: "bom.jsonc", data: new Uint8Array([239, 187, 191, 50]) }]);
  expect(bomIo.outputs).toEqual([""]);
  expect(bomIo.errors).toEqual([]);

  const lockedIo = fakeIo(new Map([["locked.jsonc", utf8('{"port":0}')]]), true);
  expect(run(["set", "locked.jsonc", "port", "1", "--write"], lockedIo)).toBe(2);
  expect(lockedIo.reads).toEqual(["locked.jsonc"]);
  expect(lockedIo.writes).toEqual([]);
  expect(lockedIo.outputs).toEqual([]);
  expect(lockedIo.errors).toEqual(['jsonsplice: "locked.jsonc": cannot write the file\n']);
});

test("absent deletions return one empty result and never write or change the file", () => {
  const files = new Map([["empty.jsonc", utf8("{}")]]);
  const missing = fakeIo(files);
  const missingChild = fakeIo(files);
  const missingWrite = fakeIo(files);
  const missingChildWrite = fakeIo(files);

  expect(run(["delete", "empty.jsonc", "missing"], missing)).toBe(1);
  expect(missing.reads).toEqual(["empty.jsonc"]);
  expect(missing.outputs).toEqual([""]);
  expect(missing.errors).toEqual([]);
  expect(missing.writes).toEqual([]);

  expect(run(["delete", "empty.jsonc", "missing.child"], missingChild)).toBe(1);
  expect(missingChild.reads).toEqual(["empty.jsonc"]);
  expect(missingChild.outputs).toEqual([""]);
  expect(missingChild.errors).toEqual([]);
  expect(missingChild.writes).toEqual([]);

  expect(run(["delete", "empty.jsonc", "missing", "--write"], missingWrite)).toBe(1);
  expect(missingWrite.reads).toEqual(["empty.jsonc"]);
  expect(missingWrite.outputs).toEqual([""]);
  expect(missingWrite.errors).toEqual([]);
  expect(missingWrite.writes).toEqual([]);

  expect(run(["delete", "empty.jsonc", "missing.child", "--write"], missingChildWrite)).toBe(1);
  expect(missingChildWrite.reads).toEqual(["empty.jsonc"]);
  expect(missingChildWrite.outputs).toEqual([""]);
  expect(missingChildWrite.errors).toEqual([]);
  expect(missingChildWrite.writes).toEqual([]);
  expect(files.get("empty.jsonc")).toEqual(utf8("{}"));
});

test("dispatcher help prints all commands once without reading input", () => {
  const io = fakeIo(new Map());

  expect(run(["--help"], io)).toBe(0);
  expect(io.outputs).toEqual([
    "usage: jsonsplice check FILE\n" +
      "       jsonsplice get FILE PATH\n" +
      "       jsonsplice paths FILE [PATH]\n" +
      "       jsonsplice layout FILE\n" +
      "       jsonsplice set FILE PATH VALUE [--write]\n" +
      "       jsonsplice insert FILE PATH VALUE [--write]\n" +
      "       jsonsplice delete FILE PATH [--write]\n",
  ]);
  expect(io.reads).toEqual([]);
  expect(io.errors).toEqual([]);
  expect(io.writes).toEqual([]);
});

test("dispatcher validates command options and argument counts before reads", () => {
  const files = new Map<string, Uint8Array>();

  expectRunFailure(files, [], "missing command (check, get, paths, layout, set, insert or delete)");
  expectRunFailure(files, ["fold", "x"], 'unknown command "fold"');
  expectRunFailure(files, ["get", "config.jsonc", "port", "--write"], 'unknown option "--write"');
  expectRunFailure(files, ["check", "a", "b"], "too many arguments");
  expectRunFailure(files, ["get", "a"], "missing PATH");
  expectRunFailure(files, ["check"], "missing FILE");
  expectRunFailure(files, ["check", "--help"], 'unknown option "--help"');
  expectRunFailure(files, ["check", "--"], 'unknown option "--"');
  expectRunFailure(
    files,
    ["set", "a.jsonc", "$", "1", "--write=true"],
    'unknown option "--write=true"',
  );
});

test("dispatcher accepts repeated write options around arguments and a negative number value", () => {
  const io = fakeIo(new Map([["negative.jsonc", utf8("0")]]));

  expect(run(["set", "--write", "negative.jsonc", "$", "-5", "--write"], io)).toBe(0);
  expect(io.reads).toEqual(["negative.jsonc"]);
  expect(io.writes).toEqual([{ path: "negative.jsonc", data: utf8("-5") }]);
  expect(io.outputs).toEqual([""]);
  expect(io.errors).toEqual([]);
});

test("dispatcher connects every read and info command with exact outputs and exit codes", () => {
  const io = fakeIo(
    new Map([
      ["one.jsonc", utf8("1")],
      ["obj.jsonc", utf8('{"a":1}')],
      ["bad.jsonc", utf8("[01]")],
    ]),
  );

  expect(run(["check", "one.jsonc"], io)).toBe(0);
  expect(run(["check", "bad.jsonc"], io)).toBe(1);
  expect(run(["get", "obj.jsonc", "a"], io)).toBe(0);
  expect(run(["get", "obj.jsonc", "missing"], io)).toBe(1);
  expect(run(["paths", "one.jsonc"], io)).toBe(0);
  expect(run(["paths", "obj.jsonc", "missing"], io)).toBe(1);
  expect(run(["layout", "one.jsonc"], io)).toBe(0);
  expect(io.outputs).toEqual([
    "ok, 1 value\n",
    "JS007 invalid number at 1:2\n1 problem\n",
    "1\n",
    "",
    "path  kind    line  col  value\n$     number  1     1    1\nvalues      1\n",
    "",
    "newline     lf\nindent      2 spaces\ntrailing    no\nfinal       no\nbom         no\n",
  ]);
  expect(io.errors).toEqual([]);
  expect(io.writes).toEqual([]);
  expect(io.reads).toEqual([
    "one.jsonc",
    "bad.jsonc",
    "obj.jsonc",
    "obj.jsonc",
    "one.jsonc",
    "obj.jsonc",
    "one.jsonc",
  ]);
});

test("dispatcher contains output and error sink exceptions without exposing details", () => {
  const outputIo = fakeIo(new Map());
  outputIo.out = () => {
    throw new Error("private details");
  };

  expect(run(["--help"], outputIo)).toBe(2);
  expect(outputIo.outputs).toEqual([]);
  expect(outputIo.errors).toEqual(["jsonsplice: unexpected error\n"]);
  expect(outputIo.reads).toEqual([]);
  expect(outputIo.writes).toEqual([]);

  const errorIo = fakeIo(new Map());
  let errorCalls = 0;
  errorIo.err = () => {
    errorCalls += 1;
    throw new Error("private details");
  };

  expect(run([], errorIo)).toBe(2);
  expect(errorCalls).toBe(1);
  expect(errorIo.outputs).toEqual([]);
  expect(errorIo.reads).toEqual([]);
  expect(errorIo.writes).toEqual([]);
});
