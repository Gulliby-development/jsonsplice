import { expect, test } from "bun:test";
import { duplicateKeys, parseDocument } from "../src/syntax/parser";
import type { Item, Kind, Node } from "../src/syntax/tree";
import { countValues, problemLine, SyntaxProblem } from "../src/syntax/tree";

test("parseDocument preserves nested JSONC tree metadata and comma offsets", () => {
  const text = ' {"a":[1,],} ';
  const root: Node = parseDocument(text, false);
  const kind: Kind = root.kind;
  const first: Item | undefined = root.items[0];

  expect(kind).toBe("object");
  expect(first?.key).toBe("a");
  expect(root).toEqual({
    kind: "object",
    start: 1,
    end: 12,
    items: [
      {
        start: 2,
        key: "a",
        keyStart: 2,
        value: {
          kind: "array",
          start: 6,
          end: 10,
          items: [
            {
              start: 7,
              key: null,
              keyStart: 7,
              value: { kind: "number", start: 7, end: 8, items: [] },
              comma: 8,
            },
          ],
        },
        comma: 10,
      },
    ],
  });
});

test("parseDocument returns a complete string scalar tree", () => {
  const root = parseDocument('"x"', true);

  expect(root).toEqual({
    kind: "string",
    start: 0,
    end: 3,
    items: [],
  });
});

test("parseDocument retains the source position after a JSONC comment", () => {
  const [text, strict]: [string, boolean] = ["/*x*/null", false];
  const root = parseDocument(text, strict);

  expect(root).toEqual({
    kind: "null",
    start: 5,
    end: 9,
    items: [],
  });
});

const structuralDiagnostics: [string, string][] = [
  ['{"a": 1,, "b": 2}', 'JS001 unexpected character "," at 1:9'],
  ['{\n  "a": 1,\n  "b": ]\n}', 'JS001 unexpected character "]" at 3:8'],
  ['["😀", x]', 'JS001 unexpected character "x" at 1:8'],
  ["truX", 'JS001 unexpected character "X" at 1:4'],
  ["true false", 'JS001 unexpected character "f" at 1:6'],
  ['{"a": [1, 2', "JS002 unexpected end of input at 1:12"],
];

test.each(structuralDiagnostics)(
  "parseDocument reports the first structural diagnostic",
  (text, expected) => {
    expect(problemLine(text, firstProblem(text))).toBe(expected);
  },
);

const tokenDiagnostics: [string, string][] = [
  ['{"a": "abc', "JS003 unterminated string at 1:7"],
  ['["a\tb"]', "JS004 control character in string at 1:4"],
  ["[1] /* open", "JS005 unterminated comment at 1:5"],
  ['["a\\qb"]', "JS006 invalid escape at 1:4"],
  ["[01]", "JS007 invalid number at 1:2"],
];

test.each(tokenDiagnostics)(
  "parseDocument reports the first token diagnostic",
  (text, expected) => {
    expect(problemLine(text, firstProblem(text))).toBe(expected);
  },
);

const literalDiagnostics: [string, string][] = [
  ['["a\\qb"]', "JS006 invalid escape at 1:4"],
  ["[01]", "JS007 invalid number at 1:2"],
  ["truX", 'JS001 unexpected character "X" at 1:4'],
  ["tru", "JS002 unexpected end of input at 1:4"],
];

test.each(literalDiagnostics)(
  "parseDocument reports first literal diagnostics",
  (text, expected) => {
    expect(problemLine(text, firstProblem(text))).toBe(expected);
  },
);

const rootAndStrictDiagnostics: [string, boolean, string][] = [
  ["true false", false, 'JS001 unexpected character "f" at 1:6'],
  ["[1,]", true, 'JS001 unexpected character "]" at 1:4'],
  ["/*x*/0", true, 'JS001 unexpected character "/" at 1:1'],
];

test.each(rootAndStrictDiagnostics)(
  "parseDocument rejects extra roots and strict-mode extensions",
  (text, strict, expected) => {
    expect(problemLine(text, firstProblem(text, strict))).toBe(expected);
  },
);

test("parseDocument reports an unterminated trailing comment", () => {
  const text = "[1] /* open";

  expect(problemLine(text, firstProblem(text))).toBe("JS005 unterminated comment at 1:5");
});

test("parseDocument rejects a leading comment in strict mode", () => {
  const text = "/*x*/0";

  expect(problemLine(text, firstProblem(text, true))).toBe('JS001 unexpected character "/" at 1:1');
});

test("parseDocument accepts 64 nested containers and rejects the 65th", () => {
  const validText =
    "[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]";
  const invalidText = "[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[";
  const root = parseDocument(validText, false);
  const problem = firstProblem(invalidText);

  expect(root.kind).toBe("array");
  expect(problem.code).toBe("JS008");
  expect(problem.at).toBe(64);
  expect(problem.message).toBe("nesting too deep");
  expect(problemLine(invalidText, problem)).toBe("JS008 nesting too deep at 1:65");
});

test("countValues counts the root and every descendant value", () => {
  expect(countValues(parseDocument('{"a":[1,true,null],"b":{}}', false))).toBe(6);
  expect(countValues(parseDocument("false", false))).toBe(1);
});

test("duplicateKeys reports decoded keys in offset order and object-local scope", () => {
  const duplicateText = '{"a": 1, "b": {"a": 2, "a": 3}, "a": 4}';
  const escapedText = '{"a":0,"\\u0061":1}';
  const nestedText = '{"a":0,"b":{"a":1}}';

  expect(duplicateKeys(duplicateText, parseDocument(duplicateText, false))).toEqual([
    'JS009 duplicate key "a" at 1:24',
    'JS009 duplicate key "a" at 1:33',
  ]);
  expect(duplicateKeys(escapedText, parseDocument(escapedText, false))).toEqual([
    'JS009 duplicate key "a" at 1:8',
  ]);
  expect(duplicateKeys(nestedText, parseDocument(nestedText, false))).toEqual([]);
});

function firstProblem(text: string, strict = false): SyntaxProblem {
  try {
    parseDocument(text, strict);
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(SyntaxProblem);
    if (error instanceof SyntaxProblem) {
      return error;
    }
    throw error;
  }
  throw new Error("Expected parseDocument to fail");
}
