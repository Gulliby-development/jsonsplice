import { Fail } from "../base/fail";
import { plural } from "../base/text";
import type { Layout } from "../layout/layout";
import { renderValue } from "../layout/render";
import { stepInto } from "../path/resolve";
import { keyJson, pathText, type Step, stepText } from "../path/steps";
import type { Item, Node } from "../syntax/tree";
import { addItem, insertBefore } from "./grow";
import { removeItem } from "./shrink";
import type { Edit } from "./splice";

export interface Value {
  src: string;
  node: Node;
}

export function setValue(
  text: string,
  root: Node,
  steps: Step[],
  value: Value,
  layout: Layout,
): Edit[] {
  const rendered = renderValue(value.src, value.node);

  if (steps.length === 0) {
    return [{ start: root.start, end: root.end, text: rendered }];
  }

  const { parent, before } = parentAt(root, steps);
  const lastStep = steps[steps.length - 1];

  if (lastStep === undefined) {
    return [];
  }

  const selected = stepInto(parent, lastStep, before);

  if (selected !== null) {
    return [{ start: selected.value.start, end: selected.value.end, text: rendered }];
  }

  if (lastStep.kind === "key") {
    return addItem(text, parent, `${keyJson(lastStep.key)}: ${rendered}`, layout);
  }

  if (lastStep.index === parent.items.length) {
    return addItem(text, parent, rendered, layout);
  }

  throw new Fail(
    `cannot set ${stepText(lastStep)}: the array at ${pathText(before)} has ${plural(parent.items.length, "element")}`,
  );
}

export function insertValue(
  text: string,
  root: Node,
  steps: Step[],
  value: Value,
  layout: Layout,
): Edit[] {
  const lastStep = steps[steps.length - 1];

  if (lastStep?.kind !== "index") {
    throw new Fail("insert needs a path that ends with an array index");
  }

  const { parent, before } = parentAt(root, steps);
  stepInto(parent, lastStep, before);

  const position = lastStep.index < 0 ? parent.items.length + lastStep.index : lastStep.index;

  if (position < 0 || position > parent.items.length) {
    throw new Fail(
      `cannot insert at ${stepText(lastStep)}: the array at ${pathText(before)} has ${plural(parent.items.length, "element")}`,
    );
  }

  return insertBefore(text, parent, position, renderValue(value.src, value.node), layout);
}

export function deleteValue(text: string, root: Node, steps: Step[]): Edit[] | null {
  if (steps.length === 0) {
    throw new Fail("cannot delete the root value");
  }

  let parent = root;
  const before: Step[] = [];

  for (let index = 0; index < steps.length - 1; index += 1) {
    const step = steps[index];

    if (step === undefined) {
      continue;
    }

    const item = stepInto(parent, step, before);

    if (item === null) {
      return null;
    }

    parent = item.value;
    before.push(step);
  }

  const lastStep = steps[steps.length - 1];

  if (lastStep === undefined) {
    return null;
  }

  const selected = stepInto(parent, lastStep, before);

  if (selected === null) {
    return null;
  }

  return removeItem(text, parent, itemIndex(parent, selected));
}

function parentAt(root: Node, steps: Step[]): { parent: Node; before: Step[] } {
  let parent = root;
  const before: Step[] = [];

  for (let index = 0; index < steps.length - 1; index += 1) {
    const step = steps[index];

    if (step === undefined) {
      continue;
    }

    const item = stepInto(parent, step, before);

    if (item === null) {
      throw new Fail(`no value at ${pathText([...before, step])}`);
    }

    parent = item.value;
    before.push(step);
  }

  return { parent, before };
}

function itemIndex(parent: Node, selected: Item): number {
  return parent.items.indexOf(selected);
}
