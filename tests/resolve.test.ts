import { expect as expectAdded, test as testAdded } from "bun:test";
import { Fail } from "../src/base/fail";
import { kindName, listing, lookup, stepInto } from "../src/path/resolve";
import { parseSteps, type Step } from "../src/path/steps";
import { parseDocument } from "../src/syntax/parser";
import type { Item, Node } from "../src/syntax/tree";

function expectFailure(run: () => unknown, message: string): void {
  let failure: unknown;

  try {
    run();
  } catch (error) {
    failure = error;
  }

  expectAdded(failure).toBeInstanceOf(Fail);
  if (failure instanceof Fail) {
    expectAdded(failure.message).toBe(message);
  }
}

testAdded("kindName describes containers and scalar values", () => {
  expectAdded(kindName("object")).toBe("an object");
  expectAdded(kindName("array")).toBe("an array");
  expectAdded(kindName("string")).toBe("a string");
  expectAdded(kindName("number")).toBe("a number");
});

testAdded("kindName preserves literal kind names", () => {
  expectAdded(kindName("true")).toBe("true");
  expectAdded(kindName("false")).toBe("false");
  expectAdded(kindName("null")).toBe("null");
});

testAdded("lookup returns the original root and nested selected values", () => {
  const text = '{"a":[true,false,null]}';
  const root: Node = parseDocument(text, false);
  const original = lookup(root, []);
  const selected: Node | null = lookup(root, parseSteps("a[1]"));

  expectAdded(original).toBe(root);
  expectAdded(selected).not.toBeNull();
  expectAdded(selected?.kind).toBe("false");
  expectAdded(selected === null ? "" : text.slice(selected.start, selected.end)).toBe("false");
  expectAdded(lookup(root, parseSteps("a"))).toBe(root.items[0]?.value);
});

testAdded("lookup returns null for absent indexes and missing prefixes", () => {
  const root = parseDocument('{"a":[true,false,null]}', false);

  expectAdded(lookup(root, parseSteps("a[3]"))).toBeNull();
  expectAdded(lookup(root, parseSteps("missing.x"))).toBeNull();
});

testAdded("lookup and stepInto select the last decoded duplicate item by identity", () => {
  const escapedText = '{"a":1,"\\u0061":2}';
  const escapedRoot = parseDocument(escapedText, false);
  const escapedStep: Step = { kind: "key", key: "a" };
  const escapedLast: Item | null = stepInto(escapedRoot, escapedStep, []);
  const duplicateText = '{"a":{"b":1},"a":{"b":2}}';
  const duplicateRoot = parseDocument(duplicateText, false);
  const duplicateStep: Step = { kind: "key", key: "a" };
  const duplicateLast: Item | null = stepInto(duplicateRoot, duplicateStep, []);

  expectAdded(escapedLast).toBe(escapedRoot.items[1]);
  if (escapedLast === null) {
    throw new Error("Expected a duplicate key item");
  }
  expectAdded(lookup(escapedRoot, [escapedStep])).toBe(escapedLast.value);
  expectAdded(escapedText.slice(escapedLast.value.start, escapedLast.value.end)).toBe("2");
  expectAdded(duplicateLast).toBe(duplicateRoot.items[1]);
  if (duplicateLast === null) {
    throw new Error("Expected a duplicate key item");
  }
  const nested = lookup(duplicateRoot, parseSteps("a.b"));
  expectAdded(nested?.kind).toBe("number");
  expectAdded(nested).toBe(duplicateLast.value.items[0]?.value ?? null);
  expectAdded(duplicateText.slice(duplicateLast.value.start, duplicateLast.value.end)).toBe(
    '{"b":2}',
  );
});

testAdded("stepInto returns original items or null and lookup stops at an absent prefix", () => {
  const root = parseDocument('{"a":[true]}', false);
  const keyStep: Step = { kind: "key", key: "a" };
  const arrayItem = stepInto(root, keyStep, []);
  const indexStep: Step = { kind: "index", index: 1 };

  expectAdded(arrayItem).toBe(root.items[0]);
  expectAdded(arrayItem?.value.items[0]?.value.kind).toBe("true");
  expectAdded(stepInto(root, { kind: "key", key: "missing" }, [])).toBeNull();
  expectAdded(stepInto(arrayItem?.value as Node, indexStep, [keyStep])).toBeNull();
  expectAdded(lookup(root, parseSteps("missing.x"))).toBeNull();
});

