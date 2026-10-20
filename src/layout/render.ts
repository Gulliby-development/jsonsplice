import { readString } from "../syntax/scanner";
import type { Node } from "../syntax/tree";

export function renderValue(src: string, node: Node): string {
  if (node.kind === "object") {
    const members = node.items.map((item) => {
      const keyEnd = readString(src, item.keyStart).end;
      const key = src.slice(item.keyStart, keyEnd);
      return `${key}: ${renderValue(src, item.value)}`;
    });

    return `{${members.join(", ")}}`;
  }

  if (node.kind === "array") {
    return `[${node.items.map((item) => renderValue(src, item.value)).join(", ")}]`;
  }

  return src.slice(node.start, node.end);
}
