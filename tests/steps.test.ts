import { expect, test } from "bun:test";
import { Fail } from "../src/base/fail";
import { keyJson, parseSteps, pathText, type Step, stepText } from "../src/path/steps";

function captureFailure(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }

  throw new Error("expected a path failure");
}

function expectInvalidPath(path: string, message: string): void {
  const failure = captureFailure(() => parseSteps(path));
  expect(failure).toBeInstanceOf(Fail);

  if (!(failure instanceof Fail)) {
    return;
  }

  expect(failure.message).toBe(message);
}

test("parseSteps accepts the root and dotted-key forms", () => {
  expect(parseSteps("$")).toEqual([]);
  expect(parseSteps("a.b")).toEqual([
    { kind: "key", key: "a" },
    { kind: "key", key: "b" },
  ]);
  expect(parseSteps("$.a")).toEqual([{ kind: "key", key: "a" }]);
  expect(parseSteps(".a")).toEqual([{ kind: "key", key: "a" }]);
});

test("parseSteps accepts an index as the first step", () => {
  expect(parseSteps("[0].a")).toEqual([
    { kind: "index", index: 0 },
    { kind: "key", key: "a" },
  ]);
});

test("parseSteps accepts key characters and the six-digit index boundary", () => {
  expect(parseSteps("a-Z_9[999999]")).toEqual([
    { kind: "key", key: "a-Z_9" },
    { kind: "index", index: 999999 },
  ]);
});

test("parseSteps accepts empty and spaced quoted keys", () => {
  expect(parseSteps('[""]')).toEqual([{ kind: "key", key: "" }]);
  expect(parseSteps('["a b"]')).toEqual([{ kind: "key", key: "a b" }]);
});

test("parseSteps decodes escaped quotes and backslashes in keys", () => {
  expect(parseSteps(String.raw`["a\"\\"]`)).toEqual([{ kind: "key", key: 'a"\\' }]);
});

test("parseSteps preserves raw controls and non-ASCII in quoted keys", () => {
  expect(parseSteps('["\n😀"]')).toEqual([{ kind: "key", key: "\n😀" }]);
});

test("parseSteps reports invalid transitions and incomplete steps", () => {
  expectInvalidPath("", 'invalid path "" at character 1');
  expectInvalidPath("a..b", 'invalid path "a..b" at character 3');
  expectInvalidPath("a[1", 'invalid path "a[1" at character 4');
  expectInvalidPath("a b", 'invalid path "a b" at character 2');
  expectInvalidPath('["x', 'invalid path "["x" at character 4');
  expectInvalidPath("a.", 'invalid path "a." at character 3');
  expectInvalidPath("a[]", 'invalid path "a[]" at character 3');
});

test("parseSteps reports restricted escapes and index boundaries by code point", () => {
  expectInvalidPath("a[01]", 'invalid path "a[01]" at character 4');
  expectInvalidPath(String.raw`["x\n"]`, 'invalid path "["x\\n"]" at character 6');
  expectInvalidPath("a[1000000]", 'invalid path "a[1000000]" at character 9');
  expectInvalidPath("$a", 'invalid path "$a" at character 2');
  expectInvalidPath('["x"x]', 'invalid path "["x"x]" at character 5');
  expectInvalidPath('["😀"]x', 'invalid path "["?"]x" at character 6');
  expectInvalidPath('["x\\', 'invalid path "["x\\" at character 5');
});

test("stepText writes indexes and bare keys", () => {
  expect(stepText({ kind: "index", index: 0 })).toBe("[0]");
  expect(stepText({ kind: "index", index: 999999 })).toBe("[999999]");
  expect(stepText({ kind: "key", key: "a-Z_9" })).toBe(".a-Z_9");
});

test("stepText quotes unusual keys and preserves their contents", () => {
  expect(stepText({ kind: "key", key: "" })).toBe('[""]');
  expect(stepText({ kind: "key", key: 'a"\\' })).toBe('["a\\"\\\\"]');
  expect(stepText({ kind: "key", key: "\n😀" })).toBe('["\n😀"]');
});

test("pathText writes canonical paths and round-trips literal steps", () => {
  const root: Step[] = [];
  const limits: Step[] = [
    { kind: "key", key: "limits" },
    { kind: "key", key: "max" },
  ];
  const tags: Step[] = [
    { kind: "key", key: "tags" },
    { kind: "index", index: 1 },
  ];
  const spaced: Step[] = [{ kind: "key", key: "a b" }];
  const controls: Step[] = [{ kind: "key", key: "\n😀" }];

  expect(pathText(root)).toBe("$");
  expect(parseSteps("$")).toEqual(root);
  expect(pathText(limits)).toBe("$.limits.max");
  expect(parseSteps("$.limits.max")).toEqual(limits);
  expect(pathText(tags)).toBe("$.tags[1]");
  expect(parseSteps("$.tags[1]")).toEqual(tags);
  expect(pathText(spaced)).toBe('$["a b"]');
  expect(parseSteps('$["a b"]')).toEqual(spaced);
  expect(pathText(controls)).toBe('$["\n😀"]');
  expect(parseSteps('$["\n😀"]')).toEqual(controls);
});

test("keyJson escapes JSON controls and preserves other characters", () => {
  expect(keyJson("")).toBe('""');
  expect(keyJson('a"\\')).toBe('"a\\"\\\\"');
  expect(keyJson("\b\t\n\f\r")).toBe('"\\b\\t\\n\\f\\r"');
  expect(keyJson("\u0000\u0001\u001f")).toBe('"\\u0000\\u0001\\u001f"');
  expect(keyJson("é😀/")).toBe('"é😀/"');
});

test("parseSteps accepts negative indexes from -1 to -999999", () => {
  expect(parseSteps("a[-1]")).toEqual([
    { kind: "key", key: "a" },
    { kind: "index", index: -1 },
  ]);
  expect(parseSteps("[-999999].b")).toEqual([
    { kind: "index", index: -999999 },
    { kind: "key", key: "b" },
  ]);
  expect(parseSteps("$[-10][0]")).toEqual([
    { kind: "index", index: -10 },
    { kind: "index", index: 0 },
  ]);

  let seed = 1234;
  const values = [1, 9, 10, 99999, 999999];
  for (let i = 0; i < 100; i += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    values.push((seed % 999999) + 1);
  }

  for (const n of values) {
    expect(parseSteps(`a[-${n}]`)).toEqual([
      { kind: "key", key: "a" },
      { kind: "index", index: -n },
    ]);
  }
});

test("parseSteps reports malformed negative indexes at the first bad character", () => {
  expectInvalidPath("a[-0]", 'invalid path "a[-0]" at character 4');
  expectInvalidPath("a[-]", 'invalid path "a[-]" at character 4');
  expectInvalidPath("a[-01]", 'invalid path "a[-01]" at character 4');
  expectInvalidPath("a[--1]", 'invalid path "a[--1]" at character 4');
  expectInvalidPath("a[-1000000]", 'invalid path "a[-1000000]" at character 10');
  expectInvalidPath("a[-1", 'invalid path "a[-1" at character 5');
  expectInvalidPath("a[1-]", 'invalid path "a[1-]" at character 4');
});

test("stepText and pathText write negative indexes as typed", () => {
  expect(stepText({ kind: "index", index: -1 })).toBe("[-1]");
  expect(pathText(parseSteps("a[-2].b"))).toBe("$.a[-2].b");

  let seed = 99;
  for (let i = 0; i < 100; i += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const n = (seed % 999999) + 1;
    expect(pathText(parseSteps(`a[-${n}].b`))).toBe(`$.a[-${n}].b`);
  }
});