testAdded("key steps report kind mismatches with canonical prefixes", () => {
  const namedText = '{"name":"api"}';
  const namedRoot = parseDocument(namedText, false);
  expectFailure(
    () => lookup(namedRoot, parseSteps("name.x")),
    "at $.name the value is a string, not an object",
  );

  const arrayRoot = parseDocument("[]", false);
  expectFailure(
    () => listing("[]", arrayRoot, parseSteps("x")),
    "at $ the value is an array, not an object",
  );

  const spacedRoot = parseDocument('{"a b":false}', false);
  const quotedStep = parseSteps('["a b"]')[0];
  const falseNode = lookup(spacedRoot, parseSteps('["a b"]'));
  expectAdded(quotedStep).toEqual({ kind: "key", key: "a b" });
  if (quotedStep !== undefined && falseNode !== null) {
    expectFailure(
      () => stepInto(falseNode, { kind: "key", key: "x" }, [quotedStep]),
      'at $["a b"] the value is false, not an object',
    );
  }

  const nullRoot = parseDocument("null", false);
  expectFailure(
    () => stepInto(nullRoot, { kind: "key", key: "x" }, []),
    "at $ the value is null, not an object",
  );
});

testAdded("index steps report kind mismatches with canonical prefixes", () => {
  const namedRoot = parseDocument('{"name":"api"}', false);
  expectFailure(
    () => lookup(namedRoot, parseSteps("name[0]")),
    "at $.name the value is a string, not an array",
  );

  const objectRoot = parseDocument("{}", false);
  expectFailure(
    () => listing("{}", objectRoot, parseSteps("[0]")),
    "at $ the value is an object, not an array",
  );

  const numberRoot = parseDocument("1", false);
  expectFailure(
    () => lookup(numberRoot, parseSteps("[0]")),
    "at $ the value is a number, not an array",
  );

  const trueRoot = parseDocument("true", false);
  expectFailure(
    () => stepInto(trueRoot, { kind: "index", index: 0 }, []),
    "at $ the value is true, not an array",
  );
});

testAdded(
  "listing includes duplicate keys in preorder and preserves the tree and source",
  async () => {
    const [{ parseDocument }, { listing }, { parseSteps }] = await Promise.all([
      import("../src/syntax/parser"),
      import("../src/path/resolve"),
      import("../src/path/steps"),
    ]);
    const text = '{"a":1,"a":[false,null]}';
    const root = parseDocument(text, false);
    const originalRoot = structuredClone(root);
    const originalText = text;

    expectAdded(listing(text, root, parseSteps("$"))).toEqual([
      ["$", "object", "1", "1", "-"],
      ["$.a", "number", "1", "6", "1"],
      ["$.a", "array", "1", "12", "-"],
      ["$.a[0]", "false", "1", "13", "false"],
      ["$.a[1]", "null", "1", "19", "null"],
    ]);
    expectAdded(root).toEqual(originalRoot);
    expectAdded(text).toBe(originalText);
  },
);

testAdded("listing starts at the selected last duplicate subtree", async () => {
  const [{ parseDocument }, { listing }, { parseSteps }] = await Promise.all([
    import("../src/syntax/parser"),
    import("../src/path/resolve"),
    import("../src/path/steps"),
  ]);
  const text = '{"a":1,"a":[false,null]}';
  const root = parseDocument(text, false);

  expectAdded(listing(text, root, parseSteps("a"))).toEqual([
    ["$.a", "array", "1", "12", "-"],
    ["$.a[0]", "false", "1", "13", "false"],
    ["$.a[1]", "null", "1", "19", "null"],
  ]);
});

testAdded("listing returns no rows for an absent path and reports CRLF TAB positions", async () => {
  const [{ parseDocument }, { listing }, { parseSteps }] = await Promise.all([
    import("../src/syntax/parser"),
    import("../src/path/resolve"),
    import("../src/path/steps"),
  ]);
  const absentText = "{}";
  const absentRoot = parseDocument(absentText, false);
  const text = '{\r\n\t"a": [1, 2]\r\n}';
  const root = parseDocument(text, false);

  expectAdded(listing(absentText, absentRoot, parseSteps("missing.x"))).toEqual([]);
  expectAdded(listing(text, root, parseSteps("a"))).toEqual([
    ["$.a", "array", "2", "7", "-"],
    ["$.a[0]", "number", "2", "8", "1"],
    ["$.a[1]", "number", "2", "11", "2"],
  ]);
});

testAdded("listing sanitizes scalar text and preserves exact JSONC tokens", async () => {
  const [{ parseDocument }, { listing }, { parseSteps }] = await Promise.all([
    import("../src/syntax/parser"),
    import("../src/path/resolve"),
    import("../src/path/steps"),
  ]);
  const text = '{"😀":"é","x":true}';
  const root = parseDocument(text, false);

  expectAdded(listing(text, root, parseSteps("$"))).toEqual([
    ["$", "object", "1", "1", "-"],
    ['$["?"]', "string", "1", "7", '"?"'],
    ["$.x", "true", "1", "15", "true"],
  ]);

  const tokenText = '[ /* c */ 1e+02, "\\u0061", ]';
  const tokenRoot = parseDocument(tokenText, false);
  expectAdded(listing(tokenText, tokenRoot, parseSteps("$"))).toEqual([
    ["$", "array", "1", "1", "-"],
    ["$[0]", "number", "1", "11", "1e+02"],
    ["$[1]", "string", "1", "18", '"\\u0061"'],
  ]);
});
