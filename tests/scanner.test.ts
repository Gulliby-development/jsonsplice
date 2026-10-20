import { expect, test } from "bun:test";
import { readNumber, readString, skipTrivia } from "../src/syntax/scanner";
import { SyntaxProblem } from "../src/syntax/tree";

function captureProblem(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }

  throw new Error("expected a syntax problem");
}

function expectProblem(
  run: () => unknown,
  expected: { code: string; at: number; message: string },
): void {
  const problem = captureProblem(run);
  expect(problem).toBeInstanceOf(SyntaxProblem);

  if (!(problem instanceof SyntaxProblem)) {
    return;
  }

  expect(problem.code).toBe(expected.code);
  expect(problem.at).toBe(expected.at);
  expect(problem.message).toBe(expected.message);
}

test("skipTrivia consumes JSONC whitespace and comments", () => {
  expect(skipTrivia(" \t\r\nx", 0, false)).toBe(4);
  expect(skipTrivia("/*a*/ //b\n0", 0, false)).toBe(10);
  expect(skipTrivia("//a", 0, false)).toBe(3);
});

test("skipTrivia stops at comments in strict mode", () => {
  expect(skipTrivia("/*a*/0", 0, true)).toBe(0);
  expect(skipTrivia(" //a", 0, true)).toBe(1);
});

test("skipTrivia reports an unterminated block comment", () => {
  expectProblem(() => skipTrivia("/*open", 0, false), {
    code: "JS005",
    at: 0,
    message: "unterminated comment",
  });
});

test("readString returns plain text and decodes the simple escapes", () => {
  expect(readString('"abc"', 0)).toEqual({ end: 5, value: "abc" });
  expect(readString('"\\"\\\\\\/\\b\\f\\n\\r\\t"', 0)).toEqual({
    end: 18,
    value: '"\\/\b\f\n\r\t',
  });
});

test("readString decodes Unicode escapes including a surrogate pair", () => {
  expect(readString('"\\u0061\\uD83D\\uDE00"', 0)).toEqual({
    end: 20,
    value: "a😀",
  });
});

test("readString reports an unterminated string at its opening quote", () => {
  expectProblem(() => readString('"abc', 0), {
    code: "JS003",
    at: 0,
    message: "unterminated string",
  });
});

test("readString reports a raw control character at its own offset", () => {
  expectProblem(() => readString('"a\tb"', 0), {
    code: "JS004",
    at: 2,
    message: "control character in string",
  });
});

test("readString reports invalid escapes at the backslash", () => {
  expectProblem(() => readString('"a\\qb"', 0), {
    code: "JS006",
    at: 2,
    message: "invalid escape",
  });
  expectProblem(() => readString('"\\u12x4"', 0), {
    code: "JS006",
    at: 1,
    message: "invalid escape",
  });
  expectProblem(() => readString('"\\', 0), { code: "JS006", at: 1, message: "invalid escape" });
});

test("readNumber returns exclusive ends for JSON number forms", () => {
  expect(readNumber("0", 0)).toBe(1);
  expect(readNumber("-0", 0)).toBe(2);
  expect(readNumber("12.5e-2,", 0)).toBe(7);
  expect(readNumber("1E+2]", 0)).toBe(4);
  expect(readNumber("1x", 0)).toBe(1);
});

test("readNumber rejects incomplete and immediately continued numbers", () => {
  expectProblem(() => readNumber("-", 0), { code: "JS007", at: 0, message: "invalid number" });
  expectProblem(() => readNumber("1.", 0), { code: "JS007", at: 0, message: "invalid number" });
  expectProblem(() => readNumber("1e", 0), { code: "JS007", at: 0, message: "invalid number" });
  expectProblem(() => readNumber("01", 0), { code: "JS007", at: 0, message: "invalid number" });
  expectProblem(() => readNumber("1.5.2", 0), { code: "JS007", at: 0, message: "invalid number" });
  expectProblem(() => readNumber("1+2", 0), { code: "JS007", at: 0, message: "invalid number" });
});
