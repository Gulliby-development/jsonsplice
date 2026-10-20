import { expect, test } from "bun:test";
import { renderValue } from "../src/layout/render";
import { parseDocument } from "../src/syntax/parser";

function render(text: string): string {
  return renderValue(text, parseDocument(text, true));
}

test("render compacts nested containers and discards outer whitespace", () => {
  expect(render(' \n{"a" : [ 1 , 2 ], "b" : { }} \t')).toBe('{"a": [1, 2], "b": {}}');
});

test("render emits an empty object without interior padding", () => {
  expect(render(" { } ")).toBe("{}");
});

test("render emits an empty array without interior padding", () => {
  expect(render(" [ ] ")).toBe("[]");
});

test("FR-005: render preserves the original string token escapes", () => {
  expect(render(' \t"\\u0061\\/\\n" \n')).toBe('"\\u0061\\/\\n"');
});

test("render preserves number spelling", () => {
  expect(render(" -0.00E+02 ")).toBe("-0.00E+02");
});

test("render preserves distinct key tokens for duplicate decoded keys", () => {
  expect(render('{"\\u0061" : 1, "a":2}')).toBe('{"\\u0061": 1, "a": 2}');
});

test("render preserves escaped object keys and string values", () => {
  expect(render('{"a\\"b": "\\\\", "x": "\\uD83D\\uDE00"}')).toBe(
    '{"a\\"b": "\\\\", "x": "\\uD83D\\uDE00"}',
  );
});

test("render keeps literal tokens and separates array items", () => {
  expect(render("[ true , false , null ]")).toBe("[true, false, null]");
});

test("render recursively compacts nested objects and arrays", () => {
  expect(render('[\n { "x" : [ ] },\n [ 1e-2, -0 ]\n]')).toBe('[{"x": []}, [1e-2, -0]]');
});

test("AC-005 [src, itemIndex] renders root.items[itemIndex].value after astral text", () => {
  const src = '["😀", { "\\u0061" : -0E+2 }]';
  const itemIndex = 1;
  const root = parseDocument(src, true);

  expect(renderValue(src, root.items[itemIndex].value)).toBe('{"\\u0061": -0E+2}');
});

test("AC-005 renders an array subtree using its itemIndex source offsets", () => {
  const src = "[0, [ 1, 2 ]]";
  const itemIndex = 1;
  const root = parseDocument(src, true);

  expect(renderValue(src, root.items[itemIndex].value)).toBe("[1, 2]");
});
