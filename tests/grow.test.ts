import { expect, test } from "bun:test";
import { addItem, insertBefore } from "../src/edit/grow";
import { applyEdits } from "../src/edit/splice";
import { inferLayout } from "../src/layout/layout";
import { parseDocument } from "../src/syntax/parser";
import type { Node } from "../src/syntax/tree";

function container(text: string): Node {
  const root = parseDocument(text, false);

  if (root.kind !== "object" && root.kind !== "array") {
    throw new Error("expected a container");
  }

  return root;
}

function append(text: string, item: string): string {
  const root = container(text);
  return applyEdits(text, addItem(text, root, item, inferLayout(text, root)));
}

test("applyEdits leaves text unchanged for an empty edit list", () => {
  expect(applyEdits("untouched", [])).toBe("untouched");
});

test("applyEdits sorts original offsets and combines replacement, deletion, and astral text", () => {
  const edits = [
    { start: 4, end: 5, text: "" },
    { start: 3, end: 4, text: "X" },
    { start: 1, end: 1, text: "!" },
  ];

  expect(applyEdits("A😀BC", edits)).toBe("A!😀X");
});

test("applyEdits keeps equal-start insertions in list order", () => {
  const edits = [
    { start: 1, end: 1, text: "first" },
    { start: 1, end: 1, text: "second" },
  ];

  expect(applyEdits("ab", edits)).toBe("afirstsecondb");
});

test("append adds an inline item with and without a trailing comma", () => {
  expect(append("[1]", "2")).toBe("[1, 2]");
  expect(append("[1,]", "2")).toBe("[1, 2,]");
});

test("append adds a multiline item after a line comment tail", () => {
  const source = "[\n  1 // keep\n]";
  const root = container(source);
  const edits = addItem(source, root, "2", inferLayout(source, root));

  expect(edits).toEqual([
    { start: 5, end: 5, text: "," },
    { start: 13, end: 13, text: "\n  2" },
  ]);
  expect(applyEdits(source, edits)).toBe("[\n  1, // keep\n  2\n]");
});

test("append retains a trailing comma after a single-line block comment tail", () => {
  const source = "[\n  1, /* keep */\n]";
  const root = container(source);
  const edits = addItem(source, root, "2", inferLayout(source, root));

  expect(edits).toEqual([{ start: 17, end: 17, text: "\n  2," }]);
  expect(applyEdits(source, edits)).toBe("[\n  1, /* keep */\n  2,\n]");
});

test("append uses a stable pair of equal-offset edits when a closing delimiter rejects the tail", () => {
  const source = "[\n  1\n]";
  const root = container(source);
  const edits = addItem(source, root, "2", inferLayout(source, root));

  expect(edits).toEqual([
    { start: 5, end: 5, text: "," },
    { start: 5, end: 5, text: "\n  2" },
  ]);
  expect(applyEdits(source, edits)).toBe("[\n  1,\n  2\n]");
});

test("append replaces empty whitespace or grows an empty multiline container", () => {
  expect(append("{ }", '"x": 1')).toBe('{"x": 1}');

  const source = "{\n}";
  expect(append(source, '"x": 1')).toBe('{\n  "x": 1\n}');
});

test("append preserves a comment in an empty inline container", () => {
  expect(append("{/* keep */}", '"x": 1')).toBe('{"x": 1/* keep */}');
});

test("append preserves nested CRLF and tab indentation", () => {
  const source = '{\r\n\t"items": [\r\n\t\t1\r\n\t]\r\n}';
  const root = container(source);
  const array = root.items[0]?.value;

  if (array === undefined) {
    throw new Error("expected a nested array");
  }

  const edits = addItem(source, array, "2", inferLayout(source, root));
  expect(applyEdits(source, edits)).toBe('{\r\n\t"items": [\r\n\t\t1,\r\n\t\t2\r\n\t]\r\n}');
});

test("insertBefore handles inline and line-leading elements", () => {
  const inline = "[1, 3]";
  const inlineRoot = container(inline);
  expect(
    applyEdits(inline, insertBefore(inline, inlineRoot, 1, "2", inferLayout(inline, inlineRoot))),
  ).toBe("[1, 2, 3]");

  const multiline = "[\n  3\n]";
  const multilineRoot = container(multiline);
  expect(
    applyEdits(
      multiline,
      insertBefore(multiline, multilineRoot, 0, "2", inferLayout(multiline, multilineRoot)),
    ),
  ).toBe("[\n  2,\n  3\n]");
});

test("insertBefore delegates at and beyond the item count to append", () => {
  const source = "[1]";
  const root = container(source);
  const layout = inferLayout(source, root);

  expect(applyEdits(source, insertBefore(source, root, 1, "2", layout))).toBe("[1, 2]");
  expect(applyEdits(source, insertBefore(source, root, 5, "2", layout))).toBe("[1, 2]");
});
