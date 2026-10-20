import { expect, test } from "bun:test";
import { removeItem } from "../src/edit/shrink";
import { applyEdits } from "../src/edit/splice";
import { parseDocument } from "../src/syntax/parser";
import type { Node } from "../src/syntax/tree";

function container(text: string): Node {
  const root = parseDocument(text, false);

  if (root.kind !== "object" && root.kind !== "array") {
    throw new Error("expected a container");
  }

  return root;
}

function remove(text: string, index: number): string {
  return applyEdits(text, removeItem(text, container(text), index));
}

test("removeItem removes first and middle inline elements", () => {
  expect(remove("[1, 2, 3]", 0)).toBe("[2, 3]");
  expect(remove("[1, 2, 3]", 1)).toBe("[1, 3]");
});

test("removeItem removes the last inline element and preserves an existing trailing comma", () => {
  expect(remove("[1, 2, 3]", 2)).toBe("[1, 2]");
  expect(remove("[1, 2, 3,]", 2)).toBe("[1, 2,]");
});

test("removeItem removes whole lines for first and middle elements", () => {
  expect(remove("[\n  1,\n  2,\n  3\n]", 0)).toBe("[\n  2,\n  3\n]");
  expect(remove("[\n  1,\n  2,\n  3\n]", 1)).toBe("[\n  1,\n  3\n]");
});

test("removeItem deletes the preceding comma when removing a whole-line last item", () => {
  const source = "[\n  1,\n  2\n]";
  const root = container(source);
  const edits = removeItem(source, root, 1);

  expect(edits).toEqual([
    { start: 7, end: 11, text: "" },
    { start: 5, end: 6, text: "" },
  ]);
  expect(applyEdits(source, edits)).toBe("[\n  1\n]");
});

test("removeItem retains the previous trailing comma when the removed last item had one", () => {
  expect(remove("[\n  1,\n  2,\n]", 1)).toBe("[\n  1,\n]");
});

test("removeItem handles the only inline item and a line-leading only item", () => {
  expect(remove("[1]", 0)).toBe("[]");
  expect(remove("[\n  1\n]", 0)).toBe("[\n]");
});

test("removeItem removes a nested multiline value as one whole line item", () => {
  const source = '[\n  {\n    "x": 1\n  },\n  2\n]';

  expect(remove(source, 0)).toBe("[\n  2\n]");
});

test("removeItem removes an attached comment but preserves a preceding comment", () => {
  expect(remove("[\n  1, // attached\n  2\n]", 0)).toBe("[\n  2\n]");
  expect(remove("[\n  // keep\n  1,\n  2\n]", 0)).toBe("[\n  // keep\n  2\n]");
});

test("removeItem uses the fallback branch for a multiline block-comment tail", () => {
  const source = "[\n  1, /* multi\n     comment */\n  2\n]";

  expect(remove(source, 0)).toBe("[\n  2\n]");
});

test("removeItem preserves CRLF while deleting a line and its attached comment", () => {
  expect(remove("[\r\n\t1, // one\r\n\t2\r\n]", 0)).toBe("[\r\n\t2\r\n]");
});

test("removeItem returns no edits when the index is absent", () => {
  const source = "[]";
  const root = container(source);

  expect(removeItem(source, root, 0)).toEqual([]);
  expect(remove(source, 0)).toBe("[]");
});
