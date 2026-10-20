import { expect, test } from "bun:test";
import { Fail } from "../src/base/fail";
import { type Io, readText, type Source } from "../src/base/inputs";
import { parseOptions } from "../src/base/options";

type FakeIo = Io & { calls: string[] };

function fakeIo(
  options: {
    stdin?: Uint8Array;
    files?: Map<string, Uint8Array>;
    failStdin?: boolean;
    failedFiles?: Set<string>;
  } = {},
): FakeIo {
  const calls: string[] = [];
  const stdin = options.stdin ?? new Uint8Array();
  const files = options.files ?? new Map<string, Uint8Array>();
  const failedFiles = options.failedFiles ?? new Set<string>();

  return {
    calls,
    readStdin() {
      calls.push("readStdin");
      if (options.failStdin) {
        throw new Error("stdin read failed");
      }
      return stdin;
    },
    readFile(path: string) {
      calls.push(`readFile:${path}`);
      const bytes = files.get(path);
      if (failedFiles.has(path) || bytes === undefined) {
        throw new Error("file read failed");
      }
      return bytes;
    },
    writeFile(path: string) {
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

test("base exports have the declared callable and data shapes", () => {
  const parse: typeof parseOptions = parseOptions;
  const read: (io: Io, arg: string) => Source = readText;
  const io: Io = fakeIo();
  const source: Source = { display: "<stdin>", text: "", bom: false };

  expect(parse).toBe(parseOptions);
  expect(read).toBe(readText);
  expect(io.readStdin()).toEqual(new Uint8Array());
  expect(source).toEqual({ display: "<stdin>", text: "", bom: false });
});

test("parseOptions returns empty flags and args for empty input", () => {
  const result = parseOptions([], []);

  expect([...result.flags]).toEqual([]);
  expect(result.args).toEqual([]);
});

test("parseOptions preserves ordinary argument order and deduplicates flags", () => {
  const result = parseOptions(["--write", "a", "--write", "-", "-5"], ["--write"]);

  expect([...result.flags]).toEqual(["--write"]);
  expect(result.args).toEqual(["a", "-", "-5"]);
});

test("parseOptions accepts a flag between ordinary arguments", () => {
  const result = parseOptions(["a", "--write", "b"], ["--write"]);

  expect([...result.flags]).toEqual(["--write"]);
  expect(result.args).toEqual(["a", "b"]);
});

test("parseOptions rejects bare, help, and equals-form long options", () => {
  expectFail(() => parseOptions(["--"], []), 'unknown option "--"');
  expectFail(() => parseOptions(["--help"], []), 'unknown option "--help"');
  expectFail(() => parseOptions(["--write=yes"], ["--write"]), 'unknown option "--write=yes"');
});

test("parseOptions stops at the first unknown option", () => {
  expectFail(() => parseOptions(["--bad", "--later"], []), 'unknown option "--bad"');
});

test("parseOptions sanitizes a non-ASCII option in its error", () => {
  expectFail(() => parseOptions(["--😀"], []), 'unknown option "--?"');
});

test("readText reads stdin bytes and reports the stdin display name", () => {
  const io = fakeIo({ stdin: new Uint8Array([123, 125]) });

  expect(readText(io, "-")).toEqual({ display: "<stdin>", text: "{}", bom: false });
  expect(io.calls).toEqual(["readStdin"]);
});

test("readText preserves empty input", () => {
  const io = fakeIo({ stdin: new Uint8Array() });

  expect(readText(io, "-")).toEqual({ display: "<stdin>", text: "", bom: false });
  expect(io.calls).toEqual(["readStdin"]);
});

test("readText displays a sanitized path but reads the original path once", () => {
  const io = fakeIo({
    files: new Map([["é.jsonc", new Uint8Array([123, 125])]]),
  });

  expect(readText(io, "é.jsonc")).toEqual({ display: '"?.jsonc"', text: "{}", bom: false });
  expect(io.calls).toEqual(["readFile:é.jsonc"]);
});

test("readText wraps stdin and named-file read failures without other Io calls", () => {
  const stdinIo = fakeIo({ failStdin: true });
  const fileIo = fakeIo({ failedFiles: new Set(["nowhere.jsonc"]) });

  expectFail(() => readText(stdinIo, "-"), "<stdin>: cannot read the file");
  expect(stdinIo.calls).toEqual(["readStdin"]);
  expectFail(() => readText(fileIo, "nowhere.jsonc"), '"nowhere.jsonc": cannot read the file');
  expect(fileIo.calls).toEqual(["readFile:nowhere.jsonc"]);
});

test("readText decodes Unicode and preserves line endings and exactly one leading BOM", () => {
  expect(readText(fakeIo({ stdin: new Uint8Array([195, 169, 240, 159, 152, 128]) }), "-")).toEqual({
    display: "<stdin>",
    text: "é😀",
    bom: false,
  });
  expect(readText(fakeIo({ stdin: new Uint8Array([123, 13, 10, 125, 10]) }), "-")).toEqual({
    display: "<stdin>",
    text: "{\r\n}\n",
    bom: false,
  });
  expect(readText(fakeIo({ stdin: new Uint8Array([239, 187, 191]) }), "-")).toEqual({
    display: "<stdin>",
    text: "",
    bom: true,
  });
  expect(
    readText(fakeIo({ stdin: new Uint8Array([239, 187, 191, 239, 187, 191, 123, 125]) }), "-"),
  ).toEqual({ display: "<stdin>", text: "\uFEFF{}", bom: true });
  expect(readText(fakeIo({ stdin: new Uint8Array([123, 239, 187, 191, 125]) }), "-")).toEqual({
    display: "<stdin>",
    text: "{\uFEFF}",
    bom: false,
  });
  expect(readText(fakeIo({ stdin: new Uint8Array([239, 187, 191, 123, 125]) }), "-")).toEqual({
    display: "<stdin>",
    text: "{}",
    bom: true,
  });
});

test("readText rejects every listed malformed UTF-8 sequence from stdin", () => {
  expectFail(
    () => readText(fakeIo({ stdin: new Uint8Array([123, 255, 10]) }), "-"),
    "<stdin>: input is not valid UTF-8",
  );
  expectFail(
    () => readText(fakeIo({ stdin: new Uint8Array([128]) }), "-"),
    "<stdin>: input is not valid UTF-8",
  );
  expectFail(
    () => readText(fakeIo({ stdin: new Uint8Array([194]) }), "-"),
    "<stdin>: input is not valid UTF-8",
  );
  expectFail(
    () => readText(fakeIo({ stdin: new Uint8Array([192, 175]) }), "-"),
    "<stdin>: input is not valid UTF-8",
  );
  expectFail(
    () => readText(fakeIo({ stdin: new Uint8Array([237, 160, 128]) }), "-"),
    "<stdin>: input is not valid UTF-8",
  );
  expectFail(
    () => readText(fakeIo({ stdin: new Uint8Array([244, 144, 128, 128]) }), "-"),
    "<stdin>: input is not valid UTF-8",
  );
  expectFail(
    () => readText(fakeIo({ stdin: new Uint8Array([226, 40, 161]) }), "-"),
    "<stdin>: input is not valid UTF-8",
  );
});

test("readText reports malformed UTF-8 from a named file with its display name", () => {
  const io = fakeIo({
    files: new Map([["bad.jsonc", new Uint8Array([123, 255, 10])]]),
  });

  expectFail(() => readText(io, "bad.jsonc"), '"bad.jsonc": input is not valid UTF-8');
  expect(io.calls).toEqual(["readFile:bad.jsonc"]);
});
