import { Fail } from "../base/fail";
import { plain } from "../base/text";
import { lineCol } from "../syntax/source";
import type { Item, Kind, Node } from "../syntax/tree";
import { pathText, type Step } from "./steps";

export function kindName(kind: Kind): string {
  switch (kind) {
    case "object":
      return "an object";
    case "array":
      return "an array";
    case "string":
      return "a string";
    case "number":
      return "a number";
    case "true":
    case "false":
    case "null":
      return kind;
  }
}

export function stepInto(node: Node, step: Step, before: Step[]): Item | null {
  if (step.kind === "key") {
    if (node.kind !== "object") {
      throw new Fail(`at ${pathText(before)} the value is ${kindName(node.kind)}, not an object`);
    }

    for (let index = node.items.length - 1; index >= 0; index -= 1) {
      const item = node.items[index];
      if (item?.key === step.key) {
        return item;
      }
    }

    return null;
  }

  if (node.kind !== "array") {
    throw new Fail(`at ${pathText(before)} the value is ${kindName(node.kind)}, not an array`);
  }

  return node.items[step.index] ?? null;
}

export function lookup(root: Node, steps: Step[]): Node | null {
  let node = root;
  const before: Step[] = [];

  for (const step of steps) {
    const item = stepInto(node, step, before);
    if (item === null) {
      return null;
    }

    node = item.value;
    before.push(step);
  }

  return node;
}

export function listing(text: string, root: Node, steps: Step[]): string[][] {
  const selected = lookup(root, steps);
  if (selected === null) {
    return [];
  }

  const rows: string[][] = [];

  function visit(node: Node, absoluteSteps: Step[]): void {
    const [line, column] = lineCol(text, node.start);
    const value =
      node.kind === "object" || node.kind === "array"
        ? "-"
        : plain(text.slice(node.start, node.end));

    rows.push([plain(pathText(absoluteSteps)), node.kind, String(line), String(column), value]);

    for (let index = 0; index < node.items.length; index += 1) {
      const item = node.items[index];
      if (item === undefined) {
        continue;
      }

      const childStep: Step =
        node.kind === "object" ? { kind: "key", key: item.key ?? "" } : { kind: "index", index };
      visit(item.value, [...absoluteSteps, childStep]);
    }
  }

  visit(selected, steps);
  return rows;
}
