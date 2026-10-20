import { expect, test } from "bun:test";
import { inferLayout, type Layout, layoutRows } from "../src/layout/layout";
import { parseDocument } from "../src/syntax/parser";

function infer(text: string): Layout {
  return inferLayout(text, parseDocument(text, false));
}

function report(text: string, bom: boolean): string {
  return layoutRows(text, parseDocument(text, false), bom);
}

test("layout uses default newline and indentation for scalars and empty containers", () => {
  const scalar: Layout = { newline: "\n", indent: "  ", trailing: false, final: false };
  const object: Layout = { newline: "\n", indent: "  ", trailing: false, final: true };
  const array: Layout = { newline: "\n", indent: "  ", trailing: false, final: false };

  expect(infer('"0"')).toEqual(scalar);
  expect(infer("{}\n")).toEqual(object);
  expect(infer("[]")).toEqual(array);
});

test("layout recognizes CRLF and indentation from the root first item", () => {
  const expected: Layout = { newline: "\r\n", indent: "\t", trailing: true, final: false };

  expect(infer('{\r\n\t"a": 1,\r\n\t"b": [1, 2],\r\n}')).toEqual(expected);
});

test("the first LF determines newline style, including mixed newline input", () => {
  expect(infer("[\n 1\n]\r\n")).toEqual({
    newline: "\n",
    indent: " ",
    trailing: false,
    final: true,
  });
  expect(infer("[\r\n  1\n]")).toEqual({
    newline: "\r\n",
    indent: "  ",
    trailing: false,
    final: false,
  });
});

test("layout preserves mixed indentation only from an eligible first item", () => {
  expect(infer('{\n \t"a": 1\n}')).toEqual({
    newline: "\n",
    indent: " \t",
    trailing: false,
    final: false,
  });
  expect(infer("[1,\n\t2\n]")).toEqual({
    newline: "\n",
    indent: "  ",
    trailing: false,
    final: false,
  });
  expect(infer("[\n1,\n\t2\n]")).toEqual({
    newline: "\n",
    indent: "  ",
    trailing: false,
    final: false,
  });
  expect(infer('{\n/*c*/\t"a": 1\n}')).toEqual({
    newline: "\n",
    indent: "  ",
    trailing: false,
    final: false,
  });
});

test("trailing comma belongs only to the root and a lone CR is not a final LF", () => {
  expect(infer('{"a": [1,]}')).toEqual({
    newline: "\n",
    indent: "  ",
    trailing: false,
    final: false,
  });
  expect(infer("[1,]\r")).toEqual({
    newline: "\n",
    indent: "  ",
    trailing: true,
    final: false,
  });
});

test("layout infers the first LF after a leading comment and ignores final spaces", () => {
  expect(infer("// lead\r\n[\n\t\t1\n]\n ")).toEqual({
    newline: "\r\n",
    indent: "\t\t",
    trailing: false,
    final: false,
  });
});

test("layout reports absent and independent BOM flags with exact LF rows", () => {
  expect(report("0", false)).toBe(
    "newline     lf\nindent      2 spaces\ntrailing    no\nfinal       no\nbom         no\n",
  );
  expect(report("0", true)).toBe(
    "newline     lf\nindent      2 spaces\ntrailing    no\nfinal       no\nbom         yes\n",
  );
});

test("layout reports CRLF, tabs, trailing commas, final newline, and BOM", () => {
  expect(report('{\r\n\t"a": 1,\r\n\t"b": [1, 2],\r\n}', true)).toBe(
    "newline     crlf\nindent      1 tab\ntrailing    yes\nfinal       no\nbom         yes\n",
  );
});

test("layout reports singular spaces, plural tabs, and mixed indentation", () => {
  expect(report("[\n 1\n]\n", false)).toBe(
    "newline     lf\nindent      1 space\ntrailing    no\nfinal       yes\nbom         no\n",
  );
  expect(report("[\n\t\t1\n]", false)).toBe(
    "newline     lf\nindent      2 tabs\ntrailing    no\nfinal       no\nbom         no\n",
  );
  expect(report('{\n \t"a": 1\n}', false)).toBe(
    "newline     lf\nindent      mixed\ntrailing    no\nfinal       no\nbom         no\n",
  );
});
