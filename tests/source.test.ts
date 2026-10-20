import { expect, test } from "bun:test";
import { baseWs, breakLength, lineCol, lineStart, startsLine, tailEnd } from "../src/syntax/source";

test("lineCol reports the empty text and the first position", () => {
  expect(lineCol("", 0)).toEqual([1, 1]);
  expect(lineCol("text", 0)).toEqual([1, 1]);
});

test("lineStart and lineCol handle an LF-leading document at offset zero", () => {
  expect(lineStart("\n", 0)).toBe(0);
  expect(lineCol("\n", 0)).toEqual([1, 1]);
});

test("lineCol counts UTF-16 units and advances only after LF", () => {
  expect(lineCol("😀x", 2)).toEqual([1, 3]);
  expect(lineCol("a\rb", 2)).toEqual([1, 3]);
  expect(lineCol("a\r\n\tb", 4)).toEqual([2, 2]);
});

test("lineCol places the offset after a final LF on the next line", () => {
  expect(lineCol("a\n", 2)).toEqual([2, 1]);
});

test("lineStart returns the position after the last preceding LF", () => {
  expect(lineStart("a\r\n  b", 5)).toBe(3);
  expect(lineStart("ab", 2)).toBe(0);
  expect(lineStart("a\nb\nc", 4)).toBe(4);
});

test("startsLine accepts only spaces and tabs from the line start", () => {
  expect(startsLine("a\n \tb", 4)).toBe(true);
  expect(startsLine("a b", 2)).toBe(false);
  expect(startsLine("\rb", 1)).toBe(false);
  expect(startsLine("a\n", 2)).toBe(true);
});

test("baseWs returns only leading spaces and tabs on the current line", () => {
  expect(baseWs("a\n \tb x", 6)).toBe(" \t");
  expect(baseWs("abc", 2)).toBe("");
  expect(baseWs("\t  value", 5)).toBe("\t  ");
});

test("breakLength distinguishes CRLF, LF, and a lone CR", () => {
  expect(breakLength("\r\n", 0)).toBe(2);
  expect(breakLength("\n", 0)).toBe(1);
  expect(breakLength("\r", 0)).toBe(0);
});

test("tailEnd skips whitespace and lone CR through EOF", () => {
  expect(tailEnd(" \t\r", 0)).toEqual({ end: 3, ok: true });
  expect(tailEnd("x \t\r", 1)).toEqual({ end: 4, ok: true });
});

test("tailEnd stops at a line break or a line comment", () => {
  expect(tailEnd(" \r\nx", 0)).toEqual({ end: 1, ok: true });
  expect(tailEnd(" //x\r\nz", 0)).toEqual({ end: 4, ok: true });
  expect(tailEnd("//x", 0)).toEqual({ end: 3, ok: true });
});

test("tailEnd permits closed same-line block comments and rejects unsafe tails", () => {
  expect(tailEnd(" /*x*/ \n", 0)).toEqual({ end: 7, ok: true });
  expect(tailEnd(" /*x\n*/", 0)).toEqual({ end: 0, ok: false });
  expect(tailEnd(" /*open", 0)).toEqual({ end: 0, ok: false });
  expect(tailEnd("x  y", 1)).toEqual({ end: 1, ok: false });
});
