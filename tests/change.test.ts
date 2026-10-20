import { expect, test } from "bun:test";
import { Fail } from "../src/base/fail";
import { deleteValue, insertValue, setValue, type Value } from "../src/edit/change";
import { applyEdits, type Edit } from "../src/edit/splice";
import { inferLayout } from "../src/layout/layout";
import { parseSteps, type Step } from "../src/path/steps";
import { parseDocument } from "../src/syntax/parser";

function value(src: string): Value {
  return { src, node: parseDocument(src, true) };
}

function setText(text: string, path: string, src: string): string {
  const root = parseDocument(text, false);
  return applyEdits(
    text,
    setValue(text, root, parseSteps(path), value(src), inferLayout(text, root)),
  );
}

function insertText(text: string, path: string, src: string): string {
  const root = parseDocument(text, false);
  return applyEdits(
    text,
    insertValue(text, root, parseSteps(path), value(src), inferLayout(text, root)),
  );
}

function deleteEdits(text: string, path: string): Edit[] | null {
  const root = parseDocument(text, false);
  return deleteValue(text, root, parseSteps(path));
}

function failureMessage(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    if (error instanceof Fail) {
      return error.message;
    }
    throw error;
  }

  throw new Error("expected a Fail");
}

test("set replaces the root value while preserving surrounding text and source tokens", () => {
  const source = "  [1]  ";
  const root = parseDocument(source, false);
  const edits = setValue(source, root, [], value('{ "n" : 1.00 }'), inferLayout(source, root));

  expect(edits).toEqual([{ start: 2, end: 5, text: '{"n": 1.00}' }]);
  expect(applyEdits(source, edits)).toBe('  {"n": 1.00}  ');
});

test("set and delete target the last duplicate member", () => {
  const source = '{"a": 1, "a": 2}';
  const root = parseDocument(source, false);
  const layout = inferLayout(source, root);

  expect(setValue(source, root, parseSteps("a"), value("3.00"), layout)).toEqual([
    { start: 14, end: 15, text: "3.00" },
  ]);
  expect(applyEdits(source, deleteValue(source, root, parseSteps("a")) ?? [])).toBe('{"a": 1}');
});

test("set appends missing keys with escaped JSON key tokens and keeps a trailing comma", () => {
  const source = '{"a": 1,}';
  const root = parseDocument(source, false);
  const steps: Step[] = [{ kind: "key", key: 'q"\\' }];
  const edits = setValue(source, root, steps, value("2"), inferLayout(source, root));

  expect(edits).toEqual([{ start: 8, end: 8, text: ' "q\\"\\\\": 2,' }]);
  expect(applyEdits(source, edits)).toBe('{"a": 1, "q\\"\\\\": 2,}');
});

test("set appends at array length, including an empty array, and rejects larger indexes", () => {
  expect(setText("[]", "[0]", " 2 ")).toBe("[2]");
  expect(setText("[1]", "[1]", "2")).toBe("[1, 2]");

  const oneItem = parseDocument("[1]", false);
  expect(
    failureMessage(() =>
      setValue("[1]", oneItem, parseSteps("[3]"), value("2"), inferLayout("[1]", oneItem)),
    ),
  ).toBe("cannot set [3]: the array at $ has 1 element");

  const empty = parseDocument("[]", false);
  expect(
    failureMessage(() =>
      setValue("[]", empty, parseSteps("[2]"), value("2"), inferLayout("[]", empty)),
    ),
  ).toBe("cannot set [2]: the array at $ has 0 elements");
});

test("insert handles zero, an existing position, length, and a multiline position", () => {
  expect(insertText("[1, 3]", "[0]", "0")).toBe("[0, 1, 3]");
  expect(insertText("[1, 3]", "[1]", "2")).toBe("[1, 2, 3]");
  expect(insertText("[1, 2]", "[2]", "3")).toBe("[1, 2, 3]");
  expect(insertText('[\n  "a",\n  "c"\n]', "[1]", '"b"')).toBe('[\n  "a",\n  "b",\n  "c"\n]');
});

test("insert validates its ending before traversal and rejects indexes past the array", () => {
  const source = "{}";
  const root = parseDocument(source, false);
  const layout = inferLayout(source, root);

  expect(
    failureMessage(() => insertValue(source, root, parseSteps("missing.key"), value("1"), layout)),
  ).toBe("insert needs a path that ends with an array index");
  expect(failureMessage(() => insertValue(source, root, [], value("1"), layout))).toBe(
    "insert needs a path that ends with an array index",
  );

  const array = parseDocument("[1]", false);
  expect(
    failureMessage(() =>
      insertValue("[1]", array, parseSteps("[2]"), value("3"), inferLayout("[1]", array)),
    ),
  ).toBe("cannot insert at [2]: the array at $ has 1 element");
});

test("set and insert report missing intermediate prefixes", () => {
  const source = '{"a": {}}';
  const root = parseDocument(source, false);
  const layout = inferLayout(source, root);

  expect(
    failureMessage(() => setValue(source, root, parseSteps("a.b.c"), value("1"), layout)),
  ).toBe("no value at $.a.b");
  expect(
    failureMessage(() => insertValue(source, root, parseSteps("a.missing[0]"), value("1"), layout)),
  ).toBe("no value at $.a.missing");
});

test("set, insert, and delete propagate kind mismatch diagnostics", () => {
  const source = '{"a": 1}';
  const root = parseDocument(source, false);
  const layout = inferLayout(source, root);

  expect(failureMessage(() => setValue(source, root, parseSteps("a.x"), value("2"), layout))).toBe(
    "at $.a the value is a number, not an object",
  );
  expect(
    failureMessage(() => insertValue(source, root, parseSteps("a[0]"), value("2"), layout)),
  ).toBe("at $.a the value is a number, not an array");
  expect(failureMessage(() => deleteValue(source, root, parseSteps("a.x")))).toBe(
    "at $.a the value is a number, not an object",
  );
});

test("delete rejects the root and returns null for an absent final selection", () => {
  expect(failureMessage(() => deleteEdits('{"a": 1}', "$"))).toBe("cannot delete the root value");
  expect(deleteEdits('{"a": 1}', "missing")).toBeNull();
  expect(deleteEdits('{"a": {}}', "a.missing")).toBeNull();
});

test("delete returns null when an intermediate selection is absent", () => {
  expect(deleteEdits('{"a": {}}', "missing.child")).toBeNull();
});

test("delete removes inline array items without disturbing remaining values", () => {
  const source = "[1, 2, 3]";
  const edits = deleteEdits(source, "[1]");

  expect(edits).toEqual([{ start: 4, end: 7, text: "" }]);
  expect(applyEdits(source, edits ?? [])).toBe("[1, 3]");
});

test("delete removes a multiline member and its comment tail with its line", () => {
  const source = '{\n  "a": 1, // one\n  "b": 2 // two\n}';
  const edits = deleteEdits(source, "a");

  expect(edits).toEqual([{ start: 2, end: 19, text: "" }]);
  expect(applyEdits(source, edits ?? [])).toBe('{\n  "b": 2 // two\n}');
});

test("set preserves CRLF, tab indentation, and a trailing comma when appending", () => {
  const source = "[\r\n\t1,\r\n]";

  expect(setText(source, "[1]", "2")).toBe("[\r\n\t1,\r\n\t2,\r\n]");
});
