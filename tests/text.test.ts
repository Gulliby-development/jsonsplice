import { expect, test } from "bun:test";
import { Fail } from "../src/base/fail";
import { line, plain, plural, show, table } from "../src/base/text";

test("Fail is an Error with its supplied message", () => {
  const failure = new Fail("broken");

  expect(failure).toBeInstanceOf(Error);
  expect(failure).toBeInstanceOf(Fail);
  expect(failure.message).toBe("broken");
});

test("plain preserves empty and printable ASCII text", () => {
  expect(plain("")).toBe("");
  expect(plain(" ~")).toBe(" ~");
});

test("show quotes empty text and preserves quotes and backslashes", () => {
  expect(show("")).toBe('""');
  expect(show('a"\\b')).toBe('"a"\\b"');
});

test("plain replaces each non-printable or non-ASCII code point once", () => {
  expect(plain("a\t\n\ré😀\u007f")).toBe("a??????");
});

test("show counts a supplementary character as one code point", () => {
  expect(show("😀")).toBe('"?"');
});

test("line pads short keys and leaves keys at or above ten characters intact", () => {
  expect(line("values", "8")).toBe("values      8\n");
  expect(line("abcdefghij", "x")).toBe("abcdefghij  x\n");
  expect(line("abcdefghijk", "x")).toBe("abcdefghijk  x\n");
});

test("line measures key width by code point", () => {
  expect(line("😀", "v")).toBe("😀           v\n");
});

test("table aligns columns to their widest header or cell", () => {
  expect(
    table(
      ["name", "n"],
      [
        ["a", "12"],
        ["long", "3"],
      ],
    ),
  ).toBe("name  n\na     12\nlong  3\n");
});

test("table prints a header-only table with an LF", () => {
  expect(table(["x", "last"], [])).toBe("x  last\n");
});

test("table removes trailing spaces after an empty final cell", () => {
  expect(table(["a", "b"], [["long", ""]])).toBe("a     b\nlong\n");
});

test("table counts supplementary characters as one column", () => {
  expect(table(["x", "y"], [["😀", "z"]])).toBe("x  y\n😀  z\n");
});

test("plural adds s except for one", () => {
  expect(plural(1, "value")).toBe("1 value");
  expect(plural(0, "value")).toBe("0 values");
  expect(plural(2, "value")).toBe("2 values");
});
